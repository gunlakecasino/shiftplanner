-- =============================================================================
-- Phase 3 Entry: Ops Domain Expansion Starter (Incidents / Events Foundation)
-- =============================================================================
-- This begins the expansion beyond pure shift planning into full Ops Hub domain
-- (incidents, compliance, huddles, equipment, training, etc.).
--
-- Starting small with a flexible incidents table that can evolve.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ops_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grave_shift_id uuid REFERENCES grave_shifts(id),
  incident_time timestamptz NOT NULL DEFAULT now(),
  category text NOT NULL,                    -- 'security', 'safety', 'guest', 'equipment', 'compliance', etc.
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title text NOT NULL,
  description text,
  tm_involved text[],                        -- array of tm_ids
  location text,
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);

CREATE INDEX IF NOT EXISTS ops_incidents_grave_shift_idx ON ops_incidents(grave_shift_id, incident_time);
CREATE INDEX IF NOT EXISTS ops_incidents_severity_idx ON ops_incidents(severity, resolved);

-- Basic RLS
ALTER TABLE ops_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY ops_incidents_service_role ON ops_incidents FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY ops_incidents_authenticated_read ON ops_incidents FOR SELECT USING (auth.role() = 'authenticated');

-- Trigger
DROP TRIGGER IF EXISTS trg_ops_incidents_updated_at ON ops_incidents;
CREATE TRIGGER trg_ops_incidents_updated_at
  BEFORE UPDATE ON ops_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE ops_incidents IS 'Phase 3 Ops Hub domain expansion starter. Flexible incident/compliance/ops event tracking tied to grave shifts.';

COMMIT;