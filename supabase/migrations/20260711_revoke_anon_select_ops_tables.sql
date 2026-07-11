-- P0 security (PR 11c / exec PR 13): revoke anon SELECT on residual ops tables.
-- Prerequisite: PR 11a code cutover + PR 11b soak gate (no client board fallbacks).
-- After this migration, browser anon key cannot REST-read these tables.
-- All reads/writes go through session-gated APIs (service_role admin client).
--
-- Do NOT apply to production until soak gate is signed (see RELEASE-CHECKLIST).
-- Staging curl proof required before prod (anon key must not return data rows).
--
-- Tables (drop *_anon_authenticated_read / residual open policies):
--   nights, zone_assignments, break_assignments, overlap_assignments,
--   night_slot_tasks, night_card_borders, night_tm_status, call_offs,
--   tm_profiles
-- Residual open policies (if PR 6 migration not yet applied):
--   ops_ai_feedback, ops_supervisor_knowledge → service_role only
--
-- Service-role FOR ALL policies from 20260624_revoke_anon_write_ops_tables.sql
-- (and baseline tm_profiles_service_role) are preserved / reasserted.
--
-- =============================================================================
-- REVERSE SQL (emergency only — re-opens public anon REST read hole)
-- =============================================================================
-- BEGIN;
--
-- -- nights
-- DROP POLICY IF EXISTS nights_anon_authenticated_read ON nights;
-- CREATE POLICY nights_anon_authenticated_read ON nights
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- zone_assignments
-- DROP POLICY IF EXISTS zone_assignments_anon_authenticated_read ON zone_assignments;
-- CREATE POLICY zone_assignments_anon_authenticated_read ON zone_assignments
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- break_assignments
-- DROP POLICY IF EXISTS break_assignments_anon_authenticated_read ON break_assignments;
-- CREATE POLICY break_assignments_anon_authenticated_read ON break_assignments
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- overlap_assignments
-- DROP POLICY IF EXISTS overlap_assignments_anon_authenticated_read ON overlap_assignments;
-- CREATE POLICY overlap_assignments_anon_authenticated_read ON overlap_assignments
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- night_slot_tasks
-- DROP POLICY IF EXISTS night_slot_tasks_anon_authenticated_read ON night_slot_tasks;
-- CREATE POLICY night_slot_tasks_anon_authenticated_read ON night_slot_tasks
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- night_card_borders
-- DROP POLICY IF EXISTS night_card_borders_anon_authenticated_read ON night_card_borders;
-- CREATE POLICY night_card_borders_anon_authenticated_read ON night_card_borders
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- night_tm_status
-- DROP POLICY IF EXISTS night_tm_status_anon_authenticated_read ON night_tm_status;
-- CREATE POLICY night_tm_status_anon_authenticated_read ON night_tm_status
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- call_offs
-- DROP POLICY IF EXISTS call_offs_anon_authenticated_read ON call_offs;
-- CREATE POLICY call_offs_anon_authenticated_read ON call_offs
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- tm_profiles
-- DROP POLICY IF EXISTS tm_profiles_anon_authenticated_read ON tm_profiles;
-- CREATE POLICY tm_profiles_anon_authenticated_read ON tm_profiles
--   FOR SELECT USING (auth.role() IN ('anon', 'authenticated'));
--
-- -- ops residual (only if rolling back service_role-only; re-opens using(true))
-- -- DROP POLICY IF EXISTS ops_ai_feedback_service_role ON ops_ai_feedback;
-- -- CREATE POLICY ops_ai_feedback_all ON ops_ai_feedback FOR ALL USING (true) WITH CHECK (true);
-- -- DROP POLICY IF EXISTS ops_supervisor_knowledge_service_role ON ops_supervisor_knowledge;
-- -- CREATE POLICY ops_supervisor_knowledge_all ON ops_supervisor_knowledge FOR ALL USING (true) WITH CHECK (true);
--
-- COMMIT;
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- nights
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS nights_anon_authenticated_read ON nights;
DROP POLICY IF EXISTS nights_anon_authenticated_all ON nights;
-- Keep / reassert service_role full access (session APIs)
DROP POLICY IF EXISTS nights_service_role_write ON nights;
CREATE POLICY nights_service_role_write ON nights
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- zone_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS zone_assignments_anon_authenticated_read ON zone_assignments;
DROP POLICY IF EXISTS zone_assignments_anon_authenticated_all ON zone_assignments;
DROP POLICY IF EXISTS zone_assignments_service_role_write ON zone_assignments;
CREATE POLICY zone_assignments_service_role_write ON zone_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- break_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS break_assignments_anon_authenticated_read ON break_assignments;
DROP POLICY IF EXISTS break_assignments_anon_authenticated_all ON break_assignments;
DROP POLICY IF EXISTS break_assignments_service_role_write ON break_assignments;
CREATE POLICY break_assignments_service_role_write ON break_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- overlap_assignments
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS overlap_assignments_anon_authenticated_read ON overlap_assignments;
DROP POLICY IF EXISTS overlap_assignments_anon_authenticated_all ON overlap_assignments;
DROP POLICY IF EXISTS overlap_assignments_service_role_write ON overlap_assignments;
CREATE POLICY overlap_assignments_service_role_write ON overlap_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- night_slot_tasks
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS night_slot_tasks_anon_authenticated_read ON night_slot_tasks;
DROP POLICY IF EXISTS night_slot_tasks_anon_authenticated_all ON night_slot_tasks;
DROP POLICY IF EXISTS night_slot_tasks_service_role_write ON night_slot_tasks;
CREATE POLICY night_slot_tasks_service_role_write ON night_slot_tasks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- night_card_borders
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS night_card_borders_anon_authenticated_read ON night_card_borders;
DROP POLICY IF EXISTS night_card_borders_anon_authenticated_all ON night_card_borders;
DROP POLICY IF EXISTS night_card_borders_service_role_write ON night_card_borders;
CREATE POLICY night_card_borders_service_role_write ON night_card_borders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- night_tm_status
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS night_tm_status_anon_authenticated_read ON night_tm_status;
DROP POLICY IF EXISTS night_tm_status_anon_authenticated_all ON night_tm_status;
DROP POLICY IF EXISTS night_tm_status_service_role_write ON night_tm_status;
CREATE POLICY night_tm_status_service_role_write ON night_tm_status
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- call_offs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS call_offs_anon_authenticated_read ON call_offs;
DROP POLICY IF EXISTS call_offs_anon_authenticated_all ON call_offs;
DROP POLICY IF EXISTS call_offs_service_role_write ON call_offs;
CREATE POLICY call_offs_service_role_write ON call_offs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- tm_profiles (was SELECT-only for anon in 20260530; roster via session APIs)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tm_profiles_anon_authenticated_read ON tm_profiles;
DROP POLICY IF EXISTS tm_profiles_service_role ON tm_profiles;
CREATE POLICY tm_profiles_service_role ON tm_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- Residual open policies (idempotent with PR 6 knowledge migration)
-- ---------------------------------------------------------------------------
ALTER TABLE ops_ai_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_ai_feedback_all ON ops_ai_feedback;
DROP POLICY IF EXISTS ops_ai_feedback_service_role ON ops_ai_feedback;
CREATE POLICY ops_ai_feedback_service_role
  ON ops_ai_feedback
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

ALTER TABLE ops_supervisor_knowledge ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_supervisor_knowledge_all ON ops_supervisor_knowledge;
DROP POLICY IF EXISTS ops_supervisor_knowledge_service_role ON ops_supervisor_knowledge;
CREATE POLICY ops_supervisor_knowledge_service_role
  ON ops_supervisor_knowledge
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
