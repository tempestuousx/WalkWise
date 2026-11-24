-- Helpers, integrity triggers, notifications, and the RPCs that carry every
-- multi-step workflow. RPCs are SECURITY DEFINER and check the caller
-- themselves; triggers enforce invariants for direct table writes.
--
-- Errors are raised with HINT set to one of: unauthenticated, forbidden,
-- not_found, invalid, conflict. The client maps the hint to ApiError.code.

-- ---------------------------------------------------------------- helpers
create or replace function public.fail(p_message text, p_code text default 'invalid')
returns void language plpgsql volatile as $$
begin
  raise exception '%', p_message using hint = p_code;
end $$;

-- True when the statement comes from an API user rather than from one of the
-- SECURITY DEFINER functions below (which run as the function owner).
create or replace function public.is_api_caller()
returns boolean language sql stable as $$
  select current_user in ('authenticated', 'anon')
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and status = 'active')
$$;

create or replace function public.require_user(p_roles public.user_role[] default null)
returns public.profiles language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then perform fail('Sign in to continue.', 'unauthenticated'); end if;
  if p.status = 'suspended' then perform fail('This account is suspended. Contact support.', 'forbidden'); end if;
  if p_roles is not null and not (p.role = any (p_roles)) then perform fail('You do not have access to this.', 'forbidden'); end if;
  return p;
end $$;

create or replace function public.miles_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 3958.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )))
$$;

create or replace function public.zip_miles(a text, b text)
returns double precision language sql stable as $$
  select miles_between(x.lat, x.lng, y.lat, y.lng) from areas x, areas y where x.zip = a and y.zip = b
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Ownership checks used by RLS policies. SECURITY DEFINER avoids policy
-- recursion between jobs and applications.
create or replace function public.owns_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from jobs where id = p_job and employer_id = auth.uid())
$$;

create or replace function public.has_applied(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications where job_id = p_job and contractor_id = auth.uid())
$$;

create or replace function public.address_shared_with_me(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from address_shares where job_id = p_job and contractor_id = auth.uid())
$$;

-- Contact details: owner and admins always. An employer sees a contractor's
-- contact once that contractor applies to one of the employer's jobs. A
-- contractor sees an employer's contact once selected for one of its jobs.
create or replace function public.can_view_contact(p_target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_target = auth.uid() or is_admin() or exists (
    select 1 from applications a join jobs j on j.id = a.job_id
    where (a.contractor_id = p_target and j.employer_id = auth.uid() and a.status <> 'withdrawn')
       or (j.employer_id = p_target and a.contractor_id = auth.uid() and a.status = 'selected')
  )
$$;

create or replace function public.is_participant(p_conversation uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations where id = p_conversation and auth.uid() in (employer_id, contractor_id))
$$;

-- Approved, unexpired verification kinds. The only source of badges.
create or replace function public.verified_badges(p_user uuid)
returns public.verification_kind[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct kind order by kind), '{}')
  from verifications
  where user_id = p_user and status = 'approved' and (expires_on is null or expires_on >= current_date)
$$;

-- ---------------------------------------------------------------- status rules
-- Mirrors JOB_TRANSITIONS in src/domain/status.ts.
create or replace function public.job_transition_ok(f public.job_status, t public.job_status)
returns boolean language sql immutable as $$
  select case f
    when 'open' then t in ('filled', 'canceled', 'expired')
    when 'filled' then t in ('in_progress', 'completed', 'canceled', 'open')
    when 'in_progress' then t in ('completed', 'canceled')
    when 'expired' then t = 'open'
    else false
  end
$$;

create or replace function public.job_is_available(j public.jobs)
returns boolean language sql stable as $$
  select j.status = 'open' and j.moderation_status = 'approved' and j.expires_at >= now()
$$;

create or replace function public.job_expiry(p_job_date date, p_deadline date, p_market text)
returns timestamptz language sql stable as $$
  select ((coalesce(p_deadline, p_job_date) + 1)::timestamp) at time zone (select timezone from markets where id = p_market)
$$;

-- Category, service area, and license requirement all satisfied.
create or replace function public.is_qualified(p_job public.jobs, p_contractor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select p_job.category_id = any (c.category_ids)
       and zip_miles(c.home_zip, p_job.zip) <= c.service_radius_miles
       and (not (p_job.license_required or cat.requires_license) or jsonb_array_length(c.licenses) > 0)
    from contractor_profiles c, categories cat
    where c.user_id = p_contractor and cat.id = p_job.category_id
  ), false)
$$;

-- ---------------------------------------------------------------- notifications
create or replace function public.notify(p_user uuid, p_type public.notification_type, p_title text, p_body text, p_link text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  pref jsonb;
  nid uuid;
begin
  select prefs -> p_type::text into pref from notification_preferences where user_id = p_user;
  insert into notifications (user_id, type, title, body, link, in_app)
  values (p_user, p_type, p_title, p_body, p_link, coalesce((pref ->> 'in_app')::boolean, true))
  returning id into nid;
  if coalesce((pref ->> 'email')::boolean, p_type <> 'new_message') then
    insert into notification_deliveries (notification_id, channel) values (nid, 'email');
  end if;
  if coalesce((pref ->> 'sms')::boolean, false) then
    insert into notification_deliveries (notification_id, channel, status, last_error) values (nid, 'sms', 'skipped', 'SMS not enabled yet');
  end if;
  return nid;
end $$;

create or replace function public.notify_matching_contractors(p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  j jobs;
  n integer := 0;
  r record;
begin
  select * into j from jobs where id = p_job;
  if not job_is_available(j) then return 0; end if;
  for r in
    select c.user_id from contractor_profiles c join profiles p on p.id = c.user_id
    where p.status = 'active' and p.market_id = j.market_id
      and coalesce((c.availability ->> 'accepting_work')::boolean, true)
      and is_qualified(j, c.user_id)
  loop
    perform notify(r.user_id, 'new_matching_job', 'New job near you', j.title || ' in ' || j.neighborhood, '/jobs/' || j.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- auth hook
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := case when new.raw_user_meta_data ->> 'role' = 'employer' then 'employer'::public.user_role else 'contractor'::public.user_role end;
begin
  -- Admins are never created from sign-up metadata; promote manually in SQL.
  insert into profiles (id, role, display_name)
  values (new.id, r, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  insert into notification_preferences (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- guards
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if is_api_caller() and (new.role, new.status, new.trust_level, new.is_demo, new.created_at) is distinct from (old.role, old.status, old.trust_level, old.is_demo, old.created_at) then
    perform fail('Role, status, and trust level are managed by administrators.', 'forbidden');
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

create or replace function public.business_guard()
returns trigger language plpgsql as $$
begin
  if is_api_caller() then
    if tg_op = 'INSERT' then
      new.plan := 'free_intro';
      new.free_listings_used := 0;
    elsif (new.plan, new.free_listings_used) is distinct from (old.plan, old.free_listings_used) then
      perform fail('Plan details cannot be edited directly.', 'forbidden');
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger business_guard before insert or update on public.business_profiles for each row execute function public.business_guard();
create trigger contractor_profiles_touch before update on public.contractor_profiles for each row execute function public.touch_updated_at();
create trigger private_contacts_touch before update on public.private_contacts for each row execute function public.touch_updated_at();

-- Deliberately SECURITY INVOKER: is_api_caller() must see the real caller.
create or replace function public.jobs_before_write()
returns trigger language plpgsql set search_path = public as $$
declare
  a areas;
  cat categories;
  poster profiles;
  mkt markets;
begin
  select * into a from areas where zip = new.zip;
  if a.zip is null then perform fail('We do not serve that ZIP code yet.', 'invalid'); end if;
  select * into cat from categories where id = new.category_id;
  if cat.id is null or (not cat.active and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)) then
    perform fail('Choose an active category.', 'invalid');
  end if;
  new.market_id := a.market_id;
  new.neighborhood := a.neighborhood;
  new.license_required := new.license_required or cat.requires_license;
  new.recurrence_note := case when new.is_recurring then new.recurrence_note else null end;

  if tg_op = 'INSERT' then
    if is_api_caller() then
      select * into poster from profiles where id = new.employer_id;
      select * into mkt from markets where id = a.market_id;
      if new.job_date < (now() at time zone mkt.timezone)::date then perform fail('The date needed cannot be in the past.', 'invalid'); end if;
      if not exists (select 1 from business_profiles where user_id = new.employer_id) then perform fail('Add your business name before posting.', 'invalid'); end if;
      new.status := 'open';
      new.moderation_status := case when poster.trust_level = 'new' and mkt.require_review_for_new_accounts then 'pending' else 'approved' end;
      new.moderation_note := null;
      new.selected_application_id := null;
      new.application_count := 0;
      new.is_demo := false;
      new.created_at := now();
      new.filled_at := null;
      new.completed_at := null;
      new.canceled_at := null;
    end if;
    new.expires_at := job_expiry(new.job_date, new.deadline, new.market_id);
  else
    if is_api_caller() then
      if (new.employer_id, new.status, new.moderation_status, new.moderation_note, new.selected_application_id, new.application_count,
          new.is_demo, new.created_at, new.filled_at, new.completed_at, new.canceled_at)
         is distinct from
         (old.employer_id, old.status, old.moderation_status, old.moderation_note, old.selected_application_id, old.application_count,
          old.is_demo, old.created_at, old.filled_at, old.completed_at, old.canceled_at) then
        perform fail('Use the job actions to change status.', 'forbidden');
      end if;
      if old.status not in ('open', 'expired') then perform fail('Only open listings can be edited. Duplicate it to post again.', 'conflict'); end if;
      if old.moderation_status = 'removed' then perform fail('This listing was removed by moderation.', 'forbidden'); end if;
      if (new.job_date, new.deadline) is distinct from (old.job_date, old.deadline) then
        new.expires_at := job_expiry(new.job_date, new.deadline, new.market_id);
      else
        new.expires_at := old.expires_at;
      end if;
      -- Re-dating an expired listing reopens it.
      if old.status = 'expired' and new.expires_at > now() then new.status := 'open'; end if;
    end if;
    if new.status is distinct from old.status and not job_transition_ok(old.status, new.status) then
      perform fail(format('A %s job cannot be marked %s.', old.status, new.status), 'conflict');
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger jobs_before_write before insert or update on public.jobs for each row execute function public.jobs_before_write();

create or replace function public.jobs_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update business_profiles set free_listings_used = free_listings_used + 1 where user_id = new.employer_id;
  if new.moderation_status = 'approved' then perform notify_matching_contractors(new.id); end if;
  return null;
end $$;
create trigger jobs_after_insert after insert on public.jobs for each row execute function public.jobs_after_insert();

create or replace function public.verifications_guard()
returns trigger language plpgsql as $$
begin
  if is_api_caller() then
    new.status := 'pending';
    new.reviewer_id := null;
    new.reviewer_note := null;
    new.reviewed_at := null;
    new.expires_on := null;
    new.created_at := now();
    if new.document_path is not null and split_part(new.document_path, '/', 1) <> auth.uid()::text then
      perform fail('Documents must be uploaded to your own folder.', 'forbidden');
    end if;
  end if;
  return new;
end $$;
create trigger verifications_guard before insert on public.verifications for each row execute function public.verifications_guard();

create or replace function public.messages_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c conversations;
  sender profiles;
begin
  select * into c from conversations where id = new.conversation_id;
  select * into sender from profiles where id = new.sender_id;
  update conversations set last_message_at = new.created_at where id = c.id;
  perform notify(case when c.employer_id = new.sender_id then c.contractor_id else c.employer_id end,
    'new_message', 'New message from ' || sender.display_name, left(new.body, 120), '/messages/' || c.id);
  return null;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------- job RPCs
create or replace function public.set_job_status(p_job uuid, p_status public.job_status, p_reason text default null)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['employer', 'admin']::user_role[]);
  j jobs;
  r record;
  sel uuid;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null then perform fail('Job not found.', 'not_found'); end if;
  if j.employer_id <> me.id and me.role <> 'admin' then perform fail('You can only manage your own listings.', 'forbidden'); end if;
  if p_status = 'filled' then perform fail('Select an applicant to fill a job.', 'invalid'); end if;
  if not job_transition_ok(j.status, p_status) then perform fail(format('A %s job cannot be marked %s.', j.status, p_status), 'conflict'); end if;

  if p_status = 'canceled' then
    for r in select contractor_id from applications where job_id = j.id and status not in ('withdrawn', 'not_selected') loop
      perform notify(r.contractor_id, 'job_canceled', 'A job you applied to was canceled', j.title || coalesce('. Reason: ' || p_reason, ''), '/jobs/' || j.id);
    end loop;
    update jobs set status = 'canceled', canceled_at = now() where id = j.id returning * into j;
  elsif p_status = 'open' and j.status = 'filled' then
    sel := j.selected_application_id;
    update applications set status = 'not_selected', updated_at = now() where id = sel;
    update jobs set status = 'open', selected_application_id = null, filled_at = null,
      expires_at = greatest(expires_at, job_expiry(job_date, deadline, market_id))
    where id = j.id returning * into j;
  elsif p_status = 'open' and j.status = 'expired' then
    if job_expiry(j.job_date, j.deadline, j.market_id) < now() then perform fail('Update the date needed before reopening this listing.', 'invalid'); end if;
    update jobs set status = 'open', expires_at = job_expiry(job_date, deadline, market_id) where id = j.id returning * into j;
  elsif p_status = 'completed' then
    update jobs set status = 'completed', completed_at = now() where id = j.id returning * into j;
  else
    update jobs set status = p_status where id = j.id returning * into j;
  end if;

  if me.role = 'admin' and me.id <> j.employer_id then
    insert into admin_actions (admin_id, action, target_type, target_id, reason) values (me.id, 'job_status:' || p_status, 'job', j.id::text, p_reason);
  end if;
  return j;
end $$;

create or replace function public.share_address(p_job uuid, p_contractor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me profiles := require_user(array['employer']::user_role[]);
begin
  if not exists (select 1 from jobs where id = p_job and employer_id = me.id) then perform fail('You can only manage your own listings.', 'forbidden'); end if;
  if not exists (select 1 from job_private_details where job_id = p_job) then perform fail('Add the property address to this listing first.', 'invalid'); end if;
  if not exists (select 1 from applications where job_id = p_job and contractor_id = p_contractor and status <> 'withdrawn') then
    perform fail('You can only share the address with an applicant.', 'forbidden');
  end if;
  insert into address_shares (job_id, contractor_id) values (p_job, p_contractor) on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- application RPCs
create or replace function public.apply_to_job(p_job uuid, p_message text, p_proposed_rate numeric default null, p_available_on date default null)
returns public.applications language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['contractor']::user_role[]);
  j jobs;
  cp contractor_profiles;
  a applications;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or not job_is_available(j) then perform fail('This job is no longer accepting applications.', 'conflict'); end if;
  select * into cp from contractor_profiles where user_id = me.id;
  if cp.user_id is null or cardinality(cp.category_ids) = 0 or cp.home_zip is null then
    perform fail('Finish your profile (services and ZIP) before applying.', 'invalid');
  end if;
  if char_length(trim(coalesce(p_message, ''))) < 20 then perform fail('Write a short note to the business (20+ characters).', 'invalid'); end if;

  select * into a from applications where job_id = p_job and contractor_id = me.id;
  if a.id is not null and a.status <> 'withdrawn' then perform fail('You already applied to this job.', 'conflict'); end if;

  insert into applications (job_id, contractor_id, message, proposed_rate, available_on, is_qualified)
  values (p_job, me.id, trim(p_message), p_proposed_rate, p_available_on, is_qualified(j, me.id))
  on conflict (job_id, contractor_id) do update
    set message = excluded.message, proposed_rate = excluded.proposed_rate, available_on = excluded.available_on,
        is_qualified = excluded.is_qualified, status = 'submitted', viewed_at = null, created_at = now(), updated_at = now()
  returning * into a;

  update jobs set application_count = application_count + 1 where id = p_job;
  perform notify(j.employer_id, 'application_received', 'New application', me.display_name || ' applied to ' || j.title, '/employer/listings/' || j.id);
  return a;
end $$;

create or replace function public.withdraw_application(p_id uuid)
returns public.applications language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['contractor']::user_role[]);
  a applications;
  j jobs;
begin
  select * into a from applications where id = p_id and contractor_id = me.id for update;
  if a.id is null then perform fail('Application not found.', 'not_found'); end if;
  if a.status in ('withdrawn', 'not_selected') then perform fail('This application can no longer be withdrawn.', 'conflict'); end if;
  select * into j from jobs where id = a.job_id for update;
  update applications set status = 'withdrawn', updated_at = now() where id = a.id returning * into a;
  update jobs set application_count = greatest(0, application_count - 1) where id = j.id;
  if j.selected_application_id = a.id and j.status = 'filled' then
    update jobs set status = 'open', selected_application_id = null, filled_at = null,
      expires_at = greatest(expires_at, job_expiry(job_date, deadline, market_id))
    where id = j.id;
    perform notify(j.employer_id, 'contractor_selected', 'Selected contractor withdrew',
      me.display_name || ' withdrew from ' || j.title || '. The listing is open again.', '/employer/listings/' || j.id);
  end if;
  return a;
end $$;

create or replace function public.set_application_status(p_id uuid, p_status public.application_status)
returns public.applications language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['employer', 'admin']::user_role[]);
  a applications;
  j jobs;
begin
  if p_status in ('selected', 'withdrawn') then perform fail('Use the select action to choose a contractor.', 'invalid'); end if;
  select * into a from applications where id = p_id for update;
  if a.id is null then perform fail('Application not found.', 'not_found'); end if;
  select * into j from jobs where id = a.job_id;
  if j.employer_id <> me.id and me.role <> 'admin' then perform fail('You can only manage your own listings.', 'forbidden'); end if;
  if a.status = p_status then return a; end if;
  if a.status in ('withdrawn', 'selected') then perform fail('This application can no longer be changed here.', 'conflict'); end if;
  if a.status = 'not_selected' and p_status <> 'shortlisted' then perform fail('Shortlist the applicant to reconsider them.', 'conflict'); end if;

  update applications set status = p_status, updated_at = now(), viewed_at = coalesce(viewed_at, now()) where id = a.id returning * into a;
  if p_status = 'shortlisted' then
    perform notify(a.contractor_id, 'application_shortlisted', 'You were shortlisted', j.title, '/jobs/' || j.id);
  elsif p_status = 'not_selected' then
    perform notify(a.contractor_id, 'application_not_selected', 'Update on your application', j.title || ': the business chose not to move forward.', '/contractor/applications');
  end if;
  return a;
end $$;

create or replace function public.select_application(p_id uuid)
returns public.jobs language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['employer', 'admin']::user_role[]);
  a applications;
  j jobs;
  r record;
  company text;
begin
  select * into a from applications where id = p_id for update;
  if a.id is null or a.status = 'withdrawn' then perform fail('Application not found.', 'not_found'); end if;
  select * into j from jobs where id = a.job_id for update;
  if j.employer_id <> me.id and me.role <> 'admin' then perform fail('You can only manage your own listings.', 'forbidden'); end if;
  if j.status <> 'open' then perform fail('This job is not open, so a contractor cannot be selected.', 'conflict'); end if;

  update applications set status = 'selected', updated_at = now(), viewed_at = coalesce(viewed_at, now()) where id = a.id;
  update jobs set status = 'filled', filled_at = now(), selected_application_id = a.id where id = j.id returning * into j;
  select company_name into company from business_profiles where user_id = j.employer_id;

  perform notify(a.contractor_id, 'contractor_selected', 'You were selected', coalesce(company, 'The business') || ' selected you for ' || j.title || '.', '/jobs/' || j.id);
  perform notify(j.employer_id, 'contractor_selected', 'Contractor confirmed',
    'You selected ' || (select display_name from profiles where id = a.contractor_id) || ' for ' || j.title || '.', '/employer/listings/' || j.id);
  for r in select id, contractor_id from applications where job_id = j.id and id <> a.id and status not in ('withdrawn', 'not_selected') loop
    update applications set status = 'not_selected', updated_at = now() where id = r.id;
    perform notify(r.contractor_id, 'application_not_selected', 'Update on your application', j.title || ' has been filled.', '/contractor/applications');
  end loop;
  return j;
end $$;

-- ---------------------------------------------------------------- messaging RPCs
create or replace function public.start_conversation(p_other uuid, p_job uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['employer', 'contractor']::user_role[]);
  other profiles;
  e uuid;
  c uuid;
  cid uuid;
begin
  select * into other from profiles where id = p_other;
  if other.id is null or other.role = me.role or other.role = 'admin' then
    perform fail('You can message businesses and contractors connected through a job.', 'forbidden');
  end if;
  e := case when me.role = 'employer' then me.id else other.id end;
  c := case when me.role = 'contractor' then me.id else other.id end;
  if not exists (
       select 1 from applications a join jobs j on j.id = a.job_id
       where a.contractor_id = c and j.employer_id = e and a.status <> 'withdrawn' and (p_job is null or a.job_id = p_job))
     and not (me.role = 'employer' and exists (select 1 from saved_contractors where employer_id = e and contractor_id = c)) then
    perform fail('Messaging opens once a contractor applies to one of your jobs.', 'forbidden');
  end if;
  select id into cid from conversations where employer_id = e and contractor_id = c and job_id is not distinct from p_job;
  if cid is null then
    insert into conversations (job_id, employer_id, contractor_id) values (p_job, e, c) returning id into cid;
  end if;
  return cid;
end $$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_user();
  if not is_participant(p_conversation) then perform fail('Conversation not found.', 'not_found'); end if;
  update messages set read_at = now() where conversation_id = p_conversation and sender_id <> auth.uid() and read_at is null;
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

-- ---------------------------------------------------------------- reviews
create or replace function public.create_review(p_job uuid, p_rating integer, p_body text default null)
returns public.reviews language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['employer']::user_role[]);
  j jobs;
  sel applications;
  r reviews;
begin
  select * into j from jobs where id = p_job;
  if j.id is null or j.employer_id <> me.id then perform fail('You can only manage your own listings.', 'forbidden'); end if;
  if j.status <> 'completed' then perform fail('You can review a contractor after the job is marked completed.', 'conflict'); end if;
  select * into sel from applications where id = j.selected_application_id;
  if sel.id is null then perform fail('No contractor was selected for this job.', 'invalid'); end if;
  if p_rating not between 1 and 5 then perform fail('Choose a rating from 1 to 5.', 'invalid'); end if;
  insert into reviews (job_id, reviewer_id, reviewee_id, rating, body)
  values (j.id, me.id, sel.contractor_id, p_rating, nullif(trim(p_body), ''))
  returning * into r;
  return r;
exception when unique_violation then
  perform fail('You already reviewed this job.', 'conflict');
  return null;
end $$;

-- ---------------------------------------------------------------- public read models
create or replace function public.employer_public(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'company_name', b.company_name, 'business_type', b.business_type,
    'avatar_url', p.avatar_url, 'member_since', p.created_at, 'is_demo', p.is_demo,
    'jobs_posted', (select count(*) from jobs where employer_id = p.id and moderation_status = 'approved'),
    'jobs_completed', (select count(*) from jobs where employer_id = p.id and status = 'completed'),
    'badges', to_jsonb(verified_badges(p.id)))
  from profiles p left join business_profiles b on b.user_id = p.id
  where p.id = p_id and p.role in ('employer', 'admin')
$$;

create or replace function public.contractor_summaries(p_ids uuid[])
returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'business_name', c.business_name, 'headline', c.headline,
    'avatar_url', p.avatar_url, 'home_zip', c.home_zip, 'years_experience', c.years_experience,
    'category_ids', to_jsonb(coalesce(c.category_ids, '{}')), 'badges', to_jsonb(verified_badges(p.id)),
    'rating', (select round(avg(rating)::numeric, 2) from reviews where reviewee_id = p.id),
    'review_count', (select count(*) from reviews where reviewee_id = p.id),
    'completed_jobs', (select count(*) from applications a join jobs j on j.id = a.job_id
                       where a.contractor_id = p.id and a.status = 'selected' and j.status = 'completed'),
    'is_demo', p.is_demo)
  from profiles p left join contractor_profiles c on c.user_id = p.id
  where p.id = any (p_ids) and p.role = 'contractor'
$$;

-- ---------------------------------------------------------------- admin RPCs
create or replace function public.admin_log(p_action text, p_type text, p_target text, p_reason text)
returns void language sql security definer set search_path = public as $$
  insert into admin_actions (admin_id, action, target_type, target_id, reason) values (auth.uid(), p_action, p_type, p_target, p_reason)
$$;

create or replace function public.admin_moderate_job(p_job uuid, p_decision text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['admin']::user_role[]);
  j jobs;
  was moderation_status;
begin
  if p_decision not in ('approve', 'reject', 'remove') then perform fail('Unknown decision.', 'invalid'); end if;
  if p_decision <> 'approve' and coalesce(trim(p_reason), '') = '' then perform fail('Give a reason. It is shared with the business.', 'invalid'); end if;
  select * into j from jobs where id = p_job for update;
  if j.id is null then perform fail('Job not found.', 'not_found'); end if;
  was := j.moderation_status;
  update jobs set moderation_status = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'removed' end::moderation_status,
    moderation_note = nullif(trim(p_reason), '')
  where id = j.id returning * into j;
  if p_decision = 'remove' and j.status in ('open', 'filled', 'in_progress') then
    perform set_job_status(j.id, 'canceled', 'Removed by moderation');
  end if;
  perform admin_log('moderate:' || p_decision, 'job', j.id::text, p_reason);
  perform notify(j.employer_id, 'listing_moderated',
    case when p_decision = 'approve' then 'Your listing is live' else 'Your listing was not published' end,
    case when p_decision = 'approve' then j.title else j.title || ': ' || p_reason end, '/employer/listings/' || j.id);
  if p_decision = 'approve' and was = 'pending' then perform notify_matching_contractors(j.id); end if;
end $$;

create or replace function public.admin_set_user_status(p_user uuid, p_status public.account_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['admin']::user_role[]);
  r record;
begin
  if p_user = me.id then perform fail('You cannot suspend your own account.', 'forbidden'); end if;
  if p_status = 'suspended' and coalesce(trim(p_reason), '') = '' then perform fail('Give a reason for the suspension.', 'invalid'); end if;
  update profiles set status = p_status where id = p_user;
  if not found then perform fail('User not found.', 'not_found'); end if;
  if p_status = 'suspended' then
    for r in select id from jobs where employer_id = p_user and status = 'open' loop
      perform set_job_status(r.id, 'canceled', 'Account suspended');
    end loop;
  end if;
  perform admin_log('user_status:' || p_status, 'user', p_user::text, p_reason);
end $$;

create or replace function public.admin_set_trust(p_user uuid, p_trust public.trust_level)
returns void language plpgsql security definer set search_path = public as $$
declare me profiles := require_user(array['admin']::user_role[]);
begin
  update profiles set trust_level = p_trust where id = p_user;
  if not found then perform fail('User not found.', 'not_found'); end if;
  perform admin_log('trust:' || p_trust, 'user', p_user::text, null);
end $$;

create or replace function public.admin_review_verification(p_id uuid, p_decision public.verification_status, p_note text default null, p_expires_on date default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['admin']::user_role[]);
  v verifications;
begin
  if p_decision not in ('approved', 'rejected') then perform fail('Approve or reject.', 'invalid'); end if;
  select * into v from verifications where id = p_id for update;
  if v.id is null then perform fail('Request not found.', 'not_found'); end if;
  if v.status <> 'pending' then perform fail('This request was already reviewed.', 'conflict'); end if;
  if p_decision = 'rejected' and coalesce(trim(p_note), '') = '' then perform fail('Explain what was missing so the user can resubmit.', 'invalid'); end if;
  update verifications set status = p_decision, reviewer_id = me.id, reviewer_note = nullif(trim(p_note), ''), reviewed_at = now(), expires_on = p_expires_on where id = v.id;
  perform admin_log('verification:' || p_decision, 'verification', v.id::text, p_note);
  perform notify(v.user_id, 'verification_updated',
    case when p_decision = 'approved' then 'Verification approved' else 'Verification needs attention' end,
    case when p_decision = 'approved' then format('Your %s check was approved.', v.kind) else format('Your %s check was not approved: %s', v.kind, p_note) end,
    '/settings/verification');
end $$;

create or replace function public.admin_save_category(p jsonb)
returns public.categories language plpgsql security definer set search_path = public as $$
declare
  me profiles := require_user(array['admin']::user_role[]);
  c categories;
  v_slug text;
begin
  if char_length(trim(coalesce(p ->> 'name', ''))) < 2 then perform fail('Enter a category name.', 'invalid'); end if;
  if p ? 'id' and p ->> 'id' is not null then
    update categories set
      name = trim(p ->> 'name'),
      "group" = coalesce(p ->> 'group', "group"),
      requires_license = coalesce((p ->> 'requires_license')::boolean, requires_license),
      license_note = case when p ? 'license_note' then p ->> 'license_note' else license_note end,
      active = coalesce((p ->> 'active')::boolean, active)
    where id = p ->> 'id' returning * into c;
    if c.id is null then perform fail('Category not found.', 'not_found'); end if;
    perform admin_log('category:update', 'category', c.id, null);
  else
    v_slug := trim(both '-' from regexp_replace(lower(trim(p ->> 'name')), '[^a-z0-9]+', '-', 'g'));
    if exists (select 1 from categories where slug = v_slug) then perform fail('A category with this name already exists.', 'conflict'); end if;
    insert into categories (id, slug, name, "group", requires_license, license_note, active, sort)
    values ('cat_' || v_slug, v_slug, trim(p ->> 'name'), coalesce(p ->> 'group', 'other'),
      coalesce((p ->> 'requires_license')::boolean, false), p ->> 'license_note', coalesce((p ->> 'active')::boolean, true),
      (select coalesce(max(sort), 0) + 10 from categories))
    returning * into c;
    perform admin_log('category:create', 'category', c.id, null);
  end if;
  return c;
end $$;

create or replace function public.admin_resolve_report(p_id uuid, p_status public.report_status)
returns void language plpgsql security definer set search_path = public as $$
declare me profiles := require_user(array['admin']::user_role[]);
begin
  update reports set status = p_status where id = p_id;
  if not found then perform fail('Report not found.', 'not_found'); end if;
  perform admin_log('report:' || p_status, 'report', p_id::text, null);
end $$;

create or replace function public.admin_list_users()
returns table (profile jsonb, email text, company_name text, jobs bigint, applications bigint, open_reports bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_user(array['admin']::user_role[]);
  return query
  select to_jsonb(p), u.email::text, coalesce(b.company_name, c.business_name),
    (select count(*) from jobs where employer_id = p.id),
    (select count(*) from applications where contractor_id = p.id),
    (select count(*) from reports r where r.status = 'open' and (r.target_id = p.id or r.target_id in (select id from jobs where employer_id = p.id)))
  from profiles p
  join auth.users u on u.id = p.id
  left join business_profiles b on b.user_id = p.id
  left join contractor_profiles c on c.user_id = p.id
  order by p.created_at desc;
end $$;

-- ---------------------------------------------------------------- scheduled maintenance
-- Schedule with pg_cron (Supabase: Database → Extensions → pg_cron):
--   select cron.schedule('turnlist-maintenance', '*/15 * * * *', 'select public.run_maintenance()');
create or replace function public.run_maintenance()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  expired integer;
  reminded integer := 0;
  r record;
  sel uuid;
begin
  update jobs set status = 'expired' where status = 'open' and expires_at < now();
  get diagnostics expired = row_count;

  update verifications set status = 'expired' where status = 'approved' and expires_on < current_date;

  for r in
    select j.* from jobs j
    where j.status in ('open', 'filled', 'in_progress')
      and coalesce(j.deadline, j.job_date) between current_date and current_date + 1
      and not exists (select 1 from notifications n where n.type = 'deadline_approaching' and n.link like '%' || j.id::text)
  loop
    perform notify(r.employer_id, 'deadline_approaching',
      case when r.status = 'open' then 'Job still unfilled' else 'Job due soon' end,
      r.title || ' is due ' || to_char(coalesce(r.deadline, r.job_date), 'Mon DD'), '/employer/listings/' || r.id);
    select contractor_id into sel from applications where id = r.selected_application_id;
    if sel is not null then
      perform notify(sel, 'deadline_approaching', 'Upcoming job', r.title || ' is due ' || to_char(coalesce(r.deadline, r.job_date), 'Mon DD'), '/jobs/' || r.id);
    end if;
    reminded := reminded + 1;
  end loop;
  return jsonb_build_object('expired', expired, 'reminded', reminded);
end $$;
