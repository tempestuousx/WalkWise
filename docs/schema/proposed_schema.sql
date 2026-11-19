-- Walkwise proposed Postgres schema (Supabase, Postgres 17 + PostGIS)
-- Status: PROPOSED. Becomes supabase/migrations/0001_init.sql after approval.
--
-- Conventions
--   * id: client-generated UUIDv7 for every user-created row (idempotent upserts).
--   * user_id on every user-owned table, even when derivable, so RLS is a single indexed predicate.
--   * client_updated_at: device clock time of the last edit, used for last-writer-wins.
--   * server_version: bigint from a global sequence, set by trigger on every insert/update.
--     Pull sync uses it as a cursor, so device clock skew never hides changes.
--   * deleted_at: soft delete (tombstone) so deletions sync. Hard purge by pg_cron after 30 days.
--   * Distances in meters, durations in seconds, temperatures in Celsius, speeds in m/s.
--     Unit conversion happens only in the presentation layer.

create extension if not exists postgis;
create extension if not exists pg_cron;

create sequence public.server_version_seq;

-- security definer: clients never get direct usage on the sequence.
create or replace function public.touch_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.server_version := nextval('public.server_version_seq');
  new.server_updated_at := now();
  return new;
end $$;

-- ───────────────────────── Enums ─────────────────────────
create type public.user_mode            as enum ('owner', 'professional', 'both');
create type public.dog_relationship     as enum ('personal', 'client');
create type public.dog_sex              as enum ('male', 'female', 'unknown');
create type public.dog_size             as enum ('toy', 'small', 'medium', 'large', 'giant');
create type public.walk_status          as enum ('recording', 'paused', 'completed', 'interrupted');
create type public.walk_classification  as enum ('personal', 'rover', 'wag', 'private_client', 'other');
create type public.payment_status       as enum ('unpaid', 'paid', 'waived', 'refunded');
create type public.interval_kind        as enum ('manual_pause', 'system_gap');
create type public.count_noun           as enum ('incident', 'observation', 'event');
create type public.event_source         as enum ('radial', 'tap', 'voice', 'manual', 'import');
create type public.media_kind           as enum ('photo', 'voice');
create type public.transcript_status    as enum ('none', 'pending', 'done', 'failed', 'unavailable');
create type public.weather_phase        as enum ('start', 'periodic', 'end', 'manual');
create type public.weather_source       as enum ('weatherkit', 'open_meteo', 'manual');
create type public.measure_source       as enum ('healthkit', 'health_connect', 'pedometer', 'estimated');
create type public.elevation_source     as enum ('gps', 'barometer', 'dem');
create type public.schedule_status      as enum ('scheduled', 'completed', 'cancelled');

-- ───────────────────────── Accounts ─────────────────────────
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  display_name       text check (char_length(display_name) <= 80),
  mode               public.user_mode not null default 'owner',
  created_at         timestamptz not null default now(),
  client_updated_at  timestamptz not null default now(),
  server_updated_at  timestamptz not null default now(),
  server_version     bigint not null default 0
);

create table public.user_preferences (
  user_id                  uuid primary key references auth.users(id) on delete cascade,
  distance_unit            text not null default 'mi' check (distance_unit in ('mi', 'km')),
  temperature_unit         text not null default 'F' check (temperature_unit in ('F', 'C')),
  theme                    text not null default 'system' check (theme in ('system', 'light', 'dark')),
  glass_intensity          real not null default 1.0 check (glass_intensity between 0 and 1),
  reduce_motion            boolean,          -- null = follow OS
  reduce_transparency      boolean,          -- null = follow OS
  lightweight_rendering    boolean not null default false,
  handedness               text not null default 'right' check (handedness in ('left', 'right')),
  quick_log_default_mode   text not null default 'gesture' check (quick_log_default_mode in ('gesture', 'tap')),
  radial_menu_config       jsonb not null default '{}'::jsonb,  -- ordering, hidden items, per-category layout
  widget_config            jsonb not null default '{}'::jsonb,
  location_retention_days  integer check (location_retention_days is null or location_retention_days >= 7), -- null = keep forever
  share_trim_meters        integer not null default 150 check (share_trim_meters between 0 and 1000),
  keep_screen_awake        boolean not null default false,
  notifications            jsonb not null default '{}'::jsonb,
  client_updated_at        timestamptz not null default now(),
  server_updated_at        timestamptz not null default now(),
  server_version           bigint not null default 0
);

-- ───────────────────────── Clients and dogs ─────────────────────────
create table public.clients (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 120),
  phone_e164         text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  notes              text,
  created_at         timestamptz not null default now(),
  client_updated_at  timestamptz not null,
  server_updated_at  timestamptz not null default now(),
  server_version     bigint not null default 0,
  deleted_at         timestamptz
);
create index clients_user_idx on public.clients (user_id) where deleted_at is null;

create table public.dogs (
  id                   uuid primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  client_id            uuid references public.clients(id) on delete set null,
  relationship         public.dog_relationship not null default 'personal',
  name                 text not null check (char_length(name) between 1 and 60),
  breed                text,
  birth_date           date,
  birth_date_is_estimate boolean not null default false,
  sex                  public.dog_sex not null default 'unknown',
  size                 public.dog_size,
  weight_kg            numeric(5,2) check (weight_kg is null or weight_kg > 0),
  photo_path           text,          -- storage object path in private bucket 'dog-photos'
  walking_notes        text,
  created_at           timestamptz not null default now(),
  client_updated_at    timestamptz not null,
  server_updated_at    timestamptz not null default now(),
  server_version       bigint not null default 0,
  deleted_at           timestamptz,
  constraint client_dog_has_client check (relationship = 'personal' or client_id is not null)
);
create index dogs_user_name_idx on public.dogs (user_id, lower(name)) where deleted_at is null;
create index dogs_client_idx on public.dogs (client_id);

-- ───────────────────────── Event taxonomy ─────────────────────────
-- System rows have user_id null and fixed ids (seeded). User rows are custom definitions.
create table public.event_categories (
  id                 uuid primary key,
  user_id            uuid references auth.users(id) on delete cascade,
  key                text not null,           -- 'nature' | 'behavior' | 'training' | 'additional' | custom slug
  name               text not null,
  color_token        text not null,           -- design token name, not a raw hex
  icon               text not null,
  sort_order         integer not null default 0,
  archived           boolean not null default false,
  client_updated_at  timestamptz not null default now(),
  server_updated_at  timestamptz not null default now(),
  server_version     bigint not null default 0,
  deleted_at         timestamptz,
  unique nulls not distinct (user_id, key)
);

create table public.event_types (
  id                 uuid primary key,
  user_id            uuid references auth.users(id) on delete cascade,
  category_id        uuid not null references public.event_categories(id),
  key                text not null,
  name               text not null,
  icon               text not null,
  count_noun         public.count_noun not null default 'event',  -- "4 incidents" vs "6 observations"
  supports_trigger   boolean not null default true,
  supports_outcome   boolean not null default true,
  sort_order         integer not null default 0,
  archived           boolean not null default false,
  client_updated_at  timestamptz not null default now(),
  server_updated_at  timestamptz not null default now(),
  server_version     bigint not null default 0,
  deleted_at         timestamptz,
  unique nulls not distinct (user_id, key)
);
create index event_types_category_idx on public.event_types (category_id);

create table public.event_triggers (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
  key text not null, name text not null, icon text not null, sort_order integer not null default 0,
  archived boolean not null default false,
  client_updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  unique nulls not distinct (user_id, key)
);

create table public.event_outcomes (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
  key text not null, name text not null, icon text not null, sort_order integer not null default 0,
  archived boolean not null default false,
  client_updated_at timestamptz not null default now(), server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  unique nulls not distinct (user_id, key)
);

-- ───────────────────────── Walks ─────────────────────────
create table public.walks (
  id                     uuid primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  recording_device_id    text not null,          -- only this device may append points while recording
  status                 public.walk_status not null,
  started_at             timestamptz not null,
  ended_at               timestamptz,
  time_zone              text not null,          -- IANA zone at start, for calendar bucketing
  elapsed_s              integer check (elapsed_s >= 0),     -- ended_at - started_at
  moving_s               integer check (moving_s >= 0),      -- elapsed minus pauses and gaps
  distance_m             double precision not null default 0 check (distance_m >= 0),
  avg_pace_s_per_km      double precision,
  elevation_gain_m       double precision,
  elevation_source       public.elevation_source,
  walker_steps           integer check (walker_steps >= 0),
  walker_steps_source    public.measure_source,
  classification         public.walk_classification not null default 'personal',
  client_id              uuid references public.clients(id) on delete set null,
  price_cents            integer check (price_cents >= 0),
  currency               char(3),
  payment_status         public.payment_status,
  booking_source         text,
  notes                  text,
  weather_status         text not null default 'pending'
                           check (weather_status in ('pending', 'complete', 'partial', 'unavailable', 'manual')),
  route                  geography(LineStringZM, 4326),     -- built from accepted points at finalize
  start_point            geography(Point, 4326),
  location_purged_at     timestamptz,           -- set when retention removed GPS data; stats are kept
  created_at             timestamptz not null default now(),
  client_updated_at      timestamptz not null,
  server_updated_at      timestamptz not null default now(),
  server_version         bigint not null default 0,
  deleted_at             timestamptz,
  constraint ended_after_start check (ended_at is null or ended_at >= started_at),
  constraint completed_has_end check (status not in ('completed') or ended_at is not null)
);
create index walks_user_started_idx on public.walks (user_id, started_at desc) where deleted_at is null;
create index walks_user_version_idx on public.walks (user_id, server_version);
create index walks_route_gix on public.walks using gist (route);

-- Pauses and recording gaps. Distance and moving time exclude these intervals.
create table public.walk_intervals (
  id           uuid primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  walk_id      uuid not null references public.walks(id) on delete cascade,
  kind         public.interval_kind not null,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  client_updated_at timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  constraint interval_order check (ended_at is null or ended_at >= started_at)
);
create index walk_intervals_walk_idx on public.walk_intervals (walk_id);

-- Dogs on a walk. joined_at / left_at are nullable now (whole walk) and enable per-dog windows later.
create table public.walk_participants (
  walk_id      uuid not null references public.walks(id) on delete cascade,
  dog_id       uuid not null references public.dogs(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  joined_at    timestamptz,
  left_at      timestamptz,
  client_updated_at timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  primary key (walk_id, dog_id)
);
create index walk_participants_dog_idx on public.walk_participants (dog_id) where deleted_at is null;

-- Raw GPS samples. Append-only. (walk_id, seq) makes chunk uploads idempotent.
create table public.gps_points (
  walk_id            uuid not null references public.walks(id) on delete cascade,
  seq                integer not null check (seq >= 0),
  user_id            uuid not null references auth.users(id) on delete cascade,
  recorded_at        timestamptz not null,
  lat                double precision not null check (lat between -90 and 90),
  lng                double precision not null check (lng between -180 and 180),
  horizontal_accuracy_m real,
  altitude_m         real,
  vertical_accuracy_m real,
  speed_mps          real,
  course_deg         real,
  accepted           boolean not null default true,   -- false if rejected by the filter (kept for audit)
  geog               geography(Point, 4326)
                       generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  primary key (walk_id, seq)
);
create index gps_points_user_idx on public.gps_points (user_id);

-- ───────────────────────── Observations ─────────────────────────
create table public.walk_events (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  walk_id            uuid not null references public.walks(id) on delete cascade,
  event_type_id      uuid not null references public.event_types(id),
  trigger_id         uuid references public.event_triggers(id),
  outcome_id         uuid references public.event_outcomes(id),
  occurred_at        timestamptz not null,
  lat                double precision check (lat between -90 and 90),   -- null if no fix was available
  lng                double precision check (lng between -180 and 180),
  location_accuracy_m real,
  location_fix_age_s real,                 -- seconds between the fix and the event
  geog               geography(Point, 4326)
                       generated always as (case when lat is null then null
                         else st_setsrid(st_makepoint(lng, lat), 4326)::geography end) stored,
  note               text,
  source             public.event_source not null,
  created_at         timestamptz not null default now(),
  client_updated_at  timestamptz not null,
  server_updated_at  timestamptz not null default now(),
  server_version     bigint not null default 0,
  deleted_at         timestamptz,
  constraint latlng_pair check ((lat is null) = (lng is null))
);
create index walk_events_walk_idx on public.walk_events (walk_id, occurred_at);
create index walk_events_user_type_time_idx on public.walk_events (user_id, event_type_id, occurred_at) where deleted_at is null;

-- Which dogs an observation applies to. Explicit rows; zero rows means "not yet attributed".
create table public.event_dogs (
  event_id   uuid not null references public.walk_events(id) on delete cascade,
  dog_id     uuid not null references public.dogs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_updated_at timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  primary key (event_id, dog_id)
);
create index event_dogs_dog_idx on public.event_dogs (dog_id) where deleted_at is null;

create table public.walk_media (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  walk_id            uuid not null references public.walks(id) on delete cascade,
  event_id           uuid references public.walk_events(id) on delete set null,
  kind               public.media_kind not null,
  storage_path       text,          -- null until uploaded; bucket 'walk-media' (private)
  mime_type          text not null,
  byte_size          bigint,
  width              integer, height integer, duration_ms integer,
  captured_at        timestamptz not null,
  lat double precision, lng double precision,
  transcript         text,
  transcript_status  public.transcript_status not null default 'none',
  include_in_report  boolean not null default true,
  client_updated_at  timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version     bigint not null default 0, deleted_at timestamptz
);
create index walk_media_walk_idx on public.walk_media (walk_id);

-- ───────────────────────── Weather ─────────────────────────
create table public.weather_observations (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  walk_id            uuid not null references public.walks(id) on delete cascade,
  phase              public.weather_phase not null,
  observed_at        timestamptz not null,       -- time the conditions describe
  fetched_at         timestamptz,                -- null for manual
  source             public.weather_source not null,
  is_historical      boolean not null default false,  -- retrieved after the fact
  temperature_c      real, apparent_temperature_c real,
  condition_code     text, condition_text text,
  humidity_pct       real check (humidity_pct between 0 and 100),
  wind_speed_mps     real, wind_gust_mps real, wind_direction_deg real,
  precipitation_mm_per_h real, precipitation_chance real,
  uv_index           real,
  alerts             jsonb not null default '[]'::jsonb,
  attribution        text,
  client_updated_at  timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version     bigint not null default 0, deleted_at timestamptz,
  unique (walk_id, phase, observed_at)
);

-- ───────────────────────── Scheduling ─────────────────────────
create table public.scheduled_walks (
  id                    uuid primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  client_id             uuid references public.clients(id) on delete set null,
  title                 text,
  starts_at             timestamptz not null,
  time_zone             text not null,
  planned_duration_min  integer check (planned_duration_min > 0),
  recurrence_rule       text,           -- RFC 5545 RRULE; occurrences expanded on device
  reminder_minutes_before integer check (reminder_minutes_before >= 0),
  status                public.schedule_status not null default 'scheduled',
  completed_walk_id     uuid references public.walks(id) on delete set null,
  notes                 text,
  client_updated_at     timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version        bigint not null default 0, deleted_at timestamptz
);
create index scheduled_walks_user_time_idx on public.scheduled_walks (user_id, starts_at) where deleted_at is null;

create table public.scheduled_walk_dogs (
  scheduled_walk_id uuid not null references public.scheduled_walks(id) on delete cascade,
  dog_id            uuid not null references public.dogs(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  client_updated_at timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  primary key (scheduled_walk_id, dog_id)
);

-- ───────────────────────── Reports and sharing ─────────────────────────
create table public.report_metadata (
  walk_id            uuid primary key references public.walks(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  report_version     integer not null default 1,
  settings           jsonb not null default '{}'::jsonb,   -- appendix on/off, photos on/off, notes on/off
  last_exported_at   timestamptz,
  client_updated_at  timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version     bigint not null default 0
);

-- Exported report files, backed up to the private 'report-exports' bucket.
-- Created only when the user explicitly exports; never written to device storage automatically.
create table public.report_exports (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  walk_id            uuid not null references public.walks(id) on delete cascade,
  format             text not null check (format in ('image', 'pdf')),
  include_appendix   boolean not null default false,
  storage_path       text,          -- null until the upload completes
  byte_size          bigint,
  report_version     integer not null,
  created_at         timestamptz not null default now(),
  client_updated_at  timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version     bigint not null default 0, deleted_at timestamptz
);
create index report_exports_walk_idx on public.report_exports (walk_id);

-- Revocable, expiring links for owners. Only a SHA-256 hash of the token is stored.
create table public.report_shares (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  walk_id            uuid not null references public.walks(id) on delete cascade,
  token_hash         bytea not null unique,
  recipient_label    text,
  include_appendix   boolean not null default true,
  include_photos     boolean not null default true,
  trim_route_m       integer not null default 150,
  expires_at         timestamptz not null default now() + interval '30 days',
  revoked_at         timestamptz,
  view_count         integer not null default 0,
  last_viewed_at     timestamptz,
  created_at         timestamptz not null default now()
);
create index report_shares_walk_idx on public.report_shares (walk_id);

-- ───────────────────────── Sync ledger ─────────────────────────
-- One row per client mutation batch item already applied. Replays are no-ops.
create table public.sync_operations (
  mutation_id    uuid primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  device_id      text not null,
  entity         text not null,
  entity_id      text not null,
  op             text not null check (op in ('upsert', 'delete')),
  result         text not null check (result in ('applied', 'stale', 'rejected')),
  error          text,
  received_at    timestamptz not null default now()
);
create index sync_operations_user_idx on public.sync_operations (user_id, received_at);

-- ───────────────────────── Triggers and RLS ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','user_preferences','clients','dogs','event_categories','event_types','event_triggers',
    'event_outcomes','walks','walk_intervals','walk_participants','walk_events','event_dogs','walk_media',
    'weather_observations','scheduled_walks','scheduled_walk_dogs','report_metadata','report_exports'
  ] loop
    execute format('create trigger %I_touch before insert or update on public.%I
                    for each row execute function public.touch_row()', t, t);
  end loop;
end $$;

-- gps_points has no server_version column: points are pulled per walk, not by cursor.

do $$
declare t text;
begin
  foreach t in array array[
    'clients','dogs','walks','walk_intervals','walk_participants','gps_points','walk_events','event_dogs',
    'walk_media','weather_observations','scheduled_walks','scheduled_walk_dogs','report_metadata',
    'report_exports','report_shares','sync_operations'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_owner on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;

alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.user_preferences enable row level security;
create policy prefs_owner on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Taxonomy: everyone reads system rows; users manage only their own custom rows.
do $$
declare t text;
begin
  foreach t in array array['event_categories','event_types','event_triggers','event_outcomes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_read on public.%I for select to authenticated
                    using (user_id is null or user_id = (select auth.uid()))', t, t);
    execute format('create policy %I_write on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;

-- Cross-table ownership guards (RLS alone does not stop referencing another user's dog id).
create or replace function public.assert_same_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name in ('walk_participants', 'event_dogs', 'scheduled_walk_dogs') then
    if not exists (select 1 from dogs d where d.id = new.dog_id and d.user_id = new.user_id) then
      raise exception 'dog % not owned by user', new.dog_id using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger walk_participants_owner before insert or update on public.walk_participants
  for each row execute function public.assert_same_owner();
create trigger event_dogs_owner before insert or update on public.event_dogs
  for each row execute function public.assert_same_owner();
create trigger scheduled_walk_dogs_owner before insert or update on public.scheduled_walk_dogs
  for each row execute function public.assert_same_owner();

-- Storage buckets (all private): dog-photos, walk-media, report-exports.
-- Object paths are '<user_id>/<entity_id>/<file>' and storage RLS checks the first path segment.
-- Shared reports read media only through the shared-report Edge Function, which issues
-- short-lived signed URLs (5 minutes) after validating the share token.
