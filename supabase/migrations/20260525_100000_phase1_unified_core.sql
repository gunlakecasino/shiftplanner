-- =============================================================================
-- Phase 1: Unified Operational Core — grave_shifts + shift_activities
-- =============================================================================
-- This migration introduces the new canonical model for the GRAVE Ops Shift Hub.
--
-- Tables:
--   - grave_shifts (evolution of nights)
--   - shift_activities (central append-only activity log)
--
-- Strategy:
-- - Non-breaking for existing systems.
-- - New tables are additive.
-- - Old tables (nights, zone_assignments, etc.) remain in place during transition.
-- - Future work will route through the new model.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. grave_shifts (new canonical shift entity)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grave_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date date NOT NULL,
  week_id uuid REFERENCES weeks(id),
  
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived', 'locked')),
  is_locked boolean NOT NULL DEFAULT false,
  locked_by text,
  locked_at timestamptz,
  
  notes text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  updated_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS grave_shifts_shift_date_idx ON grave_shifts(shift_date);
CREATE INDEX IF NOT EXISTS grave_shifts_week_id_idx ON grave_shifts(week_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_grave_shifts_updated_at ON grave_shifts;
CREATE TRIGGER trg_grave_shifts_updated_at
  BEFORE UPDATE ON grave_shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. shift_activities (the heart of the Ops Hub)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grave_shift_id uuid NOT NULL REFERENCES grave_shifts(id) ON DELETE CASCADE,
  
  activity_type text NOT NULL,                    -- 'zone_assignment', 'break_start', 'note', 'event', 'task_completed', 'agent_decision', etc.
  slot_key text,
  slot_type text,
  tm_id text,
  
  payload jsonb NOT NULL DEFAULT '{}',
  summary text,
  
  actor_type text NOT NULL DEFAULT 'operator' CHECK (actor_type IN ('operator', 'agent', 'system', 'edge_function')),
  actor_id text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_activities_grave_shift_id_idx ON shift_activities(grave_shift_id, created_at);
CREATE INDEX IF NOT EXISTS shift_activities_activity_type_idx ON shift_activities(activity_type);
CREATE INDEX IF NOT EXISTS shift_activities_tm_id_idx ON shift_activities(tm_id);

-- Optional: Add GIN index on payload for future advanced queries
-- CREATE INDEX IF NOT EXISTS shift_activities_payload_gin ON shift_activities USING GIN (payload);

-- -----------------------------------------------------------------------------
-- 3. Basic RLS (will be hardened further in Phase 2)
-- -----------------------------------------------------------------------------
ALTER TABLE grave_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_activities ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY grave_shifts_service_role ON grave_shifts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY shift_activities_service_role ON shift_activities FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Authenticated read (baseline — will be tightened)
CREATE POLICY grave_shifts_authenticated_read ON grave_shifts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY shift_activities_authenticated_read ON shift_activities FOR SELECT USING (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- 4. Migration Helper: Backfill from existing nights (one-time)
-- -----------------------------------------------------------------------------
-- This is commented out intentionally. It should be run manually or via a controlled script after review.
--
-- INSERT INTO grave_shifts (id, shift_date, week_id, status, is_locked, notes, created_at, updated_at)
-- SELECT id, night_date, week_id, status, is_locked, notes, created_at, updated_at
-- FROM nights
-- ON CONFLICT DO NOTHING;

COMMENT ON TABLE grave_shifts IS 'Canonical entity for a GRAVE operational shift. Replaces/extends the old nights table.';
COMMENT ON TABLE shift_activities IS 'Append-only central log of everything that occurs during a GRAVE shift. The foundation for the Ops Hub and agent intelligence.';

COMMIT;