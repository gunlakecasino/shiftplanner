-- P0 security: revoke anon INSERT/UPDATE/DELETE on ops tables.
-- Browser reads may still use anon SELECT until fully migrated to gated APIs.
-- All writes must go through /api/shiftbuilder/mutations (service role + session).

BEGIN;

-- zone_assignments
DROP POLICY IF EXISTS zone_assignments_anon_authenticated_all ON zone_assignments;
CREATE POLICY zone_assignments_anon_authenticated_read ON zone_assignments
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY zone_assignments_service_role_write ON zone_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- nights
DROP POLICY IF EXISTS nights_anon_authenticated_all ON nights;
CREATE POLICY nights_anon_authenticated_read ON nights
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY nights_service_role_write ON nights
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- break_assignments
DROP POLICY IF EXISTS break_assignments_anon_authenticated_all ON break_assignments;
CREATE POLICY break_assignments_anon_authenticated_read ON break_assignments
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY break_assignments_service_role_write ON break_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- overlap_assignments
DROP POLICY IF EXISTS overlap_assignments_anon_authenticated_all ON overlap_assignments;
CREATE POLICY overlap_assignments_anon_authenticated_read ON overlap_assignments
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY overlap_assignments_service_role_write ON overlap_assignments
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- night_slot_tasks
DROP POLICY IF EXISTS night_slot_tasks_anon_authenticated_all ON night_slot_tasks;
CREATE POLICY night_slot_tasks_anon_authenticated_read ON night_slot_tasks
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY night_slot_tasks_service_role_write ON night_slot_tasks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- night_card_borders
DROP POLICY IF EXISTS night_card_borders_anon_authenticated_all ON night_card_borders;
CREATE POLICY night_card_borders_anon_authenticated_read ON night_card_borders
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY night_card_borders_service_role_write ON night_card_borders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- night_tm_status
DROP POLICY IF EXISTS night_tm_status_anon_authenticated_all ON night_tm_status;
CREATE POLICY night_tm_status_anon_authenticated_read ON night_tm_status
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY night_tm_status_service_role_write ON night_tm_status
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- call_offs
DROP POLICY IF EXISTS call_offs_anon_authenticated_all ON call_offs;
CREATE POLICY call_offs_anon_authenticated_read ON call_offs
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));
CREATE POLICY call_offs_service_role_write ON call_offs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- weeks: read-only for anon (no client week creation)
DROP POLICY IF EXISTS weeks_anon_authenticated_insert ON weeks;

COMMIT;