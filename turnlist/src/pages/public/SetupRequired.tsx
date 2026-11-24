/**
 * Shown by a production build that has no backend configured. Better than
 * quietly serving demo listings to real visitors.
 */
export default function SetupRequired() {
  return (
    <main className="mx-auto max-w-xl px-6 pt-24">
      <p className="eyebrow">Turnlist</p>
      <h1 className="mt-3 text-h1">This site is not connected yet.</h1>
      <p className="mt-4 text-[15.5px] leading-relaxed text-ink-muted">
        Set <code className="rounded bg-canvas-alt px-1.5 py-0.5 text-[13.5px] text-ink">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-canvas-alt px-1.5 py-0.5 text-[13.5px] text-ink">VITE_SUPABASE_ANON_KEY</code> and rebuild. For a preview site with sample data, build with{' '}
        <code className="rounded bg-canvas-alt px-1.5 py-0.5 text-[13.5px] text-ink">VITE_DEMO_MODE=true</code>.
      </p>
    </main>
  );
}
