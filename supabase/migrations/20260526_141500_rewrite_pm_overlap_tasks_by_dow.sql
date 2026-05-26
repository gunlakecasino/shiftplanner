-- =============================================================================
-- Rewrite PM overlap tasks by day of week (May 20 – Jun 11, 2026+)
-- =============================================================================
-- Pattern (3 tasks per night → overlap_pm_0, pm_1, pm_2):
--
--   Monday / Wednesday → Booths and Ledges · Wipe Baseboards & Trim · Wipe Chair Bases
--   Tuesday            → Remove Butter from Walls · Clean White 3D Tile · Clean Glass Doors
--   Thu – Sun          → Vacuuming (2) · Glass & Countertops (1) · Tables & Restrooms (1)
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
    -- DOW: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    CASE v_night.dow
      WHEN 1, 3 THEN  -- Monday / Wednesday
        v_tasks := ARRAY[
          'Booths and Ledges',
          'Wipe Baseboards & Trim',
          'Wipe Chair Bases'
        ];
      WHEN 2 THEN     -- Tuesday
        v_tasks := ARRAY[
          'Remove Butter from Walls',
          'Clean White 3D Tile',
          'Clean Glass Doors'
        ];
      ELSE            -- Thursday / Friday / Saturday / Sunday
        v_tasks := ARRAY[
          'Vacuuming (2)',
          'Glass & Countertops (1)',
          'Tables & Restrooms (1)'
        ];
    END CASE;

    DELETE FROM public.night_slot_tasks
    WHERE  night_id  = v_night.id
      AND  slot_type = 'overlap'
      AND  slot_key  LIKE 'overlap_pm_%';

    v_idx := 0;
    FOREACH v_label IN ARRAY v_tasks LOOP
      INSERT INTO public.night_slot_tasks
        (night_id, slot_key, slot_type, rr_side, task_label, sort_order, is_coverage)
      VALUES
        (v_night.id, 'overlap_pm_' || v_idx, 'overlap', NULL, v_label, v_idx * 10, false);
      v_idx := v_idx + 1;
    END LOOP;

    RAISE NOTICE '% (DOW %): % PM tasks written', v_night.night_date, v_night.dow, v_idx;
  END LOOP;
END $$;
