import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Pencil, Plus } from 'lucide-react';
import { JobStatusTag, ModerationTag } from '@/components/badges';
import { EmptyState, ErrorState, PageHeader, PageLoading, cx } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useMyJobs } from '@/lib/queries';
import { formatNeededDay, formatPay, timeAgo } from '@/domain/format';
import { jobDisplayStatus } from '@/domain/status';
import type { Job } from '@/domain/types';

const TABS = [
  { key: 'active', label: 'Active', test: (j: Job) => j.status === 'open' && jobDisplayStatus(j) !== 'expired' },
  { key: 'scheduled', label: 'Filled and in progress', test: (j: Job) => j.status === 'filled' || j.status === 'in_progress' },
  { key: 'completed', label: 'Completed', test: (j: Job) => j.status === 'completed' },
  { key: 'closed', label: 'Expired and canceled', test: (j: Job) => j.status === 'canceled' || jobDisplayStatus(j) === 'expired' },
] as const;

export default function Listings() {
  const jobs = useMyJobs();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('active');
  if (jobs.isLoading) return <PageLoading />;
  if (jobs.isError) return <Page><ErrorState error={jobs.error} onRetry={() => jobs.refetch()} /></Page>;
  const all = jobs.data ?? [];
  const current = TABS.find((t) => t.key === tab)!;
  const rows = all.filter(current.test);

  return (
    <Page>
      <PageHeader
        title="My Listings"
        description="Everything you have posted. Duplicate a past job to post it again with a new date."
        actions={
          <Link to="/employer/post" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden /> Post a Job
          </Link>
        }
      />
      <div role="tablist" aria-label="Listing status" className="scrollbar-none -mx-4 mb-6 flex gap-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const n = all.filter(t.test).length;
          return (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cx('relative whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors', tab === t.key ? 'text-navy after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-teal' : 'text-ink-muted hover:text-navy')}>
              {t.label} <span className="ml-1 font-medium text-ink-muted tabular">{n}</span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState title={tab === 'active' ? 'No active listings' : `Nothing ${current.label.toLowerCase()}`} action={tab === 'active' ? <Link to="/employer/post" className="btn-primary">Post a Job</Link> : undefined}>
          {tab === 'active' ? 'Post a job and contractors in the area will be notified.' : 'Listings move here as their status changes.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
          {rows.map((j) => (
            <li key={j.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Link to={`/employer/listings/${j.id}`} className="font-semibold text-navy hover:text-teal-700">
                  {j.title}
                </Link>
                <p className="mt-0.5 text-[13.5px] text-ink-muted tabular">
                  {j.neighborhood} · {formatPay(j)} · needed {formatNeededDay(j.job_date)} · posted {timeAgo(j.created_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] text-ink tabular">
                  <span className="font-semibold">{j.application_count}</span> {j.application_count === 1 ? 'applicant' : 'applicants'}
                </span>
                <JobStatusTag status={jobDisplayStatus(j)} />
                <ModerationTag status={j.moderation_status} />
              </div>
              <div className="flex gap-1 sm:ml-2">
                {['open', 'expired'].includes(j.status) && (
                  <Link to={`/employer/listings/${j.id}/edit`} className="btn-ghost btn-sm" aria-label={`Edit ${j.title}`}>
                    <Pencil className="h-4 w-4" aria-hidden /> <span className="sm:sr-only">Edit</span>
                  </Link>
                )}
                <Link to={`/employer/post?from=${j.id}`} className="btn-ghost btn-sm" aria-label={`Duplicate ${j.title}`}>
                  <Copy className="h-4 w-4" aria-hidden /> <span className="sm:sr-only">Duplicate</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
