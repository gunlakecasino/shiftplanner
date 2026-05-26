-- =============================================================================
-- Fix May 29 group-level overlap task rows
-- =============================================================================
-- Root cause: the 2026-05-26_copy_may22_tasks_to_late_may_june migration used
-- a legacy group-level slot_key format for May 29 overlap tasks:
--   slot_key = 'overlap_am'  (4 rows) — no card index
--   slot_key = 'overlap_pm'  (3 rows) — no card index
--
-- The ShiftBuilder's dbToUi() function only handles the per-card format:
--   'overlap_am_0' .. 'overlap_am_5' → OL-AM-0..5
--   'overlap_pm_0' .. 'overlap_pm_5' → OL-PM-0..5
--
-- Group-level keys return 'UNK:overlap_am' / 'UNK:overlap_pm', which are
-- silently skipped in the task-loading loop — so these tasks never appear
-- on any overlap card in the UI.
--
-- Fix:
--   1. DELETE the 4 group-level overlap_am rows for May 29 — they are exact
--      content-duplicates of the per-card overlap_am_0..5 rows that already
--      exist for that night (written by a separate migration earlier today).
--
--   2. CONVERT the 3 group-level overlap_pm rows for May 29 to per-card rows
--      overlap_pm_0, overlap_pm_1, overlap_pm_2 (where TMs are already
--      assigned), stripping the "PM Overlap: " label prefix. Then delete
--      the original group-level rows.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_night_id uuid;
  v_slot_idx  int := 0;
  v_task      RECORD;
  v_new_label text;
BEGIN
  -- Resolve the May 29 night row
  SELECT id INTO v_night_id
  FROM public.nights
  WHERE night_date = '2026-05-29';

  IF v_night_id IS NULL THEN
    RAISE NOTICE 'No night row found for 2026-05-29 — nothing to fix.';
  ELSE

    -- -------------------------------------------------------------------------
    -- Part 1: Delete group-level overlap_am rows (content duplicates of per-card)
    -- -------------------------------------------------------------------------
    DELETE FROM public.night_slot_tasks
    WHERE night_id  = v_night_id
      AND slot_key  = 'overlap_am'
      AND slot_type = 'overlap';

    RAISE NOTICE 'Deleted group-level overlap_am tasks for May 29 (duplicates of per-card rows).';

    -- -------------------------------------------------------------------------
    -- Part 2: Convert group-level overlap_pm rows to per-card format
    --         Assigned sequentially: pm_0, pm_1, pm_2 (alphabetical label order)
    --         These are the only PM overlap tasks for May 29.
    -- -------------------------------------------------------------------------
    FOR v_task IN
      SELECT *
      FROM public.night_slot_tasks
      WHERE night_id  = v_night_id
        AND slot_key  = 'overlap_pm'
        AND slot_type = 'overlap'
      ORDER BY task_label  -- deterministic order: Glass → Tables → Vacuuming
    LOOP
      -- Strip the "PM Overlap: " prefix if present
      v_new_label := REGEXP_REPLACE(v_task.task_label, '^PM Overlap:\s*', '');

      INSERT INTO public.night_slot_tasks (
        night_id,
        slot_key,
        slot_type,
        rr_side,
        task_label,
        sort_order,
        is_coverage,
        catalog_task_id,
        color
      ) VALUES (
        v_night_id,
        'overlap_pm_' || v_slot_idx,
        'overlap',
        NULL,
        v_new_label,
        COALESCE(v_task.sort_order, 50),
        COALESCE(v_task.is_coverage, false),
        v_task.catalog_task_id,
        v_task.color
      )
      ON CONFLICT DO NOTHING;

      RAISE NOTICE 'Created night_slot_task: overlap_pm_% = "%"', v_slot_idx, v_new_label;
      v_slot_idx := v_slot_idx + 1;
    END LOOP;

    -- Delete the original group-level overlap_pm rows now that per-card rows exist
    DELETE FROM public.night_slot_tasks
    WHERE night_id  = v_night_id
      AND slot_key  = 'overlap_pm'
      AND slot_type = 'overlap';

    RAISE NOTICE 'Deleted group-level overlap_pm rows; % per-card rows created.', v_slot_idx;

  END IF;
END $$;

COMMIT;
