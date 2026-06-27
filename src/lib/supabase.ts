// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * GRAVE Ops Shift Hub — Supabase Client (Phase 0 Hardened)
 *
 * Security & Best Practices (coding-engineer Supabase branch):
 * - Service role key is **strongly discouraged** from the browser.
 * - In production builds, service role usage will throw to prevent accidental leaks.
 * - Prefer anon key + proper RLS + server actions / Edge Functions for privileged writes.
 * - This client is the foundation for both the web app and (eventually) shared types with the native opsApp.
 */

let _supabaseClient: SupabaseClient | null = null;
let _warmPromise: Promise<void> | null = null;

/** Supabase REST host for preconnect hints (no secrets). */
export function getSupabaseRestOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function hasSupabaseConfig(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  return !!(url && (anonKey || serviceKey));
}

// Use the standard Next.js pattern. process.env.NODE_ENV is replaced at build time
// by Turbopack/webpack. This avoids fragile runtime "process" polyfill dependencies
// that trigger "module factory is not available" errors on large client pages
// (ShiftBuilder) under dev + Safari/iPad.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function getSupabaseClient(): SupabaseClient {
  if (typeof window !== 'undefined' && !hasSupabaseConfig()) {
    // In dev, if no config, return the dummy immediately without logging "failed".
    // (warmSupabaseConnection already guards, but direct calls from data paths may happen.)
    if (!_supabaseClient) {
      _supabaseClient = new Proxy({} as SupabaseClient, {
        get() {
          throw new Error('Supabase is not configured (no NEXT_PUBLIC_SUPABASE_* keys). Add .env.local and restart.');
        }
      });
    }
    return _supabaseClient;
  }

  if (!_supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const key = serviceKey || anonKey;

    if (!url || !key) {
      const isProd = process.env.NODE_ENV === 'production';
      const missing = [];
      if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
      if (!serviceKey && !anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY)');

      // In development we often intentionally run without a local Supabase (UI review, worktrees, etc.).
      // Only log a one-time warning (not error) so the console isn't full of red during normal dev.
      if (typeof window !== 'undefined' && !(window as any).__supabaseInitLogged) {
        (window as any).__supabaseInitLogged = true;
        if (isProd) {
          console.error('[supabase] Initialization failed in PRODUCTION', {
            hasUrl: !!url,
            hasAnonKey: !!anonKey,
            hasServiceKey: !!serviceKey,
            nodeEnv: process.env.NODE_ENV ?? 'unknown',
          });
        } else {
          console.warn('[supabase] No Supabase config found in development (common / expected).', {
            hint: 'Add NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the dev server if you need live data or auth.',
          });
        }
      }

      // Never hard-throw in development from this path (prevents module-eval crashes in loading/auth shells).
      // Real usage will get a clear error from the dummy below (or from data layer).
      if (isProd) {
        throw new Error(
          `Supabase config missing: ${missing.join(', ')}. ` +
          'Make sure NEXT_PUBLIC_SUPABASE_* variables are set in Railway (they must be available at build time for NEXT_PUBLIC_ vars).'
        );
      }

      const devDummy = new Proxy({} as SupabaseClient, {
        get() {
          throw new Error('Supabase not configured — set the NEXT_PUBLIC_SUPABASE_* keys in .env.local and restart dev.');
        }
      });
      _supabaseClient = devDummy;
      return devDummy;
    }

    const usingService = !!serviceKey;

    // Helpful for prod debugging (Railway logs). In prod we are almost always on anon.
    // If you see "ShiftBuilder client initialized with anon key" + later empty result sets,
    // the problem is almost always RLS policies not granting SELECT to the anon role.
    // === PHASE 0 HARDENING ===
    if (usingService) {
      if (IS_PRODUCTION) {
        throw new Error(
          '[SECURITY] Service role key is forbidden in production browser builds. Use server actions or Edge Functions.'
        );
      }
      console.warn(
        '[oms-supabase] ⚠️  WARNING: Using SERVICE ROLE key in browser (dev only). This bypasses ALL RLS. ' +
        'This will be blocked in production. Prefer RLS + anon key or move privileged logic server-side.'
      );
    }

    _supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: usingService ? { 'X-Client-Info': 'oms-shiftbuilder-dev' } : {},
      },
      // Realtime configured per-subscription for specific nights / entities
    });
  }

  return _supabaseClient;
}

/**
 * Proxy export for ergonomic usage: `import { supabase } from '@/lib/supabase'`
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    return Reflect.get(getSupabaseClient(), prop);
  },
});

export type SupabaseClientType = SupabaseClient;

/**
 * Fire a lightweight read so TLS + HTTP/2 to Supabase are warm before the board asks.
 * Idempotent — safe to call from loading shells, providers, and route entry.
 */
export type WarmSupabaseOptions = {
  /** Drop the in-flight warm guard and ping again (after idle / tab resume). */
  force?: boolean;
};

export function warmSupabaseConnection(options?: WarmSupabaseOptions): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (options?.force) _warmPromise = null;
  if (_warmPromise) return _warmPromise;

  _warmPromise = (async () => {
    try {
      // Avoid triggering getSupabaseClient (and its console.error) during early module/useEffect
      // evaluation in development when env vars are not yet set (common in fresh clones or worktrees).
      if (!hasSupabaseConfig()) {
        return;
      }
      const client = getSupabaseClient();
      const t0 = performance.now();
      await client.from('nights').select('id').limit(1).maybeSingle();
      const ms = Math.round(performance.now() - t0);
      if (ms > 0) {
        (window as any).__supabaseWarmMs = ms;
      }
    } catch (e) {
      console.warn('[supabase] warm connection failed (non-fatal):', e);
    }
  })();

  return _warmPromise;
}
