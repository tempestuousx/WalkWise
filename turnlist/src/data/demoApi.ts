import { ApiError } from './api';
import type {
  AdminUserRow,
  ApplicationWithContractor,
  ApplicationWithJob,
  ContractorPublic,
  ContractorSummary,
  ConversationSummary,
  DataApi,
  JobDetail,
  Metrics,
  PublicEmployer,
  Session,
} from './api';
import { buildSeed, DEMO_DB_VERSION, type DemoDb } from './demoSeed';
import { DEFAULT_MARKET_ID } from '@/domain/market';
import { areaForZip } from '@/domain/market';
import { canTransitionApplication, canTransitionJob, isJobAvailable } from '@/domain/status';
import { defaultExpiry, matchingContractorIds, qualify } from '@/domain/jobs';
import { defaultPreferences } from '@/domain/notifications';
import { verifiedBadges } from '@/domain/profile';
import { applicationInputSchema, jobInputSchema, type JobInput } from '@/domain/validation';
import type { Application, Job, JobStatus, Notification, NotificationType, Profile } from '@/domain/types';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const DB_KEY = 'turnlist-demo-db';
const SESSION_KEY = 'turnlist-demo-session';

async function sha256(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

export interface DemoApi extends DataApi {
  reset(): Promise<void>;
  signInAs(userId: string): Promise<Session>;
  /** Runs the same housekeeping the database does on a schedule (expiry, deadline reminders). */
  runMaintenance(): Promise<void>;
}

export function createDemoApi(opts: { storage: KeyValueStorage; latencyMs?: number; now?: () => Date }): DemoApi {
  const { storage } = opts;
  const latency = opts.latencyMs ?? 0;
  const now = opts.now ?? (() => new Date());
  const listeners = new Set<(s: Session | null) => void>();
  let db: DemoDb | null = null;

  const wait = () => (latency ? new Promise((r) => setTimeout(r, latency * (0.6 + Math.random() * 0.8))) : Promise.resolve());

  async function load(): Promise<DemoDb> {
    if (db) return db;
    const raw = storage.getItem(DB_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DemoDb;
        if (parsed.version === DEMO_DB_VERSION) {
          db = parsed;
          return db;
        }
      } catch {
        /* fall through to reseed */
      }
    }
    db = buildSeed(await sha256('demo1234'), now());
    persist();
    return db;
  }
  function persist() {
    try {
      storage.setItem(DB_KEY, JSON.stringify(db));
    } catch {
      throw new ApiError('Your browser storage is full. Remove some photos or reset the demo.', 'unavailable');
    }
  }
  /** Wrap a mutation: load, run, persist. */
  async function tx<T>(fn: (d: DemoDb) => T | Promise<T>): Promise<T> {
    await wait();
    const d = await load();
    const out = await fn(d);
    persist();
    return out;
  }
  async function read<T>(fn: (d: DemoDb) => T): Promise<T> {
    await wait();
    return fn(await load());
  }

  function currentUserId(): string | null {
    return storage.getItem(SESSION_KEY);
  }
  function me(d: DemoDb, role?: Profile['role'] | Profile['role'][]): Profile {
    const id = currentUserId();
    const u = id ? d.users.find((x) => x.id === id) : undefined;
    if (!u) throw new ApiError('Sign in to continue.', 'unauthenticated');
    if (u.status === 'suspended') throw new ApiError('This account is suspended. Contact support.', 'forbidden');
    if (role) {
      const roles = Array.isArray(role) ? role : [role];
      if (!roles.includes(u.role)) throw new ApiError('You do not have access to this.', 'forbidden');
    }
    return publicProfile(u);
  }
  const publicProfile = (u: DemoDb['users'][number]): Profile => {
    const { password_hash: _ph, ...p } = u;
    void _ph;
    return p;
  };
  function emit() {
    const id = currentUserId();
    const u = id && db ? db.users.find((x) => x.id === id) : undefined;
    const s = u ? { user: publicProfile(u) } : null;
    listeners.forEach((l) => l(s));
  }

  function notify(d: DemoDb, userId: string, type: NotificationType, title: string, body: string, link: string | null) {
    const prefs = d.preferences[userId] ?? defaultPreferences();
    const p = prefs[type] ?? { in_app: true, email: false, sms: false };
    const n: Notification = { id: uid('ntf'), user_id: userId, type, title, body, link, read_at: p.in_app ? null : now().toISOString(), created_at: now().toISOString() };
    // in-app off: still recorded (for email delivery audit) but born read and hidden from the list.
    if (p.in_app) d.notifications.unshift(n);
    if (p.email) {
      const u = d.users.find((x) => x.id === userId);
      if (u) d.emailOutbox.push({ notification_id: n.id, to: u.email, created_at: n.created_at });
    }
  }

  function logAdmin(d: DemoDb, adminId: string, action: string, target_type: 'job' | 'user' | 'verification' | 'category' | 'report', target_id: string, reason: string | null) {
    d.adminActions.unshift({ id: uid('act'), admin_id: adminId, action, target_type, target_id, reason, created_at: now().toISOString() });
  }

  const nameOf = (d: DemoDb, id: string) => d.users.find((u) => u.id === id)?.display_name ?? 'Unknown user';

  function employerPublic(d: DemoDb, id: string): PublicEmployer {
    const u = d.users.find((x) => x.id === id);
    if (!u) throw new ApiError('Business not found.', 'not_found');
    const b = d.businesses.find((x) => x.user_id === id) ?? null;
    const jobs = d.jobs.filter((j) => j.employer_id === id && j.moderation_status === 'approved');
    return {
      id,
      display_name: u.display_name,
      company_name: b?.company_name ?? null,
      business_type: b?.business_type ?? null,
      avatar_url: u.avatar_url,
      member_since: u.created_at,
      jobs_posted: jobs.length,
      jobs_completed: jobs.filter((j) => j.status === 'completed').length,
      badges: verifiedBadges(d.verifications, id, now()),
      is_demo: u.is_demo,
    };
  }

  function contractorSummary(d: DemoDb, id: string): ContractorSummary {
    const u = d.users.find((x) => x.id === id);
    if (!u) throw new ApiError('Contractor not found.', 'not_found');
    const c = d.contractors.find((x) => x.user_id === id);
    const reviews = d.reviews.filter((r) => r.reviewee_id === id);
    const completed = d.applications.filter((a) => a.contractor_id === id && a.status === 'selected' && d.jobs.find((j) => j.id === a.job_id)?.status === 'completed');
    return {
      id,
      display_name: u.display_name,
      business_name: c?.business_name ?? null,
      headline: c?.headline ?? null,
      avatar_url: u.avatar_url,
      home_zip: c?.home_zip ?? null,
      years_experience: c?.years_experience ?? null,
      category_ids: c?.category_ids ?? [],
      badges: verifiedBadges(d.verifications, id, now()),
      rating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null,
      review_count: reviews.length,
      completed_jobs: completed.length,
      is_demo: u.is_demo,
    };
  }

  function ownJob(d: DemoDb, user: Profile, jobId: string): Job {
    const job = d.jobs.find((j) => j.id === jobId);
    if (!job) throw new ApiError('Job not found.', 'not_found');
    if (job.employer_id !== user.id && user.role !== 'admin') throw new ApiError('You can only manage your own listings.', 'forbidden');
    return job;
  }

  function transitionJob(d: DemoDb, job: Job, to: JobStatus, actor: Profile, reason?: string) {
    if (!canTransitionJob(job.status, to)) throw new ApiError(`A ${job.status.replace('_', ' ')} job cannot be marked ${to.replace('_', ' ')}.`, 'conflict');
    const ts = now().toISOString();
    const from = job.status;
    job.status = to;
    job.updated_at = ts;
    if (to === 'completed') job.completed_at = ts;
    if (to === 'canceled') {
      job.canceled_at = ts;
      for (const a of d.applications.filter((x) => x.job_id === job.id && x.status !== 'withdrawn' && x.status !== 'not_selected')) {
        notify(d, a.contractor_id, 'job_canceled', 'A job you applied to was canceled', job.title + (reason ? `. Reason: ${reason}` : ''), `/jobs/${job.id}`);
      }
    }
    if (to === 'open' && from === 'filled') {
      // Selected contractor backed out: release them, reopen for new applicants.
      const sel = d.applications.find((a) => a.id === job.selected_application_id);
      if (sel) sel.status = 'not_selected';
      job.selected_application_id = null;
      job.filled_at = null;
      if (new Date(job.expires_at) < now()) job.expires_at = defaultExpiry(job.job_date, job.deadline);
    }
    if (to === 'open' && from === 'expired') {
      job.expires_at = defaultExpiry(job.job_date, job.deadline);
      if (new Date(job.expires_at) < now()) throw new ApiError('Update the date needed before reopening this listing.', 'invalid');
    }
    if (actor.role === 'admin' && actor.id !== job.employer_id) logAdmin(d, actor.id, `job_status:${to}`, 'job', job.id, reason ?? null);
  }

  function writeJob(d: DemoDb, user: Profile, input: JobInput, existing?: Job): Job {
    const parsed = jobInputSchema.safeParse(input);
    if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Check the form.', 'invalid');
    const v = parsed.data;
    const cat = d.categories.find((c) => c.id === v.category_id && c.active);
    if (!cat) throw new ApiError('Choose an active category.', 'invalid');
    const area = areaForZip(v.zip)!;
    const ts = now().toISOString();
    const base = {
      title: v.title,
      category_id: v.category_id,
      description: v.description,
      neighborhood: area.neighborhood,
      zip: v.zip,
      property_type: v.property_type,
      job_date: v.job_date,
      deadline: v.deadline,
      duration_hours: v.duration_hours,
      pay_type: v.pay_type,
      pay_min: v.pay_min,
      pay_max: v.pay_max,
      experience_required: v.experience_required,
      license_required: v.license_required || cat.requires_license,
      insurance_required: v.insurance_required,
      materials: v.materials,
      urgency: v.urgency,
      is_recurring: v.is_recurring,
      recurrence_note: v.is_recurring ? v.recurrence_note : null,
      photos: v.photos,
      expires_at: defaultExpiry(v.job_date, v.deadline),
      updated_at: ts,
    };
    let job: Job;
    if (existing) {
      if (!['open', 'expired'].includes(existing.status)) throw new ApiError('Only open listings can be edited. Duplicate it to post again.', 'conflict');
      Object.assign(existing, base);
      if (existing.status === 'expired' && new Date(existing.expires_at) > now()) existing.status = 'open';
      job = existing;
    } else {
      const needsReview = user.trust_level === 'new';
      job = {
        id: uid('job'),
        employer_id: user.id,
        market_id: DEFAULT_MARKET_ID,
        ...base,
        status: 'open',
        moderation_status: needsReview ? 'pending' : 'approved',
        moderation_note: null,
        selected_application_id: null,
        application_count: 0,
        is_demo: false,
        created_at: ts,
        filled_at: null,
        completed_at: null,
        canceled_at: null,
      };
      d.jobs.unshift(job);
      const biz = d.businesses.find((b) => b.user_id === user.id);
      if (biz) biz.free_listings_used += 1;
      if (!needsReview) notifyMatches(d, job);
    }
    const priv = d.privateDetails.find((p) => p.job_id === job.id);
    if (v.street_address) {
      if (priv) Object.assign(priv, { street_address: v.street_address, unit: v.unit, access_notes: v.access_notes });
      else d.privateDetails.push({ job_id: job.id, street_address: v.street_address, unit: v.unit, access_notes: v.access_notes, shared_with: [] });
    } else if (priv) {
      d.privateDetails = d.privateDetails.filter((p) => p.job_id !== job.id);
    }
    return job;
  }

  function notifyMatches(d: DemoDb, job: Job) {
    const ids = matchingContractorIds(job, d.contractors, d.categories);
    for (const id of ids) {
      if (d.users.find((u) => u.id === id)?.status !== 'active') continue;
      notify(d, id, 'new_matching_job', 'New job near you', `${job.title} in ${job.neighborhood}`, `/jobs/${job.id}`);
    }
  }

  function conversationSummary(d: DemoDb, conversationId: string, viewerId: string): ConversationSummary {
    const c = d.conversations.find((x) => x.id === conversationId);
    if (!c || (c.employer_id !== viewerId && c.contractor_id !== viewerId)) throw new ApiError('Conversation not found.', 'not_found');
    const otherId = c.employer_id === viewerId ? c.contractor_id : c.employer_id;
    const other = d.users.find((u) => u.id === otherId)!;
    const company = d.businesses.find((b) => b.user_id === otherId)?.company_name;
    const msgs = d.messages.filter((m) => m.conversation_id === c.id);
    return {
      conversation: c,
      other: { id: otherId, name: company ? `${other.display_name}, ${company}` : other.display_name, avatar_url: other.avatar_url, role: other.role },
      job_title: c.job_id ? d.jobs.find((j) => j.id === c.job_id)?.title ?? null : null,
      last_message: msgs[msgs.length - 1] ?? null,
      unread: msgs.filter((m) => m.sender_id !== viewerId && !m.read_at).length,
    };
  }

  const api: DemoApi = {
    mode: 'demo',

    async reset() {
      db = buildSeed(await sha256('demo1234'), now());
      persist();
      storage.removeItem(SESSION_KEY);
      emit();
    },

    async signInAs(userId) {
      const d = await load();
      const u = d.users.find((x) => x.id === userId);
      if (!u) throw new ApiError('Account not found.', 'not_found');
      storage.setItem(SESSION_KEY, u.id);
      emit();
      return { user: publicProfile(u) };
    },

    async runMaintenance() {
      await tx((d) => {
        const t = now();
        const soon = new Date(t.getTime() + 24 * 3_600_000).toISOString().slice(0, 10);
        for (const j of d.jobs) {
          if (j.status === 'open' && new Date(j.expires_at) < t) {
            j.status = 'expired';
            j.updated_at = t.toISOString();
          }
          const due = j.deadline ?? j.job_date;
          const alreadyReminded = d.notifications.some((n) => n.type === 'deadline_approaching' && n.link?.endsWith(j.id));
          if (!alreadyReminded && ['open', 'filled', 'in_progress'].includes(j.status) && due <= soon && due >= t.toISOString().slice(0, 10)) {
            notify(d, j.employer_id, 'deadline_approaching', j.status === 'open' ? 'Job still unfilled' : 'Job due soon', `${j.title} is due ${due}`, `/employer/listings/${j.id}`);
            const sel = d.applications.find((a) => a.id === j.selected_application_id);
            if (sel) notify(d, sel.contractor_id, 'deadline_approaching', 'Upcoming job', `${j.title} is due ${due}`, `/jobs/${j.id}`);
          }
        }
      });
    },

    async getSession() {
      const d = await load();
      const id = currentUserId();
      const u = id ? d.users.find((x) => x.id === id) : undefined;
      return u ? { user: publicProfile(u) } : null;
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signIn(email, password) {
      await wait();
      const d = await load();
      const u = d.users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
      if (!u || u.password_hash !== (await sha256(password))) throw new ApiError('Email or password is incorrect.', 'unauthenticated');
      if (u.status === 'suspended') throw new ApiError('This account is suspended.', 'forbidden');
      storage.setItem(SESSION_KEY, u.id);
      emit();
      return { user: publicProfile(u) };
    },
    async signUp(input) {
      const hash = await sha256(input.password);
      const session = await tx((d) => {
        if (d.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) throw new ApiError('An account with this email already exists.', 'conflict');
        const u = {
          id: uid('usr'),
          role: input.role,
          email: input.email.trim(),
          display_name: input.display_name.trim(),
          avatar_url: null,
          market_id: DEFAULT_MARKET_ID,
          status: 'active' as const,
          trust_level: 'new' as const,
          is_demo: false,
          created_at: now().toISOString(),
          password_hash: hash,
        };
        d.users.push(u);
        d.preferences[u.id] = defaultPreferences();
        return { user: publicProfile(u) };
      });
      storage.setItem(SESSION_KEY, session.user.id);
      emit();
      return session;
    },
    async signOut() {
      storage.removeItem(SESSION_KEY);
      emit();
    },

    listCategories: (o) => read((d) => d.categories.filter((c) => o?.includeInactive || c.active).sort((a, b) => a.sort - b.sort)),

    listAvailableJobs: () => read((d) => d.jobs.filter((j) => isJobAvailable(j, now()))),

    getJob: (id) =>
      read((d): JobDetail => {
        const job = d.jobs.find((j) => j.id === id);
        const viewerId = currentUserId();
        const viewer = viewerId ? d.users.find((u) => u.id === viewerId) : undefined;
        if (!job) throw new ApiError('This job does not exist or was removed.', 'not_found');
        const isOwner = viewer?.id === job.employer_id;
        const isAdmin = viewer?.role === 'admin';
        const myApplication = viewer ? d.applications.find((a) => a.job_id === id && a.contractor_id === viewer.id) ?? null : null;
        // Same rule as the jobs SELECT policy: public sees approved listings; owner, applicants, and admins see the rest.
        if (job.moderation_status !== 'approved' && !isOwner && !isAdmin && !myApplication) throw new ApiError('This job does not exist or was removed.', 'not_found');
        const priv = d.privateDetails.find((p) => p.job_id === id) ?? null;
        const canSeeAddress = Boolean(priv && (isOwner || isAdmin || (viewer && priv.shared_with.includes(viewer.id))));
        return {
          job,
          employer: employerPublic(d, job.employer_id),
          privateDetails: canSeeAddress ? priv : null,
          myApplication,
          isSaved: Boolean(viewer && d.savedJobs.some((s) => s.job_id === id && s.contractor_id === viewer.id)),
          isOwner,
        };
      }),

    createJob: (input) =>
      tx((d) => {
        const user = me(d, 'employer');
        if (!d.businesses.some((b) => b.user_id === user.id)) throw new ApiError('Add your business name before posting.', 'invalid');
        return writeJob(d, user, input);
      }),
    updateJob: (id, input) =>
      tx((d) => {
        const user = me(d, ['employer', 'admin']);
        return writeJob(d, user, input, ownJob(d, user, id));
      }),
    setJobStatus: (id, status, reason) =>
      tx((d) => {
        const user = me(d, ['employer', 'admin']);
        const job = ownJob(d, user, id);
        transitionJob(d, job, status, user, reason);
        return job;
      }),
    listMyJobs: () =>
      read((d) => {
        const user = me(d, 'employer');
        return d.jobs.filter((j) => j.employer_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
      }),
    shareAddress: (jobId, contractorId) =>
      tx((d) => {
        const user = me(d, 'employer');
        ownJob(d, user, jobId);
        const priv = d.privateDetails.find((p) => p.job_id === jobId);
        if (!priv) throw new ApiError('Add the property address to this listing first.', 'invalid');
        const applied = d.applications.some((a) => a.job_id === jobId && a.contractor_id === contractorId && a.status !== 'withdrawn');
        if (!applied) throw new ApiError('You can only share the address with an applicant.', 'forbidden');
        if (!priv.shared_with.includes(contractorId)) priv.shared_with.push(contractorId);
      }),
    reportJob: (jobId, reason) =>
      tx((d) => {
        const user = me(d);
        if (reason.trim().length < 10) throw new ApiError('Tell us briefly what is wrong (10+ characters).', 'invalid');
        if (d.reports.some((r) => r.reporter_id === user.id && r.target_id === jobId && r.status === 'open')) throw new ApiError('You already reported this listing. We will review it.', 'conflict');
        d.reports.unshift({ id: uid('rep'), reporter_id: user.id, target_type: 'job', target_id: jobId, reason: reason.trim(), status: 'open', created_at: now().toISOString() });
      }),

    applyToJob: (jobId, input) =>
      tx((d) => {
        const user = me(d, 'contractor');
        const parsed = applicationInputSchema.safeParse(input);
        if (!parsed.success) throw new ApiError(parsed.error.issues[0]?.message ?? 'Check the form.', 'invalid');
        const job = d.jobs.find((j) => j.id === jobId);
        if (!job || !isJobAvailable(job, now())) throw new ApiError('This job is no longer accepting applications.', 'conflict');
        const existing = d.applications.find((a) => a.job_id === jobId && a.contractor_id === user.id);
        if (existing && existing.status !== 'withdrawn') throw new ApiError('You already applied to this job.', 'conflict');
        const profile = d.contractors.find((c) => c.user_id === user.id) ?? null;
        if (!profile || !profile.category_ids.length || !profile.home_zip) throw new ApiError('Finish your profile (services and ZIP) before applying.', 'invalid');
        const ts = now().toISOString();
        const fields = { message: parsed.data.message, proposed_rate: parsed.data.proposed_rate, available_on: parsed.data.available_on, status: 'submitted' as const, updated_at: ts, viewed_at: null, is_qualified: qualify(job, profile, d.categories).qualified };
        let app: Application;
        if (existing) {
          app = Object.assign(existing, fields, { created_at: ts });
        } else {
          app = { id: uid('app'), job_id: jobId, contractor_id: user.id, created_at: ts, ...fields };
          d.applications.push(app);
        }
        job.application_count += 1;
        notify(d, job.employer_id, 'application_received', 'New application', `${user.display_name} applied to ${job.title}`, `/employer/listings/${job.id}`);
        return app;
      }),
    withdrawApplication: (id) =>
      tx((d) => {
        const user = me(d, 'contractor');
        const app = d.applications.find((a) => a.id === id);
        if (!app || app.contractor_id !== user.id) throw new ApiError('Application not found.', 'not_found');
        if (!canTransitionApplication('contractor', app.status, 'withdrawn')) throw new ApiError('This application can no longer be withdrawn.', 'conflict');
        const job = d.jobs.find((j) => j.id === app.job_id)!;
        const wasSelected = app.status === 'selected';
        app.status = 'withdrawn';
        app.updated_at = now().toISOString();
        job.application_count = Math.max(0, job.application_count - 1);
        if (wasSelected && job.status === 'filled') {
          job.selected_application_id = null;
          job.status = 'open';
          job.filled_at = null;
          if (new Date(job.expires_at) < now()) job.expires_at = defaultExpiry(job.job_date, job.deadline);
          notify(d, job.employer_id, 'contractor_selected', 'Selected contractor withdrew', `${user.display_name} withdrew from ${job.title}. The listing is open again.`, `/employer/listings/${job.id}`);
        }
        return app;
      }),
    listMyApplications: () =>
      read((d): ApplicationWithJob[] => {
        const user = me(d, 'contractor');
        return d.applications
          .filter((a) => a.contractor_id === user.id)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .map((application) => {
            const job = d.jobs.find((j) => j.id === application.job_id)!;
            return { application, job, employer_name: employerPublic(d, job.employer_id).company_name ?? nameOf(d, job.employer_id) };
          });
      }),
    listApplicantsForEmployer: (jobId) =>
      read((d): ApplicationWithContractor[] => {
        const user = me(d, ['employer', 'admin']);
        const myJobs = new Map(d.jobs.filter((j) => (user.role === 'admin' || j.employer_id === user.id) && (!jobId || j.id === jobId)).map((j) => [j.id, j]));
        if (jobId && !myJobs.size) throw new ApiError('Job not found.', 'not_found');
        return d.applications
          .filter((a) => myJobs.has(a.job_id) && a.status !== 'withdrawn')
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((application) => {
            const j = myJobs.get(application.job_id)!;
            return {
              application,
              contractor: contractorSummary(d, application.contractor_id),
              job: { id: j.id, title: j.title, status: j.status, job_date: j.job_date, category_id: j.category_id, zip: j.zip },
            };
          });
      }),
    setApplicationStatus: (id, status) =>
      tx((d) => {
        const user = me(d, ['employer', 'admin']);
        const app = d.applications.find((a) => a.id === id);
        if (!app) throw new ApiError('Application not found.', 'not_found');
        const job = ownJob(d, user, app.job_id);
        if (app.status === status) return app;
        if (!canTransitionApplication(user.role, app.status, status)) throw new ApiError(`Cannot move an application from ${app.status} to ${status}.`, 'conflict');
        if (app.status === 'selected') throw new ApiError('Reopen the job to release the selected contractor.', 'conflict');
        app.status = status;
        app.updated_at = now().toISOString();
        if (status === 'viewed' && !app.viewed_at) app.viewed_at = app.updated_at;
        if (status === 'shortlisted') notify(d, app.contractor_id, 'application_shortlisted', 'You were shortlisted', job.title, `/jobs/${job.id}`);
        if (status === 'not_selected') notify(d, app.contractor_id, 'application_not_selected', 'Update on your application', `${job.title}: the business chose not to move forward.`, `/contractor/applications`);
        return app;
      }),
    selectApplication: (id) =>
      tx((d) => {
        const user = me(d, ['employer', 'admin']);
        const app = d.applications.find((a) => a.id === id);
        if (!app || app.status === 'withdrawn') throw new ApiError('Application not found.', 'not_found');
        const job = ownJob(d, user, app.job_id);
        if (job.status !== 'open') throw new ApiError('This job is not open, so a contractor cannot be selected.', 'conflict');
        const ts = now().toISOString();
        app.status = 'selected';
        app.updated_at = ts;
        job.status = 'filled';
        job.filled_at = ts;
        job.selected_application_id = app.id;
        job.updated_at = ts;
        notify(d, app.contractor_id, 'contractor_selected', 'You were selected', `${employerPublic(d, job.employer_id).company_name ?? user.display_name} selected you for ${job.title}.`, `/jobs/${job.id}`);
        notify(d, job.employer_id, 'contractor_selected', 'Contractor confirmed', `You selected ${nameOf(d, app.contractor_id)} for ${job.title}.`, `/employer/listings/${job.id}`);
        for (const other of d.applications.filter((a) => a.job_id === job.id && a.id !== app.id && !['withdrawn', 'not_selected'].includes(a.status))) {
          other.status = 'not_selected';
          other.updated_at = ts;
          notify(d, other.contractor_id, 'application_not_selected', 'Update on your application', `${job.title} has been filled.`, `/contractor/applications`);
        }
        return job;
      }),

    listSavedJobIds: () =>
      read((d) => {
        const user = me(d, 'contractor');
        return d.savedJobs.filter((s) => s.contractor_id === user.id).map((s) => s.job_id);
      }),
    toggleSaveJob: (jobId) =>
      tx((d) => {
        const user = me(d, 'contractor');
        const i = d.savedJobs.findIndex((s) => s.job_id === jobId && s.contractor_id === user.id);
        if (i >= 0) {
          d.savedJobs.splice(i, 1);
          return false;
        }
        d.savedJobs.unshift({ contractor_id: user.id, job_id: jobId, created_at: now().toISOString() });
        return true;
      }),
    listSavedContractors: () =>
      read((d) => {
        const user = me(d, 'employer');
        return d.savedContractors.filter((s) => s.employer_id === user.id).map((s) => ({ contractor: contractorSummary(d, s.contractor_id), note: s.note, saved_at: s.created_at }));
      }),
    toggleSaveContractor: (contractorId, note) =>
      tx((d) => {
        const user = me(d, 'employer');
        const i = d.savedContractors.findIndex((s) => s.employer_id === user.id && s.contractor_id === contractorId);
        if (i >= 0) {
          d.savedContractors.splice(i, 1);
          return false;
        }
        if (!d.contractors.some((c) => c.user_id === contractorId)) throw new ApiError('Contractor not found.', 'not_found');
        d.savedContractors.unshift({ employer_id: user.id, contractor_id: contractorId, note: note ?? null, created_at: now().toISOString() });
        return true;
      }),

    getMyAccount: () =>
      read((d) => {
        const user = me(d);
        return {
          profile: user,
          business: d.businesses.find((b) => b.user_id === user.id) ?? null,
          contractor: d.contractors.find((c) => c.user_id === user.id) ?? null,
          preferences: d.preferences[user.id] ?? defaultPreferences(),
        };
      }),
    updateMyProfile: (patch) =>
      tx((d) => {
        const user = me(d);
        const u = d.users.find((x) => x.id === user.id)!;
        if (patch.display_name !== undefined) {
          if (patch.display_name.trim().length < 2) throw new ApiError('Enter your name.', 'invalid');
          u.display_name = patch.display_name.trim();
        }
        if (patch.avatar_url !== undefined) u.avatar_url = patch.avatar_url;
        const p = publicProfile(u);
        queueMicrotask(emit);
        return p;
      }),
    saveBusinessProfile: (input) =>
      tx((d) => {
        const user = me(d, 'employer');
        const ts = now().toISOString();
        const existing = d.businesses.find((b) => b.user_id === user.id);
        if (existing) return Object.assign(existing, input, { updated_at: ts });
        const b = { user_id: user.id, plan: 'free_intro' as const, free_listings_used: 0, updated_at: ts, ...input };
        d.businesses.push(b);
        return b;
      }),
    saveContractorProfile: (input) =>
      tx((d) => {
        const user = me(d, 'contractor');
        const ts = now().toISOString();
        const existing = d.contractors.find((c) => c.user_id === user.id);
        if (existing) return Object.assign(existing, input, { updated_at: ts });
        const c = { user_id: user.id, updated_at: ts, ...input };
        d.contractors.push(c);
        return c;
      }),
    getContractor: (id) =>
      read((d): ContractorPublic => {
        const c = d.contractors.find((x) => x.user_id === id);
        const u = d.users.find((x) => x.id === id && x.role === 'contractor');
        if (!c || !u) throw new ApiError('Contractor not found.', 'not_found');
        const viewerId = currentUserId();
        const viewer = viewerId ? d.users.find((x) => x.id === viewerId) : undefined;
        // Contact details: the contractor, admins, and employers they applied to.
        const appliedToViewer = Boolean(viewer && d.applications.some((a) => a.contractor_id === id && a.status !== 'withdrawn' && d.jobs.find((j) => j.id === a.job_id)?.employer_id === viewer.id));
        const canSeeContact = viewer && (viewer.id === id || viewer.role === 'admin' || appliedToViewer);
        return {
          ...contractorSummary(d, id),
          bio: c.bio,
          service_radius_miles: c.service_radius_miles,
          availability: c.availability,
          insurance_self_reported: c.insurance_self_reported,
          licenses: c.licenses,
          certifications: c.certifications,
          portfolio: c.portfolio,
          contact: canSeeContact ? { phone: c.contact_phone, email: c.contact_email } : null,
          reviews: d.reviews
            .filter((r) => r.reviewee_id === id)
            .map((r) => ({ ...r, reviewer_name: employerPublic(d, r.reviewer_id).company_name ?? nameOf(d, r.reviewer_id), job_title: d.jobs.find((j) => j.id === r.job_id)?.title ?? null })),
          member_since: u.created_at,
        };
      }),
    getEmployer: (id) => read((d) => employerPublic(d, id)),
    savePreferences: (prefs) =>
      tx((d) => {
        const user = me(d);
        for (const k of Object.keys(prefs) as Array<keyof typeof prefs>) prefs[k].sms = false; // not offered yet
        d.preferences[user.id] = prefs;
      }),
    async upload(bucket, file) {
      if (!file.type.startsWith('image/') && bucket !== 'verification-docs') throw new ApiError('Upload an image file (JPG, PNG, or WebP).', 'invalid');
      if (file.size > 10 * 1024 * 1024) throw new ApiError('Files must be under 10 MB.', 'invalid');
      if (bucket === 'verification-docs') {
        // Demo mode never keeps identity or license documents, only the file name.
        return { url: '', path: `demo-not-stored/${file.name}` };
      }
      const url = await downscaleImage(file, bucket === 'avatars' ? 320 : 1280);
      return { url, path: url };
    },

    createReview: (jobId, rating, body) =>
      tx((d) => {
        const user = me(d, 'employer');
        const job = ownJob(d, user, jobId);
        if (job.status !== 'completed') throw new ApiError('You can review a contractor after the job is marked completed.', 'conflict');
        const sel = d.applications.find((a) => a.id === job.selected_application_id);
        if (!sel) throw new ApiError('No contractor was selected for this job.', 'invalid');
        if (d.reviews.some((r) => r.job_id === jobId && r.reviewer_id === user.id)) throw new ApiError('You already reviewed this job.', 'conflict');
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new ApiError('Choose a rating from 1 to 5.', 'invalid');
        const r = { id: uid('rev'), job_id: jobId, reviewer_id: user.id, reviewee_id: sel.contractor_id, rating, body: body?.trim() || null, created_at: now().toISOString() };
        d.reviews.push(r);
        return r;
      }),
    listReviewsForJob: (jobId) => read((d) => d.reviews.filter((r) => r.job_id === jobId)),

    listConversations: () =>
      read((d) => {
        const user = me(d);
        return d.conversations
          .filter((c) => c.employer_id === user.id || c.contractor_id === user.id)
          .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
          .map((c) => conversationSummary(d, c.id, user.id));
      }),
    getMessages: (conversationId) =>
      tx((d) => {
        const user = me(d);
        const summary = conversationSummary(d, conversationId, user.id);
        const ts = now().toISOString();
        const messages = d.messages.filter((m) => m.conversation_id === conversationId);
        for (const m of messages) if (m.sender_id !== user.id && !m.read_at) m.read_at = ts;
        return { summary: { ...summary, unread: 0 }, messages };
      }),
    startConversation: (otherUserId, jobId) =>
      tx((d) => {
        const user = me(d, ['employer', 'contractor']);
        const other = d.users.find((u) => u.id === otherUserId);
        if (!other || other.role === user.role || other.role === 'admin') throw new ApiError('You can message businesses and contractors connected through a job.', 'forbidden');
        const employer_id = user.role === 'employer' ? user.id : other.id;
        const contractor_id = user.role === 'contractor' ? user.id : other.id;
        // Same rule as the database: a conversation needs an application between the two parties.
        const linked = d.applications.some((a) => a.contractor_id === contractor_id && a.status !== 'withdrawn' && d.jobs.find((j) => j.id === a.job_id)?.employer_id === employer_id && (!jobId || a.job_id === jobId));
        const saved = d.savedContractors.some((s) => s.employer_id === employer_id && s.contractor_id === contractor_id);
        if (!linked && !(user.role === 'employer' && saved)) throw new ApiError('Messaging opens once a contractor applies to one of your jobs.', 'forbidden');
        const existing = d.conversations.find((c) => c.employer_id === employer_id && c.contractor_id === contractor_id && c.job_id === jobId);
        if (existing) return existing.id;
        const ts = now().toISOString();
        const c = { id: uid('conv'), job_id: jobId, employer_id, contractor_id, created_at: ts, last_message_at: ts };
        d.conversations.unshift(c);
        return c.id;
      }),
    sendMessage: (conversationId, body) =>
      tx((d) => {
        const user = me(d);
        const c = d.conversations.find((x) => x.id === conversationId);
        if (!c || (c.employer_id !== user.id && c.contractor_id !== user.id)) throw new ApiError('Conversation not found.', 'not_found');
        const text = body.trim();
        if (!text) throw new ApiError('Write a message first.', 'invalid');
        if (text.length > 4000) throw new ApiError('Messages are limited to 4,000 characters.', 'invalid');
        const ts = now().toISOString();
        const m = { id: uid('msg'), conversation_id: c.id, sender_id: user.id, body: text, created_at: ts, read_at: null };
        d.messages.push(m);
        c.last_message_at = ts;
        const to = c.employer_id === user.id ? c.contractor_id : c.employer_id;
        notify(d, to, 'new_message', `New message from ${user.display_name}`, text.slice(0, 120), `/messages/${c.id}`);
        return m;
      }),

    listNotifications: () =>
      read((d) => {
        const user = me(d);
        return d.notifications.filter((n) => n.user_id === user.id).slice(0, 100);
      }),
    markNotificationsRead: (ids) =>
      tx((d) => {
        const user = me(d);
        const ts = now().toISOString();
        for (const n of d.notifications) if (n.user_id === user.id && !n.read_at && (ids === 'all' || ids.includes(n.id))) n.read_at = ts;
      }),

    listMyVerifications: () =>
      read((d) => {
        const user = me(d);
        return d.verifications.filter((v) => v.user_id === user.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
      }),
    async submitVerification({ kind, file, details }) {
      const uploaded = file ? await api.upload('verification-docs', file) : null;
      return tx((d) => {
        const user = me(d, ['employer', 'contractor']);
        if (!file && details.trim().length < 4) throw new ApiError('Attach a document or describe what we should check.', 'invalid');
        if (d.verifications.some((v) => v.user_id === user.id && v.kind === kind && v.status === 'pending')) throw new ApiError('You already have a request of this type under review.', 'conflict');
        const v = { id: uid('ver'), user_id: user.id, kind, status: 'pending' as const, document_path: uploaded?.path ?? null, document_name: file?.name ?? null, details: details.trim() || null, reviewer_id: null, reviewer_note: null, reviewed_at: null, expires_on: null, created_at: now().toISOString() };
        d.verifications.unshift(v);
        return v;
      });
    },

    adminMetrics: () =>
      read((d): Metrics => {
        me(d, 'admin');
        return computeMetrics(d, now());
      }),
    adminListJobs: () =>
      read((d) => {
        me(d, 'admin');
        return d.jobs
          .map((j) => ({ ...j, employer_name: employerPublic(d, j.employer_id).company_name ?? nameOf(d, j.employer_id), report_count: d.reports.filter((r) => r.target_id === j.id && r.status === 'open').length }))
          .sort((a, b) => b.created_at.localeCompare(a.created_at));
      }),
    adminModerateJob: (id, decision, reason) =>
      tx((d) => {
        const admin = me(d, 'admin');
        const job = d.jobs.find((j) => j.id === id);
        if (!job) throw new ApiError('Job not found.', 'not_found');
        if (decision !== 'approve' && !reason?.trim()) throw new ApiError('Give a reason. It is shared with the business.', 'invalid');
        const was = job.moderation_status;
        job.moderation_status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'removed';
        job.moderation_note = reason?.trim() || null;
        job.updated_at = now().toISOString();
        if (decision === 'remove' && ['open', 'filled', 'in_progress'].includes(job.status)) transitionJob(d, job, 'canceled', admin, 'Removed by moderation');
        logAdmin(d, admin.id, `moderate:${decision}`, 'job', id, reason);
        notify(d, job.employer_id, 'listing_moderated', decision === 'approve' ? 'Your listing is live' : 'Your listing was not published', decision === 'approve' ? job.title : `${job.title}: ${reason}`, `/employer/listings/${job.id}`);
        if (decision === 'approve' && was === 'pending' && job.status === 'open') notifyMatches(d, job);
      }),
    adminListUsers: () =>
      read((d): AdminUserRow[] => {
        me(d, 'admin');
        return d.users
          .map((u) => ({
            profile: publicProfile(u),
            company_name: d.businesses.find((b) => b.user_id === u.id)?.company_name ?? d.contractors.find((c) => c.user_id === u.id)?.business_name ?? null,
            jobs: d.jobs.filter((j) => j.employer_id === u.id).length,
            applications: d.applications.filter((a) => a.contractor_id === u.id).length,
            open_reports: d.reports.filter((r) => r.status === 'open' && (r.target_id === u.id || d.jobs.find((j) => j.id === r.target_id)?.employer_id === u.id)).length,
          }))
          .sort((a, b) => b.profile.created_at.localeCompare(a.profile.created_at));
      }),
    adminSetUserStatus: (id, status, reason) =>
      tx((d) => {
        const admin = me(d, 'admin');
        const u = d.users.find((x) => x.id === id);
        if (!u) throw new ApiError('User not found.', 'not_found');
        if (u.id === admin.id) throw new ApiError('You cannot suspend your own account.', 'forbidden');
        if (status === 'suspended' && !reason?.trim()) throw new ApiError('Give a reason for the suspension.', 'invalid');
        u.status = status;
        if (status === 'suspended') {
          for (const j of d.jobs.filter((x) => x.employer_id === id && x.status === 'open')) {
            transitionJob(d, j, 'canceled', admin, 'Account suspended');
          }
        }
        logAdmin(d, admin.id, `user_status:${status}`, 'user', id, reason);
      }),
    adminSetTrust: (id, trust) =>
      tx((d) => {
        const admin = me(d, 'admin');
        const u = d.users.find((x) => x.id === id);
        if (!u) throw new ApiError('User not found.', 'not_found');
        u.trust_level = trust;
        logAdmin(d, admin.id, `trust:${trust}`, 'user', id, null);
      }),
    adminListVerifications: () =>
      read((d) => {
        me(d, 'admin');
        return d.verifications.map((v) => {
          const u = d.users.find((x) => x.id === v.user_id);
          return { ...v, user_name: u?.display_name ?? 'Unknown', user_role: u?.role ?? 'contractor' };
        });
      }),
    adminReviewVerification: (id, decision, note, expires_on) =>
      tx((d) => {
        const admin = me(d, 'admin');
        const v = d.verifications.find((x) => x.id === id);
        if (!v) throw new ApiError('Request not found.', 'not_found');
        if (v.status !== 'pending') throw new ApiError('This request was already reviewed.', 'conflict');
        if (decision === 'rejected' && !note?.trim()) throw new ApiError('Explain what was missing so the user can resubmit.', 'invalid');
        Object.assign(v, { status: decision, reviewer_id: admin.id, reviewer_note: note?.trim() || null, reviewed_at: now().toISOString(), expires_on });
        logAdmin(d, admin.id, `verification:${decision}`, 'verification', id, note);
        notify(d, v.user_id, 'verification_updated', decision === 'approved' ? 'Verification approved' : 'Verification needs attention', decision === 'approved' ? `Your ${v.kind} check was approved.` : `Your ${v.kind} check was not approved: ${note}`, '/settings/verification');
      }),
    adminVerificationDocumentUrl: async () => null,
    adminSaveCategory: (input) =>
      tx((d) => {
        const admin = me(d, 'admin');
        if (input.name.trim().length < 2) throw new ApiError('Enter a category name.', 'invalid');
        if (input.id) {
          const c = d.categories.find((x) => x.id === input.id);
          if (!c) throw new ApiError('Category not found.', 'not_found');
          Object.assign(c, { ...input, name: input.name.trim() });
          logAdmin(d, admin.id, 'category:update', 'category', c.id, null);
          return c;
        }
        const slug = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        if (d.categories.some((c) => c.slug === slug)) throw new ApiError('A category with this name already exists.', 'conflict');
        const c = { id: `cat_${slug}`, slug, name: input.name.trim(), group: input.group, requires_license: Boolean(input.requires_license), license_note: input.license_note ?? null, active: input.active ?? true, sort: Math.max(...d.categories.map((x) => x.sort)) + 10 };
        d.categories.push(c);
        logAdmin(d, admin.id, 'category:create', 'category', c.id, null);
        return c;
      }),
    adminListActions: () =>
      read((d) => {
        me(d, 'admin');
        return d.adminActions.map((a) => ({ ...a, admin_name: nameOf(d, a.admin_id) }));
      }),
    adminListReports: () =>
      read((d) => {
        me(d, 'admin');
        return d.reports.map((r) => ({ ...r, reporter_name: nameOf(d, r.reporter_id), target_label: r.target_type === 'job' ? d.jobs.find((j) => j.id === r.target_id)?.title ?? 'Deleted job' : nameOf(d, r.target_id) }));
      }),
    adminResolveReport: (id, status) =>
      tx((d) => {
        const admin = me(d, 'admin');
        const r = d.reports.find((x) => x.id === id);
        if (!r) throw new ApiError('Report not found.', 'not_found');
        r.status = status;
        logAdmin(d, admin.id, `report:${status}`, 'report', id, null);
      }),
  };
  return api;
}

export function computeMetrics(d: DemoDb, now: Date): Metrics {
  const employers = d.users.filter((u) => u.role === 'employer');
  const jobs = d.jobs;
  const approved = jobs.filter((j) => j.moderation_status === 'approved');
  const activeApps = d.applications.filter((a) => a.status !== 'withdrawn');
  const appsByJob = new Map<string, Application[]>();
  for (const a of activeApps) appsByJob.set(a.job_id, [...(appsByJob.get(a.job_id) ?? []), a]);

  const hoursToSelect = approved.filter((j) => j.filled_at).map((j) => (new Date(j.filled_at!).getTime() - new Date(j.created_at).getTime()) / 3_600_000).sort((a, b) => a - b);
  const median = hoursToSelect.length ? hoursToSelect[Math.floor(hoursToSelect.length / 2)] : null;

  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    keys.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const matureMs = 72 * 3_600_000;
  const eligible = approved.filter((j) => j.status !== 'open' || now.getTime() - new Date(j.created_at).getTime() >= matureMs);
  const succeeded = eligible.filter((j) => (appsByJob.get(j.id) ?? []).some((a) => a.is_qualified));

  const statusCounts = { open: 0, filled: 0, in_progress: 0, completed: 0, canceled: 0, expired: 0 } as Metrics['statusCounts'];
  for (const j of approved) statusCounts[isJobAvailable(j, now) || j.status !== 'open' ? j.status : 'expired'] += 1;

  return {
    employers: employers.length,
    contractors: d.users.filter((u) => u.role === 'contractor').length,
    activeListings: approved.filter((j) => isJobAvailable(j, now)).length,
    totalListings: approved.length,
    applications: activeApps.length,
    avgApplicationsPerJob: approved.length ? activeApps.filter((a) => approved.some((j) => j.id === a.job_id)).length / approved.length : 0,
    filledJobs: approved.filter((j) => j.filled_at).length,
    medianHoursToSelection: median,
    returningEmployers: employers.filter((e) => jobs.filter((j) => j.employer_id === e.id).length >= 2).length,
    topCategories: count(approved.map((j) => j.category_id)).slice(0, 6).map(([category_id, n]) => ({ category_id, count: n })),
    noApplicationJobs: eligible.filter((j) => !(appsByJob.get(j.id) ?? []).length).length,
    topZips: count(approved.map((j) => j.zip)).slice(0, 6).map(([zip, n]) => ({ zip, count: n })),
    primary: { eligible: eligible.length, succeeded: succeeded.length, rate: eligible.length ? succeeded.length / eligible.length : null },
    pendingModeration: jobs.filter((j) => j.moderation_status === 'pending').length,
    pendingVerifications: d.verifications.filter((v) => v.status === 'pending').length,
    openReports: d.reports.filter((r) => r.status === 'open').length,
    statusCounts,
  };
}

async function downscaleImage(file: File, maxSide: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
}
