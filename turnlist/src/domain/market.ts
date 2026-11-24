import type { Area, Market } from './types';

/**
 * Launch market. New cities are added as rows in `markets` and `areas`
 * (see supabase/seed.sql); nothing in the UI hardcodes Las Vegas beyond
 * DEFAULT_MARKET_ID.
 */
export const MARKETS: Market[] = [
  { id: 'mkt_las_vegas', slug: 'las-vegas', name: 'Las Vegas valley', state: 'NV', timezone: 'America/Los_Angeles', active: true },
];
export const DEFAULT_MARKET_ID = 'mkt_las_vegas';

// ZIP centroids are approximate (good to roughly a mile) and only used for
// distance filtering. Neighborhood labels are the public "general location".
type Row = [zip: string, neighborhood: string, city: string, lat: number, lng: number];
const ROWS: Row[] = [
  ['89101', 'Downtown', 'Las Vegas', 36.172, -115.122],
  ['89102', 'West Charleston', 'Las Vegas', 36.145, -115.186],
  ['89103', 'Spring Valley', 'Las Vegas', 36.11, -115.21],
  ['89104', 'Huntridge', 'Las Vegas', 36.152, -115.109],
  ['89106', 'Historic Westside', 'Las Vegas', 36.183, -115.162],
  ['89107', 'Charleston Heights', 'Las Vegas', 36.17, -115.209],
  ['89108', 'Northwest', 'Las Vegas', 36.205, -115.223],
  ['89109', 'The Strip', 'Las Vegas', 36.126, -115.165],
  ['89110', 'East Las Vegas', 'Las Vegas', 36.172, -115.055],
  ['89113', 'Southwest', 'Las Vegas', 36.06, -115.262],
  ['89115', 'Sunrise Manor', 'Las Vegas', 36.215, -115.067],
  ['89117', 'The Lakes', 'Las Vegas', 36.145, -115.278],
  ['89118', 'Spring Valley', 'Las Vegas', 36.077, -115.212],
  ['89119', 'Paradise', 'Las Vegas', 36.085, -115.15],
  ['89120', 'Paradise', 'Las Vegas', 36.09, -115.09],
  ['89121', 'Paradise', 'Las Vegas', 36.122, -115.091],
  ['89122', 'Sunrise Manor', 'Las Vegas', 36.115, -115.05],
  ['89123', 'Silverado Ranch', 'Las Vegas', 36.035, -115.15],
  ['89128', 'Desert Shores', 'Las Vegas', 36.197, -115.264],
  ['89129', 'Lone Mountain', 'Las Vegas', 36.23, -115.29],
  ['89130', 'Northwest', 'Las Vegas', 36.248, -115.226],
  ['89131', 'Centennial Hills', 'Las Vegas', 36.295, -115.24],
  ['89134', 'Summerlin', 'Las Vegas', 36.2, -115.307],
  ['89135', 'Summerlin South', 'Las Vegas', 36.105, -115.33],
  ['89138', 'Summerlin', 'Las Vegas', 36.17, -115.36],
  ['89139', 'Enterprise', 'Las Vegas', 36.03, -115.21],
  ['89141', 'Southern Highlands', 'Las Vegas', 35.99, -115.205],
  ['89142', 'Sunrise Manor', 'Las Vegas', 36.148, -115.035],
  ['89143', 'Centennial Hills', 'Las Vegas', 36.325, -115.29],
  ['89144', 'Summerlin', 'Las Vegas', 36.178, -115.318],
  ['89145', 'Summerlin', 'Las Vegas', 36.168, -115.278],
  ['89146', 'Spring Valley', 'Las Vegas', 36.142, -115.226],
  ['89147', 'Spring Valley', 'Las Vegas', 36.112, -115.28],
  ['89148', 'Rhodes Ranch', 'Las Vegas', 36.065, -115.3],
  ['89149', 'Centennial Hills', 'Las Vegas', 36.275, -115.29],
  ['89156', 'Sunrise Manor', 'Las Vegas', 36.2, -115.03],
  ['89166', 'Skye Canyon', 'Las Vegas', 36.33, -115.34],
  ['89169', 'Paradise', 'Las Vegas', 36.125, -115.14],
  ['89178', "Mountain's Edge", 'Las Vegas', 36.01, -115.27],
  ['89179', "Mountain's Edge", 'Las Vegas', 35.99, -115.27],
  ['89183', 'Enterprise', 'Las Vegas', 36.0, -115.155],
  ['89002', 'Henderson East', 'Henderson', 36.0, -114.96],
  ['89011', 'Lake Las Vegas', 'Henderson', 36.09, -114.96],
  ['89012', 'Green Valley', 'Henderson', 36.01, -115.04],
  ['89014', 'Green Valley', 'Henderson', 36.06, -115.06],
  ['89015', 'Henderson', 'Henderson', 36.035, -114.97],
  ['89044', 'Inspirada', 'Henderson', 35.95, -115.1],
  ['89052', 'Anthem', 'Henderson', 35.99, -115.1],
  ['89074', 'Green Valley Ranch', 'Henderson', 36.04, -115.09],
  ['89030', 'North Las Vegas', 'North Las Vegas', 36.21, -115.125],
  ['89031', 'North Las Vegas', 'North Las Vegas', 36.255, -115.17],
  ['89032', 'North Las Vegas', 'North Las Vegas', 36.22, -115.17],
  ['89081', 'North Las Vegas', 'North Las Vegas', 36.255, -115.105],
  ['89084', 'Aliante', 'North Las Vegas', 36.295, -115.18],
  ['89085', 'Aliante', 'North Las Vegas', 36.305, -115.2],
  ['89086', 'North Las Vegas', 'North Las Vegas', 36.29, -115.105],
  ['89005', 'Boulder City', 'Boulder City', 35.97, -114.83],
];

export const AREAS: Area[] = ROWS.map(([zip, neighborhood, city, lat, lng]) => ({
  zip,
  market_id: DEFAULT_MARKET_ID,
  neighborhood,
  city,
  lat,
  lng,
}));

const byZip = new Map(AREAS.map((a) => [a.zip, a]));
export const areaForZip = (zip: string | null | undefined): Area | undefined => (zip ? byZip.get(zip.trim()) : undefined);

/** Great-circle distance in miles. Mirrors public.miles_between() in SQL. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function zipDistance(fromZip: string | null | undefined, toZip: string | null | undefined): number | null {
  const a = areaForZip(fromZip);
  const b = areaForZip(toZip);
  if (!a || !b) return null;
  return milesBetween(a, b);
}

/** Neighborhood choices for the location search box, deduplicated. */
export const NEIGHBORHOODS = Array.from(new Set(AREAS.map((a) => a.neighborhood))).sort();
export const CITIES = Array.from(new Set(AREAS.map((a) => a.city)));

/** Resolve free text ("Summerlin", "89135", "Henderson") to ZIPs. */
export function resolveLocation(query: string): { zips: string[]; label: string } | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  if (/^\d{5}$/.test(q)) {
    const a = byZip.get(q);
    return a ? { zips: [q], label: `${a.neighborhood} (${q})` } : { zips: [q], label: q };
  }
  const matches = AREAS.filter((a) => a.neighborhood.toLowerCase().includes(q) || a.city.toLowerCase() === q);
  if (!matches.length) return null;
  const label = matches.every((m) => m.city.toLowerCase() === q) ? matches[0].city : matches[0].neighborhood;
  return { zips: matches.map((m) => m.zip), label };
}
