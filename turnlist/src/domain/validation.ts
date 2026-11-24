import { z } from 'zod';
import { areaForZip } from './market';
import { toDayString } from './format';

const zip = z
  .string()
  .trim()
  .regex(/^\d{5}$/, 'Enter a 5-digit ZIP code')
  .refine((v) => Boolean(areaForZip(v)), 'We only serve the Las Vegas valley right now. Enter a ZIP in Clark County.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date');

export const jobInputSchema = z
  .object({
    title: z.string().trim().min(6, 'Give the job a short, specific title (6+ characters)').max(90, 'Keep the title under 90 characters'),
    category_id: z.string().min(1, 'Choose a category'),
    description: z.string().trim().min(20, 'Describe the work in a sentence or two (20+ characters)').max(4000),
    zip,
    property_type: z.enum(['apartment', 'single_family', 'townhome_condo', 'multifamily_building', 'commercial', 'short_term_rental', 'other']),
    job_date: day.refine((d) => d >= toDayString(new Date()), 'The date needed cannot be in the past'),
    deadline: day.nullable(),
    duration_hours: z.number().positive('Duration must be more than zero').max(400).nullable(),
    pay_type: z.enum(['fixed', 'hourly']),
    pay_min: z.number({ invalid_type_error: 'Enter an amount' }).min(1, 'Enter an amount').max(100000),
    pay_max: z.number().max(100000).nullable(),
    experience_required: z.string().trim().max(300).nullable(),
    license_required: z.boolean(),
    insurance_required: z.boolean(),
    materials: z.enum(['provided', 'contractor', 'shared', 'none']),
    urgency: z.enum(['flexible', 'within_7_days', 'within_48_hours', 'same_day']),
    is_recurring: z.boolean(),
    recurrence_note: z.string().trim().max(200).nullable(),
    photos: z.array(z.string()).max(6, 'Up to 6 photos'),
    street_address: z.string().trim().max(200).nullable(),
    unit: z.string().trim().max(40).nullable(),
    access_notes: z.string().trim().max(500).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.deadline && v.deadline < v.job_date) ctx.addIssue({ path: ['deadline'], code: 'custom', message: 'Deadline must be on or after the date needed' });
    if (v.pay_max !== null && v.pay_max < v.pay_min) ctx.addIssue({ path: ['pay_max'], code: 'custom', message: 'Maximum must be at least the minimum' });
    if (v.pay_type === 'hourly' && v.pay_min < 12) ctx.addIssue({ path: ['pay_min'], code: 'custom', message: 'Hourly rates under $12 are not accepted' });
    if (v.is_recurring && !v.recurrence_note) ctx.addIssue({ path: ['recurrence_note'], code: 'custom', message: 'Say how often (for example, "Every other Friday")' });
  });

export type JobInput = z.infer<typeof jobInputSchema>;

export const applicationInputSchema = z.object({
  message: z.string().trim().min(20, 'Write a short note to the business (20+ characters)').max(1500, 'Keep it under 1,500 characters'),
  proposed_rate: z.number().positive().max(100000).nullable(),
  available_on: day.nullable(),
});
export type ApplicationInput = z.infer<typeof applicationInputSchema>;

export const signUpSchema = z.object({
  role: z.enum(['employer', 'contractor']),
  display_name: z.string().trim().min(2, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters'),
  accept_terms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms to continue' }) }),
});

export const businessProfileSchema = z.object({
  company_name: z.string().trim().min(2, 'Enter your business name').max(120),
  business_type: z.enum(['property_manager', 'landlord', 'investor', 'maintenance_company', 'other']),
  phone: z.string().trim().max(30).nullable(),
  website: z.string().trim().max(200).nullable(),
  about: z.string().trim().max(1000).nullable(),
  zip: zip.nullable(),
});

export const contractorProfileSchema = z.object({
  business_name: z.string().trim().max(120).nullable(),
  headline: z.string().trim().max(120).nullable(),
  bio: z.string().trim().max(2000).nullable(),
  years_experience: z.number().int().min(0).max(70).nullable(),
  category_ids: z.array(z.string()).min(1, 'Choose at least one service'),
  home_zip: zip,
  service_radius_miles: z.number().int().min(1).max(60),
  insurance_self_reported: z.boolean(),
  certifications: z.array(z.string().trim().min(1)).max(20),
  contact_phone: z.string().trim().max(30).nullable(),
  contact_email: z.string().trim().email('Enter a valid email').nullable().or(z.literal('').transform(() => null)),
});

/** Turn a ZodError into { field: message } for inline display. */
export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join('.') || '_';
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
