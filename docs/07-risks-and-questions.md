# 7. Technical Risks and Open Questions

## 7.1 Major risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | **Android background GPS killed by OEM power management** (Samsung, Xiaomi, OnePlus, etc.) despite the foreground service | Medium / High | Foreground service with location type; heartbeat gap detection and honest "recording gap" reporting; battery optimization guidance screen; `LocationSource` abstraction so a hardened tracker (Transistor background-geolocation, paid) can be swapped in if Phase 7 field tests fail |
| R2 | **iOS terminates the app** under memory pressure during long walks with heavy map rendering | Low to medium / High | Recording lives in the location task, not the UI; map is unmounted when backgrounded; memory budget tests; recovery banner on relaunch. Tracking after termination is not promised |
| R3 | **Widgets**: `expo-widgets` is new (iOS widgets and Live Activities via Expo UI, Android via Glance) and its Android surface is still evolving. Widgets cannot start GPS directly: Android forbids starting a location foreground service from the background without background location permission, and iOS requires the app to start updates | Medium / Medium | Widgets deep link into `walk/start`, which starts recording on open (shortest compliant flow). Fallback implementation path: Swift WidgetKit target via `@bacons/apple-targets` and `react-native-android-widget` |
| R4 | **Weather history and licensing**: WeatherKit requires an Apple Developer Program membership, attribution (Apple Weather mark and legal link), and has a monthly call allowance; alerts coverage varies by country. Open-Meteo requires a commercial plan for a paid app | Medium / Medium | Provider adapter interface; server-side proxy keeps keys off devices and caches by (rounded location, hour); one call per walk phase; graceful "Weather unavailable" with manual entry |
| R5 | **Native liquid glass only exists on iOS 26+**. Android and older iOS get a layered approximation; blur over a native map view is limited on Android | Certain / Medium | Three-tier system; on Android the map HUD uses the higher-opacity `outdoor` material (which is also better in sunlight); Mapbox TextureView mode; we never claim physical refraction |
| R6 | **Glass legibility in direct sunlight** | High / High | `outdoor` legibility mode on Active Walk by default, 7:1 contrast for live metrics, sunlight map style, solid tier one tap away |
| R7 | **Custom sync engine correctness** | Medium / High | Append-only data where possible, client UUIDs, idempotency ledger, pure merge functions with property-based tests, server row-count verification in E2E |
| R8 | **Radial gesture conflicts** with map panning and OS edge gestures (iOS home indicator, Android back gesture) | Medium / Medium | Gesture Handler exclusive activation after 180 ms hold; Quick Log placed ≥ 24 pt from the bottom edge; `systemGestureExclusionRects` on Android for the menu area while open |
| R9 | **App Store / Play location review** | Low / Medium | When In Use on iOS, no background location permission on Android, clear purpose strings, in-app explainer |
| R10 | **Mapbox cost** at scale (mobile MAU pricing) | Low now / Medium later | Map abstraction kept thin; MapLibre migration path |
| R11 | **On-device speech recognition availability** varies (Android < 13 and some languages need network) | Medium / Low | Voice note audio is always saved first; transcription deferred or skipped; event saved regardless |
| R12 | **Step data**: Android has no reliable historical pedometer without Health Connect; Health Connect permission UX is heavy | Medium / Low | Optional connection; labeled estimates otherwise |

## 7.2 Interaction change flagged per the brief

The brief describes a cascading menu where the user can continue from event into a trigger submenu in one gesture. A third concentric ring would extend past the screen edges on most phones, so the proposal uses **dwell-to-deepen**: hold still on an event for 350 ms and the trigger ring replaces the event ring in the same position. It remains one continuous gesture. Details in `02-screen-map.md`.

## 7.3 Items proposed that go slightly beyond the brief (need your approval)

1. **Route trimming on shared reports** (default 150 m from start and end) so owners' links do not reveal the walker's home. Directly supports the privacy section; can be turned off per link.
2. **Logging coverage metric and "logged walks only" toggle** in analytics, to satisfy the statistical safeguards.
3. **Press-and-hold End Walk** instead of a confirmation dialog.

## 7.4 Open questions

See the summary in the conversation. Defaults are listed so work can proceed if you agree with them.
