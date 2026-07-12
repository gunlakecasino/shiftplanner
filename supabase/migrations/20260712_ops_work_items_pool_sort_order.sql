-- Overlap pool fine rank within priority tier (Phase D).
-- Lower pool_sort_order = more important when priority ties.
-- null → treated as last in cutPoolForStaffing.

BEGIN;

ALTER TABLE ops_work_items
  ADD COLUMN IF NOT EXISTS pool_sort_order integer;

COMMENT ON COLUMN ops_work_items.pool_sort_order IS
  'Optional rank within priority for slot-default / OL standing pools; lower = higher importance.';

COMMIT;
