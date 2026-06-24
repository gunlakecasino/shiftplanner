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

// Use the standard Next.js pattern. process.env.NODE_ENV is replaced at build time
// by Turbopack/webpack. This avoids fragile runtime "process" polyfill dependencies
// that trigger "module factory is not available" errors on large client pages
// (ShiftBuilder) under dev + Safari/iPad.
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function getSupabaseClient(): SupabaseClient {
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

      console.error('[supabase] Initialization failed in', isProd ? 'PRODUCTION' : 'development', {
        hasUrl: !!url,
        hasAnonKey: !!anonKey,
        hasServiceKey: !!serviceKey,
        nodeEnv: process.env.NODE_ENV ?? 'unknown',
      });

      throw new Error(
        `Supabase config missing: ${missing.join(', ')}. ` +
        (isProd
          ? 'Make sure NEXT_PUBLIC_SUPABASE_* variables are set in Railway (they must be available at build time for NEXT_PUBLIC_ vars).'
          : 'Set them in .env.local')
      );
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
