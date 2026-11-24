import type { DataApi } from './api';
import { createDemoApi, type DemoApi } from './demoApi';
import { createSupabaseApi } from './supabaseApi';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function safeLocalStorage() {
  try {
    const t = '__turnlist_probe__';
    window.localStorage.setItem(t, t);
    window.localStorage.removeItem(t);
    return window.localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  }
}

/**
 * Which backend this build talks to:
 *  - supabase:     VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set. Real users,
 *                  no demo banner, no sample data. Always wins.
 *  - demo:         local development, or a build with VITE_DEMO_MODE=true (previews).
 *  - unconfigured: a production build with neither. The app shows a setup screen
 *                  instead of silently serving sample listings to real visitors.
 */
export const appMode: 'supabase' | 'demo' | 'unconfigured' =
  url && key ? 'supabase' : import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true' ? 'demo' : 'unconfigured';

export const api: DataApi = appMode === 'supabase' ? createSupabaseApi(url!, key!) : createDemoApi({ storage: safeLocalStorage(), latencyMs: 160 });
export const isDemo = appMode === 'demo';
export const demoApi = (isDemo ? api : null) as DemoApi | null;
export * from './api';
