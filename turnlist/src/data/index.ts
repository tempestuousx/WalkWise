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

/** Supabase when configured; otherwise the self-contained demo. */
export const api: DataApi = url && key ? createSupabaseApi(url, key) : createDemoApi({ storage: safeLocalStorage(), latencyMs: 160 });
export const isDemo = api.mode === 'demo';
export const demoApi = (isDemo ? api : null) as DemoApi | null;
export * from './api';
