-- =============================================================================
-- ShiftBuilder /projects — Task Pools
-- =============================================================================
-- A pool is a named grouping of Ops Tasks that get distributed across people
-- (successor concept to the hardcoded AM Overlap Pool). A task joins a pool via
-- ops_work_items.pool_id; distribution assigns those tasks' assignee_tm_id
-- across the roster (see /api/shiftbuilder/projects/pools/[id]/distribute).
--
-- Additive only. Reads open to anon/authenticated (client + realtime); writes
-- go through the service-role API, same posture as the rest of the projects
-- feature.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ops_task_pools (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  description       text,
  distribution_mode text NOT NULL DEFAULT 'round_robin'
                      CHECK (distribution_mode IN ('random', 'round_robin', 'manual')),
  active            boolean NOT NULL DEFAULT true,
  created_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ops_work_items
  ADD COLUMN IF NOT EXISTS pool_id uuid REFERENCES ops_task_pools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ops_work_items_pool_id_idx ON ops_work_items (pool_id);

ALTER TABLE ops_task_pools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_task_pools_read ON ops_task_pools;
CREATE POLICY ops_task_pools_read ON ops_task_pools
  FOR SELECT
  USING (auth.role() IN ('anon', 'authenticated'));

DROP POLICY IF EXISTS ops_task_pools_service_write ON ops_task_pools;
CREATE POLICY ops_task_pools_service_write ON ops_task_pools
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ops_task_pools'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops_task_pools;
  END IF;
END $$;

COMMIT;
