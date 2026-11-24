# Turnlist

A local job board for property maintenance and rental turnover work. Property managers, landlords, investors, and maintenance companies post individual, urgent, overflow, and recurring jobs; independent contractors find and apply for them. Launching in the Las Vegas valley (Las Vegas, Henderson, North Las Vegas, Summerlin, Centennial Hills, and surrounding areas), built to add cities as data.

## Run it

```sh
npm install
npm run dev            # http://localhost:5173
```

`npm run dev` runs a complete demo in the browser: sample listings labeled **Example**, and a slim, dismissible bar to view it as a property manager, a contractor, or an administrator. For a shareable preview site, `npm run build:demo`.

For launch, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and run `npm run build` (see [architecture](docs/architecture.md#running-against-supabase)). Real users then never see the demo bar or sample data. A production build without those settings shows a "not connected" screen rather than falling back to sample listings.

## Tests

```sh
npm test               # domain logic and demo backend permissions (Vitest)
npm run test:db        # migrations + row-level security on a throwaway Postgres 16
npm run build:demo && (npx vite preview --port 4173 &) && npm run test:e2e   # browser flows at desktop and phone sizes
```

## Documentation

- [Architecture](docs/architecture.md): stack, layers, where each rule is enforced, database, scheduled jobs, notifications, city expansion, deployment
- [Product](docs/product.md): roles, flows, statuses, notifications, demo mode, metrics, monetization
- [Design system](docs/design-system.md): color, type, spacing, components, interaction, accessibility
- [Trust and safety](docs/trust-and-safety.md): contractor positioning, moderation, licensing, verification, privacy, open legal items

## Layout

```
src/domain      business rules (pure TypeScript)
src/data        DataApi contract, demo and Supabase implementations
src/components  design system and shared components
src/pages       screens: public, contractor, employer, shared, admin
supabase        migrations, seed, edge function, database tests
tests, e2e      unit and browser tests
```
