# Architecture

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | React 18, TypeScript, React Router 6, Tailwind CSS 3 | Static SPA that deploys anywhere (Netlify, Vercel, S3). No server to run. |
| Data fetching | TanStack Query | Loading, error, retry, and cache invalidation handled once. |
| Validation | Zod | One schema validates forms in the browser and inputs in the demo backend. |
| Backend | Supabase: Postgres 15+, Auth, Storage, Edge Functions | Row-level security puts access control next to the data. |
| Tests | Vitest (domain + demo backend), psql (schema + policies), Playwright (browser flows) | Each layer is tested where its rules live. |

## Layers

```
src/domain/     Pure TypeScript. Types, status machines, matching, validation, formatting.
                No React, no I/O. Shared by both data adapters and the UI.
src/data/api.ts The DataApi interface: every read and write the UI can perform.
src/data/demoApi.ts      In-browser implementation (localStorage), enforcing the same
                         permission rules as the database. Used when Supabase is not configured.
src/data/supabaseApi.ts  Supabase implementation. Reads hit tables (RLS filters rows);
                         multi-step writes call RPCs.
src/lib/        Auth context, query hooks, toast, URL filter state.
src/components/ Design-system primitives and shared pieces (JobCard, CategoryStrip, SearchBar, Layout).
src/pages/      Route screens by audience: public, contractor, employer, shared, admin.
supabase/       Migrations, generated seed, edge function, database tests.
```

The UI never imports an adapter directly; `src/data/index.ts` picks one at startup:

| Mode | When | What users see |
| --- | --- | --- |
| `supabase` | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set (always wins) | Real data. No demo bar, no sample listings. |
| `demo` | `npm run dev`, or a build with `VITE_DEMO_MODE=true` (`npm run build:demo`) | Sample data labeled Example, demo bar (one line on phones, dismissible, restorable from the footer). |
| `unconfigured` | Production build with neither | A "not connected" screen. Sample listings are never served to real visitors by accident. |

## Where rules are enforced

Security rules live in the database. The UI hides actions a user cannot take, but nothing depends on that.

| Rule | Database | Demo backend |
| --- | --- | --- |
| Employers manage only their own listings | `jobs` RLS + `set_job_status()` owner check | `ownJob()` |
| Contractors cannot edit others' applications | no direct write grant; `withdraw_application()` checks owner | owner check |
| Server-managed columns (status, moderation, counts, plan) cannot be written by clients | `jobs_before_write`, `profiles_guard`, `business_guard` triggers + column grants | `writeJob()` ignores them |
| Job and application status transitions | `job_transition_ok()` in trigger and RPCs | `canTransitionJob()` / `canTransitionApplication()` in `domain/status.ts` |
| Exact address visible only to owner, admins, and contractors it was shared with | `job_private_details` RLS + `address_shares` | `getJob()` |
| Contact details visible only to linked parties | `private_contacts` RLS via `can_view_contact()` | `getContractor()` |
| Verification documents private | private `verification-docs` bucket, owner/admin policies, signed URLs | never stored in demo |
| Badges only from approved, unexpired checks | `verified_badges()` | `verifiedBadges()` |
| New business accounts' listings held for review | `jobs_before_write` sets `moderation_status = 'pending'` | same in `writeJob()` |

`tests/demoApi.test.ts` and `supabase/tests/policies_test.sql` assert the same rules against each implementation.

## Database

See `supabase/migrations/`:

- `0001_schema.sql`: enums and tables. Reference data (markets, areas, categories) uses stable text ids; user data uses uuids.
- `0002_functions.sql`: helpers, guard triggers, notifications, and the RPCs that carry every multi-step workflow (`apply_to_job`, `select_application`, `set_job_status`, `share_address`, `start_conversation`, `create_review`, admin actions, `run_maintenance`).
- `0003_policies.sql`: RLS on every table, column grants, storage buckets and policies.
- `0004_analytics.sql`: `admin_metrics()`.
- `seed.sql`: generated from `src/domain` by `npm run gen:seed`. Reference data only, no listings or people.

Main tables: `profiles`, `private_contacts`, `business_profiles`, `contractor_profiles`, `jobs`, `job_private_details`, `address_shares`, `applications`, `saved_jobs`, `saved_contractors`, `conversations`, `messages`, `notifications`, `notification_preferences`, `notification_deliveries`, `reviews`, `verifications`, `reports`, `admin_actions`, `plans`.

RPC errors carry a `HINT` (`unauthenticated`, `forbidden`, `not_found`, `invalid`, `conflict`) that the client maps to `ApiError.code`, so the UI shows the database's own message.

### Scheduled work

`run_maintenance()` expires stale listings, expires lapsed verifications, and sends deadline reminders. Schedule it with pg_cron:

```sql
select cron.schedule('turnlist-maintenance', '*/15 * * * *', 'select public.run_maintenance()');
```

### Notifications

`notify()` writes an in-app row and, depending on the user's preferences, queues an email in `notification_deliveries`. The `send-notifications` edge function drains the queue through Resend. SMS is modeled as a channel (preferences, delivery rows written as `skipped`) so adding a provider later is a change to the edge function and the settings screen only.

## Expanding to new cities

Markets are data. To launch a city:

1. Add a row to `MARKETS` and its ZIPs to `AREAS` in `src/domain/market.ts`, then `npm run gen:seed` and apply the seed.
2. Set `require_review_for_new_accounts` for the market.
3. Profiles and jobs already carry `market_id`; `jobs_before_write` derives it from the ZIP. Matching notifications are scoped to the job's market.

What would change at larger scale: move feed filtering into a Postgres function with PostGIS distance and pagination (the client currently filters up to 500 open listings per market, which is plenty for one metro), and add a market switcher to the header.

## Running against Supabase

1. Create a project. Enable pg_cron.
2. Apply `supabase/migrations/*.sql` in order, then `supabase/seed.sql`.
3. Promote your admin account: `update profiles set role = 'admin', trust_level = 'trusted' where id = '<user id>';`
4. Deploy `supabase/functions/send-notifications` and set `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and build.
