import type { Category } from './types';

/**
 * Browse groups drive the horizontal category strip. Every detailed category
 * belongs to exactly one group; admins can add categories and pick a group.
 */
export const BROWSE_GROUPS = [
  { slug: 'cleaning', name: 'Cleaning' },
  { slug: 'painting', name: 'Painting' },
  { slug: 'maintenance', name: 'General Maintenance' },
  { slug: 'landscaping', name: 'Landscaping' },
  { slug: 'junk', name: 'Junk Removal' },
  { slug: 'flooring', name: 'Flooring' },
  { slug: 'photography', name: 'Photography' },
  { slug: 'other', name: 'Other Services' },
] as const;

export type BrowseGroup = (typeof BROWSE_GROUPS)[number]['slug'];

/** Section headings used on forms, matching the product brief's four families. */
export const CATEGORY_FAMILIES: Record<string, string[]> = {
  'Cleaning and turnovers': ['move-out-cleaning', 'turnover-cleaning', 'deep-cleaning', 'carpet-cleaning', 'post-construction-cleanup'],
  'Maintenance and repairs': ['general-maintenance', 'painting', 'drywall-repair', 'flooring', 'plumbing', 'electrical', 'appliance-maintenance', 'hvac'],
  'Property preparation': ['furniture-removal', 'junk-hauling', 'landscaping', 'pressure-washing', 'window-cleaning', 'property-inspections'],
  'Additional services': ['real-estate-photography', 'rental-photography', 'property-staging', 'general-labor'],
};

const NV_LICENSE_NOTE =
  'Nevada generally requires a Nevada State Contractors Board license for this trade when the work exceeds the handyman exemption or requires a permit. Confirm licensing before hiring.';

type Seed = [slug: string, name: string, group: BrowseGroup, requiresLicense?: boolean];

const SEED: Seed[] = [
  ['move-out-cleaning', 'Move-out cleaning', 'cleaning'],
  ['turnover-cleaning', 'Apartment turnover cleaning', 'cleaning'],
  ['deep-cleaning', 'Deep cleaning', 'cleaning'],
  ['carpet-cleaning', 'Carpet cleaning', 'cleaning'],
  ['post-construction-cleanup', 'Post-construction cleanup', 'cleaning'],
  ['general-maintenance', 'General maintenance', 'maintenance'],
  ['painting', 'Painting', 'painting'],
  ['drywall-repair', 'Drywall repair', 'painting'],
  ['flooring', 'Flooring', 'flooring'],
  ['plumbing', 'Plumbing', 'maintenance', true],
  ['electrical', 'Electrical', 'maintenance', true],
  ['appliance-maintenance', 'Appliance maintenance', 'maintenance'],
  ['hvac', 'HVAC', 'maintenance', true],
  ['furniture-removal', 'Furniture removal', 'junk'],
  ['junk-hauling', 'Junk hauling', 'junk'],
  ['landscaping', 'Landscaping', 'landscaping'],
  ['pressure-washing', 'Pressure washing', 'cleaning'],
  ['window-cleaning', 'Window cleaning', 'cleaning'],
  ['property-inspections', 'Property inspections', 'other'],
  ['real-estate-photography', 'Real estate photography', 'photography'],
  ['rental-photography', 'Rental property photography', 'photography'],
  ['property-staging', 'Property staging', 'other'],
  ['general-labor', 'General labor', 'other'],
];

export const DEFAULT_CATEGORIES: Category[] = SEED.map(([slug, name, group, lic], i) => ({
  id: `cat_${slug}`,
  slug,
  name,
  group,
  requires_license: Boolean(lic),
  license_note: lic ? NV_LICENSE_NOTE : null,
  active: true,
  sort: (i + 1) * 10,
}));

export function groupName(slug: string): string {
  return BROWSE_GROUPS.find((g) => g.slug === slug)?.name ?? 'Other Services';
}
