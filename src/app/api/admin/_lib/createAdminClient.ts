import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client using the service role key.
 * 
 * Looks for:
 *  1. SUPABASE_SERVICE_ROLE_KEY (preferred, not exposed to browser)
 *  2. NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY (fallback, used by the project's lib/supabase.ts in dev)
 *
 * This makes the admin routes work regardless of how the developer named the env var locally.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Railway exposes RAILWAY_ENVIRONMENT_NAME at runtime (e.g. "production")
  const railwayEnv =
    process.env.RAILWAY_ENVIRONMENT_NAME ||
    process.env.RAILWAY_ENVIRONMENT ||
    'unknown';

  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasNextPublicServiceRole = !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  // Diagnostic log (safe — does not leak the actual key)
  console.log('[createAdminClient] Env check', {
    railwayEnvironment: railwayEnv,
    nodeEnv: process.env.NODE_ENV,
    hasUrl: !!url,
    hasServiceRoleKey: hasServiceRole,
    hasNextPublicServiceRoleKey: hasNextPublicServiceRole,
    usingFallbackNextPublic: !hasServiceRole && hasNextPublicServiceRole,
  });

  if (!url) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceKey) {
    throw new Error(
      `Missing Supabase service role key. ` +
      `Railway env: ${railwayEnv}. ` +
      `Set SUPABASE_SERVICE_ROLE_KEY (recommended) or NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY in your environment. ` +
      `Make sure it is attached to the correct Railway Environment (production vs staging).`
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
