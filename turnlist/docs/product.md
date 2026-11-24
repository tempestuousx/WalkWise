# Product

Turnlist is a local job board for property maintenance and rental turnover work, launching in the Las Vegas valley. It is a posting and applicant-management service. It does not employ anyone, process payments, or guarantee work.

## Users

| Role | Main screens |
| --- | --- |
| Contractor | Find Work (with personal overview), Saved Jobs, My Applications, Messages, Profile |
| Business (property manager, landlord, investor, maintenance company) | Dashboard, Post a Job, My Listings, Applicants, Saved Contractors, Messages |
| Administrator | Overview (metrics and queues), Listings, Users, Verification, Categories |

## Core flows

**Post a job (business).** Quick Post asks for six things: title, category, ZIP, description, date needed, pay. "All details" adds property type, finish-by date, hours, pay range, experience, license and insurance requirements, materials, recurrence, photos, and the private address. "Repeat a previous job" and "Duplicate" prefill the form with a fresh date. The ZIP's default comes from the last listing or the business profile.

**Find and apply (contractor).** The feed shows only open, approved, unexpired listings. With a profile, results are ranked by category match, distance inside the service radius, license fit, availability that day, urgency, and recency. Filters: category group and specific categories, location text, distance, minimum pay, date window, one-time or recurring, urgency. Filters live in the URL. Applying requires a short note; rate and start date are optional.

**Review and select (business).** Opening a listing marks new applications as viewed. Each applicant shows distance, experience, rating, completed jobs, verified badges, and whether they matched the job's services and area when they applied. Actions: Shortlist, Not selected, Select (confirmation), Message, Share address, Save contractor. Selecting fills the job and tells everyone else it is filled.

**Complete.** The business marks the job in progress and completed, then can leave a review. If the selected contractor withdraws, or the business reopens the listing, the job returns to open.

## Freshness, availability, and relevance

These three questions are answered on every listing without opening it.

**Is it fresh?** Cards show "New" with the age (for example "New · 3h ago") during a listing's first 24 hours, then "Posted 2d ago". Find Work can filter by posting time (24 hours, 3 days, 7 days) and sort by newest. The job page shows the age and the posting date. Contractors see how many of their matches are new today.

**Can I still apply?** Every card ends with an availability line: a teal dot and "Applications open" with when they close ("Closes Fri", "Closes tomorrow"). Under 24 hours the dot and closing time turn amber. Closed listings say why: Filled, Completed, Canceled, Expired, Awaiting review. The job page opens with a strip that says "Accepting applications. Applications close at the end of Thursday, Nov 26." or "Not accepting applications: filled". Feeds only ever list jobs that are accepting applications, and Find Work's count says so. Employers see the closing time on their dashboard and listings, with the number of applicants so far.

Applications close at the end of the finish-by date, or the end of the date needed if there is none (`expires_at`), unless the job is filled first.

**Is it for me?** Once a contractor has services and a home ZIP, Find Work splits results into "Matches for you" (services, travel radius, and license requirements all fit) and "Other available jobs", each in the chosen sort order. "Only jobs that match my profile" hides the rest. The home page leads with their matches and follows with "Recently posted". If nothing matches, they are told so and pointed to their radius and services rather than shown an empty page.

## Statuses

Job (stored): `open`, `filled`, `in_progress`, `completed`, `canceled`, `expired`. "Applications received" is derived (open with at least one active application) so it never drifts from the data.

```
open → filled → in_progress → completed
open → canceled | expired
filled → open (selected contractor released) | completed | canceled
in_progress → canceled
expired → open (after re-dating)
```

Application: `submitted → viewed → shortlisted → selected | not_selected`; contractors may withdraw until a decision. Each status shows contractors a plain explanation; none implies a guarantee of work.

Moderation (separate from job status): `pending`, `approved`, `rejected`, `removed`.

## Notifications

In-app and email, per type, per user: new matching job, application received, shortlisted, selected, not selected, job canceled, deadline approaching, new message, listing moderated, verification updated. Text messages appear in settings as "coming later" and are already modeled in the database.

## Demo mode

Development and preview builds (`npm run dev`, `npm run build:demo`) run entirely in the browser with example data. Every example listing, business, and person is flagged `is_demo` and labeled **Example**. A one-line bar explains it and can be dismissed (the footer brings it back). Launch builds connected to Supabase never show the bar or sample data, and a production build without Supabase settings refuses to fall back to demo data. Example dates are generated relative to today. "View as" switches between a property manager, a contractor, and an administrator; "Reset" restores the sample data. Uploaded verification documents are never stored in demo mode. Production seed data contains no listings or people.

## Metrics

The primary measure is the share of legitimate postings that attract at least one qualified applicant:

- Legitimate: approved by moderation (rejected and removed excluded), not demo data.
- Measured: live for 72 hours, or already closed, so brand-new listings do not drag the number down.
- Qualified: the applicant's services include the job's category, the job is inside their service radius, and they list a license when the job or category requires one. This is snapshotted on the application when submitted.

Supporting measures on the admin overview: registered businesses and contractors, active listings, applications per listing, filled jobs, median time from posting to selection, returning employers (two or more listings), listings with no applications, most requested categories, most active ZIP codes, and moderation queues.

## Monetization (designed, not charged)

- Contractors: free registration and applications, permanently. No lead or applicant-access fees.
- Businesses: introductory free listings now; later, pay per listing and a monthly plan for frequent posters.
- Modeled today: `plans` table, `business_profiles.plan` and `free_listings_used` (server-maintained, not client-writable). Nothing is enforced and there is no payment processing, pending legal and regulatory review.
- Future upgrades that fit the data model: featured listings, multiple staff accounts per business, advanced analytics, recurring job templates.

## Not in version one

Payment or escrow, scheduling and calendars, AI matching, native apps, background checks.
