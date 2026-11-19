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
