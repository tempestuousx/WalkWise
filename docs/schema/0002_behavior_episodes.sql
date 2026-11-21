-- Walkwise migration 0002: logging modes, timed behaviors, behavior episodes, guided reviews, interpretations.
-- Applies on top of proposed_schema.sql (0001).
--
-- Backward compatible by construction:
--   * Only adds nullable columns, columns with defaults, new tables, constraints that every existing row
--     already satisfies, and seed rows. No existing column is dropped, renamed, or rewritten.
--   * Existing users keep Professional logging (column default). The app writes 'beginner' only for new
--     accounts that accept the onboarding recommendation.
--   * Deleting an episode never deletes events (walk_events.episode_id is ON DELETE SET NULL).

-- ───────────── 1. Logging mode ─────────────
alter table public.user_preferences
  add column logging_mode text not null default 'professional'
    check (logging_mode in ('beginner', 'professional'));

-- ───────────── 2. Event types: which mode shows them, and how they are reviewed ─────────────
-- Types are never removed from history; logging_modes only controls the Quick Log / Timed Log menus.
alter table public.event_types
  add column logging_modes text[] not null default '{beginner,professional}'
    check (logging_modes <@ array['beginner', 'professional']::text[] and cardinality(logging_modes) > 0),
  add column is_success boolean not null default false,       -- e.g. "Calm pass"
  add column reviewable boolean not null default false,       -- shown in "Understand My Dog"
  add column behavior_family text                             -- selects review questions and indicators
    check (behavior_family in ('pulling', 'vocal', 'reactive', 'guarding', 'fear', 'threat', 'other', 'success')),
  add column serious boolean not null default false,          -- adds veterinary / professional guidance
  add column describe_prompt text;                            -- e.g. 'What did your dog do?' for Beginner "Other"

-- Existing professional taxonomy: unchanged names and ids, now tagged with its mode and family.
update public.event_types t set
  logging_modes = case when t.key in ('pulling', 'barking') then '{beginner,professional}'::text[] else '{professional}'::text[] end,
  reviewable = t.key <> 'pulling',
  behavior_family = case t.key when 'pulling' then 'pulling' when 'barking' then 'vocal' when 'reactivity' then 'reactive'
    when 'guarding' then 'guarding' when 'fear' then 'fear' when 'aggression' then 'threat' end,
  serious = t.key = 'aggression'
from public.event_categories c
where t.category_id = c.id and c.key = 'behavior' and c.user_id is null and t.user_id is null
  and t.key in ('pulling', 'barking', 'reactivity', 'guarding', 'fear', 'aggression');

-- Beginner taxonomy: directly observable actions. Growling, barking and lunging are never classified as aggression.
insert into public.event_types (id, user_id, category_id, key, name, icon, count_noun, supports_trigger, supports_outcome, sort_order,
                                logging_modes, is_success, reviewable, behavior_family, serious, describe_prompt)
select gen_random_uuid(), null, c.id, v.key, v.name, v.icon, v.noun::public.count_noun, true, true, v.sort, '{beginner}', v.success, not v.success, v.family, v.serious, v.describe
from public.event_categories c
cross join (values
  ('growling',   'Growling',       'growl',   'incident',    20, false, 'threat',   false, null),
  ('lunging',    'Lunging',        'lunge',   'incident',    30, false, 'reactive', false, null),
  ('freezing',   'Freezing',       'freeze',  'incident',    50, false, 'fear',     false, null),
  ('retreating', 'Retreating',     'retreat', 'incident',    60, false, 'fear',     false, null),
  ('snapping',   'Snapping',       'snap',    'incident',    70, false, 'threat',   true,  null),
  ('teeth',      'Showing Teeth',  'teeth',   'incident',    80, false, 'threat',   false, null),
  ('trembling',  'Trembling',      'tremble', 'incident',    90, false, 'fear',     false, null),
  ('b-other',    'Other behavior', 'other',   'incident',   100, false, 'other',    false, 'What did your dog do?'),
  ('calm',       'Calm pass',      'calm',    'observation', 110, true, 'success',  false, null)
) as v(key, name, icon, noun, sort, success, family, serious, describe)
where c.key = 'behavior' and c.user_id is null
on conflict do nothing;

-- ───────────── 3. Timed behaviors on walk_events ─────────────
create type public.timer_status as enum ('running', 'ended', 'not_ended');
create type public.duration_source as enum ('timer', 'corrected');

alter table public.walk_events
  add column is_timed boolean not null default false,
  add column ended_at timestamptz,
  add column end_lat double precision check (end_lat between -90 and 90),
  add column end_lng double precision check (end_lng between -180 and 180),
  add column end_location_accuracy_m real,
  add column timer_status public.timer_status,
  add column duration_s integer check (duration_s > 0),
  add column duration_source public.duration_source,
  add column behavior_description text,          -- answer to describe_prompt (Beginner "Other")
  add column episode_id uuid,
  add column dogs_corrected_at timestamptz;      -- set when the user narrowed a multi-dog event to one dog

alter table public.walk_events
  add constraint timed_fields check (
    (not is_timed and timer_status is null and ended_at is null and duration_s is null and duration_source is null)
    or (is_timed and timer_status is not null)),
  add constraint end_after_start check (ended_at is null or ended_at >= occurred_at),
  add constraint end_latlng_pair check ((end_lat is null) = (end_lng is null)),
  add constraint duration_has_source check ((duration_s is null) = (duration_source is null)),
  add constraint running_has_no_duration check (timer_status is distinct from 'running' or duration_s is null),
  -- A timer-sourced duration must come from a real end time; it can never be invented.
  add constraint timer_duration_is_measured check (
    duration_source is distinct from 'timer'
    or (timer_status = 'ended' and ended_at is not null
        and abs(duration_s - extract(epoch from (ended_at - occurred_at))) <= 1)),
  -- A timer that was not ended keeps no end time; a later estimate is stored as 'corrected'.
  add constraint not_ended_has_no_end check (timer_status is distinct from 'not_ended' or (ended_at is null and duration_source is distinct from 'timer'));

-- ───────────── 4. Behavior episodes ─────────────
create type public.review_status as enum ('not_started', 'partial', 'complete', 'skipped');

create table public.behavior_episodes (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  walk_id            uuid not null references public.walks(id) on delete cascade,
  dog_id             uuid not null references public.dogs(id) on delete cascade,   -- one dog per episode
  started_at         timestamptz,
  ended_at           timestamptz,
  start_lat double precision, start_lng double precision, end_lat double precision, end_lng double precision,
  trigger_id         uuid references public.event_triggers(id),
  trigger_source     text check (trigger_source in ('logged', 'reviewed')),
  origin             text not null check (origin in ('suggested', 'manual')),
  notes              text,
  review_status      public.review_status not null default 'not_started',
  created_at         timestamptz not null default now(),
  client_updated_at  timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version     bigint not null default 0, deleted_at timestamptz,
  constraint episode_times check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint episode_trigger_source check ((trigger_id is null) = (trigger_source is null))
);
create index behavior_episodes_walk_idx on public.behavior_episodes (walk_id);
create index behavior_episodes_dog_time_idx on public.behavior_episodes (dog_id, started_at) where deleted_at is null;

alter table public.walk_events
  add constraint walk_events_episode_fk foreign key (episode_id) references public.behavior_episodes(id) on delete set null;
create index walk_events_episode_idx on public.walk_events (episode_id) where episode_id is not null;

-- Episodes never mix dogs, and an event can only join an episode from its own walk.
create or replace function public.assert_episode_membership() returns trigger
language plpgsql security definer set search_path = public as $$
declare ep public.behavior_episodes%rowtype; ep_id uuid;
begin
  if tg_table_name = 'walk_events' then
    if new.episode_id is null then return new; end if;
    select * into ep from behavior_episodes where id = new.episode_id;
    if ep.walk_id <> new.walk_id or ep.user_id <> new.user_id then
      raise exception 'event % and episode % must belong to the same walk', new.id, new.episode_id using errcode = '23514';
    end if;
    if exists (select 1 from event_dogs d where d.event_id = new.id and d.deleted_at is null and d.dog_id <> ep.dog_id) then
      raise exception 'episodes never mix dogs: event % is attributed to another dog', new.id using errcode = '23514';
    end if;
  elsif tg_table_name = 'event_dogs' then
    if new.deleted_at is not null then return new; end if;
    select e.episode_id into ep_id from walk_events e where e.id = new.event_id;
    if ep_id is not null and exists (select 1 from behavior_episodes b where b.id = ep_id and b.dog_id <> new.dog_id) then
      raise exception 'episodes never mix dogs: event % belongs to an episode for another dog', new.event_id using errcode = '23514';
    end if;
  elsif tg_table_name = 'behavior_episodes' then
    if not exists (select 1 from dogs d where d.id = new.dog_id and d.user_id = new.user_id) then
      raise exception 'dog % not owned by user', new.dog_id using errcode = '42501';
    end if;
    if not exists (select 1 from walks w where w.id = new.walk_id and w.user_id = new.user_id) then
      raise exception 'walk % not owned by user', new.walk_id using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger walk_events_episode_guard before insert or update of episode_id, walk_id on public.walk_events
  for each row execute function public.assert_episode_membership();
create trigger event_dogs_episode_guard before insert or update on public.event_dogs
  for each row execute function public.assert_episode_membership();
create trigger behavior_episodes_owner before insert or update on public.behavior_episodes
  for each row execute function public.assert_episode_membership();

-- ───────────── 5. Guided reviews (owner-reported context) ─────────────
-- Answers are option keys from the versioned question set. NULL = not answered; 'not_sure' is an explicit answer.
create table public.behavior_reviews (
  id                   uuid primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  episode_id           uuid unique references public.behavior_episodes(id) on delete cascade,
  event_id             uuid unique references public.walk_events(id) on delete cascade,
  trigger_answer       text,
  before_answer        text,
  distance_answer      text,      -- owner estimate, never derived from GPS
  after_answer         text,
  recovery_answer      text,      -- time to settle; separate from behavior duration
  notes                text,
  status               public.review_status not null default 'partial',
  question_set_version text not null,
  client_updated_at timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  constraint review_one_subject check ((episode_id is null) <> (event_id is null)),
  constraint distance_values check (distance_answer in ('far', 'across_street', 'few_feet', 'very_close', 'not_sure')),
  constraint recovery_values check (recovery_answer in ('under_10s', 's10_30', 's30_120', 'over_2m', 'not_sure'))
);

create table public.body_language_indicators (
  key               text primary key,
  name              text not null,
  description       text not null,
  illustration_path text,           -- supplied separately; text is always the fallback
  sort_order        integer not null,
  content_version   text not null
);
insert into public.body_language_indicators (key, name, description, sort_order, content_version) values
  ('stiff_body', 'Stiff body', 'The body looks rigid or tense, often very still, instead of loose and wiggly.', 10, 'edu-2026.11-draft'),
  ('whale_eye', 'Whale eye', 'You can see the whites of the eyes, often while the head is turned a little away.', 20, 'edu-2026.11-draft'),
  ('lip_lick', 'Lip licking', 'A quick flick of the tongue over the lips or nose that is not about food or water.', 30, 'edu-2026.11-draft'),
  ('weight_back', 'Weight shifting backward', 'Leaning back or shifting weight onto the back legs, away from something.', 40, 'edu-2026.11-draft'),
  ('fixed_stare', 'Fixed staring', 'Eyes locked on something without looking away.', 50, 'edu-2026.11-draft'),
  ('ears_back', 'Ears pinned back', 'Ears pulled back flat against the head.', 60, 'edu-2026.11-draft'),
  ('tail_tucked', 'Tail tucked', 'Tail held low or tucked between the back legs.', 70, 'edu-2026.11-draft'),
  ('head_turn', 'Head turning away', 'Turning the head or body away from something.', 80, 'edu-2026.11-draft'),
  ('lowered_posture', 'Lowered body posture', 'The body is crouched or lower to the ground than usual.', 90, 'edu-2026.11-draft'),
  ('hackles', 'Raised hackles', 'Fur standing up along the shoulders, back, or base of the tail.', 100, 'edu-2026.11-draft');

-- One row per answered indicator. No row = not answered; 'unsure' is distinct from 'no'. No scores.
create type public.indicator_response as enum ('yes', 'no', 'unsure');
create table public.review_body_language (
  review_id      uuid not null references public.behavior_reviews(id) on delete cascade,
  indicator_key  text not null references public.body_language_indicators(key),
  user_id        uuid not null references auth.users(id) on delete cascade,
  response       public.indicator_response not null,
  client_updated_at timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  primary key (review_id, indicator_key)
);

-- ───────────── 6. Interpretations (derived education, stored apart from observations) ─────────────
create table public.behavior_interpretations (
  id                 uuid primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  review_id          uuid references public.behavior_reviews(id) on delete cascade,
  episode_id         uuid references public.behavior_episodes(id) on delete cascade,
  event_id           uuid references public.walk_events(id) on delete cascade,
  content_version    text not null,         -- versioned rule set and wording, so reviewed content can replace drafts
  input_fingerprint  text not null,         -- hash of the facts and answers it was derived from
  sections           jsonb not null,        -- { facts, context, possible, missing, watch, safety }
  generated_at       timestamptz not null default now(),
  client_updated_at timestamptz not null, server_updated_at timestamptz not null default now(),
  server_version bigint not null default 0, deleted_at timestamptz,
  constraint interpretation_one_subject check ((episode_id is null) <> (event_id is null)),
  constraint interpretation_sections check (sections ?& array['facts', 'context', 'possible', 'missing', 'watch', 'safety']),
  unique (review_id, content_version, input_fingerprint)
);

-- ───────────── 7. Sync versioning and row-level security ─────────────
do $$
declare t text;
begin
  foreach t in array array['behavior_episodes', 'behavior_reviews', 'review_body_language', 'behavior_interpretations'] loop
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.touch_row()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I_owner on public.%I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t, t);
  end loop;
end $$;
alter table public.body_language_indicators enable row level security;
create policy body_language_indicators_read on public.body_language_indicators for select to authenticated using (true);
