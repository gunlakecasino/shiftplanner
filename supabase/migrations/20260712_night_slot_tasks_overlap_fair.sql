-- Overlap fair apply (PR3) + one-off chips (PR4)
-- source_work_item_id: template write-through for fair history across renames
-- is_one_off: preserve manual OL chips across Apply Overlap; weight 0 in fairness
--
-- Fair production path: OVERLAP_FAIR_APPLY=1 on the server (default unset/0 = random_fallback).
-- Keep env off until this migration is applied and TasksPad/manual OL adds set is_one_off.

BEGIN;

ALTER TABLE night_slot_tasks
  ADD COLUMN IF NOT EXISTS source_work_item_id UUID REFERENCES ops_work_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS night_slot_tasks_source_work_item_id_idx
  ON night_slot_tasks (source_work_item_id) WHERE source_work_item_id IS NOT NULL;

ALTER TABLE night_slot_tasks
  ADD COLUMN IF NOT EXISTS is_one_off BOOLEAN NOT NULL DEFAULT false;

COMMIT;
