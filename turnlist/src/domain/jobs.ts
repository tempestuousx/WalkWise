import { areaForZip, milesBetween, zipDistance } from './market';
import { isJobAvailable, URGENCY_RANK } from './status';
import { parseDay, toDayString, addDays } from './format';
import type { Category, ContractorProfile, Job, Urgency } from './types';

export type SortKey = 'relevant' | 'newest' | 'pay' | 'soonest';
export type DateWindow = 'any' | 'today' | 'next_48h' | 'this_week' | 'later';
export type WorkType = 'any' | 'one_time' | 'recurring';

export interface JobFilters {
  q: string;
  group: string | null; // browse group slug
  categoryIds: string[];
  location: string; // free text; resolved to ZIPs by the caller
  zips: string[] | null;
  /** Max miles from originZip. null = any distance. */
  distance: number | null;
  originZip: string | null;
  /** Overrides originZip, e.g. the center of a searched city. */
  originPoint: { lat: number; lng: number } | null;
  payMin: number | null;
  date: DateWindow;
  workType: WorkType;
  urgency: Urgency[];
  sort: SortKey;
}

export const EMPTY_FILTERS: JobFilters = {
  q: '',
  group: null,
  categoryIds: [],
  location: '',
  zips: null,
  distance: null,
  originZip: null,
  originPoint: null,
  payMin: null,
  date: 'any',
  workType: 'any',
  urgency: [],
  sort: 'relevant',
};

/** Estimated total for the job, so fixed and hourly listings share one pay filter and sort. */
export function payValue(job: Pick<Job, 'pay_type' | 'pay_min' | 'pay_max' | 'duration_hours'>): number {
  const top = job.pay_max ?? job.pay_min;
  if (job.pay_type === 'fixed') return top;
  return top * (job.duration_hours ?? 4);
}

function inDateWindow(jobDate: string, w: DateWindow, now: Date): boolean {
  if (w === 'any') return true;
  const today = toDayString(now);
  if (w === 'today') return jobDate <= today;
  if (w === 'next_48h') return jobDate <= toDayString(addDays(now, 2));
  if (w === 'this_week') return jobDate <= toDayString(addDays(now, 7));
  return jobDate > toDayString(addDays(now, 7));
}

export interface Qualification {
  categoryMatch: boolean;
  inServiceArea: boolean;
  distanceMiles: number | null;
  meetsLicense: boolean;
  /** Self-reported only. Insurance verification is a separate, admin-reviewed check. */
  meetsInsurance: boolean;
  availableThatDay: boolean;
  qualified: boolean;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function qualify(job: Job, profile: ContractorProfile | null, categories: Category[]): Qualification {
  if (!profile) {
    return { categoryMatch: false, inServiceArea: false, distanceMiles: null, meetsLicense: !job.license_required, meetsInsurance: !job.insurance_required, availableThatDay: true, qualified: false };
  }
  const categoryMatch = profile.category_ids.includes(job.category_id);
  const distanceMiles = zipDistance(profile.home_zip, job.zip);
  const inServiceArea = distanceMiles !== null && distanceMiles <= profile.service_radius_miles;
  const cat = categories.find((c) => c.id === job.category_id);
  const needsLicense = job.license_required || Boolean(cat?.requires_license);
  const meetsLicense = !needsLicense || profile.licenses.length > 0;
  const meetsInsurance = !job.insurance_required || profile.insurance_self_reported;
  const dayKey = DAY_KEYS[parseDay(job.job_date).getDay()];
  const availableThatDay = profile.availability.accepting_work && (profile.availability.days.length === 0 || profile.availability.days.includes(dayKey));
  return {
    categoryMatch,
    inServiceArea,
    distanceMiles,
    meetsLicense,
    meetsInsurance,
    availableThatDay,
    qualified: categoryMatch && inServiceArea && meetsLicense,
  };
}

export function relevanceScore(job: Job, q: Qualification | null, now: Date): number {
  const ageHours = (now.getTime() - new Date(job.created_at).getTime()) / 3_600_000;
  let score = Math.max(0, 30 - ageHours / 4); // recency, fades over ~5 days
  score += URGENCY_RANK[job.urgency] * 4;
  if (q) {
    if (q.categoryMatch) score += 40;
    if (q.inServiceArea) score += 20;
    else if (q.distanceMiles !== null) score -= Math.min(20, q.distanceMiles);
    if (q.meetsLicense) score += 5;
    if (q.availableThatDay) score += 8;
  }
  return score;
}

export interface RankedJob {
  job: Job;
  distance: number | null;
  qualification: Qualification | null;
  score: number;
}

/** Applies filters to available jobs only. Expired, filled, unmoderated jobs never pass. */
export function filterJobs(
  jobs: Job[],
  filters: JobFilters,
  opts: { categories: Category[]; profile?: ContractorProfile | null; now?: Date } = { categories: [] },
): RankedJob[] {
  const now = opts.now ?? new Date();
  const profile = opts.profile ?? null;
  const q = filters.q.trim().toLowerCase();
  const groupCats = filters.group ? new Set(opts.categories.filter((c) => c.group === filters.group).map((c) => c.id)) : null;
  const origin = filters.originPoint ?? areaForZip(filters.originZip ?? profile?.home_zip ?? null);

  const out: RankedJob[] = [];
  for (const job of jobs) {
    if (!isJobAvailable(job, now)) continue;
    if (groupCats && !groupCats.has(job.category_id)) continue;
    if (filters.categoryIds.length && !filters.categoryIds.includes(job.category_id)) continue;
    if (filters.zips && !filters.zips.includes(job.zip)) continue;
    if (q) {
      const cat = opts.categories.find((c) => c.id === job.category_id);
      const hay = `${job.title} ${job.description} ${job.neighborhood} ${cat?.name ?? ''}`.toLowerCase();
      if (!q.split(/\s+/).every((t) => hay.includes(t))) continue;
    }
    const area = areaForZip(job.zip);
    const distance = origin && area ? milesBetween(origin, area) : null;
    if (filters.distance !== null && (distance === null || distance > filters.distance)) continue;
    if (filters.payMin !== null && payValue(job) < filters.payMin) continue;
    if (!inDateWindow(job.job_date, filters.date, now)) continue;
    if (filters.workType === 'recurring' && !job.is_recurring) continue;
    if (filters.workType === 'one_time' && job.is_recurring) continue;
    if (filters.urgency.length && !filters.urgency.includes(job.urgency)) continue;
    const qualification = profile ? qualify(job, profile, opts.categories) : null;
    out.push({ job, distance, qualification, score: relevanceScore(job, qualification, now) });
  }

  const byNewest = (a: RankedJob, b: RankedJob) => b.job.created_at.localeCompare(a.job.created_at);
  const sorters: Record<SortKey, (a: RankedJob, b: RankedJob) => number> = {
    relevant: (a, b) => b.score - a.score || byNewest(a, b),
    newest: byNewest,
    pay: (a, b) => payValue(b.job) - payValue(a.job) || byNewest(a, b),
    soonest: (a, b) => a.job.job_date.localeCompare(b.job.job_date) || byNewest(a, b),
  };
  return out.sort(sorters[filters.sort]);
}

/** Contractors to notify about a newly approved job. Mirrors public.notify_matching_contractors(). */
export function matchingContractorIds(job: Job, contractors: ContractorProfile[], categories: Category[]): string[] {
  return contractors
    .filter((c) => c.availability.accepting_work)
    .filter((c) => qualify(job, c, categories).qualified)
    .map((c) => c.user_id);
}

export function defaultExpiry(jobDate: string, deadline: string | null): string {
  // Listings close at the end of the deadline (or job date + 1 day) unless filled first.
  const end = addDays(parseDay(deadline ?? jobDate), 1);
  return end.toISOString();
}
