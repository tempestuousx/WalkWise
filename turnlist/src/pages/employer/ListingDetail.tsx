import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Copy, ExternalLink, Pencil, Star } from 'lucide-react';
import { JobStatusTag, ModerationTag } from '@/components/badges';
import { Button, Dialog, EmptyState, ErrorState, Field, Notice, PageLoading, Textarea, cx } from '@/components/ui';
import { ApplicantCard } from './ApplicantCard';
import { useAction, useApplicants, useJob } from '@/lib/queries';
import { api } from '@/data';
import { formatDate, formatPay } from '@/domain/format';
import { jobDisplayStatus } from '@/domain/status';
import type { Job, JobStatus } from '@/domain/types';

export default function ListingDetail() {
  const { id } = useParams();
  const detail = useJob(id);
  const applicants = useApplicants(id);
  const reviews = useQuery({ queryKey: ['reviews', id], queryFn: () => api.listReviewsForJob(id!), enabled: Boolean(id) });
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const marked = useRef(new Set<string>());
  const status = useAction(({ to, reason }: { to: JobStatus; reason?: string }) => api.setJobStatus(id!, to, reason), {
    success: (j) => `Listing marked ${j.status.replace('_', ' ')}`,
  });

  // Opening the listing counts as viewing new applications.
  useEffect(() => {
    for (const a of applicants.data ?? []) {
      if (a.application.status === 'submitted' && !marked.current.has(a.application.id)) {
        marked.current.add(a.application.id);
        void api.setApplicationStatus(a.application.id, 'viewed').catch(() => {});
      }
    }
  }, [applicants.data]);

  if (detail.isLoading) return <PageLoading />;
  if (detail.isError || !detail.data) return <div className="container-page pt-10"><ErrorState error={detail.error} onRetry={() => detail.refetch()} /></div>;
  const { job, isOwner, privateDetails } = detail.data;
  if (!isOwner) {
    navigate(`/jobs/${job.id}`, { replace: true });
    return null;
  }
  const display = jobDisplayStatus(job);
  const apps = (applicants.data ?? []).slice().sort((a, b) => rank(a.application.status) - rank(b.application.status) || Number(b.application.is_qualified) - Number(a.application.is_qualified));
  const reviewed = (reviews.data?.length ?? 0) > 0;

  return (
    <div className="container-page pt-6 sm:pt-8">
      <Link to="/employer/listings" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden /> My Listings
      </Link>

      <div className="mt-5 flex flex-col gap-5 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <JobStatusTag status={display} />
            <ModerationTag status={job.moderation_status} />
          </div>
          <h1 className="mt-3 text-h1">{job.title}</h1>
          <p className="mt-2 text-[15px] text-ink-muted tabular">
            {job.neighborhood} {job.zip} · {formatPay(job)} · needed {formatDate(job.job_date)}
            {job.deadline && `, finish by ${formatDate(job.deadline)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/jobs/${job.id}`} className="btn-ghost btn-sm">
            <ExternalLink className="h-4 w-4" aria-hidden /> Public view
          </Link>
          {['open', 'expired'].includes(job.status) && (
            <Link to={`/employer/listings/${job.id}/edit`} className="btn-secondary btn-sm">
              <Pencil className="h-4 w-4" aria-hidden /> Edit
            </Link>
          )}
          <Link to={`/employer/post?from=${job.id}`} className="btn-secondary btn-sm">
            <Copy className="h-4 w-4" aria-hidden /> Duplicate
          </Link>
          <StatusActions job={job} busy={status.isPending} onMove={(to) => (to === 'canceled' ? setCancelOpen(true) : status.mutate({ to }))} onReview={() => setReviewOpen(true)} reviewed={reviewed} />
        </div>
      </div>

      {job.moderation_status === 'pending' && (
        <div className="mt-6">
          <Notice tone="warn">Your listing is waiting for a quick review because your account is new. It becomes visible to contractors once approved, usually within a few hours.</Notice>
        </div>
      )}
      {(job.moderation_status === 'rejected' || job.moderation_status === 'removed') && (
        <div className="mt-6">
          <Notice tone="warn">
            This listing was {job.moderation_status} by moderation{job.moderation_note ? `: ${job.moderation_note}` : '.'} See the{' '}
            <Link to="/legal/moderation" className="link">
              listing standards
            </Link>
            .
          </Notice>
        </div>
      )}
      {display === 'expired' && (
        <div className="mt-6">
          <Notice tone="info">This listing expired without being filled. Edit the date to reopen it, or duplicate it.</Notice>
        </div>
      )}

      <section className="mt-10" aria-labelledby="applicants-h">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="applicants-h" className="text-[19px]">
            Applicants <span className="font-medium text-ink-muted tabular">{apps.length}</span>
          </h2>
          {apps.length > 0 && job.status === 'open' && <p className="hidden text-[13.5px] text-ink-muted sm:block">Select one applicant to fill the job. Everyone else is notified.</p>}
        </div>
        {applicants.isLoading ? (
          <PageLoading />
        ) : applicants.isError ? (
          <ErrorState error={applicants.error} onRetry={() => applicants.refetch()} />
        ) : apps.length === 0 ? (
          <EmptyState title="No applicants yet" action={<Link to={`/jobs/${job.id}`} className="btn-secondary">See your listing</Link>}>
            {job.moderation_status === 'approved' && job.status === 'open' ? 'Contractors whose services and area match were notified when you posted. Most applications arrive within a day.' : 'Applications appear here once the listing is live.'}
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {apps.map((a) => (
              <li key={a.application.id} id={`app-${a.application.id}`}>
                <ApplicantCard item={a} jobOpen={job.status === 'open'} hasAddress={Boolean(privateDetails)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CancelDialog open={cancelOpen} onClose={() => setCancelOpen(false)} job={job} onConfirm={(reason) => status.mutate({ to: 'canceled', reason }, { onSuccess: () => setCancelOpen(false) })} busy={status.isPending} />
      <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} jobId={job.id} contractorName={apps.find((a) => a.application.status === 'selected')?.contractor.display_name ?? 'the contractor'} />
    </div>
  );
}

const rank = (s: string) => ({ selected: 0, shortlisted: 1, submitted: 2, viewed: 3, not_selected: 4, withdrawn: 5 })[s] ?? 9;

function StatusActions({ job, busy, onMove, onReview, reviewed }: { job: Job; busy: boolean; onMove: (to: JobStatus) => void; onReview: () => void; reviewed: boolean }) {
  switch (job.status) {
    case 'open':
      return (
        <Button variant="danger" size="sm" onClick={() => onMove('canceled')}>
          Cancel listing
        </Button>
      );
    case 'filled':
      return (
        <>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => confirm('Release the selected contractor and reopen the listing for new applicants?') && onMove('open')}>
            Reopen
          </Button>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => onMove('in_progress')}>
            Mark in progress
          </Button>
          <Button size="sm" loading={busy} onClick={() => onMove('completed')}>
            Mark completed
          </Button>
        </>
      );
    case 'in_progress':
      return (
        <Button size="sm" loading={busy} onClick={() => onMove('completed')}>
          Mark completed
        </Button>
      );
    case 'completed':
      return reviewed ? (
        <span className="tag self-center bg-teal-50 text-teal-700">Reviewed</span>
      ) : (
        <Button size="sm" onClick={onReview}>
          <Star className="h-4 w-4" aria-hidden /> Review contractor
        </Button>
      );
    default:
      return null;
  }
}

function CancelDialog({ open, onClose, job, onConfirm, busy }: { open: boolean; onClose: () => void; job: Job; onConfirm: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Cancel this listing?"
      description={`${job.application_count} ${job.application_count === 1 ? 'applicant' : 'applicants'} will be notified. This cannot be undone, but you can duplicate the listing later.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep listing
          </Button>
          <Button variant="danger" loading={busy} onClick={() => onConfirm(reason.trim())}>
            Cancel listing
          </Button>
        </>
      }
    >
      <Field label="Reason" optional hint="Shared with applicants. For example: “Tenant extended their lease.”">
        {(a) => <Textarea {...a} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />}
      </Field>
    </Dialog>
  );
}

function ReviewDialog({ open, onClose, jobId, contractorName }: { open: boolean; onClose: () => void; jobId: string; contractorName: string }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const save = useAction(() => api.createReview(jobId, rating, body), { success: 'Review posted', onSuccess: onClose });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Review ${contractorName}`}
      description="Reviews appear on the contractor’s public profile with your business name."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!rating} loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Post review
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="label">Rating</legend>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className="rounded-md p-1">
              <Star className={cx('h-7 w-7', n <= rating ? 'fill-amber text-amber' : 'text-line-strong')} aria-hidden />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-5">
        <Field label="What went well, or what could improve?" optional>
          {(a) => <Textarea {...a} rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} />}
        </Field>
      </div>
    </Dialog>
  );
}
