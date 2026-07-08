-- =============================================================================
-- ShiftBuilder /projects — anon read for realtime
-- =============================================================================
-- The production ShiftBuilder client uses the anon key. Supabase Realtime
-- (postgres_changes) delivers row events only for rows the subscribing role can
-- SELECT under RLS. ops_work_items previously had an authenticated-only read
-- policy, so an anon subscription received nothing. This adds an anon/auth read
-- policy (archived rows stay server-only) — consistent with the existing
-- anon-read posture on zone_assignments / slot_defaults / etc. Writes remain
-- service-role-only through the projects API. Additive; nothing dropped.
--
-- (ops_task_pools already got its anon read policy in 20260703_projects_pools.sql.
--  Checklist/comments/status-history stay server-only — the detail sheet reads
--  them through the service-role API, not the client, so they need no anon read.)
-- =============================================================================

BEGIN;

DROP POLICY IF EXISTS ops_work_items_anon_read ON ops_work_items;
CREATE POLICY ops_work_items_anon_read ON ops_work_items
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated') AND archived_at IS NULL);

COMMIT;
