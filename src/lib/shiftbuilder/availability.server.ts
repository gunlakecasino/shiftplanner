import 'server-only';

import { createAdminClientSafe } from '@/app/api/admin/_lib/createAdminClient';

/**
 * Forward-dated TM unavailability (PTO / LOA / MDL / off) for a given ISO date.
 *
 * Service-role read on purpose: `tm_availability_exceptions` is RLS-on with NO
 * anon/authenticated policy (see 20260714_tm_availability_exceptions.sql), so the
 * public anon client would silently return an empty set and quietly place people
 * who are off. This keeps leave data off the browser-exposed anon key.
 *
 * Keyed on slug `tm_id` (matches the engine roster's `tm.id`), so the returned
 * set can be subtracted directly from `rosterForEngine` in the batch/day/week
 * runs (sudoBatchPlanner.server.ts) and the week preview (actions.ts).
 *
 * Fails open (empty set) so a read hiccup never blocks a scheduling run.
 */
export async function getUnavailableTmIdsForDate(iso: string): Promise<Set<string>> {
  const supabase = createAdminClientSafe();
  if (!supabase) {
    console.warn(
      '[shiftbuilder/availability] service role not configured — PTO exclusion skipped for',
      iso,
    );
    return new Set();
  }

  const { data, error } = await supabase
    .from('tm_availability_exceptions')
    .select('tm_id')
    .eq('exception_date', iso);

  if (error) {
    console.warn('[shiftbuilder/availability] getUnavailableTmIdsForDate error:', error.message);
    return new Set();
  }

  return new Set((data ?? []).map((r: { tm_id: string }) => r.tm_id));
}
