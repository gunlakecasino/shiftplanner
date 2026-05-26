-- =============================================================================
-- Phase 0: Baseline RLS Hardening for Core Operational Tables
-- =============================================================================
-- This migration adds proper, minimal-viable RLS policies to the most critical
-- GRAVE Ops tables that currently have RLS enabled but no (or insufficient) policies.
--
-- Philosophy (coding-engineer + Supabase best practices):
-- - Service role always has full access (for Edge Functions, migrations, admin).
-- - Authenticated users get scoped access based on operator context where possible.
-- - For tables without strong multi-user modeling yet, we use conservative but safe policies.
-- - All policies are designed to be tightened later in Phase 1/2 when roles + orgs are modeled.
--
-- Tables addressed in this pass (highest operational impact):
--   - nights
--   - zone_assignments
--   - break_assignments
--   - overlap_assignments
--   - tasks
--   - events (Nightwatch + legacy)
--   - tm_profiles (read-heavy)
--   - weeks
--
-- Note: This is a stabilization pass. A more sophisticated role-based model will come later.
-- =============================================================================

BEGIN;

-- Ensure service role bypass is consistently available (good hygiene)
-- (Many tables already rely on this; we document it explicitly here)

-- =============================================================================
-- nights
-- =============================================================================
DROP POLICY IF EXISTS nights_service_role ON nights;
CREATE POLICY nights_service_role ON nights
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- For now: allow authenticated users to read all nights (common operational need)
-- Write access remains mostly service-role driven until better auth modeling
DROP POLICY IF EXISTS nights_authenticated_read ON nights;
CREATE POLICY nights_authenticated_read ON nights
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- zone_assignments
-- =============================================================================
DROP POLICY IF EXISTS zone_assignments_service_role ON zone_assignments;
CREATE POLICY zone_assignments_service_role ON zone_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS zone_assignments_authenticated_read ON zone_assignments;
CREATE POLICY zone_assignments_authenticated_read ON zone_assignments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- break_assignments
-- =============================================================================
DROP POLICY IF EXISTS break_assignments_service_role ON break_assignments;
CREATE POLICY break_assignments_service_role ON break_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS break_assignments_authenticated_read ON break_assignments;
CREATE POLICY break_assignments_authenticated_read ON break_assignments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- overlap_assignments
-- =============================================================================
DROP POLICY IF EXISTS overlap_assignments_service_role ON overlap_assignments;
CREATE POLICY overlap_assignments_service_role ON overlap_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS overlap_assignments_authenticated_read ON overlap_assignments;
CREATE POLICY overlap_assignments_authenticated_read ON overlap_assignments
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- tasks (very important for Ops Hub)
-- =============================================================================
DROP POLICY IF EXISTS tasks_service_role ON tasks;
CREATE POLICY tasks_service_role ON tasks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS tasks_authenticated_read ON tasks;
CREATE POLICY tasks_authenticated_read ON tasks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- events (Nightwatch + operational events)
-- =============================================================================
DROP POLICY IF EXISTS events_service_role ON events;
CREATE POLICY events_service_role ON events
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS events_authenticated_read ON events;
CREATE POLICY events_authenticated_read ON events
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- tm_profiles (read-heavy roster table)
-- =============================================================================
DROP POLICY IF EXISTS tm_profiles_service_role ON tm_profiles;
CREATE POLICY tm_profiles_service_role ON tm_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS tm_profiles_authenticated_read ON tm_profiles;
CREATE POLICY tm_profiles_authenticated_read ON tm_profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- weeks
-- =============================================================================
DROP POLICY IF EXISTS weeks_service_role ON weeks;
CREATE POLICY weeks_service_role ON weeks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS weeks_authenticated_read ON weeks;
CREATE POLICY weeks_authenticated_read ON weeks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- Notes
-- =============================================================================
-- This is a baseline stabilization pass.
-- Future improvements (Phase 1+):
--   - Organization / role-based scoping
--   - Write policies for authenticated operators on specific tables
--   - Row-level ownership using operator_id where it makes sense
--   - Manager override policies

COMMIT;