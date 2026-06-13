import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _adminClient: SupabaseClient | null = null;
let _envLogged = false;

/**
 * Creates a Supabase client using the service role key.
 *
 * Looks for:
 *  1. SUPABASE_SERVICE_ROLE_KEY (preferred, **not** exposed to browser via NEXT_PUBLIC_)
 *  2. NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY (fallback, only for local dev convenience)
 *
 * This makes the admin routes work regardless of how the developer named the env var locally.
 *
 * NOTE: This function will THROW if the key is missing. Use createAdminClientSafe() when you want graceful degradation.
 */
export function createAdminClient() {
  const client = createAdminClientSafe();
  if (!client) {
    const railwayEnv =
      process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.RAILWAY_ENVIRONMENT ||
      'unknown';

    throw new Error(
      `Missing Supabase service role key. ` +
        `Railway env: ${railwayEnv}. ` +
        `Set SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY in your environment. ` +
        `Make sure it is attached to the correct Railway Environment (production vs staging).`
    );
  }
  return client;
}

/**
 * Safe version that returns null instead of throwing when the service role key is missing.
 * Use this in paths that should degrade gracefully (e.g. main board scheduled data).
 */
export function createAdminClientSafe() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  const hasProperServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasFallback = !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  // Log the admin client configuration **once** per process to avoid spamming the dev terminal
  // on every night-core / night-secondary / roster request.
  if (!_envLogged) {
    _envLogged = true;

    const railwayEnv =
      process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.RAILWAY_ENVIRONMENT ||
      'unknown';

    if (!hasProperServiceKey && hasFallback) {
      console.warn(
        '[createAdminClient] Using NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY fallback (dev only). ' +
          'For cleaner local dev and to match production shape, add SUPABASE_SERVICE_ROLE_KEY to .env.local ' +
          '(without the NEXT_PUBLIC_ prefix).'
      );
    }

    // Only emit the detailed object when something is off or on first creation in non-prod.
    // This keeps normal `pnpm dev` output clean while still helping Railway/env debugging.
    if (process.env.NODE_ENV !== 'production' && (!hasProperServiceKey || !serviceKey)) {
      console.log('[createAdminClient] Env check', {
        railwayEnvironment: railwayEnv,
        nodeEnv: process.env.NODE_ENV,
        hasUrl: !!url,
        hasServiceRoleKey: hasProperServiceKey,
        hasNextPublicServiceRoleKey: hasFallback,
        usingFallbackNextPublic: !hasProperServiceKey && hasFallback,
      });
    }
  }

  if (!url || !serviceKey) {
    return null;
  }

  if (!_adminClient) {
    _adminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return _adminClient;
}
