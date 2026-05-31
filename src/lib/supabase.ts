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

// Safe access — prevents "Can't find variable: process" on iPad simulator / certain Turbopack chunks
const IS_PRODUCTION =
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NODE_ENV === 'production';

export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const key = serviceKey || anonKey;

    if (!url || !key) {
      const isProd =
        typeof process !== 'undefined' &&
        process.env &&
        process.env.NODE_ENV === 'production';
      const missing = [];
      if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
      if (!serviceKey && !anonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY)');

      console.error('[supabase] Initialization failed in', isProd ? 'PRODUCTION' : 'development', {
        hasUrl: !!url,
        hasAnonKey: !!anonKey,
        hasServiceKey: !!serviceKey,
        nodeEnv:
          typeof process !== 'undefined' && process.env
            ? process.env.NODE_ENV
            : 'unknown',
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
    const envForLog =
      typeof process !== 'undefined' && process.env ? process.env.NODE_ENV : 'unknown';
    console.log(
      `[supabase] ShiftBuilder client initialized with ${usingService ? 'SERVICE_ROLE' : 'anon'} key (env: ${envForLog})`
    );

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
