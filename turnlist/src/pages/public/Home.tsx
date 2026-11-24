import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Search } from 'lucide-react';
import { SearchBar } from '@/components/SearchBar';
import { CategoryStrip } from '@/components/CategoryStrip';
import { JobCard, JobCardSkeleton, JobGrid } from '@/components/JobCard';
import { EmptyState, ErrorState } from '@/components/ui';
import { useAvailableJobs, useCategories, useSavedJobIds } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { groupName } from '@/domain/categories';
import { EMPTY_FILTERS, filterJobs, partitionByMatch, type RankedJob } from '@/domain/jobs';
import { freshness } from '@/domain/freshness';
import { areaForZip } from '@/domain/market';
import { api } from '@/data';
import { useAction, useMyAccount } from '@/lib/queries';

export default function Home() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const jobs = useAvailableJobs();
  const cats = useCategories();
  const saved = useSavedJobIds();
  const [group, setGroup] = useState<string | null>(null);
  const toggleSave = useAction((id: string) => api.toggleSaveJob(id), { success: (on) => (on ? 'Saved to your list' : 'Removed from saved jobs') });

  const account = useMyAccount();
  const profile = session?.user.role === 'contractor' ? account.data?.contractor ?? null : null;
  const hasProfile = Boolean(profile?.category_ids.length && profile?.home_zip);
  const categories = cats.data ?? [];
  const available = useMemo(() => filterJobs(jobs.data ?? [], { ...EMPTY_FILTERS, sort: 'newest' }, { categories, profile }), [jobs.data, categories, profile]);
  const inGroup = group ? available.filter((r) => categories.find((c) => c.id === r.job.category_id)?.group === group) : available;
  // Relevance: a contractor's matches lead; everything else follows under "Recently posted".
  const { matches, others } = hasProfile ? partitionByMatch(inGroup) : { matches: [] as RankedJob[], others: inGroup };
  const visible = hasProfile && matches.length ? others : inGroup;
  const postedToday = inGroup.filter((r) => freshness(r.job).isNew).length;
  const card = (r: RankedJob) => (
    <JobCard
      key={r.job.id}
      job={r.job}
      category={categories.find((c) => c.id === r.job.category_id)}
      distance={hasProfile ? r.distance : undefined}
      saved={saved.data?.includes(r.job.id)}
      onToggleSave={session?.user.role === 'contractor' ? () => toggleSave.mutate(r.job.id) : undefined}
    />
  );
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of available) {
      const g = categories.find((c) => c.id === r.job.category_id)?.group ?? 'other';
      m[g] = (m[g] ?? 0) + 1;
    }
    return m;
  }, [available, categories]);
  const byArea = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of available) {
      const city = areaForZip(r.job.zip)?.city ?? '';
      const label = city === 'Las Vegas' ? r.job.neighborhood : city;
      m.set(label, (m.get(label) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [available]);

  const search = (q: string, loc: string) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (loc) p.set('loc', loc);
    navigate(`/jobs${p.toString() ? `?${p}` : ''}`);
  };

  return (
    <>
      {/* Hero: oversized type, one search, very faint blue-gray atmosphere */}
      <section className="relative overflow-hidden bg-[radial-gradient(60%_80%_at_88%_0%,#E9F0F5_0%,rgba(233,240,245,0)_70%),radial-gradient(40%_60%_at_0%_100%,#F2F6F9_0%,rgba(242,246,249,0)_70%)]">
        <div className="container-page pb-12 pt-12 sm:pb-14 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mb-5 inline-flex items-center gap-2 text-[13px] font-semibold text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" aria-hidden />
              Las Vegas, Henderson, North Las Vegas, and Summerlin
            </p>
            <h1 className="text-balance text-display font-bold text-navy">Local jobs. Real opportunities.</h1>
            <p className="mx-auto mt-5 max-w-xl text-balance text-[17px] leading-relaxed text-ink-muted sm:text-[18px]">
              Find property maintenance, cleaning, and turnover work from businesses hiring in your area.
            </p>
          </div>
          <div className="mx-auto mt-9 max-w-3xl">
            <SearchBar onSearch={search} />
            <p className="mt-4 text-center text-[14px] text-ink-muted">
              Hiring for a turnover or repair?{' '}
              <Link to={session?.user.role === 'contractor' ? '/how-it-works' : '/employer/post'} className="link">
                Post a job in about two minutes
              </Link>
            </p>
          </div>
        </div>
      </section>

      <div className="container-page">
        <CategoryStrip value={group} onChange={setGroup} counts={jobs.data ? counts : undefined} />
      </div>

      {hasProfile && matches.length > 0 && (
        <section className="container-page mt-12" aria-labelledby="matches-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="matches-heading" className="text-[22px] font-semibold tracking-tight">
                Matches for you
              </h2>
              <p className="mt-1 text-[14px] text-ink-muted tabular">
                {matches.length} {group ? `${groupName(group).toLowerCase()} ` : ''}
                {matches.length === 1 ? 'job' : 'jobs'} in your services within {profile!.service_radius_miles} mi, newest first
              </p>
            </div>
            <Link to="/jobs?matches=1" className="link inline-flex items-center gap-1 text-[14px]">
              All your matches <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <JobGrid>{matches.slice(0, 8).map(card)}</JobGrid>
        </section>
      )}

      <section className="container-page mt-12" aria-labelledby="available-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="available-heading" className="text-[22px] font-semibold tracking-tight">
              {hasProfile && matches.length ? 'Recently posted' : group ? `${groupName(group)} jobs` : 'Available jobs'}
            </h2>
            <p className="mt-1 text-[14px] text-ink-muted tabular">
              {jobs.isLoading
                ? 'Loading listings'
                : hasProfile && matches.length
                  ? `${visible.length} more accepting applications, outside your services or radius`
                  : `${visible.length} accepting applications${group ? '' : ' across the valley'}${postedToday ? `, ${postedToday} posted in the last day` : ''}`}
            </p>
          </div>
          <Link to={group ? `/jobs?group=${group}` : '/jobs'} className="link inline-flex items-center gap-1 text-[14px]">
            {group ? `All ${groupName(group).toLowerCase()} jobs` : 'Browse all jobs'} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {jobs.isError ? (
          <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
        ) : jobs.isLoading ? (
          <JobGrid>{Array.from({ length: 8 }, (_, i) => <JobCardSkeleton key={i} />)}</JobGrid>
        ) : visible.length === 0 && hasProfile && matches.length > 0 ? (
          <p className="text-[14.5px] text-ink-muted">Every open job in this category matches your profile.</p>
        ) : visible.length === 0 ? (
          <EmptyState icon={<Search />} title={group ? `No ${groupName(group).toLowerCase()} jobs right now` : 'No open jobs right now'} action={group ? <button className="btn-secondary" onClick={() => setGroup(null)}>Show all categories</button> : <Link to="/employer/post" className="btn-primary">Post the first job</Link>}>
            {group ? 'New listings appear here as soon as they are posted.' : 'Listings appear here as soon as businesses post them.'}
          </EmptyState>
        ) : (
          <JobGrid>{visible.slice(0, hasProfile && matches.length ? 4 : 8).map(card)}</JobGrid>
        )}

        {byArea.length > 0 && (
          <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-baseline sm:gap-6">
            <h3 className="shrink-0 text-[14px] font-semibold">Open jobs by area</h3>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[14px]">
              {byArea.map(([label, n]) => (
                <li key={label}>
                  <Link to={`/jobs?loc=${encodeURIComponent(label)}`} className="text-ink hover:text-teal-700">
                    {label} <span className="text-ink-muted tabular">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <HowItWorksSection />
    </>
  );
}

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="mt-24 border-t border-line bg-canvas-alt" aria-labelledby="how-heading">
      <div className="container-page py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 id="how-heading" className="text-h1">
            How it works
          </h2>
          <p className="mt-3 text-[16px] text-ink-muted">A job board built for one kind of work: getting rental and investment properties cleaned, repaired, and ready.</p>
        </div>
        <div className="mt-12 grid gap-12 md:grid-cols-2 md:gap-16">
          <Steps
            title="For property managers and owners"
            steps={[
              ['Post the job', 'Category, ZIP, date, and pay. Quick Post takes about two minutes, and you can repeat past jobs in one click.'],
              ['Review applicants', 'Each application shows the contractor’s services, distance, experience, and any checks we have verified.'],
              ['Pick someone and confirm', 'Select a contractor, share the address when you are ready, and agree on details in Messages.'],
            ]}
            cta={{ to: '/employer/post', label: 'Post a Job' }}
          />
          <Steps
            title="For contractors"
            steps={[
              ['Set up your profile', 'Pick your services, home ZIP, and how far you will travel. Matching jobs come to you.'],
              ['Apply with a short note', 'Free to join and free to apply. No lead fees or bidding credits.'],
              ['Hear back clearly', 'Every application shows where it stands: submitted, viewed, shortlisted, selected, or not selected.'],
            ]}
            cta={{ to: '/jobs', label: 'Find Work' }}
          />
        </div>
        <p className="mt-14 max-w-3xl border-t border-line pt-6 text-[13.5px] leading-relaxed text-ink-muted">
          Turnlist connects businesses with independent contractors. We do not employ contractors, set their rates, or handle payment, and applying does not guarantee work. Read the{' '}
          <Link to="/legal/contractors" className="link">
            independent contractor notice
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Steps({ title, steps, cta }: { title: string; steps: [string, string][]; cta: { to: string; label: string } }) {
  return (
    <div>
      <h3 className="text-[18px]">{title}</h3>
      <ol className="mt-6 space-y-6">
        {steps.map(([h, p], i) => (
          <li key={h} className="grid grid-cols-[2.25rem_1fr] gap-3">
            <span className="text-[15px] font-bold text-teal-700 tabular" aria-hidden>
              0{i + 1}
            </span>
            <div>
              <p className="font-semibold text-navy">{h}</p>
              <p className="mt-1 text-[14.5px] text-ink-muted">{p}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link to={cta.to} className="btn-secondary mt-8">
        {cta.label}
      </Link>
    </div>
  );
}
