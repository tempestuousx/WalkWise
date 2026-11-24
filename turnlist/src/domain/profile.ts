import type { ContractorProfile, Verification, VerificationKind } from './types';

export interface CompletionItem {
  key: string;
  label: string;
  done: boolean;
}

export function contractorCompletion(p: ContractorProfile | null, avatar: string | null): { percent: number; items: CompletionItem[] } {
  const items: CompletionItem[] = [
    { key: 'services', label: 'Choose your services', done: Boolean(p?.category_ids.length) },
    { key: 'area', label: 'Set your ZIP and service radius', done: Boolean(p?.home_zip) },
    { key: 'about', label: 'Write a short headline and bio', done: Boolean(p?.headline && p?.bio) },
    { key: 'experience', label: 'Add years of experience', done: p?.years_experience !== null && p?.years_experience !== undefined },
    { key: 'availability', label: 'Set your availability', done: Boolean(p?.availability.days.length) },
    { key: 'photo', label: 'Add a profile photo', done: Boolean(avatar) },
    { key: 'portfolio', label: 'Upload work photos', done: Boolean(p?.portfolio.length) },
    { key: 'contact', label: 'Add business contact info', done: Boolean(p?.contact_phone || p?.contact_email) },
  ];
  const done = items.filter((i) => i.done).length;
  return { percent: Math.round((done / items.length) * 100), items };
}

export const BADGE_LABEL: Record<VerificationKind, string> = {
  identity: 'ID verified',
  license: 'License verified',
  insurance: 'Insurance verified',
  business: 'Business verified',
};

/**
 * Badges come only from verifications an admin approved and that have not
 * expired. Self-reported licenses or insurance never produce a badge.
 */
export function verifiedBadges(verifications: Verification[], userId: string, now = new Date()): VerificationKind[] {
  const today = now.toISOString().slice(0, 10);
  const kinds = new Set<VerificationKind>();
  for (const v of verifications) {
    if (v.user_id !== userId || v.status !== 'approved') continue;
    if (v.expires_on && v.expires_on < today) continue;
    kinds.add(v.kind);
  }
  return (['identity', 'business', 'license', 'insurance'] as VerificationKind[]).filter((k) => kinds.has(k));
}
