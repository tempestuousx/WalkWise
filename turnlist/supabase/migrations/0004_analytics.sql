-- Marketplace analytics for the admin dashboard. Returns the same shape as
-- the Metrics interface in src/data/api.ts.
--
-- Primary metric: share of legitimate postings that attracted at least one
-- qualified applicant. "Legitimate" = approved by moderation (rejected and
-- removed listings are excluded) and not demo data. A posting is measured
-- once it has been live 72 hours or has closed, so brand-new listings do not
-- drag the rate down. "Qualified" is snapshotted on each application when it
-- is submitted (category + service area + license requirement).

create or replace function public.admin_metrics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  result jsonb;
begin
  perform require_user(array['admin']::user_role[]);

  with
  approved as (select * from jobs where moderation_status = 'approved' and not is_demo),
  active_apps as (select a.* from applications a join approved j on j.id = a.job_id where a.status <> 'withdrawn'),
  eligible as (select * from approved where status <> 'open' or created_at <= now() - interval '72 hours'),
  succeeded as (select e.id from eligible e where exists (select 1 from active_apps a where a.job_id = e.id and a.is_qualified)),
  sel_hours as (select extract(epoch from (filled_at - created_at)) / 3600 as h from approved where filled_at is not null)
  select jsonb_build_object(
    'employers', (select count(*) from profiles where role = 'employer' and not is_demo),
    'contractors', (select count(*) from profiles where role = 'contractor' and not is_demo),
    'activeListings', (select count(*) from approved j where job_is_available(j)),
    'totalListings', (select count(*) from approved),
    'applications', (select count(*) from active_apps),
    'avgApplicationsPerJob', coalesce((select count(*)::numeric from active_apps) / nullif((select count(*) from approved), 0), 0),
    'filledJobs', (select count(*) from approved where filled_at is not null),
    'medianHoursToSelection', (select percentile_disc(0.5) within group (order by h) from sel_hours),
    'returningEmployers', (select count(*) from (select employer_id from approved group by employer_id having count(*) >= 2) x),
    'topCategories', coalesce((select jsonb_agg(jsonb_build_object('category_id', category_id, 'count', n) order by n desc)
                               from (select category_id, count(*) n from approved group by category_id order by n desc limit 6) x), '[]'),
    'noApplicationJobs', (select count(*) from eligible e where not exists (select 1 from active_apps a where a.job_id = e.id)),
    'topZips', coalesce((select jsonb_agg(jsonb_build_object('zip', zip, 'count', n) order by n desc)
                         from (select zip, count(*) n from approved group by zip order by n desc limit 6) x), '[]'),
    'primary', jsonb_build_object(
      'eligible', (select count(*) from eligible),
      'succeeded', (select count(*) from succeeded),
      'rate', (select count(*)::numeric from succeeded) / nullif((select count(*) from eligible), 0)),
    'pendingModeration', (select count(*) from jobs where moderation_status = 'pending'),
    'pendingVerifications', (select count(*) from verifications where status = 'pending'),
    'openReports', (select count(*) from reports where status = 'open'),
    'statusCounts', jsonb_build_object(
      'open', (select count(*) from approved j where job_is_available(j)),
      'filled', (select count(*) from approved where status = 'filled'),
      'in_progress', (select count(*) from approved where status = 'in_progress'),
      'completed', (select count(*) from approved where status = 'completed'),
      'canceled', (select count(*) from approved where status = 'canceled'),
      'expired', (select count(*) from approved j where status = 'expired' or (status = 'open' and expires_at < now())))
  ) into result;
  return result;
end $$;
