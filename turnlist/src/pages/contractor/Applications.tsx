import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { AppStatusTag, JobStatusTag } from '@/components/badges';
import { Button, EmptyState, ErrorState, PageHeader, PageLoading, cx } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAction, useMyApplications } from '@/lib/queries';
import { api, type ApplicationWithJob } from '@/data';
import { APP_STATUS_HELP, jobDisplayStatus } from '@/domain/status';
import { formatNeededDay, formatPay, timeAgo } from '@/domain/format';

const TABS = [
  { key: 'active', label: 'In review', test: (a: ApplicationWithJob) => ['submitted', 'viewed', 'shortlisted'].includes(a.application.status) },
  { key: 'selected', label: 'Selected', test: (a: ApplicationWithJob) => a.application.status === 'selected' },
  { key: 'closed', label: 'Closed', test: (a: ApplicationWithJob) => ['not_selected', 'withdrawn'].includes(a.application.status) },
] as const;

export default function Applications() {
  const apps = useMyApplications();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('active');
  const withdraw = useAction((id: string) => api.withdrawApplication(id), { success: 'Application withdrawn' });
  if (apps.isLoading) return <PageLoading />;
  if (apps.isError) return <Page><ErrorState error={apps.error} onRetry={() => apps.refetch()} /></Page>;
  const all = apps.data ?? [];
  const rows = all.filter(TABS.find((t) => t.key === tab)!.test);

  return (
    <Page>
      <PageHeader title="My Applications" description="Where each application stands. Businesses choose who to hire, so not every application leads to work." />
      <div role="tablist" aria-label="Application status" className="mb-6 flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cx('relative pb-3 text-[14px] font-semibold', tab === t.key ? 'text-navy after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-teal' : 'text-ink-muted hover:text-navy')}>
            {t.label} <span className="ml-1 font-medium text-ink-muted tabular">{all.filter(t.test).length}</span>
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Briefcase />} title={tab === 'active' ? 'No applications in review' : tab === 'selected' ? 'No selections yet' : 'Nothing closed'} action={<Link to="/jobs" className="btn-primary">Find Work</Link>}>
          {tab === 'active' ? 'Apply to a job and you can follow its status here.' : 'Applications move here as businesses make decisions.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
          {rows.map(({ application: a, job, employer_name }) => (
            <li key={a.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <Link to={`/jobs/${job.id}`} className="font-semibold text-navy hover:text-teal-700">
                  {job.title}
                </Link>
                <p className="mt-0.5 text-[13.5px] text-ink-muted tabular">
                  {employer_name} · {job.neighborhood} · {formatPay(job)} · needed {formatNeededDay(job.job_date)}
                </p>
                <p className="mt-1.5 text-[13.5px] text-ink">{APP_STATUS_HELP[a.status]}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end">
                <AppStatusTag status={a.status} />
                {a.status === 'selected' && <JobStatusTag status={jobDisplayStatus(job)} />}
                <span className="text-[12.5px] text-ink-muted">Applied {timeAgo(a.created_at)}</span>
              </div>
              {['submitted', 'viewed', 'shortlisted'].includes(a.status) && (
                <Button variant="ghost" size="sm" onClick={() => confirm('Withdraw this application?') && withdraw.mutate(a.id)}>
                  Withdraw
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
