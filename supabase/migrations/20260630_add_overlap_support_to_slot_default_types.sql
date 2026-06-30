-- =============================================================================
-- Patch: allow 'overlap' slot_type on the Card Defaults tables.
-- This enables configuring default tasks and break groups for overlap slots
-- (AM/PM Overlaps) in Sudo > Card Defaults.
-- Run this in Supabase SQL editor if the migration didn't apply cleanly.
-- =============================================================================

-- Widen the CHECK on slot_default_tasks (the one that was failing on add).
ALTER TABLE slot_default_tasks
  DROP CONSTRAINT IF EXISTS slot_default_tasks_slot_type_check;

ALTER TABLE slot_default_tasks
  ADD CONSTRAINT slot_default_tasks_slot_type_check
  CHECK (slot_type IN ('zone','rr','aux','overlap'));

-- Also widen slot_defaults table if it has a similar constraint (for consistency
-- when upserting break defaults for overlap slots).
ALTER TABLE slot_defaults
  DROP CONSTRAINT IF EXISTS slot_defaults_slot_type_check;

ALTER TABLE slot_defaults
  ADD CONSTRAINT slot_defaults_slot_type_check
  CHECK (slot_type IN ('zone','rr','aux','overlap'));

-- Fix any existing rows that might have null rr_side (for non-RR slots like overlap/zone/aux).
UPDATE slot_default_tasks SET rr_side = '' WHERE rr_side IS NULL;

-- Seed the 6 example tasks from your screenshot into the AM Overlap Pool
-- (they will be collected + randomly distributed by pushTaskDefaultsToNight).
-- Using overlap_am_0 as the canonical key for the "pool" (per our DefaultsTab logic).
INSERT INTO slot_default_tasks (slot_key, slot_type, rr_side, task_label, sort_order, is_coverage)
VALUES
  ('overlap_am_0', 'overlap', '', 'Hotel + CBK Offices', 10, false),
  ('overlap_am_0', 'overlap', '', 'Shikode + CBK', 20, false),
  ('overlap_am_0', 'overlap', '', '131 / Green Rooms', 30, false),
  ('overlap_am_0', 'overlap', '', 'Sandhill Cafe / Express / Lobby', 40, false),
  ('overlap_am_0', 'overlap', '', 'CBK / Shikode BOH', 50, false),
  ('overlap_am_0', 'overlap', '', 'Lobby / Trash', 60, false)
ON CONFLICT (slot_key, rr_side, task_label) DO NOTHING;
