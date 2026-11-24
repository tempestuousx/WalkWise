> **Also in this repository:** [`turnlist/`](turnlist/README.md), a local property maintenance and turnover job marketplace (React + Supabase), developed separately from Walkwise.

# Walkwise

GPS dog-walk tracking, one-handed behavioral logging, weather context, analytics, and shareable walk reports, for dog owners and professional walkers. iOS and Android, built with Expo (React Native) and Supabase.

> Every walk tells a story.

## Status

**Architecture proposal, revision 2** (maps, accounts, sharing decided; weather provider pending). No application code yet. Implementation starts with Phase 1 (design system) and Phase 2 (core walking) once the proposal is approved.

## Proposal documents

1. [Architecture](docs/01-architecture.md): stack (verified against Expo SDK 58), layering, project structure, key decisions
2. [Screen map and flows](docs/02-screen-map.md): navigation diagram, screen blueprints, Quick Log radial menu interaction spec
3. [Database schema](docs/03-database-schema.md) and [DDL](docs/schema/proposed_schema.sql): Postgres + PostGIS with RLS, local SQLite differences, analytics definitions
4. [Background GPS and offline sync](docs/04-gps-and-offline-sync.md)
5. [Liquid glass design system](docs/05-liquid-glass.md): rendering tiers, tokens, motion, component specs
6. [Roadmap and acceptance criteria](docs/06-roadmap.md)
7. [Risks and open questions](docs/07-risks-and-questions.md)
8. [Behavior logging and assessment system](docs/08-behavior-observation-system.md): logging modes, Timed Log, episodes, guided review, education, analytics

Design preview: [`docs/preview/index.html`](docs/preview/index.html), a clickable browser mockup with sample data (not the app).

## Tests

```sh
node --test docs/preview/behavior-core.test.js   # behavior logic (modes, timers, episodes, review, education, analytics)
```

The database migration test (`docs/schema/tests/0002_migration_test.sql`) runs against Postgres 16 + PostGIS: apply `proposed_schema.sql`, the test's legacy section, `0002_behavior_episodes.sql`, then the test again with `-v phase_checks=1`.
