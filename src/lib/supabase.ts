import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Clean Supabase client for OMS / Shift Builder.
 * 
 * Follows the zds-home pattern:
 * - Prefers NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY for dev (bypasses RLS, full write access).
 * - Falls back to anon key.
 * - Singleton lazy client (safe for Next.js).
 * - Never persists sessions (stateless for this board).
 * 
 * For production, move writes behind server actions / API routes that use the non-public service key.
 */

let _supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const key = serviceKey || anonKey;

    if (!url || !key) {
      throw new Error(
        'NEXT_PUBLIC_SUPABASE_URL and (NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY) must be set in .env.local'
      );
    }

    const usingService = !!serviceKey;
    if (usingService) {
      // eslint-disable-next-line no-console
      console.log('[oms-supabase] Using SERVICE ROLE key (dev only — full read/write, bypasses RLS)');
    }

    _supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: usingService ? { 'X-Client-Info': 'oms-shiftbuilder-dev' } : {},
      },
      // Realtime will be configured per-subscription for specific nights
    });
  }

  return _supabaseClient;
}

/**
 * Proxy export so you can do `import { supabase } from '@/lib/supabase'` and call .from() etc directly.
 * Access is lazy.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string | symbol) {
    return Reflect.get(getSupabaseClient(), prop);
  },
});

export type SupabaseClientType = SupabaseClient;
