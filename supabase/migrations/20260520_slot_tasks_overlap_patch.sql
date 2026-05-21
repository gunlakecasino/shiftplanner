-- =============================================================================
-- Patch migration: add 'overlap' slot_type to the catalog + selection tables,
-- and allow zone_assignments to hold overlap slot rows.
-- =============================================================================
-- Run AFTER 20260520_slot_tasks.sql.
--
-- The breaks view has an OVERLAPS section with 12 slots (6 PM at 11p-1a + 6 AM
-- at 5a-7a). They live in zone_assignments with slot_type='overlap' and
-- slot_key='overlap_pm_0..5' / 'overlap_am_0..5'. Tasks attach the same way
-- as zones / RRs / aux. No new table needed.
-- =============================================================================

BEGIN;

-- 1. Allow 'overlap' on the catalog + selections tables.
ALTER TABLE slot_task_catalog
  DROP CONSTRAINT IF EXISTS slot_task_catalog_slot_type_check;
ALTER TABLE slot_task_catalog
  ADD CONSTRAINT slot_task_catalog_slot_type_check
  CHECK (slot_type IN ('zone','rr','aux','overlap'));

ALTER TABLE night_slot_tasks
  DROP CONSTRAINT IF EXISTS night_slot_tasks_slot_type_check;
ALTER TABLE night_slot_tasks
  ADD CONSTRAINT night_slot_tasks_slot_type_check
  CHECK (slot_type IN ('zone','rr','aux','overlap'));

-- 2. If zone_assignments has a slot_type CHECK constraint, widen it too. If
--    the column is unconstrained text, this is a no-op (the DROP IF EXISTS
--    safely skips).
ALTER TABLE zone_assignments
  DROP CONSTRAINT IF EXISTS zone_assignments_slot_type_check;
ALTER TABLE zone_assignments
  ADD CONSTRAINT zone_assignments_slot_type_check
  CHECK (slot_type IN ('zone','rr','aux','overlap'));

-- 3. Seed catalog rows for the 12 overlap slots. Operator can edit / add via
--    Supabase Studio later, or via the in-app custom-task input.
INSERT INTO slot_task_catalog (slot_key, slot_type, rr_side, label, sort_order) VALUES
  ('overlap_pm_0', 'overlap', NULL, 'PM Overlap 1 (11p-1a)', 0),
  ('overlap_pm_1', 'overlap', NULL, 'PM Overlap 2 (11p-1a)', 0),
  ('overlap_pm_2', 'overlap', NULL, 'PM Overlap 3 (11p-1a)', 0),
  ('overlap_pm_3', 'overlap', NULL, 'PM Overlap 4 (11p-1a)', 0),
  ('overlap_pm_4', 'overlap', NULL, 'PM Overlap 5 (11p-1a)', 0),
  ('overlap_pm_5', 'overlap', NULL, 'PM Overlap 6 (11p-1a)', 0),
  ('overlap_am_0', 'overlap', NULL, 'AM Overlap 1 (5a-7a)', 0),
  ('overlap_am_1', 'overlap', NULL, 'AM Overlap 2 (5a-7a)', 0),
  ('overlap_am_2', 'overlap', NULL, 'AM Overlap 3 (5a-7a)', 0),
  ('overlap_am_3', 'overlap', NULL, 'AM Overlap 4 (5a-7a)', 0),
  ('overlap_am_4', 'overlap', NULL, 'AM Overlap 5 (5a-7a)', 0),
  ('overlap_am_5', 'overlap', NULL, 'AM Overlap 6 (5a-7a)', 0)
ON CONFLICT DO NOTHING;

COMMIT;
