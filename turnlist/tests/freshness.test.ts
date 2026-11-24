import { describe, expect, it } from 'vitest';
import { closesLabel, freshness } from '@/domain/freshness';
import { EMPTY_FILTERS, filterJobs, partitionByMatch } from '@/domain/jobs';
import { buildSeed } from '@/data/demoSeed';

// Tuesday 2026-11-24, 6 pm local
const NOW = new Date(2026, 10, 24, 18, 0, 0);
const seed = buildSeed('x', NOW);
const at = (y: number, m: number, d: number, h = 0) => new Date(y, m, d, h).toISOString();

describe('freshness', () => {
  it('labels when applications close by the last open day', () => {
    expect(closesLabel(at(2026, 10, 25), NOW)).toBe('Closes today'); // midnight tonight
    expect(closesLabel(at(2026, 10, 26), NOW)).toBe('Closes tomorrow');
    expect(closesLabel(at(2026, 10, 28), NOW)).toBe('Closes Friday');
    expect(closesLabel(at(2026, 10, 28), NOW, true)).toBe('Closes Fri');
    expect(closesLabel(at(2026, 11, 9), NOW)).toBe('Closes Dec 8');
    expect(closesLabel(new Date(NOW.getTime() + 20 * 60_000).toISOString(), NOW)).toBe('Closes within the hour');
  });

  it('flags new listings, closing-soon listings, and why closed ones are closed', () => {
    const base = { created_at: new Date(NOW.getTime() - 3 * 3_600_000).toISOString(), expires_at: at(2026, 10, 25), status: 'open' as const, moderation_status: 'approved' as const };
    const f = freshness(base, NOW);
    expect(f).toMatchObject({ isNew: true, accepting: true, closingSoon: true, closedReason: null, postedAgo: '3h ago' });
    expect(freshness({ ...base, created_at: new Date(NOW.getTime() - 30 * 3_600_000).toISOString() }, NOW).isNew).toBe(false);
    expect(freshness({ ...base, expires_at: at(2026, 10, 30) }, NOW).closingSoon).toBe(false);
    expect(freshness({ ...base, status: 'filled' }, NOW)).toMatchObject({ accepting: false, closedReason: 'Filled', closesLabel: null });
    expect(freshness({ ...base, expires_at: at(2026, 10, 20) }, NOW).closedReason).toBe('Expired');
    expect(freshness({ ...base, moderation_status: 'pending' }, NOW).closedReason).toBe('Awaiting review');
  });
});

describe('discovery: freshness and relevance', () => {
  const marco = seed.contractors.find((c) => c.user_id === 'usr_con_marco')!;
  const opts = { categories: seed.categories, now: NOW };

  it('filters by how recently a job was posted', () => {
    const day = filterJobs(seed.jobs, { ...EMPTY_FILTERS, posted: '24h' }, opts);
    expect(day.length).toBeGreaterThan(0);
    expect(day.every((r) => NOW.getTime() - new Date(r.job.created_at).getTime() <= 24 * 3_600_000)).toBe(true);
    expect(filterJobs(seed.jobs, { ...EMPTY_FILTERS, posted: '7d' }, opts).length).toBeGreaterThanOrEqual(day.length);
  });

  it('sorts by closing soonest', () => {
    const r = filterJobs(seed.jobs, { ...EMPTY_FILTERS, sort: 'closing' }, opts).map((x) => x.job.expires_at);
    expect(r).toEqual([...r].sort());
  });

  it('puts profile matches first and can hide everything else', () => {
    const ranked = filterJobs(seed.jobs, { ...EMPTY_FILTERS, sort: 'newest' }, { ...opts, profile: marco });
    const { matches, others } = partitionByMatch(ranked);
    expect(matches.length).toBeGreaterThan(0);
    expect(others.length).toBeGreaterThan(0);
    expect(matches.every((r) => r.qualification!.categoryMatch && r.qualification!.inServiceArea)).toBe(true);
    expect(others.some((r) => r.job.id === 'job_3')).toBe(true); // plumbing, unlicensed
    // order inside each group follows the chosen sort
    expect(matches.map((r) => r.job.created_at)).toEqual([...matches.map((r) => r.job.created_at)].sort().reverse());
    const only = filterJobs(seed.jobs, { ...EMPTY_FILTERS, matchesOnly: true }, { ...opts, profile: marco });
    expect(only.map((r) => r.job.id).sort()).toEqual(matches.map((r) => r.job.id).sort());
  });

  it('treats everyone without a profile as having no matches', () => {
    const { matches, others } = partitionByMatch(filterJobs(seed.jobs, EMPTY_FILTERS, opts));
    expect(matches).toEqual([]);
    expect(others.length).toBeGreaterThan(0);
  });
});
