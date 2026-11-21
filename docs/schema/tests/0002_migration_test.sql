-- Migration test for 0002. Run after: (Supabase auth stub) + proposed_schema.sql (0001) + LEGACY section below,
-- then 0002_behavior_episodes.sql, then the CHECKS section. Every check raises on failure.

-- ═════════════ LEGACY: data that exists before 0002 ═════════════
\if :{?phase_checks}
\else
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.user_preferences (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.event_categories (id, key, name, color_token, icon) values
  ('c0000000-0000-0000-0000-000000000001', 'nature', 'Nature', 'nature', 'leaf'),
  ('c0000000-0000-0000-0000-000000000002', 'behavior', 'Behavior', 'behavior', 'tri');
insert into public.event_types (id, category_id, key, name, icon, count_noun) values
  ('70000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'pulling', 'Pulling', 'pull', 'incident'),
  ('70000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'reactivity', 'Reactivity', 'react', 'incident'),
  ('70000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'guarding', 'Resource Guarding', 'guard', 'incident'),
  ('70000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000002', 'fear', 'Fear / Anxiety', 'fear', 'incident'),
  ('70000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000002', 'aggression', 'Aggression', 'aggr', 'incident'),
  ('70000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000002', 'barking', 'Barking', 'bark', 'incident'),
  ('70000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000001', 'pee', 'Pee', 'pee', 'event');
insert into public.event_triggers (id, key, name, icon) values ('80000000-0000-0000-0000-000000000001', 'dog', 'Dog', 'dog');
insert into public.dogs (id, user_id, name, client_updated_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Juno', now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Maple', now());
insert into public.walks (id, user_id, recording_device_id, status, started_at, ended_at, time_zone, distance_m, client_updated_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'phone', 'completed', '2026-11-01 17:00Z', '2026-11-01 17:45Z', 'America/Los_Angeles', 3060, '2026-11-01 17:45Z');
insert into public.gps_points (walk_id, seq, user_id, recorded_at, lat, lng)
  select '20000000-0000-0000-0000-000000000001', g, '00000000-0000-0000-0000-00000000000a', '2026-11-01 17:00Z'::timestamptz + g * interval '5 s', 36.1 + g * 0.0001, -115.1
  from generate_series(0, 99) g;
insert into public.walk_events (id, user_id, walk_id, event_type_id, trigger_id, occurred_at, lat, lng, note, source, client_updated_at) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000006', '80000000-0000-0000-0000-000000000001', '2026-11-01 17:10:00Z', 36.101, -115.1, 'legacy bark', 'radial', now()),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', null, '2026-11-01 17:10:20Z', 36.101, -115.1, null, 'radial', now()),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000007', null, '2026-11-01 17:20:00Z', 36.102, -115.1, null, 'radial', now());
insert into public.event_dogs (event_id, dog_id, user_id, client_updated_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', now()),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', now()),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', now());
create table public._legacy_fingerprint as
  select (select md5(string_agg(t::text, '|' order by t.id)) from (select id, user_id, walk_id, event_type_id, trigger_id, occurred_at, lat, lng, note, source, deleted_at from public.walk_events) t) as events_md5,
         (select md5(string_agg(t::text, '|' order by t.walk_id, t.seq)) from public.gps_points t) as points_md5,
         (select md5(string_agg(t::text, '|' order by t.id)) from (select id, key, name, category_id from public.event_types) t) as types_md5,
         (select md5(string_agg(t::text, '|' order by t.id)) from (select id, name, user_id from public.dogs) t) as dogs_md5,
         (select md5(string_agg(t::text, '|' order by t.id)) from (select id, status, started_at, ended_at, distance_m from public.walks) t) as walks_md5;
\endif

-- ═════════════ CHECKS: run after 0002 ═════════════
\if :{?phase_checks}
do $$
declare f record; n int;
begin
  select * into f from public._legacy_fingerprint;
  -- Existing data is untouched
  if f.events_md5 <> (select md5(string_agg(t::text, '|' order by t.id)) from (select id, user_id, walk_id, event_type_id, trigger_id, occurred_at, lat, lng, note, source, deleted_at from public.walk_events) t) then raise exception 'FAIL legacy events changed'; end if;
  if f.points_md5 <> (select md5(string_agg(t::text, '|' order by t.walk_id, t.seq)) from public.gps_points t) then raise exception 'FAIL GPS points changed'; end if;
  if f.types_md5 <> (select md5(string_agg(t::text, '|' order by t.id)) from (select id, key, name, category_id from public.event_types where key in ('pulling','reactivity','guarding','fear','aggression','barking','pee')) t) then raise exception 'FAIL professional taxonomy changed'; end if;
  if f.dogs_md5 <> (select md5(string_agg(t::text, '|' order by t.id)) from (select id, name, user_id from public.dogs) t) then raise exception 'FAIL dogs changed'; end if;
  if f.walks_md5 <> (select md5(string_agg(t::text, '|' order by t.id)) from (select id, status, started_at, ended_at, distance_m from public.walks) t) then raise exception 'FAIL walks changed'; end if;
  raise notice 'PASS legacy walks, GPS points, events, dogs and taxonomy unchanged';
  -- Existing user keeps Professional
  if (select logging_mode from public.user_preferences where user_id = '00000000-0000-0000-0000-00000000000a') <> 'professional' then raise exception 'FAIL existing user mode'; end if;
  raise notice 'PASS existing user retains Professional mode';
  -- Modes on the taxonomy
  if (select logging_modes from public.event_types where key = 'reactivity') <> '{professional}' then raise exception 'FAIL reactivity mode'; end if;
  if (select logging_modes from public.event_types where key = 'barking') <> '{beginner,professional}' then raise exception 'FAIL shared barking'; end if;
  select count(*) into n from public.event_types where logging_modes = '{beginner}';
  if n <> 9 then raise exception 'FAIL expected 9 beginner-only types, got %', n; end if;
  if exists (select 1 from public.event_types where key in ('growling','barking','lunging') and behavior_family = 'threat' and key <> 'growling') then raise exception 'FAIL classification'; end if;
  raise notice 'PASS beginner types added, professional types tagged, shared types in both modes';
  -- Legacy events are instant (not timed)
  if exists (select 1 from public.walk_events where is_timed or timer_status is not null or duration_s is not null) then raise exception 'FAIL legacy events became timed'; end if;
  raise notice 'PASS legacy events read as instant events';
end $$;

-- Timed events: real durations only
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.walk_events (id, user_id, walk_id, event_type_id, occurred_at, lat, lng, source, client_updated_at, is_timed, timer_status)
  values ('30000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000006', '2026-11-01 17:30:00Z', 36.103, -115.1, 'radial', now(), true, 'running');
update public.walk_events set timer_status = 'ended', ended_at = '2026-11-01 17:30:28Z', end_lat = 36.1031, end_lng = -115.1, duration_s = 28, duration_source = 'timer'
  where id = '30000000-0000-0000-0000-000000000010';
insert into public.walk_events (id, user_id, walk_id, event_type_id, occurred_at, source, client_updated_at, is_timed, timer_status)
  values ('30000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000006', '2026-11-01 17:40:00Z', 'radial', now(), true, 'not_ended');
do $$ begin
  begin update public.walk_events set duration_s = 30, duration_source = 'timer' where id = '30000000-0000-0000-0000-000000000011'; raise exception 'FAIL not-ended timer accepted a timer duration';
  exception when check_violation then raise notice 'PASS a timer that was not ended cannot get a timer-measured duration'; end;
  begin update public.walk_events set duration_s = 99 where id = '30000000-0000-0000-0000-000000000010'; raise exception 'FAIL fabricated duration accepted';
  exception when check_violation then raise notice 'PASS timer duration must match start and end'; end;
  begin insert into public.walk_events (id, user_id, walk_id, event_type_id, occurred_at, source, client_updated_at, is_timed, timer_status, duration_s, duration_source)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000006', now(), 'radial', now(), true, 'running', 5, 'corrected');
    raise exception 'FAIL running timer accepted a duration';
  exception when check_violation then raise notice 'PASS a running timer has no duration'; end;
end $$;
update public.walk_events set duration_s = 20, duration_source = 'corrected' where id = '30000000-0000-0000-0000-000000000011';

-- Episodes: link events, never mix dogs, never delete events
insert into public.behavior_episodes (id, user_id, walk_id, dog_id, started_at, ended_at, origin, client_updated_at)
  values ('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-11-01 17:10:00Z', '2026-11-01 17:10:20Z', 'suggested', now());
update public.walk_events set episode_id = 'e0000000-0000-0000-0000-000000000001' where id in ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002');
do $$ begin
  begin update public.walk_events set episode_id = 'e0000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000003';
    raise exception 'FAIL Maple event joined a Juno episode';
  exception when check_violation then raise notice 'PASS episodes never mix dogs (event side)'; end;
  begin insert into public.event_dogs (event_id, dog_id, user_id, client_updated_at) values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', now());
    raise exception 'FAIL second dog attributed to an episode event';
  exception when check_violation then raise notice 'PASS episodes never mix dogs (attribution side)'; end;
end $$;

-- Reviews keep "not sure" and unanswered distinct; one subject per review
insert into public.behavior_reviews (id, user_id, episode_id, before_answer, distance_answer, after_answer, question_set_version, client_updated_at)
  values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', 'dog_approached', 'not_sure', null, 'q-2026.11', now());
insert into public.review_body_language (review_id, indicator_key, user_id, response, client_updated_at) values
  ('a0000000-0000-0000-0000-000000000001', 'stiff_body', '00000000-0000-0000-0000-00000000000a', 'yes', now()),
  ('a0000000-0000-0000-0000-000000000001', 'whale_eye', '00000000-0000-0000-0000-00000000000a', 'unsure', now());
do $$ begin
  begin insert into public.behavior_reviews (id, user_id, episode_id, event_id, question_set_version, client_updated_at)
    values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'e0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'q', now());
    raise exception 'FAIL review with two subjects';
  exception when check_violation then raise notice 'PASS a review is about one episode or one event'; end;
  if (select count(*) from public.review_body_language where review_id = 'a0000000-0000-0000-0000-000000000001') <> 2 then raise exception 'FAIL indicators'; end if;
  if (select response::text from public.review_body_language where indicator_key = 'whale_eye') <> 'unsure' then raise exception 'FAIL unsure stored'; end if;
  if (select after_answer from public.behavior_reviews where id = 'a0000000-0000-0000-0000-000000000001') is not null then raise exception 'FAIL unanswered'; end if;
  raise notice 'PASS unanswered (null), not sure, unsure and no are stored distinctly';
end $$;

-- Another user cannot see episodes or reviews
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from public.behavior_episodes) + (select count(*) from public.behavior_reviews) + (select count(*) from public.review_body_language) <> 0 then raise exception 'FAIL RLS leak'; end if;
  if (select count(*) from public.body_language_indicators) <> 10 then raise exception 'FAIL indicator library not readable'; end if;
  raise notice 'PASS episodes and reviews are private; indicator library is readable';
end $$;

-- Deleting an episode keeps its events (ungrouping never destroys records)
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from public.behavior_episodes where id = 'e0000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.walk_events where id in ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002') and episode_id is null) <> 2 then raise exception 'FAIL events lost with episode'; end if;
  raise notice 'PASS deleting an episode keeps every event (episode_id set to null)';
end $$;
reset role;
\endif
