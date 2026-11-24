import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import { JobStatusTag, ModerationTag } from '@/components/badges';
import { Avatar, EmptyState, ErrorState, PageLoading, SectionTitle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useApplicants, useMyAccount, useMyJobs } from '@/lib/queries';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/data';
import { formatNeededDay, formatPay, timeAgo } from '@/domain/format';
import { jobDisplayStatus } from '@/domain/status';
import { zipDistance } from '@/domain/market';

export default function EmployerDashboard() {
  const { session } = useAuth();
  const jobs = useMyJobs();
  const applicants = useApplicants();
  const account = useMyAccount();
  const saved = useQuery({ queryKey: ['savedContractors', session?.user.id], queryFn: () => api.listSavedContractors() });

  if (jobs.isLoading || applicants.isLoading) return <PageLoading />;
  if (jobs.isError) return <div className="container-page pt-10"><ErrorState error={jobs.error} onRetry={() => jobs.refetch()} /></div>;

  const all = jobs.data ?? [];
  const apps = applicants.data ?? [];
  const active = all.filter((j) => j.status === 'open' && jobDisplayStatus(j) !== 'expired');
  const needsReview = apps.filter((a) => a.application.status === 'submitted' && a.job.status === 'open');
  const awaitingSelection = active.filter((j) => j.application_count > 0);
  const upcoming = all.filter((j) => j.status === 'filled' || j.status === 'in_progress').sort((a, b) => a.job_date.localeCompare(b.job_date));
  const completed = all.filter((j) => j.status === 'completed').slice(0, 5);
  const selectedFor = new Map(apps.filter((a) => a.application.status === 'selected').map((a) => [a.job.id, a.contractor]));
  const firstName = session?.user.display_name.split(' ')[0];
  const company = account.data?.business?.company_name;

  return (
    <div className="container-page pt-8 sm:pt-10">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{company ?? 'Dashboard'}</p>
          <h1 className="mt-2 text-h1">Good to see you, {firstName}.</h1>
          <p className="mt-2 text-[15px] text-ink-muted tabular">
            {active.length} active {active.length === 1 ? 'listing' : 'listings'}
            {needsReview.length > 0 && <>, {needsReview.length} new {needsReview.length === 1 ? 'application' : 'applications'} to review</>}
            {upcoming.length > 0 && <>, {upcoming.length} upcoming</>}.
          </p>
        </div>
        <Link to="/employer/post" className="btn-primary">
          <Plus className="h-4 w-4" aria-hidden /> Post New Job
        </Link>
      </div>

      {!account.data?.business && (
        <div className="mb-8 rounded-card border border-amber/40 bg-amber-50 px-5 py-4 text-[14.5px]">
          <span className="font-semibold text-navy">Add your business name</span> before posting your first job.{' '}
          <Link to="/employer/profile" className="link">
            Business profile
          </Link>
        </div>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="review-h">
            <SectionTitle count={needsReview.length} action={<Link to="/employer/applicants" className="link text-[14px]">All applicants</Link>}>
              <span id="review-h">New applications</span>
            </SectionTitle>
            {needsReview.length === 0 ? (
              <p className="rounded-card border border-line bg-white px-5 py-6 text-[14.5px] text-ink-muted">No new applications. You will get a notification when someone applies.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
                {needsReview.slice(0, 6).map(({ application: a, contractor: c, job }) => {
                  const dist = zipDistance(c.home_zip, job.zip);
                  return (
                    <li key={a.id}>
                      <Link to={`/employer/listings/${job.id}#app-${a.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-canvas-alt/60">
                        <Avatar name={c.display_name} src={c.avatar_url} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-navy">
                            {c.display_name}
                            {a.is_qualified && <span className="ml-2 align-middle text-[12px] font-semibold text-teal-700">Matches job</span>}
                          </p>
                          <p className="truncate text-[13.5px] text-ink-muted">
                            {job.title}
                            {dist !== null && ` · ${Math.round(dist)} mi away`}
                            {c.years_experience ? ` · ${c.years_experience} yrs experience` : ''}
                          </p>
                        </div>
                        <span className="hidden shrink-0 text-[13px] text-ink-muted sm:block">{timeAgo(a.created_at)}</span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="active-h">
            <SectionTitle count={active.length} action={<Link to="/employer/listings" className="link text-[14px]">All listings</Link>}>
              <span id="active-h">Active listings</span>
            </SectionTitle>
            {active.length === 0 ? (
              <EmptyState title="No active listings" action={<Link to="/employer/post" className="btn-primary">Post a Job</Link>}>
                Post a job and it will appear here with its applicants.
              </EmptyState>
            ) : (
              <>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white sm:hidden">
                {active.map((j) => (
                  <li key={j.id}>
                    <Link to={`/employer/listings/${j.id}`} className="block px-4 py-3.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate font-semibold text-navy">{j.title}</span>
                        <span className="shrink-0 text-[13px] text-ink tabular">{j.application_count} {j.application_count === 1 ? 'applicant' : 'applicants'}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
                        <span className="truncate tabular">
                          {formatPay(j)} · {formatNeededDay(j.job_date)}
                        </span>
                        <JobStatusTag status={jobDisplayStatus(j)} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-line bg-white sm:block">
                <table className="table min-w-[620px]">
                  <thead>
                    <tr>
                      <th scope="col">Listing</th>
                      <th scope="col">Needed</th>
                      <th scope="col">Pay</th>
                      <th scope="col" className="text-right">Applicants</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((j) => (
                      <tr key={j.id}>
                        <td className="max-w-[280px]">
                          <Link to={`/employer/listings/${j.id}`} className="block truncate font-semibold text-navy hover:text-teal-700">
                            {j.title}
                          </Link>
                          <span className="text-[13px] text-ink-muted">{j.neighborhood}</span>
                        </td>
                        <td className="whitespace-nowrap">{formatNeededDay(j.job_date)}</td>
                        <td className="whitespace-nowrap tabular">{formatPay(j)}</td>
                        <td className="text-right font-semibold tabular">{j.application_count}</td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            <JobStatusTag status={jobDisplayStatus(j)} />
                            <ModerationTag status={j.moderation_status} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
            {awaitingSelection.length > 0 && (
              <p className="mt-3 text-[13.5px] text-ink-muted">
                {awaitingSelection.length} {awaitingSelection.length === 1 ? 'listing has' : 'listings have'} applicants waiting for your decision.
              </p>
            )}
          </section>
        </div>

        <div className="space-y-10">
          <section aria-labelledby="upcoming-h">
            <SectionTitle count={upcoming.length}>
              <span id="upcoming-h">Upcoming assignments</span>
            </SectionTitle>
            {upcoming.length === 0 ? (
              <p className="text-[14px] text-ink-muted">Jobs you have filled show up here with the contractor and date.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((j) => {
                  const c = selectedFor.get(j.id);
                  return (
                    <li key={j.id}>
                      <Link to={`/employer/listings/${j.id}`} className="block rounded-card border border-line bg-white px-4 py-3.5 transition-colors hover:border-line-strong">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate font-semibold text-navy">{j.title}</span>
                          <span className="shrink-0 text-[13px] font-semibold text-ink">{formatNeededDay(j.job_date)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3 text-[13px] text-ink-muted">
                          <span className="truncate">{c ? c.display_name : 'Contractor selected'}</span>
                          <JobStatusTag status={j.status} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="done-h">
            <SectionTitle>
              <span id="done-h">Recently completed</span>
            </SectionTitle>
            {completed.length === 0 ? (
              <p className="text-[14px] text-ink-muted">Mark jobs completed to keep a history and leave a review.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {completed.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-3 py-3 text-[14px]">
                    <Link to={`/employer/listings/${j.id}`} className="truncate text-ink hover:text-teal-700">
                      {j.title}
                    </Link>
                    <Link to={`/employer/post?from=${j.id}`} className="link shrink-0 text-[13px]">
                      Post again
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="saved-h">
            <SectionTitle count={saved.data?.length} action={<Link to="/employer/saved" className="link text-[14px]">View all</Link>}>
              <span id="saved-h">Saved contractors</span>
            </SectionTitle>
            {!saved.data?.length ? (
              <p className="text-[14px] text-ink-muted">Save contractors from your applicant lists to find them again for future jobs.</p>
            ) : (
              <ul className="space-y-3">
                {saved.data.slice(0, 4).map(({ contractor: c }) => (
                  <li key={c.id}>
                    <Link to={`/contractors/${c.id}`} className="flex items-center gap-3 text-[14px] hover:text-teal-700">
                      <Avatar name={c.display_name} src={c.avatar_url} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-navy">{c.display_name}</span>
                        <span className="block truncate text-[12.5px] text-ink-muted">{c.business_name ?? c.headline ?? 'Contractor'}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
