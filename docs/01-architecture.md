# 1. Architecture Proposal

Status: **Proposed, revision 2 (decisions from review applied)**
Date: 2026-11-19

## 1.1 Summary

Walkwise is a local-first React Native app. Everything a user does during a walk is written to an on-device SQLite database first, and the cloud (Supabase) is a sync target, backup, and sharing layer. The GPS engine runs in a native background task that writes directly to SQLite, so the UI can be killed, backgrounded, or offline without losing the walk.

```
┌────────────────────────────── Device ──────────────────────────────┐
│                                                                    │
│  Expo Router screens ──► Feature modules ──► Repositories (Drizzle)│
│        ▲                     │   ▲                 │               │
│        │ live queries        │   │                 ▼               │
│        └─────────────────────┘   │           SQLite (WAL)  ◄──┐    │
│                                  │                 ▲          │    │
│  Native background task (TaskManager + Location) ──┘          │    │
│  (headless JS: filter points, update totals, heartbeat)       │    │
│                                                               │    │
│  Sync engine: outbox ──push──►  ◄──pull── cursor              │    │
│  Weather queue, media upload queue, transcription queue ──────┘    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS (JWT)
┌──────────────────────────────▼───────── Supabase ──────────────────┐
│ Auth │ Postgres + PostGIS + RLS │ RPC: sync_push / sync_pull       │
│ Storage (private buckets) │ Edge Functions: weather, shared-report,│
│ export-data, delete-account │ pg_cron: retention, share expiry     │
└────────────────────────────────────────────────────────────────────┘
```

## 1.2 Verified stack (Expo SDK 58, checked against npm on 2026-11-19)

| Concern | Choice | Version | Notes |
|---|---|---|---|
| Runtime | Expo SDK 58, React Native 0.88, React 19.3 | `expo@58` | Development builds only (`expo-dev-client`). Expo Go cannot run the background task, Google Maps with custom keys, widgets, or glass. |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess` | | |
| Navigation | Expo Router | `~58.0` | File-based routes, typed routes, deep links for widgets and shared reports. |
| Animation | Reanimated 4 + Worklets | `4.7.x`, `worklets 0.13` | Pinned to the SDK's bundled versions. |
| Gestures | React Native Gesture Handler 3 | `~3.3` | Radial menu runs entirely on the UI thread. |
| Location | `expo-location` + `expo-task-manager` | `~58.0` | Verified: Android path with `foregroundService` does **not** require `ACCESS_BACKGROUND_LOCATION`, but must be started while the app is foregrounded. iOS needs the `location` background mode; uses `CLBackgroundActivitySession`. |
| Local DB | `expo-sqlite` + Drizzle ORM | `~58.0`, `drizzle-orm 0.45` | Drizzle migrations, typed queries, `useLiveQuery` for reactive UI. Same schema runs on `better-sqlite3` in Node tests. |
| Server state | TanStack Query 5 | `5.x` | Remote-only reads (auth session, shared-report status, weather on demand) and sync status. Local data is read from SQLite, not from Query caches. |
| Ephemeral UI state | Zustand | | Live walk HUD, radial menu interaction state, sheet state. |
| Backend | Supabase (Auth, Postgres 17 + PostGIS, Storage, Edge Functions, pg_cron) | `supabase-js 2.x` | |
| Maps | **Decided: Google Maps on both platforms** via `react-native-maps` with `PROVIDER_GOOGLE` | `1.29.11` (SDK 58 bundled) | Maps SDK for Android/iOS map loads are free and unlimited **when no Map ID is used**, so the pastel style is applied as a JSON `customMapStyle` (cloud styling with a Map ID is billed per load). Clustering with `supercluster` in JS, route as `Polyline`, markers as custom views with `tracksViewChanges` off after first render, export snapshots with `MapView.takeSnapshot`. Separate API keys per platform, restricted to the bundle id / SHA-1. |
| Weather | **Recommended: Apple WeatherKit REST via a Supabase Edge Function** (the free option, see 7.5) | | 500,000 calls/month included with the Apple Developer Program membership the App Store already requires. Current conditions, hourly history back to 2021, UV, gusts, apparent temperature, alerts where Apple has coverage. Works for Android users because the call is made by our server. Requires Apple Weather attribution in the UI. |
| Glass | `expo-glass-effect` (iOS 26+ native Liquid Glass), `expo-blur` (iOS < 26, Android 12+), `@shopify/react-native-skia` 2.x (highlights, rims, ambient light, lens effect on our own backgrounds) | | Three rendering tiers, see `05-liquid-glass.md`. |
| Charts | `victory-native` 43 (Skia based) | | Interactive line/bar charts with press-to-inspect, renders on the UI thread. |
| Audio | `expo-audio` | `~58.0` | Voice notes (AAC m4a). |
| Speech to text | `expo-speech-recognition` | `58.0` | On-device recognition on iOS and Android 13+; deferred transcription of saved files when offline recognition is unavailable. No AI service required. |
| Steps | iOS: `@kingstinct/react-native-healthkit` (and CoreMotion pedometer through `expo-sensors`); Android: `react-native-health-connect` | | Measured walker steps when authorized, labeled estimate otherwise. |
| Widgets / Live Activities | `expo-widgets` (iOS widgets + Live Activities, Android Glance widgets) + `expo-app-intents` | `~58.0` | See risk R3. Fallback: `@bacons/apple-targets` (Swift) and `react-native-android-widget`. |
| Export | `react-native-view-shot`, `expo-print` (PDF), `expo-sharing`, `expo-media-library` (only on explicit "Save to Photos") | | Nothing is written to the user's device without an explicit action. |
| Haptics | `expo-haptics` | | |
| Notifications | `expo-notifications` | | Scheduled walk reminders, recording-stopped alerts. |
| Testing | Jest (`jest-expo`), React Native Testing Library, `better-sqlite3` for repository tests, pgTAP via `supabase test db` for RLS, Maestro for E2E on dev builds | | |
| Builds | EAS Build (development, preview, production profiles), EAS Submit | | |

Rejected or deferred:

- **`react-native-background-geolocation` (Transistor)**: the most battle-tested tracker (motion detection, survives app termination on Android), but it is a paid license and the brief prefers Expo Location. We isolate tracking behind a `LocationSource` interface so it can be swapped in if Phase 7 field testing shows unacceptable gaps on aggressive Android OEMs.
- **PowerSync**: a credible managed alternative to a hand-written sync engine. Our data is mostly append-only and single-writer, so a custom outbox is simpler and avoids another vendor. Revisit only if multi-device editing becomes a core requirement.
- **Mapbox / MapLibre**: stronger styling and offline packs, but you chose Google Maps. Trade-off accepted: Google's mobile SDK has no downloadable offline areas (see risk R10).
- **`expo-maps`**: uses Apple Maps on iOS, which conflicts with the Google Maps decision.

## 1.3 Project structure

```
walkwise/
├─ app/                          Expo Router routes. Thin: compose feature screens, no business logic.
│  ├─ _layout.tsx                Providers, DB migration gate, theme, sync bootstrap, deep-link handling
│  ├─ (tabs)/                    Floating glass tab bar
│  │  ├─ index.tsx               Dashboard
│  │  ├─ calendar.tsx
│  │  ├─ dogs/index.tsx          Dogs directory
│  │  └─ insights/index.tsx      Behavior analytics hub
│  ├─ walk/active.tsx            Active Walk (full-screen modal)
│  ├─ walk/[walkId]/index.tsx    Walk Summary and Report Card
│  ├─ walk/[walkId]/assign.tsx   Assign dogs sheet
│  ├─ walk/start.tsx             Deep-link target for widgets: starts recording, redirects to active
│  ├─ dogs/[dogId]/index.tsx     Dog profile
│  ├─ dogs/[dogId]/behavior/[eventTypeId].tsx
│  ├─ insights/[eventTypeId].tsx Behavior detail analytics
│  ├─ review/[year].tsx          Year in Review
│  ├─ schedule/[id].tsx
│  └─ settings/...               Settings stack
├─ src/
│  ├─ domain/                    Pure TypeScript, zero React Native imports. 100% unit tested.
│  │  ├─ geo/                    haversine, point filtering, distance, pace, elevation smoothing, clustering
│  │  ├─ walk/                   walk session state machine, totals, gap detection
│  │  ├─ events/                 event taxonomy, defaults, attribution rules
│  │  ├─ stats/                  rates, normalization, trend buckets, weather bucketing, double-count rules
│  │  ├─ steps/                  stride models, estimate labeling
│  │  ├─ review/                 Year in Review aggregations, distance comparisons dataset
│  │  └─ sync/                   merge rules (LWW, monotonic status), outbox coalescing
│  ├─ data/
│  │  ├─ local/                  Drizzle schema, migrations, repositories, seed (system taxonomy)
│  │  ├─ remote/                 Supabase client, generated DB types, RPC wrappers
│  │  └─ sync/                   outbox processor, push, pull, media uploader, scheduler
│  ├─ services/                  Platform adapters behind interfaces
│  │  ├─ location/               LocationSource (expo-location impl), permission flow
│  │  ├─ weather/                WeatherProvider (edge function client), request queue
│  │  ├─ health/                 StepSource (HealthKit, Health Connect, estimate)
│  │  ├─ media/                  photo capture, voice recording, transcription queue
│  │  ├─ notifications/
│  │  └─ widgets/                widget/Live Activity state publisher
│  ├─ background/
│  │  └─ locationTask.ts         TaskManager.defineTask, imported from the entry file
│  ├─ design/                    Tokens, theme provider, glass primitives, typography, motion, icons
│  ├─ components/                Shared composed components (StatTile, DogAvatar, EventMarker, ...)
│  └─ features/                  walk, quicklog, map, report, dogs, calendar, analytics, review, pro, settings
├─ supabase/
│  ├─ migrations/                SQL migrations (schema, RLS, RPCs, triggers)
│  ├─ functions/                 weather, shared-report, export-data, delete-account
│  ├─ tests/                     pgTAP RLS and RPC tests
│  └─ seed.sql
├─ widgets/                      expo-widgets definitions (iOS + Android)
├─ e2e/                          Maestro flows
└─ docs/
```

Dependency rule (enforced with `eslint-plugin-boundaries`): `domain` imports nothing; `data` imports `domain`; `services` imports `domain`; `features` imports `data`, `services`, `design`, `components`, `domain`; `app` imports `features`. The background task imports only `domain`, `data/local`, and `services/location`, which keeps the headless bundle small and free of UI code.

## 1.4 Key architectural decisions

1. **SQLite is the source of truth on device.** Screens read with Drizzle live queries. No screen waits on the network to show user data.
2. **Client-generated UUIDv7 primary keys** for every user-created row. They are time-ordered (good index locality) and make every upload idempotent.
3. **The background task owns recording.** It persists each location batch, updates running totals on the walk row, and writes a heartbeat. The UI is a viewer of that state, never the owner.
4. **Walk session is an explicit state machine** in `domain/walk` (`idle → recording ⇄ paused → finalizing → completed`, plus `interrupted`). Every transition is persisted before it takes effect.
5. **Events are saved on gesture release.** No confirmation dialogs. Details are editable afterwards.
6. **Event attribution is explicit.** Each event stores the dogs it applies to (`event_dogs`). Events logged before any dog is assigned are attributed when dogs are first assigned, never silently.
7. **Analytics compute locally** with SQL over SQLite, so they work offline and never depend on server-only data. Server RPCs mirror the same definitions for the web report viewer.
8. **No invented data.** Missing weather is shown as missing. Estimated values carry a `source` and are labeled in the UI.
9. **Privacy by default.** All storage buckets are private, routes are only shared through revocable, expiring tokens, and shared reports can trim the start and end of a route (see Q5).

## 1.5 Authentication model

- **Decided: an account is required.** Supabase Auth with Sign in with Apple, Google, and email (magic link or code). Apple requires Sign in with Apple whenever another social login is offered.
- First launch needs a connection to sign in. After that, the session is cached and the app works fully offline: walks, logging, history. An expired access token never blocks local work; it only pauses sync until a refresh succeeds.
- All photos (dog photos, walk photos), voice notes, and exported report images and PDFs are backed up automatically to private Supabase Storage, so they survive a lost or replaced phone. Backup can be limited to Wi-Fi in Settings.
- Session tokens stored in `expo-secure-store`. Refresh handled by supabase-js with an AppState listener.
