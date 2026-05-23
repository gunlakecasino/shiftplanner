-- =============================================================================
-- Add "is_default_on_new_night" flag to slot_task_catalog
-- =============================================================================
-- This allows the operator (via Sudo > Tasks tab) to mark which catalog entries
-- should be automatically seeded onto every new night.
--
-- Combined with the new seedDefaultTasksForNight() helper, this replaces
-- manual "copy from yesterday" workflows for the recurring daily tasks
-- (RR cleanings, zone sweeps, overlaps, etc.).
--
-- Sweepers and other day-specific heavy tasks can simply remain unmarked.
-- =============================================================================

BEGIN;

ALTER TABLE slot_task_catalog
  ADD COLUMN IF NOT EXISTS is_default_on_new_night boolean NOT NULL DEFAULT false;

-- Helpful index for the seeding query
CREATE INDEX IF NOT EXISTS slot_task_catalog_defaults_idx
  ON slot_task_catalog (is_default_on_new_night)
  WHERE is_default_on_new_night = true;

-- Optional: backfill some obvious daily defaults from the current data
-- (the operator can adjust these in the UI after the column exists)
-- UPDATE slot_task_catalog SET is_default_on_new_night = true
-- WHERE label IN ('Buffet RR', 'Family RR', 'Elevators & Stairwells', ...);

COMMIT;

-- After applying this migration, run the new seed function or use the
-- "Apply daily defaults" button in Sudo > Tasks.