// Core domain types. These mirror the Postgres schema in supabase/migrations
// (snake_case columns are mapped 1:1 so both data adapters share one shape).

export type Role = 'employer' | 'contractor' | 'admin';
export type AccountStatus = 'active' | 'suspended';
export type TrustLevel = 'new' | 'trusted';

export type Urgency = 'flexible' | 'within_7_days' | 'within_48_hours' | 'same_day';
export type PayType = 'fixed' | 'hourly';
export type MaterialsPolicy = 'provided' | 'contractor' | 'shared' | 'none';
export type PropertyType =
  | 'apartment'
  | 'single_family'
  | 'townhome_condo'
  | 'multifamily_building'
  | 'commercial'
  | 'short_term_rental'
  | 'other';

/** Stored job status. "applications_received" is derived for display, see status.ts. */
export type JobStatus = 'open' | 'filled' | 'in_progress' | 'completed' | 'canceled' | 'expired';
export type JobDisplayStatus = JobStatus | 'applications_received';
export type ModerationStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export type ApplicationStatus =
  | 'submitted'
  | 'viewed'
  | 'shortlisted'
  | 'selected'
  | 'not_selected'
  | 'withdrawn';

export type VerificationKind = 'identity' | 'license' | 'insurance' | 'business';
export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export type NotificationType =
  | 'new_matching_job'
  | 'application_received'
  | 'application_shortlisted'
  | 'contractor_selected'
  | 'application_not_selected'
  | 'job_canceled'
  | 'deadline_approaching'
  | 'new_message'
  | 'listing_moderated'
  | 'verification_updated';

export type NotificationChannel = 'in_app' | 'email' | 'sms';

export interface Market {
  id: string;
  slug: string;
  name: string;
  state: string;
  timezone: string;
  active: boolean;
}

export interface Area {
  zip: string;
  market_id: string;
  neighborhood: string;
  city: string;
  lat: number;
  lng: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  group: string; // browse group slug, see categories.ts
  requires_license: boolean;
  license_note: string | null;
  active: boolean;
  sort: number;
}

export interface Profile {
  id: string;
  role: Role;
  email: string;
  display_name: string;
  avatar_url: string | null;
  market_id: string;
  status: AccountStatus;
  trust_level: TrustLevel;
  is_demo: boolean;
  created_at: string;
}

export type BusinessType = 'property_manager' | 'landlord' | 'investor' | 'maintenance_company' | 'other';

export interface BusinessProfile {
  user_id: string;
  company_name: string;
  business_type: BusinessType;
  phone: string | null;
  website: string | null;
  about: string | null;
  zip: string | null;
  plan: 'free_intro' | 'pay_per_post' | 'monthly';
  free_listings_used: number;
  updated_at: string;
}

export interface Availability {
  accepting_work: boolean;
  days: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>;
  same_day_ok: boolean;
  note: string | null;
}

export interface LicenseEntry {
  id: string;
  license_type: string;
  license_number: string;
  issuer: string;
  expires_on: string | null;
}

export interface ContractorProfile {
  user_id: string;
  business_name: string | null;
  headline: string | null;
  bio: string | null;
  years_experience: number | null;
  category_ids: string[];
  home_zip: string | null;
  service_radius_miles: number;
  availability: Availability;
  /** Self-reported. Never shown as "Insured" unless an approved verification exists. */
  insurance_self_reported: boolean;
  licenses: LicenseEntry[];
  certifications: string[];
  contact_phone: string | null;
  contact_email: string | null;
  portfolio: PortfolioItem[];
  updated_at: string;
}

export interface PortfolioItem {
  id: string;
  url: string;
  caption: string | null;
}

export interface Job {
  id: string;
  employer_id: string;
  market_id: string;
  title: string;
  category_id: string;
  description: string;
  neighborhood: string;
  zip: string;
  property_type: PropertyType;
  job_date: string; // yyyy-mm-dd, the day work is needed
  deadline: string | null; // yyyy-mm-dd, last day the work may be finished
  duration_hours: number | null;
  pay_type: PayType;
  pay_min: number; // dollars
  pay_max: number | null;
  experience_required: string | null;
  license_required: boolean;
  insurance_required: boolean;
  materials: MaterialsPolicy;
  urgency: Urgency;
  is_recurring: boolean;
  recurrence_note: string | null;
  photos: string[];
  status: JobStatus;
  moderation_status: ModerationStatus;
  moderation_note: string | null;
  selected_application_id: string | null;
  application_count: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string; // listing stops accepting applications
  filled_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
}

/** Address and access details. Only the employer and contractors it was shared with can read it. */
export interface JobPrivateDetails {
  job_id: string;
  street_address: string;
  unit: string | null;
  access_notes: string | null;
  shared_with: string[];
}

export interface Application {
  id: string;
  job_id: string;
  contractor_id: string;
  message: string;
  proposed_rate: number | null;
  available_on: string | null;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  viewed_at: string | null;
  /** Snapshot at submit time: category, service area and license requirement all matched. */
  is_qualified: boolean;
}

export interface Conversation {
  id: string;
  job_id: string | null;
  employer_id: string;
  contractor_id: string;
  created_at: string;
  last_message_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export type NotificationPreferences = Record<NotificationType, { in_app: boolean; email: boolean; sms: boolean }>;

export interface Review {
  id: string;
  job_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  body: string | null;
  created_at: string;
}

export interface Verification {
  id: string;
  user_id: string;
  kind: VerificationKind;
  status: VerificationStatus;
  /** Path inside the private "verification-docs" bucket. Never a public URL. */
  document_path: string | null;
  document_name: string | null;
  details: string | null;
  reviewer_id: string | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  expires_on: string | null;
  created_at: string;
}

export interface AdminAction {
  id: string;
  admin_id: string;
  action: string;
  target_type: 'job' | 'user' | 'verification' | 'category' | 'report';
  target_id: string;
  reason: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: 'job' | 'user';
  target_id: string;
  reason: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
}

export interface SavedContractor {
  employer_id: string;
  contractor_id: string;
  note: string | null;
  created_at: string;
}
