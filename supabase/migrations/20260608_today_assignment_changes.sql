-- Append-only audit log for /today quick pre-shift edits (operator name captured at entry).

BEGIN;

CREATE TABLE IF NOT EXISTS today_assignment_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  night_id uuid NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  night_date date NOT NULL,
  operator_name text NOT NULL,
  action text NOT NULL CHECK (action IN ('assign', 'unassign', 'lock', 'unlock')),
  slot_key text NOT NULL,
  slot_type text,
  rr_side text,
  previous_tm_id text,
  previous_tm_name text,
  new_tm_id text,
  new_tm_name text,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS today_assignment_changes_night_date_idx
  ON today_assignment_changes (night_date, created_at DESC);

CREATE INDEX IF NOT EXISTS today_assignment_changes_night_id_idx
  ON today_assignment_changes (night_id, created_at DESC);

ALTER TABLE today_assignment_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY today_assignment_changes_service_role
  ON today_assignment_changes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY today_assignment_changes_authenticated_read
  ON today_assignment_changes
  FOR SELECT
  USING (auth.role() = 'authenticated');

COMMIT;