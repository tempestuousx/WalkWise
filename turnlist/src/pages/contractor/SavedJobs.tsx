import { Link } from 'react-router-dom';
import { Bookmark } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { JobCard, JobCardSkeleton, JobGrid } from '@/components/JobCard';
import { EmptyState, ErrorState, PageHeader } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAction, useCategories, useMyApplications, useSavedJobIds } from '@/lib/queries';
import { api } from '@/data';
import { isJobAvailable } from '@/domain/status';
import { freshness } from '@/domain/freshness';

export default function SavedJobs() {
  const ids = useSavedJobIds();
  const cats = useCategories();
  const apps = useMyApplications();
  const details = useQueries({ queries: (ids.data ?? []).map((id) => ({ queryKey: ['savedJob', id], queryFn: () => api.getJob(id) })) });
  const toggle = useAction((id: string) => api.toggleSaveJob(id), { success: 'Removed from saved jobs' });
  const loading = ids.isLoading || details.some((d) => d.isLoading);
  const jobs = details.map((d) => d.data?.job).filter((j): j is NonNullable<typeof j> => Boolean(j));
  const open = jobs.filter((j) => isJobAvailable(j));
  const closed = jobs.filter((j) => !isJobAvailable(j));
  const appByJob = new Map(apps.data?.map((a) => [a.job.id, a.application]) ?? []);

  return (
    <Page>
      <PageHeader title="Saved Jobs" description="Jobs you bookmarked. Closed listings move to the bottom so you are never applying to filled work." />
      {ids.isError ? (
        <ErrorState error={ids.error} onRetry={() => ids.refetch()} />
      ) : loading ? (
        <JobGrid>{Array.from({ length: 4 }, (_, i) => <JobCardSkeleton key={i} />)}</JobGrid>
      ) : jobs.length === 0 ? (
        <EmptyState icon={<Bookmark />} title="No saved jobs" action={<Link to="/jobs" className="btn-primary">Find Work</Link>}>
          Tap the bookmark on any listing to keep it here while you decide.
        </EmptyState>
      ) : (
        <>
          {open.length > 0 ? (
            <JobGrid>
              {open.map((j) => (
                <JobCard key={j.id} job={j} category={cats.data?.find((c) => c.id === j.category_id)} saved application={appByJob.get(j.id)} onToggleSave={() => toggle.mutate(j.id)} />
              ))}
            </JobGrid>
          ) : (
            <p className="text-[14.5px] text-ink-muted">None of your saved jobs are still open.</p>
          )}
          {closed.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-3 text-[15px] font-semibold text-ink-muted">No longer available</h2>
              <ul className="divide-y divide-line rounded-card border border-line bg-white">
                {closed.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
                    <Link to={`/jobs/${j.id}`} className="min-w-0 truncate text-ink-muted hover:text-navy">
                      {j.title}
                      <span className="ml-2 text-[12.5px]">{freshness(j).closedReason}</span>
                    </Link>
                    <button className="link shrink-0 text-[13px]" onClick={() => toggle.mutate(j.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Page>
  );
}
