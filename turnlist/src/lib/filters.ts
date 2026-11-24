import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EMPTY_FILTERS, type DateWindow, type JobFilters, type SortKey, type WorkType } from '@/domain/jobs';
import { AREAS, resolveLocation } from '@/domain/market';
import type { Urgency } from '@/domain/types';

/** Find Work filters live in the URL so searches can be shared and survive reloads. */
export function useJobFilters(defaultOriginZip: string | null) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<JobFilters & { locationLabel: string | null; locationUnknown: boolean }>(() => {
    const loc = params.get('loc') ?? '';
    const resolved = resolveLocation(loc);
    const dist = params.get('dist');
    let originPoint: JobFilters['originPoint'] = null;
    if (resolved && dist) {
      const pts = AREAS.filter((a) => resolved.zips.includes(a.zip));
      if (pts.length) originPoint = { lat: pts.reduce((s, a) => s + a.lat, 0) / pts.length, lng: pts.reduce((s, a) => s + a.lng, 0) / pts.length };
    }
    return {
      ...EMPTY_FILTERS,
      q: params.get('q') ?? '',
      group: params.get('group'),
      categoryIds: params.get('cats')?.split(',').filter(Boolean) ?? [],
      location: loc,
      zips: resolved && !dist ? resolved.zips : null,
      distance: dist ? Number(dist) : null,
      originZip: defaultOriginZip,
      originPoint,
      payMin: params.get('pay') ? Number(params.get('pay')) : null,
      date: (params.get('date') as DateWindow) ?? 'any',
      workType: (params.get('type') as WorkType) ?? 'any',
      urgency: (params.get('urg')?.split(',').filter(Boolean) as Urgency[]) ?? [],
      sort: (params.get('sort') as SortKey) ?? 'relevant',
      locationLabel: resolved?.label ?? null,
      locationUnknown: Boolean(loc) && !resolved,
    };
  }, [params, defaultOriginZip]);

  const set = (patch: Record<string, string | number | null | string[]>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      const val = Array.isArray(v) ? v.join(',') : v;
      if (val === null || val === '' || val === 'any' || (k === 'sort' && val === 'relevant')) next.delete(k);
      else next.set(k, String(val));
    }
    setParams(next, { replace: true });
  };
  const clear = () => setParams(new URLSearchParams(params.get('sort') ? { sort: params.get('sort')! } : {}), { replace: true });
  return { filters, set, clear };
}
