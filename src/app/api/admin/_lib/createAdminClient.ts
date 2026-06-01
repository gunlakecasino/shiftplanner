import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client using the service role key.
 * 
 * Looks for:
 *  1. SUPABASE_SERVICE_ROLE_KEY (preferred, not exposed to browser)
 *  2. NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY (fallback, used by the project's lib/supabase.ts in dev)
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

  const railwayEnv =
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    'unknown';

  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasNextPublicServiceRole = !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  // Always log presence so we can debug Railway variable injection issues
  console.log('[createAdminClient] Env check', {
    railwayEnvironment: railwayEnv,
    nodeEnv: process.env.NODE_ENV,
    hasUrl: !!url,
    hasServiceRoleKey: hasServiceRole,
    hasNextPublicServiceRoleKey: hasNextPublicServiceRole,
    usingFallbackNextPublic: !hasServiceRole && hasNextPublicServiceRole,
  });

  if (!url || !serviceKey) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
