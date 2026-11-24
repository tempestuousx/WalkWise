import { describe, expect, it } from 'vitest';
import { canTransitionApplication, canTransitionJob, jobDisplayStatus, isJobAvailable } from '@/domain/status';
import { EMPTY_FILTERS, filterJobs, qualify } from '@/domain/jobs';
import { buildSeed } from '@/data/demoSeed';
import { resolveLocation, zipDistance } from '@/domain/market';
import { jobInputSchema } from '@/domain/validation';
import { verifiedBadges } from '@/domain/profile';
import { formatPay, toDayString, addDays } from '@/domain/format';

const NOW = new Date('2026-11-24T18:00:00');
const seed = buildSeed('x', NOW);

describe('job status', () => {
  it('derives applications received and expiry without storing them', () => {
    const base = { status: 'open' as const, expires_at: new Date(NOW.getTime() + 1e7).toISOString(), application_count: 0 };
    expect(jobDisplayStatus(base, NOW)).toBe('open');
    expect(jobDisplayStatus({ ...base, application_count: 2 }, NOW)).toBe('applications_received');
    expect(jobDisplayStatus({ ...base, expires_at: new Date(NOW.getTime() - 1).toISOString() }, NOW)).toBe('expired');
  });
  it('only allows valid lifecycle moves', () => {
    expect(canTransitionJob('open', 'filled')).toBe(true);
    expect(canTransitionJob('completed', 'open')).toBe(false);
    expect(canTransitionJob('canceled', 'open')).toBe(false);
    expect(canTransitionJob('filled', 'open')).toBe(true);
  });
  it('keeps contractors and employers in their own lanes', () => {
    expect(canTransitionApplication('contractor', 'submitted', 'shortlisted')).toBe(false);
    expect(canTransitionApplication('contractor', 'submitted', 'withdrawn')).toBe(true);
    expect(canTransitionApplication('employer', 'submitted', 'withdrawn')).toBe(false);
    expect(canTransitionApplication('employer', 'viewed', 'shortlisted')).toBe(true);
  });
  it('never treats pending, filled, or expired jobs as available', () => {
    for (const j of seed.jobs) {
      if (['job_15', 'job_16', 'job_17', 'job_18'].includes(j.id)) expect(isJobAvailable(j, NOW)).toBe(false);
    }
  });
});

describe('job discovery', () => {
  const marco = seed.contractors.find((c) => c.user_id === 'usr_con_marco')!;
  it('excludes unavailable jobs and filters by browse group', () => {
    const all = filterJobs(seed.jobs, EMPTY_FILTERS, { categories: seed.categories, now: NOW });
    expect(all.every((r) => isJobAvailable(r.job, NOW))).toBe(true);
    const cleaning = filterJobs(seed.jobs, { ...EMPTY_FILTERS, group: 'cleaning' }, { categories: seed.categories, now: NOW });
    expect(cleaning.length).toBeGreaterThan(0);
    expect(cleaning.every((r) => seed.categories.find((c) => c.id === r.job.category_id)!.group === 'cleaning')).toBe(true);
  });
  it('ranks qualified nearby jobs first for a contractor', () => {
    const ranked = filterJobs(seed.jobs, EMPTY_FILTERS, { categories: seed.categories, profile: marco, now: NOW });
    expect(ranked[0].qualification?.categoryMatch).toBe(true);
    const plumbing = ranked.find((r) => r.job.id === 'job_3')!;
    expect(plumbing.qualification?.qualified).toBe(false); // no license, wrong trade
  });
  it('filters by distance, pay, urgency, and recurring', () => {
    const near = filterJobs(seed.jobs, { ...EMPTY_FILTERS, distance: 5, originZip: '89117' }, { categories: seed.categories, now: NOW });
    expect(near.every((r) => (r.distance ?? 99) <= 5)).toBe(true);
    const recurring = filterJobs(seed.jobs, { ...EMPTY_FILTERS, workType: 'recurring' }, { categories: seed.categories, now: NOW });
    expect(recurring.map((r) => r.job.id)).toEqual(['job_5']);
    const urgent = filterJobs(seed.jobs, { ...EMPTY_FILTERS, urgency: ['same_day'] }, { categories: seed.categories, now: NOW });
    expect(urgent.every((r) => r.job.urgency === 'same_day')).toBe(true);
    const sorted = filterJobs(seed.jobs, { ...EMPTY_FILTERS, sort: 'soonest' }, { categories: seed.categories, now: NOW });
    expect(sorted.map((r) => r.job.job_date)).toEqual([...sorted.map((r) => r.job.job_date)].sort());
  });
  it('requires a license for license-restricted trades even if the employer did not tick it', () => {
    const job = { ...seed.jobs.find((j) => j.id === 'job_3')!, license_required: false };
    const tomas = seed.contractors.find((c) => c.user_id === 'usr_con_tomas')!;
    expect(qualify(job, { ...tomas, licenses: [] }, seed.categories).meetsLicense).toBe(false);
    expect(qualify(job, tomas, seed.categories).meetsLicense).toBe(true);
  });
  it('resolves neighborhoods, cities, and ZIPs', () => {
    expect(resolveLocation('summerlin')!.zips).toContain('89134');
    expect(resolveLocation('Henderson')!.zips.length).toBeGreaterThan(4);
    expect(resolveLocation('89074')!.zips).toEqual(['89074']);
    expect(resolveLocation('Reno')).toBeNull();
    expect(zipDistance('89135', '89135')).toBe(0);
  });
});

describe('validation and display', () => {
  const valid = {
    title: 'Move-out clean', category_id: 'cat_move-out-cleaning', description: 'Two bedroom apartment move-out clean, empty unit.',
    zip: '89135', property_type: 'apartment', job_date: toDayString(addDays(new Date(), 1)), deadline: null, duration_hours: 4,
    pay_type: 'fixed', pay_min: 180, pay_max: null, experience_required: null, license_required: false, insurance_required: false,
    materials: 'provided', urgency: 'flexible', is_recurring: false, recurrence_note: null, photos: [], street_address: null, unit: null, access_notes: null,
  } as const;
  it('accepts a minimal Quick Post and rejects bad input with field messages', () => {
    expect(jobInputSchema.safeParse(valid).success).toBe(true);
    const bad = jobInputSchema.safeParse({ ...valid, zip: '10001', pay_max: 50, job_date: '2000-01-01' });
    expect(bad.success).toBe(false);
    const paths = bad.success ? [] : bad.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(['zip', 'job_date']));
  });
  it('formats pay ranges and hourly rates', () => {
    expect(formatPay({ pay_type: 'fixed', pay_min: 180, pay_max: null })).toBe('$180');
    expect(formatPay({ pay_type: 'hourly', pay_min: 35, pay_max: 45 })).toBe('$35–$45/hr');
  });
  it('only awards badges for approved, unexpired verifications', () => {
    const v = (status: 'approved' | 'pending', expires_on: string | null) => ({ id: 'v', user_id: 'u', kind: 'insurance' as const, status, document_path: null, document_name: null, details: null, reviewer_id: null, reviewer_note: null, reviewed_at: null, expires_on, created_at: '' });
    expect(verifiedBadges([v('pending', null)], 'u', NOW)).toEqual([]);
    expect(verifiedBadges([v('approved', '2020-01-01')], 'u', NOW)).toEqual([]);
    expect(verifiedBadges([v('approved', null)], 'u', NOW)).toEqual(['insurance']);
  });
});
