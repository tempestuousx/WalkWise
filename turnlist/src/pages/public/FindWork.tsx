import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, SlidersHorizontal, X } from 'lucide-react';
import { JobCard, JobCardSkeleton, JobGrid } from '@/components/JobCard';
import { SearchBar } from '@/components/SearchBar';
import { CategoryStrip } from '@/components/CategoryStrip';
import { AppStatusTag } from '@/components/badges';
import { Checkbox, EmptyState, ErrorState, Notice, Segmented, Select, Sheet, cx } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useJobFilters } from '@/lib/filters';
import { useAction, useAvailableJobs, useCategories, useMyAccount, useMyApplications, useSavedJobIds } from '@/lib/queries';
import { api } from '@/data';
import { BROWSE_GROUPS, groupName } from '@/domain/categories';
import { filterJobs, type DateWindow, type SortKey, type WorkType } from '@/domain/jobs';
import { URGENCY_LABEL } from '@/domain/status';
import { contractorCompletion } from '@/domain/profile';
import { formatNeededDay } from '@/domain/format';
import type { Category, Urgency } from '@/domain/types';

const DIST_OPTIONS = [null, 5, 10, 15, 25] as const;
const PAY_OPTIONS = [null, 100, 250, 500, 1000] as const;
const DATE_OPTIONS: Array<[DateWindow, string]> = [['any', 'Any date'], ['today', 'Today'], ['next_48h', 'Next 48 hours'], ['this_week', 'Next 7 days'], ['later', 'Later']];
const SORT_OPTIONS: Array<[SortKey, string]> = [['relevant', 'Most relevant'], ['newest', 'Newest'], ['soonest', 'Date needed'], ['pay', 'Highest pay']];

export default function FindWork() {
  const { session } = useAuth();
  const isContractor = session?.user.role === 'contractor';
  const account = useMyAccount();
  const profile = isContractor ? account.data?.contractor ?? null : null;
  const { filters, set, clear } = useJobFilters(profile?.home_zip ?? null);
  const jobs = useAvailableJobs();
  const cats = useCategories();
  const saved = useSavedJobIds();
  const apps = useMyApplications();
  const [sheet, setSheet] = useState(false);
  const toggleSave = useAction((id: string) => api.toggleSaveJob(id), { success: (on) => (on ? 'Saved to your list' : 'Removed from saved jobs') });

  const categories = cats.data ?? [];
  const results = useMemo(() => filterJobs(jobs.data ?? [], filters, { categories, profile }), [jobs.data, filters, categories, profile]);
  const appByJob = new Map(apps.data?.map((a) => [a.job.id, a.application]) ?? []);

  const chips = activeChips(filters, categories);
  const filterPanel = <FilterPanel filters={filters} set={set} categories={categories} hasOrigin={Boolean(profile?.home_zip || filters.originPoint)} />;

  return (
    <div className="container-page pt-8 sm:pt-10">
      {isContractor && <ContractorOverview />}

      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-h1">Find Work</h1>
        <p className="text-[15px] text-ink-muted">Property maintenance, cleaning, and turnover jobs across the Las Vegas valley.</p>
      </div>
      <div className="mb-6">
        <SearchBar size="md" key={`${filters.q}|${filters.location}`} initialQ={filters.q} initialLoc={filters.location} onSearch={(q, loc) => set({ q, loc })} />
        {filters.locationUnknown && <p className="mt-2 text-[13.5px] text-amber-800">We could not match “{filters.location}” to an area we serve yet. Try a neighborhood, city, or Clark County ZIP.</p>}
      </div>

      <div className="mb-8 lg:hidden">
        <CategoryStrip value={filters.group} onChange={(g) => set({ group: g, cats: null })} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[264px_1fr]">
        <aside className="hidden lg:block" aria-label="Filters">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-8 pr-2">{filterPanel}</div>
        </aside>

        <section aria-labelledby="results-heading" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-heading" className="text-[15px] font-semibold text-navy tabular" aria-live="polite">
              {jobs.isLoading ? 'Loading jobs' : `${results.length} available ${results.length === 1 ? 'job' : 'jobs'}`}
              {filters.locationLabel && !filters.distance && <span className="font-medium text-ink-muted"> in {filters.locationLabel}</span>}
            </h2>
            <div className="flex items-center gap-2">
              <button className="btn-secondary btn-sm lg:hidden" onClick={() => setSheet(true)}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> Filters{chips.length ? ` (${chips.length})` : ''}
              </button>
              <label className="flex items-center gap-2 text-[13.5px] text-ink-muted">
                <span className="hidden sm:inline">Sort by</span>
                <Select value={filters.sort} onChange={(e) => set({ sort: e.target.value })} className="h-9 w-auto py-0 text-[13.5px]" aria-label="Sort jobs">
                  {SORT_OPTIONS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button key={c.key} onClick={() => set(c.clear)} className="chip h-8 gap-1 border-teal/40 bg-teal-50 pr-2 text-teal-700" aria-label={`Remove filter: ${c.label}`}>
                  {c.label}
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ))}
              <button onClick={clear} className="ml-1 text-[13.5px] font-semibold text-ink-muted underline-offset-4 hover:text-navy hover:underline">
                Clear all
              </button>
            </div>
          )}

          {jobs.isError ? (
            <ErrorState error={jobs.error} onRetry={() => jobs.refetch()} />
          ) : jobs.isLoading ? (
            <JobGrid columns={3}>{Array.from({ length: 6 }, (_, i) => <JobCardSkeleton key={i} />)}</JobGrid>
          ) : results.length === 0 ? (
            <EmptyState icon={<Search />} title="No jobs match these filters" action={chips.length ? <button className="btn-secondary" onClick={clear}>Clear filters</button> : undefined}>
              {chips.length ? 'Try a wider distance, a different date, or fewer filters.' : 'There are no open listings right now. New jobs show up here as soon as they are posted.'}
            </EmptyState>
          ) : (
            <JobGrid columns={3}>
              {results.map((r) => (
                <JobCard
                  key={r.job.id}
                  job={r.job}
                  headingLevel="h3"
                  category={categories.find((c) => c.id === r.job.category_id)}
                  distance={r.distance}
                  application={appByJob.get(r.job.id)}
                  saved={saved.data?.includes(r.job.id)}
                  onToggleSave={isContractor ? () => toggleSave.mutate(r.job.id) : undefined}
                />
              ))}
            </JobGrid>
          )}
          {!session && results.length > 0 && (
            <p className="mt-8 text-center text-[14px] text-ink-muted">
              <Link to="/signup?role=contractor" className="link">
                Create a free contractor profile
              </Link>{' '}
              to apply, save jobs, and get alerts for new work near you.
            </p>
          )}
        </section>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Filters" footer={<button className="btn-primary w-full" onClick={() => setSheet(false)}>Show {results.length} {results.length === 1 ? 'job' : 'jobs'}</button>}>
        {filterPanel}
      </Sheet>
    </div>
  );
}

type SetFn = (patch: Record<string, string | number | null | string[]>) => void;

function FilterPanel({ filters, set, categories, hasOrigin }: { filters: ReturnType<typeof useJobFilters>['filters']; set: SetFn; categories: Category[]; hasOrigin: boolean }) {
  const groupCats = filters.group ? categories.filter((c) => c.group === filters.group) : [];
  return (
    <div className="space-y-7">
      <FilterGroup title="Category">
        <div className="space-y-0.5">
          <RadioRow checked={!filters.group} onClick={() => set({ group: null, cats: null })} label="All categories" />
          {BROWSE_GROUPS.map((g) => (
            <RadioRow key={g.slug} checked={filters.group === g.slug} onClick={() => set({ group: g.slug, cats: null })} label={g.name} />
          ))}
        </div>
        {groupCats.length > 1 && (
          <div className="mt-3 space-y-2 border-l-2 border-line pl-3">
            {groupCats.map((c) => (
              <Checkbox
                key={c.id}
                label={c.name}
                checked={filters.categoryIds.includes(c.id)}
                onChange={(on) => set({ cats: on ? [...filters.categoryIds, c.id] : filters.categoryIds.filter((x) => x !== c.id) })}
              />
            ))}
          </div>
        )}
      </FilterGroup>

      <FilterGroup title="Distance">
        <Select value={filters.distance ?? ''} onChange={(e) => set({ dist: e.target.value || null })} aria-label="Distance" disabled={!hasOrigin && !filters.location}>
          {DIST_OPTIONS.map((d) => (
            <option key={d ?? 'any'} value={d ?? ''}>
              {d ? `Within ${d} miles` : 'Any distance'}
            </option>
          ))}
        </Select>
        <p className="hint">{filters.location ? `Measured from ${filters.locationLabel ?? filters.location}.` : hasOrigin ? 'Measured from your home ZIP.' : 'Enter a location above to filter by distance.'}</p>
      </FilterGroup>

      <FilterGroup title="Pay">
        <Select value={filters.payMin ?? ''} onChange={(e) => set({ pay: e.target.value || null })} aria-label="Minimum pay">
          {PAY_OPTIONS.map((p) => (
            <option key={p ?? 'any'} value={p ?? ''}>
              {p ? `$${p.toLocaleString()} or more` : 'Any amount'}
            </option>
          ))}
        </Select>
        <p className="hint">Hourly jobs are estimated from rate × hours.</p>
      </FilterGroup>

      <FilterGroup title="Date needed">
        <div className="space-y-0.5">
          {DATE_OPTIONS.map(([v, l]) => (
            <RadioRow key={v} checked={filters.date === v} onClick={() => set({ date: v })} label={l} />
          ))}
        </div>
      </FilterGroup>

      <FilterGroup title="Type of work">
        <Segmented<WorkType>
          label="Type of work"
          size="sm"
          value={filters.workType}
          onChange={(v) => set({ type: v })}
          options={[
            { value: 'any', label: 'All' },
            { value: 'one_time', label: 'One-time' },
            { value: 'recurring', label: 'Recurring' },
          ]}
        />
      </FilterGroup>

      <FilterGroup title="Urgency">
        <div className="space-y-2.5">
          {(['same_day', 'within_48_hours', 'within_7_days', 'flexible'] as Urgency[]).map((u) => (
            <Checkbox key={u} label={URGENCY_LABEL[u]} checked={filters.urgency.includes(u)} onChange={(on) => set({ urg: on ? [...filters.urgency, u] : filters.urgency.filter((x) => x !== u) })} />
          ))}
        </div>
      </FilterGroup>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 text-[13.5px] font-semibold text-navy">{title}</legend>
      {children}
    </fieldset>
  );
}

function RadioRow({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onClick} className={cx('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[14px] transition-colors', checked ? 'font-semibold text-teal-700' : 'text-ink hover:bg-canvas-alt')}>
      <span aria-hidden className={cx('flex h-4 w-4 items-center justify-center rounded-full border', checked ? 'border-teal' : 'border-line-strong')}>
        {checked && <span className="h-2 w-2 rounded-full bg-teal" />}
      </span>
      {label}
    </button>
  );
}

function activeChips(f: ReturnType<typeof useJobFilters>['filters'], categories: Category[]) {
  const out: Array<{ key: string; label: string; clear: Record<string, null | string[]> }> = [];
  if (f.q) out.push({ key: 'q', label: `“${f.q}”`, clear: { q: null } });
  if (f.location) out.push({ key: 'loc', label: f.locationLabel ?? f.location, clear: { loc: null, dist: null } });
  if (f.group) out.push({ key: 'group', label: groupName(f.group), clear: { group: null, cats: null } });
  for (const id of f.categoryIds) out.push({ key: id, label: categories.find((c) => c.id === id)?.name ?? id, clear: { cats: f.categoryIds.filter((x) => x !== id) } });
  if (f.distance) out.push({ key: 'dist', label: `Within ${f.distance} mi`, clear: { dist: null } });
  if (f.payMin) out.push({ key: 'pay', label: `$${f.payMin.toLocaleString()}+`, clear: { pay: null } });
  if (f.date !== 'any') out.push({ key: 'date', label: DATE_OPTIONS.find(([v]) => v === f.date)?.[1] ?? f.date, clear: { date: null } });
  if (f.workType !== 'any') out.push({ key: 'type', label: f.workType === 'recurring' ? 'Recurring' : 'One-time', clear: { type: null } });
  for (const u of f.urgency) out.push({ key: u, label: URGENCY_LABEL[u], clear: { urg: f.urgency.filter((x) => x !== u) } });
  return out;
}

/** The contractor dashboard: what needs attention, above the feed, without another page. */
function ContractorOverview() {
  const account = useMyAccount();
  const apps = useMyApplications();
  const saved = useSavedJobIds();
  const profile = account.data?.contractor ?? null;
  const completion = contractorCompletion(profile, account.data?.profile.avatar_url ?? null);
  const list = apps.data ?? [];
  const upcoming = list.filter((a) => a.application.status === 'selected' && ['filled', 'in_progress'].includes(a.job.status)).sort((a, b) => a.job.job_date.localeCompare(b.job.job_date));
  const pending = list.filter((a) => ['submitted', 'viewed', 'shortlisted'].includes(a.application.status));
  const completed = list.filter((a) => a.application.status === 'selected' && a.job.status === 'completed');
  if (account.isLoading) return null;
  const needsProfile = !profile?.category_ids.length || !profile?.home_zip;

  return (
    <section aria-label="Your work" className="mb-10">
      {needsProfile ? (
        <Notice tone="warn">
          <p>
            <span className="font-semibold">Add your services and home ZIP</span> to see jobs ranked for you and to apply.{' '}
            <Link to="/contractor/profile" className="link">
              Finish your profile
            </Link>
          </p>
        </Notice>
      ) : (
        <div className="grid overflow-hidden rounded-card border border-line bg-white md:grid-cols-[1.3fr_1fr_1fr]">
          <div className="border-b border-line p-5 md:border-b-0 md:border-r">
            <h2 className="text-[14px] font-semibold">Upcoming assignments</h2>
            {upcoming.length ? (
              <ul className="mt-3 space-y-2.5">
                {upcoming.slice(0, 3).map((a) => (
                  <li key={a.application.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <Link to={`/jobs/${a.job.id}`} className="truncate font-medium text-navy hover:text-teal-700">
                      {a.job.title}
                    </Link>
                    <span className="shrink-0 text-ink-muted">{formatNeededDay(a.job.job_date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-ink-muted">Nothing scheduled. Jobs you are selected for show up here.</p>
            )}
          </div>
          <div className="border-b border-line p-5 md:border-b-0 md:border-r">
            <h2 className="text-[14px] font-semibold">Applications</h2>
            {pending.length ? (
              <ul className="mt-3 space-y-2">
                {pending.slice(0, 3).map((a) => (
                  <li key={a.application.id} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="truncate text-ink">{a.job.title}</span>
                    <AppStatusTag status={a.application.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-ink-muted">No open applications.</p>
            )}
            <Link to="/contractor/applications" className="link mt-3 inline-flex items-center gap-1 text-[13.5px]">
              All applications <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
          <div className="p-5">
            <h2 className="text-[14px] font-semibold">Your profile</h2>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-tint" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
                <div className="h-full rounded-full bg-teal" style={{ width: `${completion.percent}%` }} />
              </div>
              <span className="text-[13px] font-semibold text-navy tabular">{completion.percent}%</span>
            </div>
            <p className="mt-2 text-[13.5px] text-ink-muted">
              {completion.percent < 100 ? `Next: ${completion.items.find((i) => !i.done)?.label.toLowerCase()}.` : 'Complete.'}{' '}
              {saved.data?.length ? (
                <Link to="/contractor/saved" className="link">
                  {saved.data.length} saved
                </Link>
              ) : null}
              {completed.length ? <span> · {completed.length} completed</span> : null}
            </p>
            <Link to="/contractor/profile" className="link mt-2 inline-flex items-center gap-1 text-[13.5px]">
              Edit profile <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
