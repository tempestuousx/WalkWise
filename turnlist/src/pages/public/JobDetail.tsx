import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Bookmark, BookmarkCheck, Building2, Check, CircleAlert, Flag, Lock, MapPin, MessageSquare, ShieldCheck } from 'lucide-react';
import { AppStatusTag, ExampleTag, JobStatusTag, ModerationTag, UrgencyTag, VerifiedBadges } from '@/components/badges';
import { Button, Dialog, ErrorState, Field, Input, PageLoading, Textarea, cx } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAction, useCategories, useJob, useMyAccount } from '@/lib/queries';
import { api } from '@/data';
import { APP_STATUS_HELP, isJobAvailable, jobDisplayStatus } from '@/domain/status';
import { formatDate, formatDuration, formatPay, MATERIALS_LABEL, payQualifier, PROPERTY_TYPE_LABEL, timeAgo } from '@/domain/format';
import { areaForZip } from '@/domain/market';
import { qualify } from '@/domain/jobs';
import { applicationInputSchema, fieldErrors } from '@/domain/validation';
import { closesSentence, freshness } from '@/domain/freshness';
import type { Job } from '@/domain/types';

export default function JobDetail() {
  const { id } = useParams();
  const { data, isLoading, error, refetch } = useJob(id);
  const cats = useCategories();
  const { session } = useAuth();
  const account = useMyAccount();
  const navigate = useNavigate();
  const [applyOpen, setApplyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const save = useAction(() => api.toggleSaveJob(id!), { success: (on) => (on ? 'Saved to your list' : 'Removed from saved jobs') });
  const withdraw = useAction((appId: string) => api.withdrawApplication(appId), { success: 'Application withdrawn' });
  const message = useAction((employerId: string) => api.startConversation(employerId, id!), { onSuccess: (cid) => navigate(`/messages/${cid}`) });

  if (isLoading) return <PageLoading />;
  if (error || !data)
    return (
      <div className="container-page max-w-3xl pt-12">
        <ErrorState error={error} onRetry={() => refetch()} />
        <Link to="/jobs" className="link mt-6 inline-block">
          Back to Find Work
        </Link>
      </div>
    );

  const { job, employer, privateDetails, myApplication, isSaved, isOwner } = data;
  const category = cats.data?.find((c) => c.id === job.category_id);
  const area = areaForZip(job.zip);
  const status = jobDisplayStatus(job);
  const available = isJobAvailable(job);
  const role = session?.user.role;
  const q = role === 'contractor' && account.data?.contractor ? qualify(job, account.data.contractor, cats.data ?? []) : null;
  const needsLicense = job.license_required || category?.requires_license;

  const facts: Array<[string, string | null]> = [
    ['Date needed', formatDate(job.job_date)],
    ['Finish by', job.deadline ? formatDate(job.deadline) : null],
    ['Estimated time', formatDuration(job.duration_hours)],
    ['Property', PROPERTY_TYPE_LABEL[job.property_type]],
    ['Materials', MATERIALS_LABEL[job.materials]],
    ['Schedule', job.is_recurring ? `Recurring${job.recurrence_note ? `: ${job.recurrence_note}` : ''}` : 'One-time job'],
  ];

  return (
    <div className="container-page pt-6 sm:pt-8">
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Find Work
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <article className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-ink-muted">{category?.name}</span>
            <UrgencyTag urgency={job.urgency} />
            {(isOwner || !available) && status !== 'open' && <JobStatusTag status={status} />}
            <ModerationTag status={job.moderation_status} />
            {job.is_demo && <ExampleTag />}
          </div>
          <h1 className="mt-3 text-balance text-h1">{job.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-muted">
            <MapPin className="h-4 w-4" aria-hidden />
            {job.neighborhood}
            {area && area.city !== job.neighborhood ? `, ${area.city}` : ''} {job.zip}
          </p>

          <AvailabilityStrip job={job} applicants={isOwner ? job.application_count : null} />

          {/* Pay and schedule first: the two things people scan for */}
          <div className="mt-8 rounded-card border border-line bg-white">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-4 sm:px-6">
              <span className="text-[28px] font-bold tracking-tight text-ink tabular">{formatPay(job)}</span>
              <span className="text-[14px] text-ink-muted">{payQualifier(job)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-3 sm:px-6">
              {facts
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[12.5px] font-semibold text-ink-muted">{k}</dt>
                    <dd className="mt-0.5 text-[14.5px] font-medium text-ink">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>

          <Section title="About the job">
            <p className="whitespace-pre-line text-[15.5px] leading-relaxed text-ink">{job.description}</p>
          </Section>

          {job.photos.length > 0 && (
            <Section title="Photos">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {job.photos.map((src, i) => (
                  <li key={i}>
                    <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-ctl border border-line">
                      <img src={src} alt={`Job photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Requirements">
            <ul className="space-y-3 text-[15px]">
              <Req ok={!needsLicense} label={needsLicense ? 'Contractor license required' : 'No license required'} />
              <Req ok={!job.insurance_required} label={job.insurance_required ? 'Liability insurance required' : 'Insurance not required'} />
              {job.experience_required && <Req ok label={job.experience_required} neutral />}
            </ul>
            {needsLicense && category?.license_note && <p className="mt-4 rounded-ctl bg-canvas-alt px-4 py-3 text-[13.5px] leading-relaxed text-ink-muted">{category.license_note}</p>}
            <p className="mt-3 text-[13px] text-ink-muted">Licenses and insurance listed on contractor profiles are self-reported unless marked verified. Confirm before work starts.</p>
          </Section>

          <Section title="Location">
            {privateDetails ? (
              <div className="rounded-ctl border border-teal/30 bg-teal-50 px-4 py-3 text-[15px]">
                <p className="font-semibold text-navy">
                  {privateDetails.street_address}
                  {privateDetails.unit ? `, ${privateDetails.unit}` : ''}
                </p>
                <p className="text-ink-muted">
                  {job.neighborhood}, {area?.city} NV {job.zip}
                </p>
                {privateDetails.access_notes && <p className="mt-2 text-[14px] text-ink">{privateDetails.access_notes}</p>}
                <p className="mt-2 text-[12.5px] text-ink-muted">{isOwner ? 'Only you and contractors you share it with can see this.' : 'Shared with you by the business. Please keep it private.'}</p>
              </div>
            ) : (
              <p className="flex items-start gap-2.5 text-[15px] text-ink">
                <Lock className="mt-1 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <span>
                  {job.neighborhood}, {area?.city} {job.zip}. <span className="text-ink-muted">The business shares the exact address with the contractor it selects.</span>
                </span>
              </p>
            )}
          </Section>
        </article>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-line bg-white p-5 shadow-card">
            <ApplyPanel
              job={job}
              available={available}
              isOwner={isOwner}
              role={role}
              signedIn={Boolean(session)}
              application={myApplication}
              isSaved={isSaved}
              onApply={() => setApplyOpen(true)}
              onSave={() => save.mutate(undefined)}
              saving={save.isPending}
              onWithdraw={() => myApplication && confirm('Withdraw your application? The business will no longer see it.') && withdraw.mutate(myApplication.id)}
              onMessage={() => message.mutate(job.employer_id)}
              messaging={message.isPending}
              qualification={q}
            />
          </div>

          <div className="rounded-card border border-line bg-white p-5">
            <h2 className="text-[13px] font-semibold text-ink-muted">Posted by</h2>
            <div className="mt-3 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-ctl bg-navy-50 text-navy">
                <Building2 className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-navy">{employer.company_name ?? employer.display_name}</p>
                <p className="text-[13.5px] text-ink-muted">
                  {employer.business_type ? employer.business_type.replace('_', ' ').replace(/^./, (c) => c.toUpperCase()) : 'Business'} · on Turnlist since{' '}
                  {new Date(employer.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13.5px]">
              <div>
                <dt className="text-ink-muted">Jobs posted</dt>
                <dd className="font-semibold text-navy tabular">{employer.jobs_posted}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Completed</dt>
                <dd className="font-semibold text-navy tabular">{employer.jobs_completed}</dd>
              </div>
            </dl>
            {employer.badges.length > 0 && (
              <div className="mt-4">
                <VerifiedBadges kinds={employer.badges} />
              </div>
            )}
          </div>

          {session && !isOwner && (
            <button onClick={() => setReportOpen(true)} className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-ink-muted hover:text-navy">
              <Flag className="h-3.5 w-3.5" aria-hidden /> Report this listing
            </button>
          )}
        </aside>
      </div>

      <ApplyDialog open={applyOpen} onClose={() => setApplyOpen(false)} job={job} />
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} jobId={job.id} />
    </div>
  );
}

/** Answers "can I still apply?" before anything else on the page. */
function AvailabilityStrip({ job, applicants }: { job: Job; applicants: number | null }) {
  const f = freshness(job);
  const posted = new Date(job.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div
      className={cx(
        'mt-6 flex flex-col gap-1.5 rounded-ctl border px-4 py-3 text-[14px] sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        !f.accepting ? 'border-line bg-canvas-alt' : f.closingSoon ? 'border-amber/50 bg-amber-50' : 'border-teal/30 bg-teal-50/70',
      )}
    >
      <p className="flex items-start gap-2">
        <span aria-hidden className={cx('mt-[7px] h-2 w-2 shrink-0 rounded-full', !f.accepting ? 'bg-ink-faint' : f.closingSoon ? 'bg-amber' : 'bg-teal')} />
        <span>
          <span className="font-semibold text-navy">{f.accepting ? 'Accepting applications' : `Not accepting applications: ${f.closedReason?.toLowerCase()}`}</span>
          {f.accepting && <span className={cx(f.closingSoon ? 'font-semibold text-amber-800' : 'text-ink')}>. {closesSentence(job.expires_at)}.</span>}
          {applicants !== null && <span className="text-ink-muted"> {applicants} {applicants === 1 ? 'applicant' : 'applicants'} so far.</span>}
        </span>
      </p>
      <p className="flex shrink-0 items-center gap-2 pl-4 text-[13.5px] text-ink-muted sm:pl-0">
        {f.isNew && <span className="tag h-5 bg-white px-1.5 text-[11px] text-teal-700">New</span>}
        <time dateTime={job.created_at} title={new Date(job.created_at).toLocaleString()}>
          Posted {f.postedAgo}, {posted}
        </time>
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-[17px]">{title}</h2>
      {children}
    </section>
  );
}

function Req({ ok, label, neutral }: { ok: boolean; label: string; neutral?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {neutral || ok ? <Check className={cx('mt-0.5 h-4 w-4 shrink-0', neutral ? 'text-ink-muted' : 'text-teal')} aria-hidden /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-800" aria-hidden />}
      <span className={cx(!ok && !neutral && 'font-semibold text-navy')}>{label}</span>
    </li>
  );
}

function ApplyPanel(p: {
  job: Job;
  available: boolean;
  isOwner: boolean;
  role: string | undefined;
  signedIn: boolean;
  application: import('@/domain/types').Application | null;
  isSaved: boolean;
  onApply: () => void;
  onSave: () => void;
  saving: boolean;
  onWithdraw: () => void;
  onMessage: () => void;
  messaging: boolean;
  qualification: ReturnType<typeof qualify> | null;
}) {
  if (p.isOwner)
    return (
      <>
        <p className="text-[14px] text-ink-muted">This is your listing.</p>
        <Link to={`/employer/listings/${p.job.id}`} className="btn-primary mt-4 w-full">
          Manage listing and applicants
        </Link>
      </>
    );
  if (!p.signedIn)
    return (
      <>
        <p className="text-[15px] font-semibold text-navy">Interested in this job?</p>
        <p className="mt-1 text-[14px] text-ink-muted">Sign in or create a free contractor profile to apply.</p>
        <Link to={`/signin?next=/jobs/${p.job.id}`} className="btn-primary mt-4 w-full">
          Apply for Job
        </Link>
        <Link to="/signup?role=contractor" className="btn-ghost mt-2 w-full">
          Create a profile
        </Link>
      </>
    );
  if (p.role !== 'contractor') return <p className="text-[14px] text-ink-muted">Only contractor accounts can apply for jobs.</p>;

  const a = p.application;
  if (a && a.status !== 'withdrawn') {
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14px] font-semibold text-navy">Your application</p>
          <AppStatusTag status={a.status} />
        </div>
        <p className="mt-2 text-[14px] text-ink-muted">{APP_STATUS_HELP[a.status]}</p>
        <p className="mt-3 text-[12.5px] text-ink-muted">Sent {timeAgo(a.created_at)}</p>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant={a.status === 'selected' ? 'primary' : 'secondary'} onClick={p.onMessage} loading={p.messaging}>
            <MessageSquare className="h-4 w-4" aria-hidden /> Message the business
          </Button>
          {['submitted', 'viewed', 'shortlisted', 'selected'].includes(a.status) && (
            <Button variant="ghost" onClick={p.onWithdraw}>
              Withdraw application
            </Button>
          )}
        </div>
      </>
    );
  }

  const q = p.qualification;
  return (
    <>
      {p.available ? (
        <>
          <Button className="w-full" onClick={p.onApply}>
            Apply for Job
          </Button>
          <Button variant="secondary" className="mt-2 w-full" onClick={p.onSave} loading={p.saving} aria-pressed={p.isSaved}>
            {p.isSaved ? <BookmarkCheck className="h-4 w-4 text-teal-700" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
            {p.isSaved ? 'Saved' : 'Save Job'}
          </Button>
          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">Applying is free. The business decides who to hire, so an application is not a guarantee of work.</p>
        </>
      ) : (
        <p className="text-[14px] text-ink-muted">This job is no longer accepting applications.</p>
      )}
      {q && p.available && (
        <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-[13.5px]">
          <Fit ok={q.categoryMatch} yes="Matches your services" no="Not one of your listed services" />
          <Fit ok={q.inServiceArea} yes={`Inside your service area${q.distanceMiles !== null ? ` (${Math.round(q.distanceMiles)} mi)` : ''}`} no={q.distanceMiles !== null ? `${Math.round(q.distanceMiles)} mi away, outside your radius` : 'Add your ZIP to see distance'} />
          {!q.meetsLicense && <Fit ok={false} yes="" no="Requires a license on your profile" />}
          {!q.availableThatDay && <Fit ok={false} yes="" no="Outside the days you said you work" />}
        </ul>
      )}
    </>
  );
}

function Fit({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return (
    <li className={cx('flex items-start gap-2', ok ? 'text-ink' : 'text-amber-800')}>
      {ok ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal" aria-hidden /> : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
      {ok ? yes : no}
    </li>
  );
}

function ApplyDialog({ open, onClose, job }: { open: boolean; onClose: () => void; job: Job }) {
  const [message, setMessage] = useState('');
  const [rate, setRate] = useState('');
  const [availableOn, setAvailableOn] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const apply = useAction((input: Parameters<typeof api.applyToJob>[1]) => api.applyToJob(job.id, input), {
    success: 'Application sent. You will be notified when the business responds.',
    onSuccess: onClose,
  });
  const submit = () => {
    const parsed = applicationInputSchema.safeParse({ message, proposed_rate: rate ? Number(rate) : null, available_on: availableOn || null });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    apply.mutate(parsed.data);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Apply for this job"
      description={job.title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={apply.isPending}>
            Send application
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Message to the business" hint="When you can start, relevant experience, and anything they should know." error={errors.message}>
          {(a) => <Textarea {...a} rows={5} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1500} placeholder="I can be there Thursday morning. I have done move-out cleans for property managers in Summerlin for three years and bring my own supplies." />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={job.pay_type === 'hourly' ? 'Your rate ($/hr)' : 'Your price ($)'} optional hint={`Listed: ${formatPay(job)}`} error={errors.proposed_rate}>
            {(a) => <Input {...a} inputMode="decimal" type="number" min={1} value={rate} onChange={(e) => setRate(e.target.value)} />}
          </Field>
          <Field label="Earliest date you can start" optional error={errors.available_on}>
            {(a) => <Input {...a} type="date" value={availableOn} onChange={(e) => setAvailableOn(e.target.value)} />}
          </Field>
        </div>
        <p className="text-[13px] text-ink-muted">Your profile, services, and contact details are shared with this business when you apply. Submitting does not guarantee you will be selected.</p>
      </form>
    </Dialog>
  );
}

function ReportDialog({ open, onClose, jobId }: { open: boolean; onClose: () => void; jobId: string }) {
  const [reason, setReason] = useState('');
  const report = useAction(() => api.reportJob(jobId, reason), { success: 'Thanks. Our team will review this listing.', onSuccess: onClose });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Report this listing"
      description="Tell us what looks wrong: a scam, a duplicate, illegal work, or pay that does not match the job."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => report.mutate(undefined)} loading={report.isPending} disabled={reason.trim().length < 10}>
            Send report
          </Button>
        </>
      }
    >
      <Field label="What is the problem?">{(a) => <Textarea {...a} value={reason} onChange={(e) => setReason(e.target.value)} rows={4} />}</Field>
    </Dialog>
  );
}
