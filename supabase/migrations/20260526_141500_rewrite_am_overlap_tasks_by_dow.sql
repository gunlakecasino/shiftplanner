-- =============================================================================
-- Rewrite AM overlap tasks by day of week (May 20 – Jun 11, 2026)
-- =============================================================================
-- Pattern:
--   Monday / Tuesday  → 3 tasks: Noodle Bar/CBK · Hotel Offices/CBK Offices ·
--                                  Sandhill Cafe/Express/Lobby
--   Wed – Sunday      → 4 tasks: Shkode/CBK · Hotel Offices/CBK Offices ·
--                                  Sandhill Cafe/Express/Lobby · 131/Green Rooms
--
-- Each task is written to a per-card slot (overlap_am_0, overlap_am_1, …) so
-- dbToUi() translates them correctly to OL-AM-0..5.
-- Existing AM overlap tasks for all affected nights are replaced wholesale.
-- =============================================================================

DO $$
DECLARE
  v_night  RECORD;
  v_tasks  text[];
  v_label  text;
  v_idx    int;
BEGIN
  FOR v_night IN
    SELECT id,
           night_date,
           EXTRACT(DOW FROM night_date)::int AS dow
    FROM   public.nights
    WHERE  night_date >= '2026-05-20'
    ORDER  BY night_date
  LOOP
    -- ── Choose task list by DOW (0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat) ──
    IF v_night.dow IN (1, 2) THEN
      -- Monday / Tuesday
      v_tasks := ARRAY[
        'Noodle Bar/CBK',
        'Hotel Offices/CBK Offices',
        'Sandhill Cafe/Express/Lobby'
      ];
    ELSE
      -- Wednesday through Sunday
      v_tasks := ARRAY[
        'Shkode/CBK',
        'Hotel Offices/CBK Offices',
        'Sandhill Cafe/Express/Lobby',
        '131/Green Rooms'
      ];
    END IF;

    -- ── Wipe existing AM overlap tasks for this night ─────────────────────────
    DELETE FROM public.night_slot_tasks
    WHERE  night_id  = v_night.id
      AND  slot_type = 'overlap'
      AND  slot_key  LIKE 'overlap_am_%';

    -- ── Insert fresh per-card AM tasks ────────────────────────────────────────
    v_idx := 0;
    FOREACH v_label IN ARRAY v_tasks LOOP
      INSERT INTO public.night_slot_tasks
        (night_id, slot_key, slot_type, rr_side, task_label, sort_order, is_coverage)
      VALUES
        (v_night.id, 'overlap_am_' || v_idx, 'overlap', NULL, v_label, v_idx * 10, false);
      v_idx := v_idx + 1;
    END LOOP;

    RAISE NOTICE '% (DOW %): % AM overlap tasks written.', v_night.night_date, v_night.dow, v_idx;
  END LOOP;
END $$;
