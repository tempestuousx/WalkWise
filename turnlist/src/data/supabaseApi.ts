import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './api';
import type { ContractorPublic, ContractorSummary, ConversationSummary, DataApi, Metrics, PublicEmployer, Session } from './api';
import { defaultPreferences } from '@/domain/notifications';
import { isJobAvailable } from '@/domain/status';
import type { BusinessProfile, ContractorProfile, Job, Message, Profile, Role } from '@/domain/types';
import type { JobInput } from '@/domain/validation';

/**
 * Supabase implementation of DataApi. Reads go straight to tables (RLS
 * filters rows); multi-step writes call the RPCs in supabase/migrations/0002.
 */
export function createSupabaseApi(url: string, anonKey: string): DataApi {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });

  function fail(error: PostgrestError | { message: string; hint?: string } | null): never {
    const hint = (error as PostgrestError | null)?.hint;
    const code = (['unauthenticated', 'forbidden', 'not_found', 'invalid', 'conflict'] as const).find((c) => c === hint) ?? 'invalid';
    throw new ApiError(error?.message ?? 'Something went wrong. Try again.', code);
  }
  async function q<T>(p: PromiseLike<{ data: T | null; error: PostgrestError | null }>): Promise<T> {
    const { data, error } = await p;
    if (error) fail(error);
    return data as T;
  }
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    return q<T>(sb.rpc(fn, args));
  }
  async function uidOrThrow(): Promise<string> {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new ApiError('Sign in to continue.', 'unauthenticated');
    return id;
  }
  async function sessionFor(userId: string, email: string): Promise<Session | null> {
    const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
    return data ? { user: { ...(data as Omit<Profile, 'email'>), email } } : null;
  }
  async function contractorSummaries(ids: string[]): Promise<Map<string, ContractorSummary>> {
    if (!ids.length) return new Map();
    const rows = await rpc<ContractorSummary[]>('contractor_summaries', { p_ids: Array.from(new Set(ids)) });
    return new Map(rows.map((r) => [r.id, { ...r, rating: r.rating === null ? null : Number(r.rating) }]));
  }
  function jobRow(input: JobInput) {
    const { street_address: _a, unit: _u, access_notes: _n, ...rest } = input;
    void _a; void _u; void _n;
    return { ...rest, neighborhood: '', market_id: 'mkt_las_vegas', expires_at: new Date().toISOString() }; // server recomputes
  }
  async function writePrivate(jobId: string, input: JobInput) {
    if (input.street_address) {
      await q(sb.from('job_private_details').upsert({ job_id: jobId, street_address: input.street_address, unit: input.unit, access_notes: input.access_notes }));
    } else {
      await q(sb.from('job_private_details').delete().eq('job_id', jobId));
    }
  }

  const api: DataApi = {
    mode: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? sessionFor(u.id, u.email ?? '') : null;
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        const u = session?.user;
        // Defer to avoid calling Supabase inside the auth callback.
        setTimeout(() => void (u ? sessionFor(u.id, u.email ?? '').then(cb) : cb(null)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.user) throw new ApiError(error?.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error?.message ?? 'Could not sign in.', 'unauthenticated');
      const s = await sessionFor(data.user.id, data.user.email ?? email);
      if (!s) throw new ApiError('Your profile could not be loaded.', 'not_found');
      if (s.user.status === 'suspended') {
        await sb.auth.signOut();
        throw new ApiError('This account is suspended.', 'forbidden');
      }
      return s;
    },
    async signUp({ role, display_name, email, password }) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { role, display_name }, emailRedirectTo: `${location.origin}/signin` } });
      if (error) throw new ApiError(error.message, 'invalid');
      if (!data.session || !data.user) return { confirmEmail: true as const };
      const s = await sessionFor(data.user.id, email);
      if (!s) throw new ApiError('Your profile could not be created.', 'unavailable');
      return s;
    },
    async signOut() {
      await sb.auth.signOut();
    },

    listCategories: async (o) => {
      let query = sb.from('categories').select('*').order('sort');
      if (!o?.includeInactive) query = query.eq('active', true);
      return q(query);
    },

    async listAvailableJobs() {
      const rows = await q<Job[]>(sb.from('jobs').select('*').eq('status', 'open').eq('moderation_status', 'approved').gte('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(500));
      return rows.filter((j) => isJobAvailable(j));
    },
    async getJob(id) {
      const { data: sess } = await sb.auth.getSession();
      const me = sess.session?.user.id ?? null;
      const job = await q<Job | null>(sb.from('jobs').select('*').eq('id', id).maybeSingle());
      if (!job) throw new ApiError('This job does not exist or was removed.', 'not_found');
      const [employer, priv, mine, saved] = await Promise.all([
        rpc<PublicEmployer>('employer_public', { p_id: job.employer_id }),
        q(sb.from('job_private_details').select('*').eq('job_id', id).maybeSingle()),
        me ? q(sb.from('applications').select('*').eq('job_id', id).eq('contractor_id', me).maybeSingle()) : Promise.resolve(null),
        me ? q(sb.from('saved_jobs').select('job_id').eq('job_id', id).eq('contractor_id', me).maybeSingle()) : Promise.resolve(null),
      ]);
      return {
        job,
        employer,
        privateDetails: priv ? { ...(priv as object), shared_with: [] } as never : null,
        myApplication: (mine as never) ?? null,
        isSaved: Boolean(saved),
        isOwner: me === job.employer_id,
      };
    },
    async createJob(input) {
      const me = await uidOrThrow();
      const job = await q<Job>(sb.from('jobs').insert({ ...jobRow(input), employer_id: me }).select().single());
      await writePrivate(job.id, input);
      return job;
    },
    async updateJob(id, input) {
      const job = await q<Job>(sb.from('jobs').update(jobRow(input)).eq('id', id).select().single());
      await writePrivate(id, input);
      return job;
    },
    setJobStatus: (id, status, reason) => rpc('set_job_status', { p_job: id, p_status: status, p_reason: reason ?? null }),
    async listMyJobs() {
      const me = await uidOrThrow();
      return q(sb.from('jobs').select('*').eq('employer_id', me).order('created_at', { ascending: false }));
    },
    shareAddress: (jobId, contractorId) => rpc('share_address', { p_job: jobId, p_contractor: contractorId }),
    async reportJob(jobId, reason) {
      const me = await uidOrThrow();
      const { error } = await sb.from('reports').insert({ reporter_id: me, target_type: 'job', target_id: jobId, reason: reason.trim() });
      if (error?.code === '23505') throw new ApiError('You already reported this listing. We will review it.', 'conflict');
      if (error) fail(error);
    },

    applyToJob: (jobId, input) => rpc('apply_to_job', { p_job: jobId, p_message: input.message, p_proposed_rate: input.proposed_rate, p_available_on: input.available_on }),
    withdrawApplication: (id) => rpc('withdraw_application', { p_id: id }),
    async listMyApplications() {
      const me = await uidOrThrow();
      const rows = await q<Array<Record<string, unknown> & { job: Job }>>(sb.from('applications').select('*, job:jobs!applications_job_id_fkey(*)').eq('contractor_id', me).order('updated_at', { ascending: false }));
      const employers = await Promise.all(Array.from(new Set(rows.map((r) => r.job.employer_id))).map((id) => rpc<PublicEmployer>('employer_public', { p_id: id })));
      const names = new Map(employers.filter(Boolean).map((e) => [e.id, e.company_name ?? e.display_name]));
      return rows.map(({ job, ...application }) => ({ application: application as never, job, employer_name: names.get(job.employer_id) ?? 'Business' }));
    },
    async listApplicantsForEmployer(jobId) {
      let query = sb.from('applications').select('*, job:jobs!applications_job_id_fkey(id, title, status, job_date, category_id, zip, employer_id)').neq('status', 'withdrawn').order('created_at', { ascending: false });
      if (jobId) query = query.eq('job_id', jobId);
      const me = await uidOrThrow();
      const rows = (await q<Array<Record<string, unknown> & { job: Job; contractor_id: string }>>(query)).filter((r) => r.job.employer_id === me);
      const people = await contractorSummaries(rows.map((r) => r.contractor_id));
      return rows.map(({ job, ...application }) => ({ application: application as never, job, contractor: people.get(application.contractor_id as string)! }));
    },
    setApplicationStatus: (id, status) => rpc('set_application_status', { p_id: id, p_status: status }),
    selectApplication: (id) => rpc('select_application', { p_id: id }),

    async listSavedJobIds() {
      const rows = await q<Array<{ job_id: string }>>(sb.from('saved_jobs').select('job_id').order('created_at', { ascending: false }));
      return rows.map((r) => r.job_id);
    },
    async toggleSaveJob(jobId) {
      const me = await uidOrThrow();
      const existing = await q(sb.from('saved_jobs').select('job_id').eq('job_id', jobId).maybeSingle());
      if (existing) {
        await q(sb.from('saved_jobs').delete().eq('job_id', jobId).eq('contractor_id', me));
        return false;
      }
      await q(sb.from('saved_jobs').insert({ contractor_id: me, job_id: jobId }));
      return true;
    },
    async listSavedContractors() {
      const rows = await q<Array<{ contractor_id: string; note: string | null; created_at: string }>>(sb.from('saved_contractors').select('*').order('created_at', { ascending: false }));
      const people = await contractorSummaries(rows.map((r) => r.contractor_id));
      return rows.filter((r) => people.has(r.contractor_id)).map((r) => ({ contractor: people.get(r.contractor_id)!, note: r.note, saved_at: r.created_at }));
    },
    async toggleSaveContractor(contractorId, note) {
      const me = await uidOrThrow();
      const existing = await q(sb.from('saved_contractors').select('contractor_id').eq('contractor_id', contractorId).maybeSingle());
      if (existing) {
        await q(sb.from('saved_contractors').delete().eq('contractor_id', contractorId).eq('employer_id', me));
        return false;
      }
      await q(sb.from('saved_contractors').insert({ employer_id: me, contractor_id: contractorId, note: note ?? null }));
      return true;
    },

    async getMyAccount() {
      const { data } = await sb.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new ApiError('Sign in to continue.', 'unauthenticated');
      const [profile, business, contractor, contact, prefs] = await Promise.all([
        q<Omit<Profile, 'email'>>(sb.from('profiles').select('*').eq('id', user.id).single()),
        q<Omit<BusinessProfile, 'phone'> | null>(sb.from('business_profiles').select('*').eq('user_id', user.id).maybeSingle()),
        q<Omit<ContractorProfile, 'contact_phone' | 'contact_email'> | null>(sb.from('contractor_profiles').select('*').eq('user_id', user.id).maybeSingle()),
        q<{ phone: string | null; email: string | null } | null>(sb.from('private_contacts').select('phone, email').eq('user_id', user.id).maybeSingle()),
        q<{ prefs: Record<string, unknown> } | null>(sb.from('notification_preferences').select('prefs').eq('user_id', user.id).maybeSingle()),
      ]);
      return {
        profile: { ...profile, email: user.email ?? '' },
        business: business ? { ...business, phone: contact?.phone ?? null } : null,
        contractor: contractor ? { ...contractor, contact_phone: contact?.phone ?? null, contact_email: contact?.email ?? null } : null,
        preferences: { ...defaultPreferences(), ...(prefs?.prefs ?? {}) } as never,
      };
    },
    async updateMyProfile(patch) {
      const me = await uidOrThrow();
      const row = await q<Omit<Profile, 'email'>>(sb.from('profiles').update(patch).eq('id', me).select().single());
      const { data } = await sb.auth.getSession();
      return { ...row, email: data.session?.user.email ?? '' };
    },
    async saveBusinessProfile(input) {
      const me = await uidOrThrow();
      const { phone, ...rest } = input;
      const row = await q<Omit<BusinessProfile, 'phone'>>(sb.from('business_profiles').upsert({ ...rest, user_id: me }).select().single());
      await q(sb.from('private_contacts').upsert({ user_id: me, phone }));
      return { ...row, phone };
    },
    async saveContractorProfile(input) {
      const me = await uidOrThrow();
      const { contact_phone, contact_email, ...rest } = input;
      const row = await q<Omit<ContractorProfile, 'contact_phone' | 'contact_email'>>(sb.from('contractor_profiles').upsert({ ...rest, user_id: me }).select().single());
      await q(sb.from('private_contacts').upsert({ user_id: me, phone: contact_phone, email: contact_email }));
      return { ...row, contact_phone, contact_email };
    },
    async getContractor(id) {
      const [summary, profile, contact, reviews] = await Promise.all([
        contractorSummaries([id]).then((m) => m.get(id)),
        q<ContractorProfile | null>(sb.from('contractor_profiles').select('*').eq('user_id', id).maybeSingle()),
        q<{ phone: string | null; email: string | null } | null>(sb.from('private_contacts').select('phone, email').eq('user_id', id).maybeSingle()),
        q<Array<Record<string, unknown> & { job: { title: string } | null; reviewer_id: string }>>(sb.from('reviews').select('*, job:jobs(title)').eq('reviewee_id', id).order('created_at', { ascending: false })),
      ]);
      if (!summary || !profile) throw new ApiError('Contractor not found.', 'not_found');
      const reviewers = await Promise.all(Array.from(new Set(reviews.map((r) => r.reviewer_id))).map((rid) => rpc<PublicEmployer>('employer_public', { p_id: rid })));
      const names = new Map(reviewers.filter(Boolean).map((e) => [e.id, e.company_name ?? e.display_name]));
      const { data: member } = await sb.from('profiles').select('created_at').eq('id', id).single();
      const out: ContractorPublic = {
        ...summary,
        bio: profile.bio,
        service_radius_miles: profile.service_radius_miles,
        availability: profile.availability,
        insurance_self_reported: profile.insurance_self_reported,
        licenses: profile.licenses,
        certifications: profile.certifications,
        portfolio: profile.portfolio,
        contact: contact ? { phone: contact.phone, email: contact.email } : null,
        reviews: reviews.map(({ job, ...r }) => ({ ...(r as never as ContractorPublic['reviews'][number]), reviewer_name: names.get(r.reviewer_id) ?? 'Business', job_title: job?.title ?? null })),
        member_since: (member as { created_at: string } | null)?.created_at ?? '',
      };
      return out;
    },
    async getEmployer(id) {
      const e = await rpc<PublicEmployer | null>('employer_public', { p_id: id });
      if (!e) throw new ApiError('Business not found.', 'not_found');
      return e;
    },
    async savePreferences(prefs) {
      const me = await uidOrThrow();
      await q(sb.from('notification_preferences').upsert({ user_id: me, prefs, updated_at: new Date().toISOString() }));
    },
    async upload(bucket, file) {
      const me = await uidOrThrow();
      if (file.size > 10 * 1024 * 1024) throw new ApiError('Files must be under 10 MB.', 'invalid');
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
      const path = `${me}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new ApiError(error.message, 'invalid');
      if (bucket === 'verification-docs') return { url: '', path };
      return { url: sb.storage.from(bucket).getPublicUrl(path).data.publicUrl, path };
    },

    createReview: (jobId, rating, body) => rpc('create_review', { p_job: jobId, p_rating: rating, p_body: body }),
    listReviewsForJob: (jobId) => q(sb.from('reviews').select('*').eq('job_id', jobId)),

    async listConversations() {
      const me = await uidOrThrow();
      const convs = await q<Array<Record<string, unknown> & { id: string; employer_id: string; contractor_id: string; job: { title: string } | null }>>(
        sb.from('conversations').select('*, job:jobs(title)').order('last_message_at', { ascending: false }),
      );
      return Promise.all(convs.map((c) => summarize(c, me)));
    },
    async getMessages(conversationId) {
      const me = await uidOrThrow();
      const c = await q<(Record<string, unknown> & { id: string; employer_id: string; contractor_id: string; job: { title: string } | null }) | null>(
        sb.from('conversations').select('*, job:jobs(title)').eq('id', conversationId).maybeSingle(),
      );
      if (!c) throw new ApiError('Conversation not found.', 'not_found');
      await rpc('mark_conversation_read', { p_conversation: conversationId });
      const messages = await q<Message[]>(sb.from('messages').select('*').eq('conversation_id', conversationId).order('created_at'));
      return { summary: { ...(await summarize(c, me)), unread: 0 }, messages };
    },
    startConversation: (otherUserId, jobId) => rpc('start_conversation', { p_other: otherUserId, p_job: jobId }),
    async sendMessage(conversationId, body) {
      const me = await uidOrThrow();
      const text = body.trim();
      if (!text) throw new ApiError('Write a message first.', 'invalid');
      return q(sb.from('messages').insert({ conversation_id: conversationId, sender_id: me, body: text }).select().single());
    },

    listNotifications: () => q(sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)),
    markNotificationsRead: (ids) => rpc('mark_notifications_read', { p_ids: ids === 'all' ? null : ids }),

    listMyVerifications: async () => q(sb.from('verifications').select('*').eq('user_id', await uidOrThrow()).order('created_at', { ascending: false })),
    async submitVerification({ kind, file, details }) {
      const me = await uidOrThrow();
      const uploaded = file ? await api.upload('verification-docs', file) : null;
      const { data, error } = await sb.from('verifications').insert({ user_id: me, kind, document_path: uploaded?.path ?? null, document_name: file?.name ?? null, details: details.trim() || null }).select().single();
      if (error?.code === '23505') throw new ApiError('You already have a request of this type under review.', 'conflict');
      if (error) fail(error);
      return data;
    },

    adminMetrics: () => rpc<Metrics>('admin_metrics'),
    async adminListJobs() {
      const [jobs, reports] = await Promise.all([
        q<Job[]>(sb.from('jobs').select('*').order('created_at', { ascending: false }).limit(500)),
        q<Array<{ target_id: string }>>(sb.from('reports').select('target_id').eq('status', 'open')),
      ]);
      const employers = await Promise.all(Array.from(new Set(jobs.map((j) => j.employer_id))).map((id) => rpc<PublicEmployer>('employer_public', { p_id: id })));
      const names = new Map(employers.filter(Boolean).map((e) => [e.id, e.company_name ?? e.display_name]));
      return jobs.map((j) => ({ ...j, employer_name: names.get(j.employer_id) ?? 'Unknown', report_count: reports.filter((r) => r.target_id === j.id).length }));
    },
    adminModerateJob: (id, decision, reason) => rpc('admin_moderate_job', { p_job: id, p_decision: decision, p_reason: reason }),
    async adminListUsers() {
      const rows = await rpc<Array<{ profile: Omit<Profile, 'email'>; email: string; company_name: string | null; jobs: number; applications: number; open_reports: number }>>('admin_list_users');
      return rows.map((r) => ({ profile: { ...r.profile, email: r.email }, company_name: r.company_name, jobs: r.jobs, applications: r.applications, open_reports: r.open_reports }));
    },
    adminSetUserStatus: (id, status, reason) => rpc('admin_set_user_status', { p_user: id, p_status: status, p_reason: reason }),
    adminSetTrust: (id, trust) => rpc('admin_set_trust', { p_user: id, p_trust: trust }),
    async adminListVerifications() {
      const rows = await q<Array<Record<string, unknown> & { user: { display_name: string; role: Role } }>>(sb.from('verifications').select('*, user:profiles!verifications_user_id_fkey(display_name, role)').order('created_at', { ascending: false }));
      return rows.map(({ user, ...v }) => ({ ...(v as never as import('@/domain/types').Verification), user_name: user.display_name, user_role: user.role }));
    },
    adminReviewVerification: (id, decision, note, expires_on) => rpc('admin_review_verification', { p_id: id, p_decision: decision, p_note: note, p_expires_on: expires_on }),
    async adminVerificationDocumentUrl(id) {
      const v = await q<{ document_path: string | null }>(sb.from('verifications').select('document_path').eq('id', id).single());
      if (!v.document_path) return null;
      // Short-lived signed URL; the bucket itself is private.
      const { data, error } = await sb.storage.from('verification-docs').createSignedUrl(v.document_path, 120);
      if (error) throw new ApiError(error.message, 'forbidden');
      return data.signedUrl;
    },
    adminSaveCategory: (input) => rpc('admin_save_category', { p: input }),
    async adminListActions() {
      const rows = await q<Array<Record<string, unknown> & { admin: { display_name: string } | null }>>(sb.from('admin_actions').select('*, admin:profiles(display_name)').order('created_at', { ascending: false }).limit(200));
      return rows.map(({ admin, ...a }) => ({ ...(a as never as import('@/domain/types').AdminAction), admin_name: admin?.display_name ?? 'Admin' }));
    },
    async adminListReports() {
      const rows = await q<Array<Record<string, unknown> & { reporter: { display_name: string } | null; target_id: string; target_type: string }>>(sb.from('reports').select('*, reporter:profiles(display_name)').order('created_at', { ascending: false }));
      const jobIds = rows.filter((r) => r.target_type === 'job').map((r) => r.target_id);
      const jobs = jobIds.length ? await q<Array<{ id: string; title: string }>>(sb.from('jobs').select('id, title').in('id', jobIds)) : [];
      return rows.map(({ reporter, ...r }) => ({ ...(r as never as import('@/domain/types').Report), reporter_name: reporter?.display_name ?? 'User', target_label: jobs.find((j) => j.id === r.target_id)?.title ?? r.target_id }));
    },
    adminResolveReport: (id, status) => rpc('admin_resolve_report', { p_id: id, p_status: status }),
  };

  async function summarize(c: Record<string, unknown> & { id: string; employer_id: string; contractor_id: string; job: { title: string } | null }, me: string): Promise<ConversationSummary> {
    const otherId = c.employer_id === me ? c.contractor_id : c.employer_id;
    const [other, last, unread] = await Promise.all([
      q<{ id: string; display_name: string; avatar_url: string | null; role: Role }>(sb.from('profiles').select('id, display_name, avatar_url, role').eq('id', otherId).single()),
      q<Message | null>(sb.from('messages').select('*').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()),
      sb.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', c.id).neq('sender_id', me).is('read_at', null),
    ]);
    const { job, ...conversation } = c;
    return {
      conversation: conversation as never,
      other: { id: other.id, name: other.display_name, avatar_url: other.avatar_url, role: other.role },
      job_title: job?.title ?? null,
      last_message: last,
      unread: unread.count ?? 0,
    };
  }

  return api;
}
