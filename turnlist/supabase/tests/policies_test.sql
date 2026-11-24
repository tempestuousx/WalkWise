-- Workflow and access-control tests. Each block impersonates a user the way
-- PostgREST does (role + JWT subject) and asserts what they can and cannot do.
\set QUIET on
set client_min_messages = warning;

create function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, false);
end $$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', false);
  perform set_config('request.jwt.claim.sub', '', false);
end $$;
-- Runs a statement and requires it to fail with a message matching the pattern.
create function pg_temp.expect_error(p_sql text, p_pattern text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected failure matching "%" but statement succeeded: %', p_pattern, p_sql;
exception when others then
  if sqlerrm like 'expected failure%' then raise; end if;
  if sqlerrm !~* p_pattern then raise exception 'expected error matching "%" got "%" for: %', p_pattern, sqlerrm, p_sql; end if;
end $$;
create function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAILED: %', p_label; end if;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- fixture users (sign-up trigger creates profiles)
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'pm@test.dev', '{"role":"employer","display_name":"Pat Manager"}'),
  ('22222222-2222-2222-2222-222222222222', 'other@test.dev', '{"role":"employer","display_name":"Olive Owner"}'),
  ('33333333-3333-3333-3333-333333333333', 'con@test.dev', '{"role":"contractor","display_name":"Casey Cleaner"}'),
  ('44444444-4444-4444-4444-444444444444', 'con2@test.dev', '{"role":"contractor","display_name":"Drew Painter"}'),
  ('55555555-5555-5555-5555-555555555555', 'admin@test.dev', '{"role":"admin","display_name":"Ada Admin"}');
select pg_temp.check((select role from profiles where id = '55555555-5555-5555-5555-555555555555') = 'contractor', 'sign-up metadata cannot create admins');
update profiles set role = 'admin' where id = '55555555-5555-5555-5555-555555555555';
update profiles set trust_level = 'trusted' where id = '11111111-1111-1111-1111-111111111111';

-- profiles: cannot self-promote
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.expect_error($$update profiles set role = 'admin' where id = auth.uid()$$, 'permission denied|managed by administrators');
update profiles set display_name = 'Casey C.' where id = auth.uid();
insert into contractor_profiles (user_id, category_ids, home_zip, service_radius_miles) values (auth.uid(), '{cat_move-out-cleaning,cat_turnover-cleaning}', '89117', 15);
insert into private_contacts (user_id, phone) values (auth.uid(), '702-555-0101');
select pg_temp.expect_error($$insert into business_profiles (user_id, company_name) values (auth.uid(), 'Not an employer')$$, 'row-level security');
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
insert into contractor_profiles (user_id, category_ids, home_zip, service_radius_miles) values (auth.uid(), '{cat_painting}', '89074', 10);

-- employer posts; must have a business profile first; server sets moderation/status
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($$insert into jobs (employer_id, title, category_id, description, zip, property_type, job_date, pay_type, pay_min, neighborhood, market_id, expires_at)
  values (auth.uid(), 'Move-out clean', 'cat_move-out-cleaning', 'Two bedroom move-out cleaning, empty unit.', '89135', 'apartment', current_date + 2, 'fixed', 180, 'x', 'mkt_las_vegas', now())$$, 'business name');
insert into business_profiles (user_id, company_name, plan, free_listings_used) values (auth.uid(), 'Pat Property Co', 'monthly', 99);
select pg_temp.check((select plan = 'free_intro' and free_listings_used = 0 from business_profiles where user_id = auth.uid()), 'plan fields are server-managed');
insert into jobs (employer_id, title, category_id, description, zip, property_type, job_date, pay_type, pay_min, neighborhood, market_id, expires_at, status, moderation_status, application_count)
  values (auth.uid(), 'Move-out clean', 'cat_move-out-cleaning', 'Two bedroom move-out cleaning, empty unit.', '89135', 'apartment', current_date + 2, 'fixed', 180, 'spoofed', 'mkt_las_vegas', now() - interval '1 year', 'completed', 'approved', 50);
select pg_temp.reset_role();
create temp table t_job as select * from jobs where title = 'Move-out clean';
grant select on t_job to anon, authenticated;
select pg_temp.check((select status = 'open' and moderation_status = 'approved' and application_count = 0 and neighborhood = 'Summerlin South' and expires_at > now() from t_job), 'insert normalizes server fields');
select pg_temp.check((select count(*) = 1 from notifications where user_id = '33333333-3333-3333-3333-333333333333' and type = 'new_matching_job'), 'matching contractor notified');
select pg_temp.check((select count(*) = 0 from notifications where user_id = '44444444-4444-4444-4444-444444444444' and type = 'new_matching_job'), 'non-matching contractor not notified');
select pg_temp.check((select count(*) = 1 from notification_deliveries d join notifications n on n.id = d.notification_id where n.user_id = '33333333-3333-3333-3333-333333333333' and d.channel = 'email'), 'email queued in outbox');
insert into job_private_details (job_id, street_address, access_notes) select id, '742 Private Way', 'Lockbox 4455' from t_job;

-- employer cannot change status directly or touch another employer's job
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.expect_error($$update jobs set status = 'completed' where id = (select id from t_job)$$, 'job actions');
update jobs set pay_min = 200 where id = (select id from t_job);
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
update jobs set pay_min = 1 where id = (select id from t_job);
select pg_temp.check((select pay_min = 200 from jobs where id = (select id from t_job)), 'other employer update silently filtered by RLS');
select pg_temp.expect_error($$select set_job_status((select id from t_job), 'canceled')$$, 'own listings');
select pg_temp.check((select count(*) = 0 from job_private_details), 'other employer cannot read address');

-- anonymous visitors see approved listings but never addresses
select pg_temp.act_as(null);
select pg_temp.check((select count(*) = 1 from jobs), 'anon sees approved job');
select pg_temp.check((select count(*) = 0 from job_private_details), 'anon cannot read address');
select pg_temp.expect_error($$select apply_to_job((select id from t_job), 'Hello there I can do this job on time.')$$, 'Sign in');

-- contractors apply; cannot insert applications directly or touch others'
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) = 0 from job_private_details), 'applicant cannot read address before share');
select pg_temp.expect_error($$insert into applications (job_id, contractor_id, message) values ((select id from t_job), auth.uid(), 'Direct insert should be refused here.')$$, 'permission denied');
select pg_temp.expect_error($$select apply_to_job((select id from t_job), 'too short')$$, '20\+ characters');
select apply_to_job((select id from t_job), 'I can do this Thursday morning with my own supplies.');
select pg_temp.expect_error($$select apply_to_job((select id from t_job), 'Applying twice to the same job is refused.')$$, 'already applied');
select pg_temp.check((select is_qualified from applications where contractor_id = auth.uid()), 'qualification snapshot true for matching contractor');
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select apply_to_job((select id from t_job), 'Painter here, also available to clean that day.');
select pg_temp.check((select count(*) = 1 from applications), 'contractor sees only own application');
select pg_temp.check((select not is_qualified from applications), 'out-of-area, wrong-trade applicant not qualified');
select pg_temp.expect_error($$select withdraw_application((select id from applications where contractor_id = '33333333-3333-3333-3333-333333333333'))$$, 'not found');
select pg_temp.expect_error($$select set_application_status((select id from applications limit 1), 'shortlisted')$$, 'access');
select pg_temp.check((select count(*) = 0 from private_contacts where user_id = '33333333-3333-3333-3333-333333333333'), 'contractors cannot read each other''s contacts');

-- employer reviews applicants
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) = 2 from applications), 'employer sees applications on own job');
select pg_temp.check((select application_count = 2 from jobs where id = (select id from t_job)), 'application count maintained');
select pg_temp.check((select phone = '702-555-0101' from private_contacts where user_id = '33333333-3333-3333-3333-333333333333'), 'employer sees applicant contact');
select set_application_status((select id from applications where contractor_id = '33333333-3333-3333-3333-333333333333'), 'shortlisted');
select pg_temp.expect_error($$select share_address((select id from t_job), '22222222-2222-2222-2222-222222222222')$$, 'only share the address with an applicant');
select share_address((select id from t_job), '33333333-3333-3333-3333-333333333333');
select select_application((select id from applications where contractor_id = '33333333-3333-3333-3333-333333333333'));
select pg_temp.check((select status = 'filled' from jobs where id = (select id from t_job)), 'job filled after selection');
select pg_temp.check((select status = 'not_selected' from applications where contractor_id = '44444444-4444-4444-4444-444444444444'), 'other applicants marked not selected');
select pg_temp.expect_error($$select select_application((select id from applications where contractor_id = '44444444-4444-4444-4444-444444444444'))$$, 'not open');

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select street_address = '742 Private Way' from job_private_details), 'selected contractor sees shared address');
select pg_temp.check((select count(*) >= 2 from notifications where type in ('application_shortlisted', 'contractor_selected')), 'contractor notified of shortlist and selection');
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check((select count(*) = 0 from job_private_details), 'unselected contractor still cannot see address');
select pg_temp.check((select count(*) = 1 from jobs), 'applicant still sees the job they applied to');

-- messaging only between linked parties
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.expect_error($$select start_conversation('22222222-2222-2222-2222-222222222222')$$, 'Messaging opens');
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
create temp table t_conv as select start_conversation('11111111-1111-1111-1111-111111111111', (select id from t_job)) as id;
insert into messages (conversation_id, sender_id, body) select id, auth.uid(), 'On my way, see you at 8.' from t_conv;
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check((select count(*) = 0 from messages), 'non-participant cannot read messages');
select pg_temp.expect_error($$insert into messages (conversation_id, sender_id, body) select id, auth.uid(), 'sneaky' from t_conv$$, 'row-level security');
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) = 1 from messages), 'participant reads messages');
select pg_temp.check((select count(*) = 1 from notifications where type = 'new_message'), 'message notification created');

-- lifecycle and reviews
select set_job_status((select id from t_job), 'in_progress');
select pg_temp.expect_error($$select create_review((select id from t_job), 5, 'early')$$, 'after the job is marked completed');
select set_job_status((select id from t_job), 'completed');
select pg_temp.expect_error($$select set_job_status((select id from t_job), 'open')$$, 'cannot be marked');
select create_review((select id from t_job), 5, 'Great work');
select pg_temp.expect_error($$select create_review((select id from t_job), 4, 'again')$$, 'already reviewed');
select pg_temp.check((select (s ->> 'rating')::numeric = 5 and (s ->> 'completed_jobs')::int = 1 from contractor_summaries(array['33333333-3333-3333-3333-333333333333'::uuid]) s), 'contractor summary aggregates');

-- verification: badge only after admin approval; documents private
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
insert into verifications (user_id, kind, status, document_path) values (auth.uid(), 'insurance', 'approved', '33333333-3333-3333-3333-333333333333/coi.pdf');
select pg_temp.check((select status = 'pending' from verifications), 'self-submitted verification forced to pending');
select pg_temp.check((select cardinality(verified_badges(auth.uid())) = 0), 'no badge before review');
select pg_temp.expect_error($$insert into verifications (user_id, kind, document_path) values (auth.uid(), 'license', 'someone-else/doc.pdf')$$, 'own folder');
select pg_temp.reset_role();
insert into storage.objects (bucket_id, name) values ('verification-docs', '33333333-3333-3333-3333-333333333333/coi.pdf');
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check((select count(*) = 0 from storage.objects where bucket_id = 'verification-docs'), 'other users cannot read verification docs');
select pg_temp.check((select count(*) = 0 from verifications), 'other users cannot read verification records');
select pg_temp.expect_error($$select admin_review_verification((select id from verifications limit 1), 'approved')$$, 'access');
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select pg_temp.check((select count(*) = 1 from storage.objects where bucket_id = 'verification-docs'), 'admin can read verification docs');
select admin_review_verification((select id from verifications limit 1), 'approved', null, current_date + 365);
select pg_temp.check((select verified_badges('33333333-3333-3333-3333-333333333333') = '{insurance}'), 'badge after approval');

-- moderation: new accounts are held for review
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
insert into business_profiles (user_id, company_name) values (auth.uid(), 'Olive Rentals');
insert into jobs (employer_id, title, category_id, description, zip, property_type, job_date, pay_type, pay_min, neighborhood, market_id, expires_at)
  values (auth.uid(), 'Paint two bedrooms', 'cat_painting', 'Two bedrooms, walls only, paint supplied.', '89074', 'townhome_condo', current_date + 3, 'fixed', 400, 'x', 'mkt_las_vegas', now());
select pg_temp.check((select moderation_status = 'pending' from jobs where title = 'Paint two bedrooms'), 'new account listing pending');
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
select pg_temp.check((select count(*) = 0 from jobs where title = 'Paint two bedrooms'), 'pending listing hidden from contractors');
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select pg_temp.expect_error($$select admin_moderate_job((select id from jobs where title = 'Paint two bedrooms'), 'reject')$$, 'Give a reason');
select admin_moderate_job((select id from jobs where title = 'Paint two bedrooms'), 'approve');
select pg_temp.reset_role();
select pg_temp.check((select count(*) = 1 from notifications where user_id = '44444444-4444-4444-4444-444444444444' and type = 'new_matching_job'), 'matches notified on approval');
select pg_temp.check((select count(*) = 1 from admin_actions where action = 'moderate:approve'), 'admin action logged');

-- reports and suspension
select pg_temp.act_as('44444444-4444-4444-4444-444444444444');
insert into reports (reporter_id, target_type, target_id, reason) select auth.uid(), 'job', id, 'Looks like a duplicate posting.' from jobs where title = 'Paint two bedrooms';
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select pg_temp.check((select count(*) = 1 from admin_list_users() where open_reports > 0), 'reports surface on user list');
select admin_set_user_status('22222222-2222-2222-2222-222222222222', 'suspended', 'Fraudulent listings');
select pg_temp.check((select status = 'canceled' from jobs where title = 'Paint two bedrooms'), 'suspension cancels open listings');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.expect_error($$select set_job_status((select id from jobs where title = 'Paint two bedrooms'), 'open')$$, 'suspended');

-- analytics and maintenance
select pg_temp.act_as('55555555-5555-5555-5555-555555555555');
select pg_temp.check((select (m ->> 'totalListings')::int = 2 and (m -> 'primary' ->> 'eligible')::int = 2 and (m -> 'primary' ->> 'succeeded')::int = 1 from admin_metrics() m), 'metrics compute primary rate');
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.expect_error($$select admin_metrics()$$, 'access');
select pg_temp.expect_error($$select run_maintenance()$$, 'permission denied');
select pg_temp.reset_role();
update jobs set job_date = current_date - 5, expires_at = now() - interval '1 day' where title = 'Paint two bedrooms';
select run_maintenance();
select pg_temp.check((select count(*) = 0 from jobs where status = 'open' and expires_at < now()), 'maintenance expires stale listings');

\echo 'all policy tests passed'
