-- Speed up /logs person + day filters

BEGIN;

CREATE INDEX IF NOT EXISTS today_assignment_changes_operator_night_idx
  ON today_assignment_changes (night_date, operator_name, created_at DESC);

COMMIT;