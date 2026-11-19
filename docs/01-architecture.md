# 1. Architecture Proposal

Status: **Proposed, awaiting approval**
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
| Runtime | Expo SDK 58, React Native 0.88, React 19.3 | `expo@58` | Development builds only (`expo-dev-client`). Expo Go cannot run the background task, Mapbox, widgets, or glass. |
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess` | | |
| Navigation | Expo Router | `~58.0` | File-based routes, typed routes, deep links for widgets and shared reports. |
| Animation | Reanimated 4 + Worklets | `4.7.x`, `worklets 0.13` | Pinned to the SDK's bundled versions. |
| Gestures | React Native Gesture Handler 3 | `~3.3` | Radial menu runs entirely on the UI thread. |
| Location | `expo-location` + `expo-task-manager` | `~58.0` | Verified: Android path with `foregroundService` does **not** require `ACCESS_BACKGROUND_LOCATION`, but must be started while the app is foregrounded. iOS needs the `location` background mode; uses `CLBackgroundActivitySession`. |
| Local DB | `expo-sqlite` + Drizzle ORM | `~58.0`, `drizzle-orm 0.45` | Drizzle migrations, typed queries, `useLiveQuery` for reactive UI. Same schema runs on `better-sqlite3` in Node tests. |
| Server state | TanStack Query 5 | `5.x` | Remote-only reads (auth session, shared-report status, weather on demand) and sync status. Local data is read from SQLite, not from Query caches. |
| Ephemeral UI state | Zustand | | Live walk HUD, radial menu interaction state, sheet state. |
| Backend | Supabase (Auth, Postgres 17 + PostGIS, Storage, Edge Functions, pg_cron) | `supabase-js 2.x` | |
| Maps | **Recommended: Mapbox (`@rnmapbox/maps` 10.x)** | `10.3` | Custom pastel map style that matches the glass language, native GeoJSON clustering, offline tile packs, `takeSnap` for exports, TextureView mode on Android so glass can sit over it. Alternative: MapLibre with a commercial tile host. See open question Q2. |
| Weather | **Recommended: Apple WeatherKit REST via a Supabase Edge Function** | | Current conditions, hourly history back to 2021, UV, gusts, apparent temperature, and alerts where Apple has coverage. Works on Android because it is a REST call from our server. Fallback adapter: Open-Meteo (commercial plan required for a paid app). See Q3. |
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
- **`react-native-maps` / `expo-maps`**: fewer styling controls and no first-class offline packs. Viable if the Mapbox cost is unacceptable.

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

- Supabase Auth with Sign in with Apple, Google, and email magic link.
- Recommended (Q4): the app is fully usable before sign-in. Data lives locally under a provisional local user id; on first sign-in it is re-keyed to the auth user and uploaded. Sharing reports, backup, and multi-device require an account.
- Session tokens stored in `expo-secure-store`. Refresh handled by supabase-js with an AppState listener.
