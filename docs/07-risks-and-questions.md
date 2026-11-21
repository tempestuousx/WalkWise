# 7. Technical Risks and Open Questions

## 7.1 Major risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | **Android background GPS killed by OEM power management** (Samsung, Xiaomi, OnePlus, etc.) despite the foreground service | Medium / High | Foreground service with location type; heartbeat gap detection and honest "recording gap" reporting; battery optimization guidance screen; `LocationSource` abstraction so a hardened tracker (Transistor background-geolocation, paid) can be swapped in if Phase 7 field tests fail |
| R2 | **iOS terminates the app** under memory pressure during long walks with heavy map rendering | Low to medium / High | Recording lives in the location task, not the UI; map is unmounted when backgrounded; memory budget tests; recovery banner on relaunch. Tracking after termination is not promised |
| R3 | **Widgets**: `expo-widgets` is new (iOS widgets and Live Activities via Expo UI, Android via Glance) and its Android surface is still evolving. Widgets cannot start GPS directly: Android forbids starting a location foreground service from the background without background location permission, and iOS requires the app to start updates | Medium / Medium | Widgets deep link into `walk/start`, which starts recording on open (shortest compliant flow). Fallback implementation path: Swift WidgetKit target via `@bacons/apple-targets` and `react-native-android-widget` |
| R4 | **Weather history and licensing**: WeatherKit requires an Apple Developer Program membership, attribution (Apple Weather mark and legal link), and has a monthly call allowance; alerts coverage varies by country. Open-Meteo requires a commercial plan for a paid app | Medium / Medium | Provider adapter interface; server-side proxy keeps keys off devices and caches by (rounded location, hour); one call per walk phase; graceful "Weather unavailable" with manual entry |
| R5 | **Native liquid glass only exists on iOS 26+**. Android and older iOS get a layered approximation; blur over a native map view is limited on Android | Certain / Medium | Three-tier system; on Android the map HUD uses the higher-opacity `outdoor` material (which is also better in sunlight); we never claim physical refraction |
| R6 | **Glass legibility in direct sunlight** | High / High | `outdoor` legibility mode on Active Walk by default, 7:1 contrast for live metrics, sunlight map style, solid tier one tap away |
| R7 | **Custom sync engine correctness** | Medium / High | Append-only data where possible, client UUIDs, idempotency ledger, pure merge functions with property-based tests, server row-count verification in E2E |
| R8 | **Radial gesture conflicts** with map panning and OS edge gestures (iOS home indicator, Android back gesture) | Medium / Medium | Gesture Handler exclusive activation after 180 ms hold; Quick Log placed ≥ 24 pt from the bottom edge; `systemGestureExclusionRects` on Android for the menu area while open |
| R9 | **App Store / Play location review** | Low / Medium | When In Use on iOS, no background location permission on Android, clear purpose strings, in-app explainer |
| R10 | **Google Maps offline basemap**: the mobile SDK only caches tiles for areas already viewed; there are no downloadable offline regions. Also, using a cloud Map ID switches map loads from free to billed | Medium / Low | Recording, route, and markers never depend on tiles: offline, the route and markers still draw over whatever tiles are cached (or a plain background). Style via JSON `customMapStyle`, never a Map ID. Thin `MapView` wrapper keeps a provider swap possible |
| R11 | **On-device speech recognition availability** varies (Android < 13 and some languages need network) | Medium / Low | Voice note audio is always saved first; transcription deferred or skipped; event saved regardless |
| R12 | **Step data**: Android has no reliable historical pedometer without Health Connect; Health Connect permission UX is heavy | Medium / Low | Optional connection; labeled estimates otherwise |

## 7.2 Interaction change flagged per the brief

The brief describes a cascading menu where the user can continue from event into a trigger submenu in one gesture. A third concentric ring would extend past the screen edges on most phones, so the proposal uses **dwell-to-deepen**: hold still on an event for 350 ms and the trigger ring replaces the event ring in the same position. It remains one continuous gesture. Details in `02-screen-map.md`.

## 7.3 Items proposed that go slightly beyond the brief (need your approval)

1. **Route trimming on shared reports** (default 150 m from start and end) so owners' links do not reveal the walker's home. Directly supports the privacy section; can be turned off per link.
2. **Logging coverage metric and "logged walks only" toggle** in analytics, to satisfy the statistical safeguards.
3. **Press-and-hold End Walk** instead of a confirmation dialog.

## 7.4 Decisions log

| # | Question | Decision |
|---|---|---|
| Q1 | Visual references | Two glass references and the Wag profile screenshot received; applied in `05-liquid-glass.md` 5.0 and the Dog Profile blueprint. More screenshots may follow |
| Q2 | Map provider | **Google Maps** on both platforms (`react-native-maps`, JSON styling, no Map ID) |
| Q3 | Weather provider | Pending: WeatherKit recommended as the free option (7.5) |
| Q4 | Accounts | **Account required**; offline use after first sign-in |
| Q5 | Owner sharing | **Image, PDF, and expiring web links**; all photos, voice notes, and exports backed up to cloud storage |
| Q6 | Minimum OS | Default assumed: iOS 17+, Android 10+ (API 29) |
| Q9 | Behavior logging and assessment update | Beginner / Professional modes (existing users stay Professional), always-visible Timed Log, behavior episodes with suggested grouping, optional post-walk "Understand My Dog" review with education, and episode-aware analytics. See doc 08 |
| Q8 | Behavior logging update | Behaviors are exactly Pulling, Reactivity, Resource Guarding, Fear / Anxiety, Aggression, Barking. Slide-out Dog / Human / Other on all but Pulling, always optional. Other prompts "What triggered this behavior?" after logging (optional). "Human" replaces Person/People everywhere |
| Q7 | Quick Log changes from preview review | Poop gets a Consistency ring (Normal, Soft, Runny); Sniffing removed; nested rings open by pushing out or a 0.9 s hold; **Training removed from Quick Log and moved to the report card** with ideas based on logged behavior plus manual entry |

## 7.5 Weather: the free options compared

| Provider | Cost | Commercial use | History | Alerts | UV, gusts, feels-like | Coverage |
|---|---|---|---|---|---|---|
| **Apple WeatherKit (REST)** | 500,000 calls/month included with the Apple Developer Program ($99/yr, already required to publish on the App Store). Paid tiers start at 1M calls for $49.99/month | Yes | Hourly back to Aug 2021 | Yes, where Apple has coverage | Yes | Global; Android users served through our server |
| Open-Meteo (free API) | Free under 10,000 calls/day | **No**: free API is non-commercial only; a published app store product needs the paid plan | Yes (archive) | No | Yes | Global |
| US National Weather Service | Free, public domain | Yes | About 7 days of station observations | Yes (US) | No UV | US only |

Recommendation: **WeatherKit**. Budget: about 4 calls per walk (start, one periodic, end, plus a retry), reduced further by caching per rounded location and hour on the server, so 500,000 calls covers roughly 125,000 walks a month before any paid tier. The UI must show the Apple Weather attribution mark and legal link wherever weather appears.
