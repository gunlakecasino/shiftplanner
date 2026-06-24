-- Card Defaults tables were created with authenticated-only RLS.
-- Local dev often uses NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY (bypasses RLS);
-- production ShiftBuilder uses anon only → SELECT returns [] for slot_default_tasks.
-- Writes already go through /api/shiftbuilder/mutations (service_role).

BEGIN;

-- slot_defaults
DROP POLICY IF EXISTS slot_defaults_authenticated_all ON slot_defaults;
DROP POLICY IF EXISTS slot_defaults_anon_authenticated_all ON slot_defaults;
DROP POLICY IF EXISTS slot_defaults_anon_authenticated_read ON slot_defaults;
DROP POLICY IF EXISTS slot_defaults_service_role_write ON slot_defaults;

CREATE POLICY slot_defaults_anon_authenticated_read ON slot_defaults
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY slot_defaults_service_role_write ON slot_defaults
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- slot_default_tasks
DROP POLICY IF EXISTS slot_default_tasks_authenticated_all ON slot_default_tasks;
DROP POLICY IF EXISTS slot_default_tasks_anon_authenticated_all ON slot_default_tasks;
DROP POLICY IF EXISTS slot_default_tasks_anon_authenticated_read ON slot_default_tasks;
DROP POLICY IF EXISTS slot_default_tasks_service_role_write ON slot_default_tasks;

CREATE POLICY slot_default_tasks_anon_authenticated_read ON slot_default_tasks
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY slot_default_tasks_service_role_write ON slot_default_tasks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;