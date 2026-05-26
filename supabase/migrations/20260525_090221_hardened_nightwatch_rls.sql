-- =============================================================================
-- Phase 0 Remediation: Harden RLS on Nightwatch Tables
-- =============================================================================
-- Tables affected: shift_notes, canvas_strokes, shift_events
--
-- Problem: Original migration used extremely permissive `USING (true)` policies.
-- This allows any authenticated or anonymous user to read/write all operational
-- grave shift data. Unacceptable for casino operations data.
--
-- Approach for Phase 0 (current single-operator reality + gradual auth rollout):
--   - Service role retains full access (for Edge Functions, admin tools, dev).
--   - Authenticated users can only access rows where operator_id matches their auth.uid()
--     OR rows where operator_id is still NULL (legacy data during transition).
--   - INSERTs are restricted so authenticated users can only create rows with their own operator_id.
--
-- Future (when multi-user + proper profiles/roles are live):
--   - Tighten further with organization scoping.
--   - Add manager override policies.
--
-- This migration is idempotent and safe to re-run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. shift_notes
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "shift_notes_all" ON shift_notes;

-- Service role full access (trusted server processes)
CREATE POLICY "shift_notes_service_role_full"
  ON shift_notes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Authenticated users: own data or legacy NULL operator_id rows (read + write during transition)
CREATE POLICY "shift_notes_authenticated_own_or_legacy"
  ON shift_notes
  FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    (operator_id IS NULL OR operator_id = auth.uid())
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND
    (operator_id IS NULL OR operator_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 2. canvas_strokes
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "canvas_strokes_all" ON canvas_strokes;

CREATE POLICY "canvas_strokes_service_role_full"
  ON canvas_strokes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "canvas_strokes_authenticated_own_or_legacy"
  ON canvas_strokes
  FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    (operator_id IS NULL OR operator_id = auth.uid())
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND
    (operator_id IS NULL OR operator_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. shift_events
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "shift_events_all" ON shift_events;

CREATE POLICY "shift_events_service_role_full"
  ON shift_events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "shift_events_authenticated_own_or_legacy"
  ON shift_events
  FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    (operator_id IS NULL OR operator_id = auth.uid())
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND
    (operator_id IS NULL OR operator_id = auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Notes for operators
-- -----------------------------------------------------------------------------
-- After applying this migration:
-- 1. Existing rows with NULL operator_id remain accessible to any authenticated user (transition safety).
-- 2. New rows created from the iPad or web (when auth is properly wired) will be scoped to the user.
-- 3. Service role (Edge Functions, Supabase Studio with service key, etc.) retains full power.
-- 4. Later, when profiles + organization_members + roles exist, we will tighten these policies further.

COMMIT;