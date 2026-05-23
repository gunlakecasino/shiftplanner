-- ============================================================
-- Fix zone_assignments unique constraint: NULL rr_side handling
-- ============================================================
--
-- ROOT CAUSE:
--   The existing constraint UNIQUE(night_id, slot_type, slot_key, rr_side)
--   uses standard Postgres NULL semantics where NULL != NULL. This means
--   any upsert for a zone or aux slot (rr_side IS NULL) never triggers the
--   ON CONFLICT clause — every upsert silently inserts a new duplicate row
--   instead of updating the existing one.
--
-- SYMPTOM:
--   - Dragging a TM to a new slot appears to work in the UI (optimistic),
--     but after refresh the destination slot is empty.
--   - Swapping two TMs appears to clear both slots after refresh.
--   - The DB accumulates duplicate rows for the same logical slot.
--
-- FIX:
--   1. Deduplicate existing ghost rows (keep the most recently updated
--      non-null TM assignment per logical slot, falling back to most recent
--      row if all are null).
--   2. Drop the old constraint.
--   3. Recreate with NULLS NOT DISTINCT (Postgres 15+ / we are on 17).
--      This makes two rows with rr_side = NULL conflict as expected, so
--      ON CONFLICT triggers correctly and upserts update in place.
-- ============================================================

-- Step 1: Remove duplicate rows, keeping the best row per logical slot.
-- "Best" = non-null tm_id first, then most recently updated.
DELETE FROM zone_assignments
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY night_id, slot_type, slot_key, COALESCE(rr_side, '_none_')
             ORDER BY
               CASE WHEN tm_id IS NOT NULL THEN 0 ELSE 1 END,
               updated_at DESC NULLS LAST
           ) AS rn
    FROM zone_assignments
  ) ranked
  WHERE rn = 1
);

-- Step 2: Drop the old constraint that allowed multiple NULLs.
ALTER TABLE zone_assignments
  DROP CONSTRAINT IF EXISTS zone_assignments_night_id_slot_type_slot_key_rr_side_key;

-- Step 3: Recreate with NULLS NOT DISTINCT so NULL = NULL for conflict detection.
-- This makes ON CONFLICT(night_id, slot_type, slot_key, rr_side) fire correctly
-- even when rr_side is NULL, enabling proper upsert behavior for zone/aux slots.
ALTER TABLE zone_assignments
  ADD CONSTRAINT zone_assignments_night_id_slot_type_slot_key_rr_side_key
  UNIQUE NULLS NOT DISTINCT (night_id, slot_type, slot_key, rr_side);
