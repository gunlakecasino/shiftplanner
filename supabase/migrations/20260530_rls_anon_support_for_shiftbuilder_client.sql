-- =============================================================================
-- RLS Fix: Allow anon (and authenticated) role for ShiftBuilder client
-- =============================================================================
-- Root cause of "works locally, empty cards in production":
--   - The deployed Next.js client bundle ALWAYS uses the anon key
--     (supabase.ts hard-blocks service_role in NODE_ENV=production).
--   - Previous baseline RLS (20260525_093000) only granted SELECT to
--     'authenticated' (plus full access to service_role).
--   - Local dev often had NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY present,
--     so the browser client ran with service_role and bypassed RLS entirely.
--
-- Result: In prod, every .select() / .upsert() from the browser for
-- zone_assignments, tm_profiles, nights, break_assignments, etc. returned
-- zero rows (or failed silently) → cards always showed "no TM scheduled"
-- even though the rows existed in the DB.
--
-- This migration adds the minimal policies so the public anon client
-- (what the Railway build actually ships) can read + write exactly the
-- tables the ShiftBuilder UI needs. Realtime postgres_changes also
-- respect these policies, so live updates will start working too.
--
-- Security note: This is an internal ops tool. The anon key is not
-- exposed to untrusted public users; the entire surface is protected
-- by the hosting / VPN / physical access model of the control room.
-- We can tighten to proper authenticated sessions + org roles later.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Helper: ensure we don't duplicate policies on re-runs
-- -----------------------------------------------------------------------------

-- =============================================================================
-- nights (nightId resolution + notes on the row)
-- =============================================================================
DROP POLICY IF EXISTS nights_anon_authenticated_all ON nights;
CREATE POLICY nights_anon_authenticated_all ON nights
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- zone_assignments (the heart of the "click a card → which TM?" symptom)
-- =============================================================================
DROP POLICY IF EXISTS zone_assignments_anon_authenticated_all ON zone_assignments;
CREATE POLICY zone_assignments_anon_authenticated_all ON zone_assignments
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- break_assignments (Sudo push + break sheet + per-card breakGroup)
-- =============================================================================
DROP POLICY IF EXISTS break_assignments_anon_authenticated_all ON break_assignments;
CREATE POLICY break_assignments_anon_authenticated_all ON break_assignments
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- overlap_assignments (if/when the client starts writing them directly)
-- =============================================================================
DROP POLICY IF EXISTS overlap_assignments_anon_authenticated_all ON overlap_assignments;
CREATE POLICY overlap_assignments_anon_authenticated_all ON overlap_assignments
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- tm_profiles (roster names, grave_pool, gender, primary_section — read only for client)
-- =============================================================================
DROP POLICY IF EXISTS tm_profiles_anon_authenticated_read ON tm_profiles;
CREATE POLICY tm_profiles_anon_authenticated_read ON tm_profiles
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

-- Keep the service full-access policy (already present from baseline)
-- but ensure anon/auth can't write profiles from the browser (we don't want that anyway).

-- =============================================================================
-- night_slot_tasks (the per-card task pills)
-- =============================================================================
DROP POLICY IF EXISTS night_slot_tasks_anon_authenticated_all ON night_slot_tasks;
CREATE POLICY night_slot_tasks_anon_authenticated_all ON night_slot_tasks
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- slot_task_catalog (the menu of available tasks per slot type)
-- =============================================================================
DROP POLICY IF EXISTS slot_task_catalog_anon_authenticated_read ON slot_task_catalog;
CREATE POLICY slot_task_catalog_anon_authenticated_read ON slot_task_catalog
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- night_card_borders (visual attention marks persisted per night)
-- =============================================================================
DROP POLICY IF EXISTS night_card_borders_anon_authenticated_all ON night_card_borders;
CREATE POLICY night_card_borders_anon_authenticated_all ON night_card_borders
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- call_offs + night_tm_status (roster filters, realtime schedule status)
-- =============================================================================
DROP POLICY IF EXISTS call_offs_anon_authenticated_all ON call_offs;
CREATE POLICY call_offs_anon_authenticated_all ON call_offs
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS night_tm_status_anon_authenticated_all ON night_tm_status;
CREATE POLICY night_tm_status_anon_authenticated_all ON night_tm_status
  FOR ALL
  USING (auth.role() IN ('anon', 'authenticated'))
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- =============================================================================
-- Engine / placement reference tables (read by the live engine + recent history)
-- These are mostly read-only from the client.
-- =============================================================================
DROP POLICY IF EXISTS tm_preferences_anon_authenticated_read ON tm_preferences;
CREATE POLICY tm_preferences_anon_authenticated_read ON tm_preferences
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS tm_pair_affinities_anon_authenticated_read ON tm_pair_affinities;
CREATE POLICY tm_pair_affinities_anon_authenticated_read ON tm_pair_affinities
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS tm_accommodations_anon_authenticated_read ON tm_accommodations;
CREATE POLICY tm_accommodations_anon_authenticated_read ON tm_accommodations
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS tm_zone_matrix_anon_authenticated_read ON tm_zone_matrix;
CREATE POLICY tm_zone_matrix_anon_authenticated_read ON tm_zone_matrix
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS tm_placement_history_anon_authenticated_read ON tm_placement_history;
CREATE POLICY tm_placement_history_anon_authenticated_read ON tm_placement_history
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

-- Note: engine_config / engine_*_overrides / eligibility_rules already received
-- anon-friendly policies in 20260528_engine_granular_overrides_and_matrix.sql
-- (service + authenticated). We leave them; if the client needs anon reads there
-- in the future we can broaden in a follow-up.

-- =============================================================================
-- weeks (parent of nights, used in getOrCreate paths)
-- =============================================================================
DROP POLICY IF EXISTS weeks_anon_authenticated_read ON weeks;
CREATE POLICY weeks_anon_authenticated_read ON weeks
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

-- Optional write policy if the lazy week creation path is ever hit from the browser:
DROP POLICY IF EXISTS weeks_anon_authenticated_insert ON weeks;
CREATE POLICY weeks_anon_authenticated_insert ON weeks
  FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

COMMIT;

-- =============================================================================
-- After applying this migration:
--   1. Deploy the new code (or just run the migration via Supabase CLI / Studio).
--   2. Hard-refresh the Railway ShiftBuilder URL (or clear service worker cache).
--   3. Existing assignments should now appear on card click / load exactly as
--      they do locally.
--   4. Realtime subscriptions for zone_assignments etc. will also start delivering
--      cross-client updates.
--
-- If you ever want to move away from anon-key-in-browser, the proper path is:
--   - Add real Supabase Auth sign-in for operators (email + magic link or SSO).
--   - Switch client to use the resulting authenticated session.
--   - Tighten these policies back to only 'authenticated' + service_role.
-- =============================================================================
