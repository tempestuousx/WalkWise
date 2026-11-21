# 8. Behavior Logging and Assessment System

Status: specified, implemented in the design preview and the shared logic module, database migration written and tested.
Source request: "WalkWise: Behavior Logging and Assessment System Update".

| Piece | Location |
|---|---|
| Logic (pure, no UI): modes, timers, episodes, questionnaire, interpretation, analytics | [`preview/behavior-core.js`](preview/behavior-core.js), becomes `src/domain/behavior/*` in the app |
| Unit tests (18) | [`preview/behavior-core.test.js`](preview/behavior-core.test.js), run `node --test docs/preview/behavior-core.test.js` |
| Interactive preview | [`preview/index.html`](preview/index.html) |
| Database migration | [`schema/0002_behavior_episodes.sql`](schema/0002_behavior_episodes.sql) |
| Migration test (legacy data preserved, constraints) | [`schema/tests/0002_migration_test.sql`](schema/tests/0002_migration_test.sql) |

## 8.1 Logging modes

Setting: **Behavior logging: Beginner / Professional** (Settings, and the avatar on Home in the preview).

| | Professional (existing taxonomy, unchanged) | Beginner (observable actions) |
|---|---|---|
| Behaviors | Pulling, Reactivity, Resource Guarding, Fear / Anxiety, Aggression, Barking | Barking, Growling, Lunging, Pulling, Freezing, Retreating, Snapping, Showing Teeth, Trembling, Other, **Calm pass** (successful encounter) |
| Slide-out | Dog / Human / Other on all but Pulling | Same |

- Existing users keep Professional (database default). New users are shown Beginner as "Recommended" during onboarding.
- Both modes write to the same event table. Pulling and Barking are the same event types in both modes, so their history is continuous. Switching modes only changes which types appear in Quick Log and Timed Log; past events always display with their original names.
- Beginner never classifies growling, barking or lunging as aggression. "Other" in Beginner asks "What did your dog do?" (optional) after logging.
- The Nature menu is identical in both modes.

## 8.2 Quick Log (unchanged) and Timed Log (new)

Quick Log keeps its press-hold-slide-release gesture, menu position, hysteresis, push-out / hold for the slide-out, tap mode, and cancel.

**Timed Log** is a compact orb beside Quick Log, always visible during a walk.
- Same gesture and same menu position. Its menu has one category, Behavior, for the current mode, with the same Dog / Human / Other slide-out.
- Releasing starts a timer: the event is saved immediately with its start time and start GPS fix. A compact indicator above the stats panel shows the behavior name, elapsed time, and **End**. Several timers can run at once; the Timed Log orb shows a count badge.
- **End** saves the end time, end GPS fix, and duration (end minus start).
- Quick Log keeps working while timers run.
- If the walk ends with a timer still running, the event is kept as **not ended** with an **unknown** duration. No duration is invented. The report offers "Add duration", stored as a corrected value and labeled "added later"; the fact that the timer was not ended is kept.
- Behavior duration and recovery time (time to settle, from the review) are separate fields and are never combined.
- The walk clock keeps running while a walk is paused, so timers and timestamps stay accurate through pauses.

## 8.3 Behavior episodes

An episode groups related behavior events from one situation, for one dog. It is a parent record; events are linked, never merged or copied.

Fields: id, walk, dog, start and end (derived from its events), start and end location, optional trigger (with source: logged or reviewed), optional notes, origin (suggested or manual), review status.

**Suggestions** (on the report, never during the walk): reviewable behavior events within 90 seconds and 40 meters of each other, attributed to the same dog, not already grouped.
- Never groups events for different dogs. An event attributed to two dogs on a shared walk is only grouped after the user picks the dog; that narrowing is stored as a correction (original attribution kept).
- Never assumes a shared trigger. If every event logged the same trigger, the episode shows it "as logged"; otherwise the trigger is "different triggers logged" or "not recorded", and triggers are never copied between events.
- The user confirms ("Group as one encounter") or rejects ("Keep separate"; not suggested again). Events can be removed from an episode, added to a compatible episode, or left standalone. Ungrouping removes only the grouping (and that episode's review answers) and keeps every event.
- Pulling and calm passes are tracked but not suggested for grouping or review.

## 8.4 Understand My Dog (post-walk, optional)

A report section listing grouping suggestions, episodes, and standalone reviewable behaviors, each with a status: Not reviewed, In progress, Reviewed, Skipped. Nothing here appears during a walk. Reviews can be skipped, saved part way ("Save and finish later"), and edited later.

**Conditional questionnaire** (one question per screen, every question skippable, "I'm not sure" and "Other" where appropriate):

| # | Question | Asked when | Options depend on |
|---|---|---|---|
| 0 | What was your dog reacting to? | Trigger was not logged reliably (and not resource guarding) | n/a |
| 1 | What happened immediately before? | Always | Trigger (dog, human, other) or resource guarding |
| 2 | How close was it? (your best estimate, not GPS) | Unless "Nothing I noticed" | n/a |
| 3 | What body language did you notice? | Always, optional | Behavior family: up to 5 relevant indicators, "Show more signs" for the rest |
| 4 | What happened afterward? | Always | Social reaction, fear, or guarding |
| 4b | About how long did your dog take to settle? | Only after a "settled" answer | n/a |
| 5 | Anything else? (notes) | Always | n/a |

Body-language library (10 indicators, plain names, one-sentence descriptions, optional illustration slot by indicator key, Yes / No / Not sure): stiff body, whale eye, lip licking, weight shifting backward, fixed staring, ears pinned back, tail tucked, head turning away, lowered body posture, raised hackles. Unanswered, "not sure" and "no" are stored distinctly. The questionnaire never asks what the dog intended or felt.

## 8.5 Education ("What this may mean")

Generated by versioned rules (`edu-2026.11-draft`) from the recorded facts and answers, stored separately from the observations, and regenerated when they change.

Sections: **What you recorded** (facts), **What was happening** (context), **Possible explanations**, **Still unknown** (missing information), **Watch for next time**, plus safety guidance.

Rules enforced in code and tests:
- No possible explanations unless both "just before" and "afterward" are actually known (not skipped, not "not sure").
- No explanation from a single body-language sign; at least two related signs are required, and even then the wording says they cannot tell motivations apart.
- Explanations use "consistent with" and "may", never diagnoses, scores, or percentages.
- Missing and "not sure" answers are listed as unknowns, never treated as "no".
- Nothing is inferred from GPS beyond what was logged.
- No punishment, intimidation or aversive advice; growling is described as communication to respect by adding distance.
- Snapping and Aggression add guidance to see a qualified behavior professional and a veterinarian (pain or illness). Every summary includes guidance for new or worsening behavior.
- Draft wording is labeled as pending review by a qualified professional; the content version lets reviewed wording replace it without code changes.
- No AI service or external API is used.

## 8.6 Analytics

Insights now compute from logged records with filters for date range, dog, behavior, and trigger:
- Walks, **encounters** (episodes + ungrouped reviewable behaviors + calm passes), and **behavior events**, shown separately. One episode with growling, barking and lunging is one encounter and three behaviors.
- Frequency by behavior; known durations (count, average) and timers not ended (unknown) per behavior.
- Outcomes: settled afterward, kept reacting, not reported, calm passes; "x of the y encounters you logged included a reaction", with the note that only logged encounters count.
- Time to settle, triggers, and distance estimates, each with "not sure" and "not reported" shown apart from zero.
- Encounters per week alongside walks per week, with the note that fewer logged behaviors does not by itself mean improvement.

## 8.7 Data model (migration 0002)

| Concept | Storage |
|---|---|
| Logging mode | `user_preferences.logging_mode` (default `professional`) |
| Mode per type, success flag, family, serious flag, describe prompt | new columns on `event_types`; 9 Beginner types seeded |
| Behavior event | existing `walk_events` + `is_timed`, `ended_at`, end location, `timer_status` (`running`, `ended`, `not_ended`), `duration_s`, `duration_source` (`timer`, `corrected`), `behavior_description`, `episode_id`, `dogs_corrected_at` |
| Behavior episode | `behavior_episodes` (one dog, walk, span, location, trigger and source, origin, notes, review status) |
| Behavior review | `behavior_reviews` (one subject: episode or event; answers as option keys; null = unanswered) + `review_body_language` (yes / no / unsure per indicator; no row = unanswered) + `body_language_indicators` library |
| Interpretation | `behavior_interpretations` (content version, input fingerprint, sections JSON) |

Database-level guarantees: a timer-sourced duration must equal end minus start (within 1 s); a not-ended timer has no end time and no timer duration; running timers have no duration; episodes cannot mix dogs (checked from both the event and the attribution side); deleting an episode sets `episode_id` to null on its events; new tables use row-level security; legacy rows satisfy every new constraint without being rewritten.

## 8.8 Not done yet / needs configuration

- The real mobile app does not exist yet; Phase 1 is still pending approval. The logic module and migration are ready to move into it.
- Body-language illustrations: supply image files keyed by indicator (`stiff_body`, `whale_eye`, ...). The preview and schema already accept them.
- Educational wording should be reviewed by a qualified professional (for example a veterinary behaviorist or certified behavior consultant) before release.
- Insights in the preview use generated sample history plus walks done in the session.
- The preview stores everything in memory; nothing persists after reload.
