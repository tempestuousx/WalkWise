# 5. Liquid Glass Design System for React Native

## 5.1 Honest capability statement

| Platform | What is genuinely native | What we approximate |
|---|---|---|
| iOS 26+ | Apple Liquid Glass (`UIGlassEffect`) through `expo-glass-effect` `GlassView` / `GlassContainer`: real lensing, specular response, morphing between nearby glass shapes | Nothing for standard surfaces. We add ambient lighting behind glass, not on it |
| iOS 17 to 25 | `UIVisualEffectView` blur via `expo-blur` | Specular rims, internal highlights, inner shadow, edge lensing (Skia) |
| Android 12+ | Real backdrop blur via `expo-blur` (stable since SDK 55, RenderEffect based) | Same Skia layers as above |
| Android < 12, low-end devices | No real-time blur | Frosted fill without blur (Tier 3) |

Skia cannot sample pixels drawn by native views (the map, the camera). Lens-style refraction is therefore only rendered where the backdrop is our own Skia-drawn ambient background (Dashboard, Year in Review, Insights hero). Over the map we use native blur plus highlights. We do not describe any of this as physically accurate refraction.

## 5.2 Rendering tiers

`useGlassTier()` resolves once per session and on accessibility changes:

```
tier = 'native'   if iOS >= 26 and not reduceTransparency and not lightweight
tier = 'layered'  if (iOS < 26 or Android API >= 31) and not reduceTransparency and not lightweight and device not low-end
tier = 'solid'    otherwise
```

Low-end heuristic: Android with < 4 GB RAM or a measured frame budget miss on the first-launch micro benchmark (renders 6 blurred cards for 1 s; > 10% dropped frames selects `solid`, the user can override).

## 5.3 Anatomy of a layered glass surface (Tier "layered")

Bottom to top:

1. **Contact shadow**: soft, low-opacity, tinted toward the background hue (not grey), offset y = 6 to 18 by elevation.
2. **Backdrop blur**: `BlurView` intensity 30 to 60 (scaled by Glass intensity setting).
3. **Material body**: milky fill. Light `rgba(255,255,255,0.38)`, dark `rgba(26,32,42,0.52)`.
4. **Body gradient**: vertical, 6% brighter at top, gives thickness.
5. **Top highlight band**: elliptical radial gradient across the top 40%, 18% white, suggests a curved top surface.
6. **Specular rim**: 1.25 px Skia stroke on the rounded rect path with a sweep gradient: bright (90% white) at top-left, fading to 10% along the bottom-right. Rotates slightly with device tilt when motion is allowed (Reanimated sensor, capped at 6°).
7. **Inner edge shadow**: 8 px inner blur along the bottom edge at 6% charcoal, sells the "thick glass" depth.
8. **Edge lensing (hero elements only, Skia backdrops only)**: runtime shader that samples the backdrop with a displacement proportional to the rounded-rect signed distance near the edge (outer 12 px), producing the bent-light rim seen in the references.
9. **Grain**: static 2% noise texture to prevent gradient banding on OLED.

Tier "native" uses `GlassView` (`glassEffectStyle: 'regular'` for cards, `'clear'` over imagery, `isInteractive` for pressable controls, tint from tokens) and skips our layers 3 to 8.

Tier "solid": opaque milky fill (96% white light, 92% charcoal dark), 1 px hairline border, contact shadow. Fully legible, no blur.

## 5.4 Tokens

```ts
// src/design/tokens.ts (excerpt)
color.light = {
  bgBase: '#EEF2F6',
  ambient: { sky: '#BCD8F3', aqua: '#BDE5DF', blush: '#F2D2DA', lavender: '#D9D3F1', silver: '#D6DDE6' },
  textPrimary: '#1B2028',    // charcoal, >= 12:1 on bgBase
  textSecondary: '#454E5C',  // >= 7:1 on glass body over bgBase
  textTertiary: '#5F6877',   // >= 4.5:1, captions only
  accent: '#2867B8',         // Start Walk, primary actions; white text 5.6:1
  danger: '#C2413A',         // End Walk hold ring, recording dot
  category: { nature: '#2E8B57', behavior: '#D9682A', training: '#2F6FD0', custom: '#8458CC' },
}
color.dark = {
  bgBase: '#0C1016',
  ambient: { sky: '#1D3A5C', aqua: '#1A4643', blush: '#4A2B35', lavender: '#332C52', silver: '#2A3039' },
  textPrimary: '#F3F6F9', textSecondary: '#C3CAD4', textTertiary: '#9AA3B0',
  accent: '#6FA8F0', danger: '#FF6B62',
  category: { nature: '#5CC68C', behavior: '#F29554', training: '#6FA0F2', custom: '#B394F0' },
}
radius = { pill: 999, card: 28, sheet: 34, orb: 999, control: 20 }
space  = 4-point scale: 4, 8, 12, 16, 20, 24, 32, 40, 56
elevation = { 1: card, 2: floating control, 3: radial menu / sheets }
```

Purple is limited to the Custom category accent and a faint ambient lavender, never used for primary UI.

Category markers use **shape plus color** so they work for color-blind users and in sunlight glare: Nature = circle, Behavior = rounded triangle, Training = rounded square, Custom = diamond. Each marker has a white 2 px halo for contrast on any map tile. Measured contrast of light-theme category colors against that halo: Nature 4.25, Behavior 3.52, Training 4.88, Custom 4.94 (WCAG non-text minimum is 3:1). Category colors are never used for body text.

Typography: platform system fonts (SF Pro / Roboto) to honor Dynamic Type and font scaling; SF Pro Rounded / Roboto Flex rounded axis for display numerals. All live metrics use tabular numerals. Text scales to 200%; layouts reflow rather than truncate metrics.

Map style: custom Mapbox style with desaturated pastel land, soft aqua water, silver roads, reduced labels, so glass HUD and colored markers carry the visual weight. A separate high-contrast "Sunlight" map style is selected automatically when screen brightness is at maximum (and via setting).

## 5.5 Motion tokens

| Token | Spec | Used for |
|---|---|---|
| `press` | scale to 0.96, spring damping 18, stiffness 420, mass 0.6 | All pressables |
| `panel` | spring damping 22, stiffness 220 | Card expansion, sheets |
| `radialOpen` | spring damping 16, stiffness 320; items stagger 18 ms | Quick Log rings |
| `morph` | `GlassContainer` merge on iOS 26; shared-value path interpolation elsewhere | Start Walk orb to live pill |
| `ambientDrift` | 40 s loop, ±6% position | Background light blobs |

Reduce Motion (OS or setting): springs replaced with 120 ms opacity fades, no parallax, no ambient drift, radial rings appear without scale. Haptics remain (they are feedback, not motion) unless disabled.

## 5.6 Component specifications

| Component | Purpose | Key props | Notes |
|---|---|---|---|
| `GlassSurface` | Primitive for every glass shape | `variant: 'card' \| 'pill' \| 'orb' \| 'bar' \| 'sheet'`, `elevation`, `tint`, `interactive`, `legibility: 'standard' \| 'outdoor'` | Chooses tier; `outdoor` raises body opacity to 0.72 and text weight one step |
| `AmbientBackground` | Soft pastel light field | `palette`, `animated` | Skia canvas; one per screen |
| `GlassButton` | Pressable glass | `size`, `icon`, `label`, `haptic` | Min target 48 × 48 dp, 56 on Active Walk |
| `HoldButton` | Press-and-hold confirm (End Walk) | `holdMs`, `onComplete` | Progress ring, accessible as a normal button with a confirm action |
| `StartWalkOrb` | Dashboard hero | `state: 'idle' \| 'recording'` | Morphs into `LiveWalkPill` |
| `FloatingTabBar` | Primary navigation | | Glass bar with center orb slot, hides on scroll down on long lists |
| `MetricTile` | Big number + unit + label | `value`, `unit`, `estimate` | Shows "est." badge when value is an estimate |
| `DogAvatar`, `DogChipRow` | Photos with names | | Fallback monogram |
| `EventMarker` | Map marker | `category`, `selected`, `count` | Shape + color; cluster bubble shows count |
| `RadialMenu` | Quick Log | `config`, `onCommit`, `onCancel`, `mode` | Geometry and hit testing as worklets; see screen map |
| `GlassSheet` | Bottom sheets | `detents` | Native form sheet with glass background |
| `GlassToast` | Non-blocking confirmations | `actions` | Auto-dismiss 6 s, announced to screen readers |
| `StatStrip` | Calendar and dashboard stats | `items` | Horizontally scrollable at large text sizes |
| `ChartCard` | Victory Native charts in glass | `series`, `onSelect` | Accessible data table alternative |
| `StoryCard` | Year in Review | `index`, `total` | Swipe, tap, hold to pause |

Every interactive component exposes `accessibilityRole`, `accessibilityLabel`, and state; every color pair is checked in a unit test with a WCAG contrast function across both themes and all three tiers.
