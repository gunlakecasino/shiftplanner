-- P0 security: close open using(true) policies on ops AI feedback + supervisor knowledge.
-- Browser clients must not INSERT/UPDATE/SELECT these tables directly (anon key).
-- All access goes through session-gated /api/shiftbuilder/mutations (service_role).
--
-- Reverse (emergency only — re-opens anon hole):
--   DROP POLICY IF EXISTS ops_ai_feedback_service_role ON ops_ai_feedback;
--   DROP POLICY IF EXISTS ops_supervisor_knowledge_service_role ON ops_supervisor_knowledge;
--   CREATE POLICY ops_ai_feedback_all ON ops_ai_feedback FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY ops_supervisor_knowledge_all ON ops_supervisor_knowledge FOR ALL USING (true) WITH CHECK (true);

BEGIN;

-- ops_ai_feedback
ALTER TABLE ops_ai_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_ai_feedback_all ON ops_ai_feedback;
DROP POLICY IF EXISTS ops_ai_feedback_service_role ON ops_ai_feedback;

CREATE POLICY ops_ai_feedback_service_role
  ON ops_ai_feedback
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ops_supervisor_knowledge
ALTER TABLE ops_supervisor_knowledge ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_supervisor_knowledge_all ON ops_supervisor_knowledge;
DROP POLICY IF EXISTS ops_supervisor_knowledge_service_role ON ops_supervisor_knowledge;

CREATE POLICY ops_supervisor_knowledge_service_role
  ON ops_supervisor_knowledge
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
