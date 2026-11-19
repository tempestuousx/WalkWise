# 4. Background GPS and Offline Synchronization

## 4.1 Recording pipeline

```
 CLLocationManager / FusedLocationProvider
            │  batches of locations
            ▼
 TaskManager task "walkwise-location" (headless JS, defined at module scope in the entry file)
   1. read active_session (walk id, state, last accepted point)
   2. if state != recording: store points as accepted=false, stop
   3. filter each point (domain/geo/filter.ts)
   4. append to gps_points with monotonically increasing seq
   5. update running distance / moving time on walks + active_session in ONE transaction
   6. write heartbeat (last_point_at, last_accuracy)
   7. publish lightweight HUD snapshot (Live Activity / widget state) at most every 15 s
            │
            ▼
 SQLite (WAL) ──live query──► Active Walk UI (when foregrounded)
```

The UI never computes distance. It renders what the task persisted, so a UI crash, navigation, or backgrounding cannot corrupt the walk.

### Location configuration

| Option | Value | Why |
|---|---|---|
| `accuracy` | `Location.Accuracy.High` (BestForNavigation only in "precision mode") | Good walking accuracy with far less drain than navigation mode |
| `distanceInterval` | 5 m (10 m in battery saver) | Dense enough for sidewalks and event placement |
| `timeInterval` (Android) | 3000 ms | Upper bound on sampling |
| `activityType` (iOS) | `Fitness` | Tells iOS this is pedestrian activity |
| `pausesUpdatesAutomatically` (iOS) | `false` | iOS auto-pause stops tracking at intersections and does not reliably resume |
| `showsBackgroundLocationIndicator` (iOS) | `true` | Required to keep When-In-Use background updates; honest to the user |
| `foregroundService` (Android) | title "Recording walk", body with start time, `killServiceOnDestroy: false` | Keeps the process alive; does **not** require background location permission (verified in expo-location 58 source) |
| `deferredUpdatesInterval` | unset | We want points promptly for event placement |

### Permissions strategy

- iOS: request When In Use only. With the `location` background mode and the background indicator, updates continue when the screen locks. We do not request Always, which keeps App Review simple. `NSLocationWhenInUseUsageDescription` text explains route recording.
- Android: `ACCESS_FINE_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS` (13+). We do **not** declare `ACCESS_BACKGROUND_LOCATION`, which avoids Google Play's background location declaration and review video. Consequence: recording can only start while the app is in the foreground (widgets therefore open the app).
- Approximate location granted: recording still runs but the HUD shows "Precise location is off: routes will be approximate" with a link to settings.
- A pre-permission glass explainer screen precedes every OS prompt.

### Point filtering (pure, unit tested)

1. Reject `horizontal_accuracy_m > 35` (configurable). Rejected points are stored with `accepted = false` for diagnostics but excluded from distance and the route.
2. Reject points older than the previous accepted point (out of order batches).
3. Reject implied speed > 6.5 m/s from the last accepted point (faster than a sprint with a dog; catches GPS jumps).
4. Jitter suppression: if displacement < max(3 m, 0.5 × combined accuracy), do not add distance (standing at a lamppost should not accumulate distance).
5. Distance = sum of haversine between consecutive accepted points outside pause and gap intervals.
6. On finalize, distance is recomputed from all stored points with the same function (deterministic, idempotent), and the server can verify with `ST_Length(route)`.

Elevation: raw GPS altitude is too noisy for gain. We compute gain only when vertical accuracy < 10 m, with hysteresis smoothing (3 m threshold), and label it approximate. Barometric altitude (iOS `CMAltimeter`) is a Phase 6 enhancement.

### Interruption handling

| Situation | Detection | Behavior |
|---|---|---|
| Weak GPS | accuracy > 35 m for 20 s | Status pill: "Weak GPS" (amber) |
| No points | heartbeat older than 60 s while recording | Pill: "No GPS signal". When points resume, a `system_gap` interval is recorded and shown in the report |
| Location services disabled / permission revoked | `hasServicesEnabledAsync`, permission check on AppState change | Local notification "Walk recording paused: location is off"; walk moves to paused with a system gap |
| App terminated by OS or force quit | On launch: `active_session.state == recording` and `TaskManager.isTaskRegisteredAsync` false, or last heartbeat stale | Recovery banner: Resume (continue same walk, gap recorded) or Finish (end at last point). Never auto-discarded |
| Android OEM battery killers | Heartbeat gaps while process alive | Settings > Recording reliability: battery optimization check and OEM-specific guidance |
| Device reboot mid-walk | Same as termination | Same recovery banner |

What we will not claim: tracking after a force quit, or after the OS kills the app. The UI says so in the permission explainer and help.

## 4.2 Walk session state machine

```
            start()                    pause()
  idle ───────────────► recording ◄──────────► paused
                           │   ▲      resume()     │
              OS kill /    │   │ resume()          │ end()
              no task      ▼   │                   ▼
                       interrupted ──finish()──► finalizing ──► completed
                                                     │
                                       no dogs ──► completed (unassigned, prompt on Dashboard)
```

Every transition is persisted in SQLite first, then the side effect runs (start or stop location updates, notifications). `start()` creates the walk row, then calls `startLocationUpdatesAsync`; if that fails the walk is marked failed-to-start and removed, and the user sees why (for example, permission denied). Starting a walk never waits for the network, weather, or dog selection.

## 4.3 Offline-first sync

### Write path

Every repository mutation runs in one SQLite transaction: write the row with `sync_state = pending`, then upsert a coalesced `sync_outbox` entry for `(entity, entity_id)`. GPS points are not added to the outbox individually; the outbox holds a single `walk_points` entry per walk whose payload is computed at push time (points with `seq > last_pushed_seq`).

### Push

- Trigger: connectivity regained (NetInfo), app foregrounded, walk finalized, every 15 minutes via `expo-background-task` when pending items exist, and manual "Sync now".
- Order respects foreign keys: profiles/preferences → taxonomy (custom) → clients → dogs → walks → intervals → participants → gps_points (chunks of 500) → events → event_dogs → weather → media metadata → scheduled walks → report metadata. Media binaries upload last, resumable (TUS), Wi-Fi only if the user chooses.
- Transport: one Postgres RPC, `sync_push(device_id, mutations jsonb)`, running as the calling user (RLS applies). For each mutation it checks `sync_operations` for the mutation id (replay = no-op), applies last-writer-wins by `client_updated_at` (ties broken by device id), records the result, and returns per-item status.
- Retries: exponential backoff with jitter (2 s to 30 min). Items rejected for validation are kept, surfaced in Settings > Sync issues, and never silently dropped.
- Duplicate prevention: client ids plus the idempotency ledger mean a retried batch, a crash mid-push, or two simultaneous sync triggers cannot create duplicate walks, events, or points. A per-process mutex prevents concurrent push loops.

### Pull

`sync_pull(cursor)` returns changed rows across tables with `server_version > cursor`, paged by 1,000. GPS points are pulled lazily per walk when a route is first opened on a device that did not record it. Incoming rows apply LWW against local rows that are still pending.

### Conflict rules (pure functions in `domain/sync`)

| Data | Rule |
|---|---|
| Most rows | Last writer wins per row on `client_updated_at` |
| Walk status | Monotonic: `completed` never reverts to `recording`; `interrupted → completed` allowed |
| Walk totals while recording | Only `recording_device_id` may change them |
| GPS points | Append-only, no conflicts |
| Participants, event_dogs | Set semantics keyed by composite id; deletes are tombstones |
| Deleted vs edited | Delete wins if its timestamp is newer; otherwise the edit resurrects the row (rare, logged) |

### Weather retrieval

- At start and end of a walk, and every 20 minutes during it, the app enqueues a `weather_request(lat, lng, at, phase)`.
- If online and `at` is within 30 minutes, the weather Edge Function returns current conditions; otherwise it requests WeatherKit hourly data for the hour containing `at` (`is_historical = true`).
- The request queue is processed with sync. After 5 failures over 48 hours the walk's `weather_status` becomes `unavailable` and the report offers manual entry. The app never fabricates weather.

### Auth and sync

An account is required, so every local row is written with the signed-in user's id from the start; there is no anonymous mode to migrate. Sign-in happens once with a connection; afterwards the cached session lets the app work offline indefinitely, and sync resumes once the token refreshes. Signing out first pushes pending changes (or warns how many are unsynced), then wipes local data and cached media for privacy.

### Media backup

Dog photos, walk photos, voice notes, and exported report images/PDFs are uploaded to private buckets (`dog-photos`, `walk-media`, `report-exports`) through the resumable upload queue. The local file is kept as a cache; if it is missing (new phone, cleared cache) it is re-downloaded through a short-lived signed URL. Upload over cellular is allowed by default and can be limited to Wi-Fi.
