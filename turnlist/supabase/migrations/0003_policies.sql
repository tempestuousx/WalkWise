-- Row-level security. Default deny: every table has RLS on, and only the
-- policies below grant access. Writes that span several rows (apply, select,
-- status changes, moderation) have no direct policy and go through the
-- SECURITY DEFINER functions in 0002.

alter table public.markets enable row level security;
alter table public.areas enable row level security;
alter table public.categories enable row level security;
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.private_contacts enable row level security;
alter table public.business_profiles enable row level security;
alter table public.contractor_profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_private_details enable row level security;
alter table public.address_shares enable row level security;
alter table public.applications enable row level security;
alter table public.saved_jobs enable row level security;
alter table public.saved_contractors enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.reviews enable row level security;
alter table public.verifications enable row level security;
alter table public.reports enable row level security;
alter table public.admin_actions enable row level security;

-- reference data: readable by everyone, writable by admins via RPC only
create policy "markets readable" on public.markets for select using (true);
create policy "areas readable" on public.areas for select using (true);
create policy "categories readable" on public.categories for select using (active or public.is_admin());
create policy "plans readable" on public.plans for select using (true);

-- profiles: public display fields; email lives in auth.users, never here
create policy "profiles readable" on public.profiles for select using (status = 'active' or id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "contacts visible to linked parties" on public.private_contacts for select using (public.can_view_contact(user_id));
create policy "contacts self insert" on public.private_contacts for insert with check (user_id = auth.uid());
create policy "contacts self update" on public.private_contacts for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "business profiles readable" on public.business_profiles for select using (true);
create policy "business profile self insert" on public.business_profiles for insert
  with check (user_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'employer'));
create policy "business profile self update" on public.business_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "contractor profiles readable" on public.contractor_profiles for select using (true);
create policy "contractor profile self insert" on public.contractor_profiles for insert
  with check (user_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'contractor'));
create policy "contractor profile self update" on public.contractor_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- jobs: approved listings are public (status shown honestly as filled/expired);
-- owners, applicants, and admins also see pending/rejected/removed ones.
create policy "jobs readable" on public.jobs for select
  using (moderation_status = 'approved' or employer_id = auth.uid() or public.is_admin() or public.has_applied(id));
create policy "employers insert own jobs" on public.jobs for insert
  with check (employer_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'employer' and status = 'active'));
create policy "employers update own jobs" on public.jobs for update
  using (employer_id = auth.uid()) with check (employer_id = auth.uid());

-- exact address: owner, admins, and contractors the owner shared it with
create policy "address visible to authorized" on public.job_private_details for select
  using (public.owns_job(job_id) or public.is_admin() or public.address_shared_with_me(job_id));
create policy "address owner insert" on public.job_private_details for insert with check (public.owns_job(job_id));
create policy "address owner update" on public.job_private_details for update using (public.owns_job(job_id)) with check (public.owns_job(job_id));
create policy "address owner delete" on public.job_private_details for delete using (public.owns_job(job_id));
create policy "shares visible to parties" on public.address_shares for select using (contractor_id = auth.uid() or public.owns_job(job_id) or public.is_admin());

-- applications: contractor sees own; employer sees those on own jobs. Writes via RPC.
create policy "applications readable by parties" on public.applications for select
  using (contractor_id = auth.uid() or public.owns_job(job_id) or public.is_admin());

create policy "saved jobs own" on public.saved_jobs for all using (contractor_id = auth.uid()) with check (contractor_id = auth.uid());
create policy "saved contractors own" on public.saved_contractors for all using (employer_id = auth.uid()) with check (employer_id = auth.uid());

create policy "conversations participants" on public.conversations for select using (auth.uid() in (employer_id, contractor_id));
create policy "messages participants read" on public.messages for select using (public.is_participant(conversation_id));
create policy "messages participants send" on public.messages for insert
  with check (sender_id = auth.uid() and public.is_participant(conversation_id) and read_at is null);

create policy "notifications own" on public.notifications for select using (user_id = auth.uid() and in_app);
create policy "preferences own" on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- notification_deliveries: no policies. Only the service role (edge function) reads it.

create policy "reviews readable" on public.reviews for select using (true);

create policy "verifications own or admin" on public.verifications for select using (user_id = auth.uid() or public.is_admin());
create policy "verifications self submit" on public.verifications for insert with check (user_id = auth.uid());

create policy "reports own or admin" on public.reports for select using (reporter_id = auth.uid() or public.is_admin());
create policy "reports self insert" on public.reports for insert with check (reporter_id = auth.uid());

create policy "admin actions admin only" on public.admin_actions for select using (public.is_admin());

-- Column-level hardening on top of RLS: the client may not write server-managed columns.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
revoke update on public.messages from anon, authenticated;
revoke insert, update, delete on public.applications, public.notifications, public.reviews, public.admin_actions, public.address_shares from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;

-- RPC surface. Internal helpers are not callable by API users.
revoke execute on function public.notify(uuid, public.notification_type, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_matching_contractors(uuid) from public, anon, authenticated;
revoke execute on function public.run_maintenance() from public, anon, authenticated;
revoke execute on function public.admin_log(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------- storage
-- Public buckets hold images people choose to publish. Identity, license, and
-- insurance documents go to a private bucket readable only by the owner and admins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('job-photos', 'job-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('portfolio', 'portfolio', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do nothing;

-- Every object lives under "<user id>/..." so ownership is checkable from the path.
create policy "public images readable" on storage.objects for select
  using (bucket_id in ('avatars', 'job-photos', 'portfolio'));
create policy "upload to own folder" on storage.objects for insert
  with check (bucket_id in ('avatars', 'job-photos', 'portfolio', 'verification-docs') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own objects" on storage.objects for delete
  using ((storage.foldername(name))[1] = auth.uid()::text);
create policy "verification docs owner or admin" on storage.objects for select
  using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
