# 6. Phased Implementation Plan and Acceptance Criteria

Each phase ends with a tagged build, a short demo recording, and its acceptance checklist passed. "Device" means a physical iPhone and a physical Android phone (one Pixel and one Samsung recommended), running development builds.

## Phase 1: Architecture and design system

Scope: Expo SDK 58 project with dev client and EAS profiles; TypeScript strict; ESLint boundaries; Expo Router skeleton for all nine primary screens; theme provider with light/dark; tokens; `GlassSurface` in all three tiers; `AmbientBackground`; core components (buttons, tab bar, metric tiles, sheets, toasts); Drizzle schema and migrations on device; Supabase project with migration `0001_init.sql` (from the approved schema), RLS, seed taxonomy; development seed data generator (clearly marked, dev builds only).

Acceptance:
- [ ] `npm run typecheck`, `npm run lint`, `npm test` pass in CI.
- [ ] Every primary screen reachable from the floating tab bar or a contextual action; deep link `walkwise://walk/start` resolves.
- [ ] Glass renders in native tier on iOS 26, layered tier on Android 12+, solid tier when Reduce Transparency is on; switching is live.
- [ ] Contrast test suite passes for all token pairs in both themes and all tiers.
- [ ] Text scales to 200% without clipped metrics on Dashboard and Active Walk.
- [ ] `supabase test db` passes RLS tests (isolation, spoofing, cross-user references).
- [ ] Seed data appears only in dev builds and is labeled "Sample data".

## Phase 2: Core walking

Scope: location service and background task; walk state machine; start/pause/resume/end; running totals; point filtering; map with live route; dog assignment before, during, after; unassigned walk flow; interruption detection and recovery; walk history list; sync engine v1 (push/pull for dogs, walks, intervals, participants, points); required sign-in (Apple, Google, email) with offline use after the first sign-in; media backup queue.

Acceptance:
- [ ] One tap on Start Walk begins recording with no dog selected; time to first accepted point < 10 s outdoors.
- [ ] 45-minute walk with screen locked for 40 minutes records a continuous route on both devices (field test log attached).
- [ ] Switching to another app (camera, music) for 10 minutes does not interrupt recording.
- [ ] Airplane mode for a whole walk: start, pause, resume, end all work; sync after reconnect uploads exactly one walk with all points (verified by server row counts).
- [ ] Killing the app mid-walk produces the recovery banner on next launch; Finish ends at the last point; Resume records a system gap.
- [ ] Assigning or changing dogs mid-walk never resets timer, distance, or route (automated test on the state machine plus manual check).
- [ ] Dismissing the end-of-walk dog prompt saves the walk as Unassigned and shows the Dashboard banner.
- [ ] Distance on a measured 1.00 km course is within ±3% across 3 runs per device.
- [ ] Battery drain during a 60-minute recorded walk ≤ 8% on the test devices with screen off (measured and recorded).
- [ ] Unit tests: haversine, filters, totals, pause exclusion, state machine transitions, outbox coalescing, LWW rules, idempotent replay.

## Phase 3: Behavioral logging

Scope: radial menu (gesture and tap modes), haptics, cancel gesture, dwell-to-trigger, detail rings (Poop consistency), post-log chips, event persistence with location, map markers and clustering, event editing, custom categories/events/triggers, Quick Log customization, voice notes with deferred transcription and keyword-based suggestions, photos.

Acceptance:
- [ ] Logging an event with one press-drag-release takes < 1.5 s for a practiced user and requires no dialogs.
- [ ] Gesture runs at 60 fps (120 on ProMotion) with no JS-thread dependency during the drag (verified with the performance monitor).
- [ ] Event saved on release even when offline and with no dog assigned; timestamp and nearest fix (with fix age) recorded.
- [ ] Triggers and outcomes are never required; release in the dead zone after dwell saves the event without trigger.
- [ ] Behavior ring shows exactly Pulling, Reactivity, Resource Guarding, Fear / Anxiety, Aggression, Barking; all but Pulling offer an optional Dog / Human / Other slide-out by gesture and by tap.
- [ ] Choosing Other saves the event first, then shows "What triggered this behavior?"; the text is optional, skippable, stored on that event (with its time and GPS), and appears in history and shared reports.
- [ ] The word "Person" or "People" appears nowhere in the UI; "Human" is used.
- [ ] Lingering under 0.9 s never opens a nested ring; resting a thumb on the line between two options does not flip between them.
- [ ] Poop can be logged as Normal, Soft, or Runny in one gesture (hold on Poop) or in tap mode, and without a consistency; the report shows the consistency counts.
- [ ] VoiceOver and TalkBack users can log every event type through the list alternative.
- [ ] Markers appear on the active map immediately and on the report without any toggle; overlapping markers cluster and expand.
- [ ] Voice note recorded offline is saved immediately and transcribed later; no network AI service is called.
- [ ] Custom event created in Settings appears in the menu and in analytics.

## Phase 4: Profiles and reports

Scope: report card Training section (ideas from logged behavior plus manual entry), Dogs directory (contacts-style), dog form, clients, profile with walking overview and Walk Behavior section, behavior drill-down to focused walk map, report card, timeline, exports (image, PDF with optional appendix), share sheet, revocable share links with expiry and route trimming, web report viewer (Edge Function rendered), professional fields (classification, price, payment status, booking source).

Acceptance:
- [ ] Training cannot be logged from Quick Log; it is recorded on the report card, with ideas shown only when a matching behavior was logged, each idea showing which logged behavior produced it.
- [ ] Shared reports include recorded training and never include unrecorded ideas.
- [ ] Report contains every recorded event: automated test compares event counts in the DB to the rendered breakdown and marker count.
- [ ] Exported image and PDF include the route and all colored markers; nothing is written to device storage until the user taps Save or Share.
- [ ] Revoking a share link makes it return 404 within 60 s; expired links return 404; tokens are never stored in plaintext.
- [ ] Shared reports never include walks other than the shared one and trim the configured distance from each end.
- [ ] Missing trigger or outcome renders as blank, never inferred.
- [ ] Call button opens the dialer for client dogs with a phone number.

## Phase 5: Weather and analytics

Scope: weather Edge Function (WeatherKit + fallback adapter), weather queue, historical backfill, manual entry, heat estimate warning; calendar month/week/day with stats strip and dog filter; scheduled walks with reminders; behavior analytics with rates, trends, comparisons, weather breakdown; steps (HealthKit, Health Connect, estimate); Year in Review with distance comparisons and shareable cards.

Acceptance:
- [ ] Walk recorded offline obtains historical weather after reconnecting (`is_historical = true`) or shows "Weather unavailable" with manual entry.
- [ ] Heat warnings label pavement temperature as an estimate and display air temperature separately.
- [ ] Monthly stats match a SQL reference query on a fixture dataset (unit tested), including multi-dog walks counted once for walker totals.
- [ ] Analytics show exposure (walks, miles, hours) beside every rate and refuse comparisons below the minimum sample.
- [ ] Measured and estimated steps are labeled distinctly; dog steps always labeled as estimates.
- [ ] Year in Review numbers match the analytics engine for the same range (property test on generated data); distance comparisons are computed from stored city coordinates.

## Phase 6: Platform enhancements

Scope: widgets (small, medium, large; minimal and detailed presets; light/dark/reduced effects), Live Activity on iOS, ongoing walk notification on Android, reminder notifications, accessibility pass, performance pass (list virtualization, map marker batching, Skia layer caching), optional barometric elevation.

Acceptance:
- [ ] Widget Start Walk opens directly into a recording walk with zero further taps on both platforms.
- [ ] Live Activity / notification shows elapsed time and distance during a locked-screen walk.
- [ ] Accessibility audit (VoiceOver, TalkBack, Switch Control spot check) with no blocking issues.
- [ ] Cold start < 2 s on test devices; Dashboard scroll holds 60 fps in layered tier.

## Phase 7: Testing and release

Scope: field test matrix (urban canyon, park, poor signal, airplane mode, low battery mode, OEM battery saver), battery profiling, offline recovery tests, security and privacy review (RLS audit, storage policies, token handling, data export and deletion), App Store and Play listings, privacy nutrition labels and Data Safety form, location permission justifications, TestFlight and Play internal testing.

Acceptance: release checklist in `docs/09-release-checklist.md` (written in Phase 7) fully checked; zero open P0/P1 bugs; crash-free sessions ≥ 99.5% in beta.

## Test strategy summary

| Layer | Tooling | Examples |
|---|---|---|
| Domain | Jest | geo math, filters, state machine, stats, LWW, outbox coalescing, Year in Review math |
| Repositories | Jest + better-sqlite3 + Drizzle (same schema) | transactions, attribution rules, calendar queries |
| Components | React Native Testing Library | radial menu commit/cancel logic (geometry worklets tested as pure functions), report breakdown rendering |
| Backend | pgTAP (`supabase test db`), Deno tests for Edge Functions | RLS, `sync_push` idempotency, share token validation, retention job |
| E2E | Maestro on dev builds | start/end walk with mocked route, offline walk then sync, log event via tap mode |
| Field | Written protocol, real devices | background GPS, battery, OEM behavior |

Simulator or emulator success is never accepted as evidence of background GPS reliability.
