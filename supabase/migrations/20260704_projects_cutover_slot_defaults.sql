-- =============================================================================
-- ShiftBuilder /projects — cutover phase 1: slot-default columns
-- =============================================================================
-- A slot-linked Ops Task can now carry the metadata needed to materialize a
-- night_slot_tasks card chip (the successor to slot_default_tasks). is_slot_default
-- marks these "default chip" rows so they are excluded from the tracker views
-- (List/Board/Calendar/Recurring) and consumed only by the night materializer.
-- The slot key itself reuses the existing ops_work_items.zone_slot_key column.
--
-- Additive only. Nothing is imported or wired here — the legacy slot_default_tasks
-- table and pushTaskDefaultsToNight remain the live path until the gated flip.
-- =============================================================================

BEGIN;

ALTER TABLE ops_work_items
  ADD COLUMN IF NOT EXISTS is_slot_default boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slot_key text,
  ADD COLUMN IF NOT EXISTS slot_type text,
  ADD COLUMN IF NOT EXISTS rr_side text,
  ADD COLUMN IF NOT EXISTS task_color text,
  ADD COLUMN IF NOT EXISTS is_coverage boolean NOT NULL DEFAULT false;

-- Fast lookup for the materializer (all active slot-default chips for a department).
CREATE INDEX IF NOT EXISTS ops_work_items_slot_default_idx
  ON ops_work_items (department, is_slot_default, active)
  WHERE is_slot_default = true;

CREATE INDEX IF NOT EXISTS ops_work_items_slot_key_idx
  ON ops_work_items (slot_key)
  WHERE slot_key IS NOT NULL;

COMMIT;
