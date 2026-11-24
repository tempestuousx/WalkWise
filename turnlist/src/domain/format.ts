import type { Job, MaterialsPolicy, PropertyType } from './types';

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function formatPay(job: Pick<Job, 'pay_type' | 'pay_min' | 'pay_max'>): string {
  const range = job.pay_max && job.pay_max > job.pay_min ? `${usd0.format(job.pay_min)}–${usd0.format(job.pay_max)}` : usd0.format(job.pay_min);
  return job.pay_type === 'hourly' ? `${range}/hr` : range;
}
export function payQualifier(job: Pick<Job, 'pay_type' | 'pay_max' | 'pay_min'>): string {
  if (job.pay_type === 'hourly') return 'hourly';
  return job.pay_max && job.pay_max > job.pay_min ? 'budget range' : 'flat rate';
}

/** Parse a yyyy-mm-dd as a local calendar date (avoids UTC off-by-one). */
export function parseDay(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day);
}
export function toDayString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** "Today", "Tomorrow", "Thursday", or "Dec 4". */
export function formatNeededDay(day: string, now = new Date()): string {
  const d = parseDay(day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
export function formatDate(day: string): string {
  return parseDay(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function timeAgo(iso: string, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDuration(hours: number | null): string | null {
  if (!hours) return null;
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours >= 8 && hours % 8 === 0) return hours === 8 ? '1 day' : `${hours / 8} days`;
  return `${hours % 1 === 0 ? hours : hours.toFixed(1)} hr${hours === 1 ? '' : 's'}`;
}

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  apartment: 'Apartment',
  single_family: 'Single-family home',
  townhome_condo: 'Townhome or condo',
  multifamily_building: 'Multifamily building',
  commercial: 'Commercial',
  short_term_rental: 'Short-term rental',
  other: 'Other',
};

export const MATERIALS_LABEL: Record<MaterialsPolicy, string> = {
  provided: 'Materials provided',
  contractor: 'Contractor brings materials',
  shared: 'Some materials provided',
  none: 'No materials needed',
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
