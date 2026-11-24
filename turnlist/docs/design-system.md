# Design system

Editorial classifieds: generous white space, oversized headline type, deep navy text, quiet borders, and color reserved for meaning. Tokens are in `tailwind.config.js`; component classes are in `src/styles/index.css`; React primitives are in `src/components/ui.tsx`.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `navy` | #14294B | Headings, primary buttons, structure |
| `ink` | #172638 | Body text |
| `ink-muted` | #5C6B7D | Secondary text. Slightly darker than the brief's #667587 so it passes WCAG AA (4.5:1) on the #F5F7FA surface too |
| `canvas` / `canvas-alt` / `canvas-tint` | #FFFFFF / #F5F7FA / #E9F0F5 | Page, quiet panels, skeletons and the faint hero atmosphere |
| `line` / `line-strong` | #E4E9EE / #CBD4DD | Card borders and dividers / control borders |
| `teal` | #168A80 | Selected states, focus ring, icons, dots |
| `teal-700` | #11706A | Teal used as text or on white (5.9:1). #168A80 is 4.2:1, so it is never used for small text |
| `amber` | #E5AD46 | Time pressure only: dots and tag backgrounds. Text on amber uses `amber-800` #8A5A06 |
| `danger` | #B4382F | Errors and destructive actions |

Rules: most surfaces are white. Navy is the primary action color; teal marks links and what is selected. Amber means "soon". No gradients except the near-invisible blue-gray shading behind the hero.

## Type

One family, Manrope (variable, self-hosted). Scale:

| Role | Size / line height / weight |
| --- | --- |
| Display (home hero) | clamp(40px, 6.2vw, 76px) / 1.02 / 700, −0.035em |
| Page title | clamp(28px, 3.2vw, 38px) / 1.15 / 650 |
| Section | 17–22px / 600 |
| Card title | 16.5px / 1.35 / 600 |
| Body | 15px / 1.6 / 400 |
| Metadata | 13–13.5px / 500 |
| Tag | 12px / 600 |

Prices and counts use tabular numerals. Nothing below 11px; secondary text never lighter than `ink-muted`.

## Spacing and shape

4px base. Page gutter 16 / 24 / 32px. Card padding 20px. Controls 44px tall (36px compact). Radius 10px for controls, 14px for cards, 6–8px for tags and chips. Avatars and status dots are the only circles. Shadows: `card` (barely there), `lift` (hover and menus), `search` (the hero search only).

## Components

- **Header**: 64px, white, hairline border. Logo left, three to five links centered with a 2px teal underline on the active one, actions right. "Post a Job" is the only filled button in it.
- **Mobile**: signed-in users get a five-tab bottom bar (employers have a center Post button); public visitors get a menu sheet.
- **Search bar**: one bordered surface split into "What kind of work?" and "Location or ZIP code", with a navy Search Jobs button. Stacks on phones.
- **Category strip**: one bordered rail, line icons at 1.6 stroke, hairline dividers, live counts, teal underline when selected. Scrolls horizontally on narrow screens.
- **Job card**: text first. Category and urgency, title (the whole card is the link), neighborhood and distance, pay as the largest text, date needed and hours, two-line description, footer with posted time or application status, Save, and View Details. Employer photos appear only when uploaded; no stock imagery. Card heights follow content.
- **Tags**: job status, application status, moderation, urgency, Example, verified badge. Each has one meaning and one color.
- **Tables** for dashboards and admin lists on wider screens, stacked lists on phones.
- **Dialogs** for decisions that need confirmation or a reason (select, cancel, reject, report). Escape closes, focus is trapped and returned.
- **Empty states** say what will appear and offer the next action.
- **Forms**: label above, hint below, inline error with icon, a summary message that receives focus on submit.

## Interaction

Transitions are 150ms color or shadow changes. Hover lifts cards with a stronger shadow, never movement. One focus style everywhere: 2px teal outline offset 2px. Loading uses skeleton cards and a small spinner. `prefers-reduced-motion` disables transitions.

## Accessibility

Skip link, landmark regions, labelled controls, `aria-pressed` and `aria-checked` on toggles, live regions for result counts and toasts, keyboard-operable menus and dialogs, AA contrast for all text.
