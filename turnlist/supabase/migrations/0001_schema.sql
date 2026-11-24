-- Turnlist core schema.
-- Conventions: snake_case, timestamptz everywhere, text ids for reference data
-- (markets, categories) so the client and seed files can name them stably,
-- uuid ids for user-generated rows.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.user_role as enum ('employer', 'contractor', 'admin');
create type public.account_status as enum ('active', 'suspended');
create type public.trust_level as enum ('new', 'trusted');
create type public.business_type as enum ('property_manager', 'landlord', 'investor', 'maintenance_company', 'other');
create type public.plan_code as enum ('free_intro', 'pay_per_post', 'monthly');
create type public.urgency as enum ('flexible', 'within_7_days', 'within_48_hours', 'same_day');
create type public.pay_type as enum ('fixed', 'hourly');
create type public.materials_policy as enum ('provided', 'contractor', 'shared', 'none');
create type public.property_type as enum ('apartment', 'single_family', 'townhome_condo', 'multifamily_building', 'commercial', 'short_term_rental', 'other');
-- "applications_received" is derived (open + application_count > 0), never stored.
create type public.job_status as enum ('open', 'filled', 'in_progress', 'completed', 'canceled', 'expired');
create type public.moderation_status as enum ('pending', 'approved', 'rejected', 'removed');
create type public.application_status as enum ('submitted', 'viewed', 'shortlisted', 'selected', 'not_selected', 'withdrawn');
create type public.verification_kind as enum ('identity', 'license', 'insurance', 'business');
create type public.verification_status as enum ('pending', 'approved', 'rejected', 'expired');
create type public.notification_type as enum (
  'new_matching_job', 'application_received', 'application_shortlisted', 'contractor_selected',
  'application_not_selected', 'job_canceled', 'deadline_approaching', 'new_message',
  'listing_moderated', 'verification_updated'
);
create type public.delivery_channel as enum ('email', 'sms');
create type public.delivery_status as enum ('queued', 'sent', 'failed', 'skipped');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- ---------------------------------------------------------------- reference data
create table public.markets (
  id text primary key,
  slug text not null unique,
  name text not null,
  state text not null,
  timezone text not null,
  active boolean not null default true,
  -- When true, listings from accounts with trust_level = 'new' wait for admin approval.
  require_review_for_new_accounts boolean not null default true
);

create table public.areas (
  zip text primary key check (zip ~ '^\d{5}$'),
  market_id text not null references public.markets(id),
  neighborhood text not null,
  city text not null,
  lat double precision not null,
  lng double precision not null
);
create index areas_market_idx on public.areas(market_id);

create table public.categories (
  id text primary key,
  slug text not null unique,
  name text not null,
  "group" text not null,
  requires_license boolean not null default false,
  license_note text,
  active boolean not null default true,
  sort integer not null default 0
);

-- Monetization is modeled but not charged. No payment processing until legal review.
create table public.plans (
  code public.plan_code primary key,
  name text not null,
  monthly_listing_quota integer,          -- null = unlimited
  price_cents integer,                    -- informational only
  active boolean not null default false
);

-- ---------------------------------------------------------------- people
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null,
  display_name text not null check (char_length(display_name) between 2 and 80),
  avatar_url text,
  market_id text not null references public.markets(id) default 'mkt_las_vegas',
  status public.account_status not null default 'active',
  trust_level public.trust_level not null default 'new',
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);

-- Phone and email shown on profiles. Visible to the owner, admins, and
-- counterparties linked through an application (see can_view_contact()).
create table public.private_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (char_length(phone) <= 30),
  email text check (char_length(email) <= 200),
  updated_at timestamptz not null default now()
);

create table public.business_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  company_name text not null check (char_length(company_name) between 2 and 120),
  business_type public.business_type not null default 'property_manager',
  website text check (char_length(website) <= 200),
  about text check (char_length(about) <= 1000),
  zip text references public.areas(zip),
  plan public.plan_code not null default 'free_intro',
  free_listings_used integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.contractor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  business_name text check (char_length(business_name) <= 120),
  headline text check (char_length(headline) <= 120),
  bio text check (char_length(bio) <= 2000),
  years_experience integer check (years_experience between 0 and 70),
  category_ids text[] not null default '{}',
  home_zip text references public.areas(zip),
  service_radius_miles integer not null default 15 check (service_radius_miles between 1 and 60),
  -- { accepting_work: bool, days: ['mon',...], same_day_ok: bool, note: text }
  availability jsonb not null default '{"accepting_work": true, "days": [], "same_day_ok": false, "note": null}',
  -- Self-reported. Never displayed as "insured" without an approved verification.
  insurance_self_reported boolean not null default false,
  -- [{ id, license_type, license_number, issuer, expires_on }] self-reported
  licenses jsonb not null default '[]',
  certifications text[] not null default '{}',
  -- [{ id, url, caption }] images in the public "portfolio" bucket
  portfolio jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create index contractor_profiles_categories_idx on public.contractor_profiles using gin (category_ids);

-- ---------------------------------------------------------------- jobs
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  employer_id uuid not null references public.profiles(id) on delete cascade,
  market_id text not null references public.markets(id),
  title text not null check (char_length(title) between 6 and 90),
  category_id text not null references public.categories(id),
  description text not null check (char_length(description) between 20 and 4000),
  neighborhood text not null,
  zip text not null references public.areas(zip),
  property_type public.property_type not null,
  job_date date not null,
  deadline date check (deadline is null or deadline >= job_date),
  duration_hours numeric(6, 2) check (duration_hours > 0),
  pay_type public.pay_type not null,
  pay_min numeric(10, 2) not null check (pay_min > 0),
  pay_max numeric(10, 2) check (pay_max is null or pay_max >= pay_min),
  experience_required text check (char_length(experience_required) <= 300),
  license_required boolean not null default false,
  insurance_required boolean not null default false,
  materials public.materials_policy not null default 'provided',
  urgency public.urgency not null default 'flexible',
  is_recurring boolean not null default false,
  recurrence_note text check (char_length(recurrence_note) <= 200),
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  status public.job_status not null default 'open',
  moderation_status public.moderation_status not null default 'pending',
  moderation_note text,
  selected_application_id uuid,
  application_count integer not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  filled_at timestamptz,
  completed_at timestamptz,
  canceled_at timestamptz
);
create index jobs_feed_idx on public.jobs(market_id, status, moderation_status, expires_at);
create index jobs_employer_idx on public.jobs(employer_id, created_at desc);
create index jobs_category_idx on public.jobs(category_id);
create index jobs_zip_idx on public.jobs(zip);

create table public.job_private_details (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  street_address text not null check (char_length(street_address) <= 200),
  unit text check (char_length(unit) <= 40),
  access_notes text check (char_length(access_notes) <= 500)
);

-- Contractors the employer chose to share the exact address with.
create table public.address_shares (
  job_id uuid not null references public.jobs(id) on delete cascade,
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (job_id, contractor_id)
);

-- ---------------------------------------------------------------- applications
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 20 and 1500),
  proposed_rate numeric(10, 2) check (proposed_rate > 0),
  available_on date,
  status public.application_status not null default 'submitted',
  -- Snapshot when submitted: category, service area, and license requirement matched.
  is_qualified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  viewed_at timestamptz,
  unique (job_id, contractor_id)
);
create index applications_contractor_idx on public.applications(contractor_id, updated_at desc);
create index applications_job_idx on public.applications(job_id);

alter table public.jobs
  add constraint jobs_selected_application_fk foreign key (selected_application_id)
  references public.applications(id) on delete set null;

create table public.saved_jobs (
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contractor_id, job_id)
);

create table public.saved_contractors (
  employer_id uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (employer_id, contractor_id)
);

-- ---------------------------------------------------------------- messaging
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  employer_id uuid not null references public.profiles(id) on delete cascade,
  contractor_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create unique index conversations_unique_idx on public.conversations(employer_id, contractor_id, coalesce(job_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_conversation_idx on public.messages(conversation_id, created_at);

-- ---------------------------------------------------------------- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null,
  link text,
  -- false when the user turned off in-app for this type (row kept for delivery audit)
  in_app boolean not null default true,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- { "<notification_type>": { "in_app": bool, "email": bool, "sms": bool } }
  prefs jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Outbox processed by the send-notifications edge function. SMS rows are
-- written as 'skipped' until an SMS provider is approved.
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel public.delivery_channel not null,
  status public.delivery_status not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_deliveries_queue_idx on public.notification_deliveries(status, created_at) where status = 'queued';

-- ---------------------------------------------------------------- trust and safety
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  unique (job_id, reviewer_id)
);
create index reviews_reviewee_idx on public.reviews(reviewee_id);

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.verification_kind not null,
  status public.verification_status not null default 'pending',
  -- Object path inside the private "verification-docs" bucket. Never a public URL.
  document_path text,
  document_name text,
  details text check (char_length(details) <= 1000),
  reviewer_id uuid references public.profiles(id),
  reviewer_note text,
  reviewed_at timestamptz,
  expires_on date,
  created_at timestamptz not null default now()
);
create index verifications_status_idx on public.verifications(status, created_at);
create unique index verifications_one_pending_idx on public.verifications(user_id, kind) where status = 'pending';

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('job', 'user')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 10 and 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);
create unique index reports_one_open_idx on public.reports(reporter_id, target_id) where status = 'open';

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null check (target_type in ('job', 'user', 'verification', 'category', 'report')),
  target_id text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index admin_actions_created_idx on public.admin_actions(created_at desc);
