-- =============================================================================
-- Recurring Ops Task auto-generation (pg_cron)
-- =============================================================================
-- Materializes instances of active recurring templates on a daily schedule, so
-- "every Monday" / "the 15th" tasks appear without anyone clicking Generate.
--
-- Templates are ops_work_items with work_type='recurring' AND is_slot_default=false
-- (slot-default chips are a separate mechanism — they materialize per-night via
-- applySlotDefaultsToNight, not here).
--
-- ops_next_recurrence_date() mirrors src/lib/tasks/recurrence.ts (computeNextDueDate)
-- — KEEP THE TWO IN SYNC. The TS version is the tested source of truth (19 tests
-- in recurrence.test.ts); this SQL exists only so a DB-side cron can run offline.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Next-occurrence date (mirror of computeNextDueDate) ──────────────────────
CREATE OR REPLACE FUNCTION ops_next_recurrence_date(
  p_rtype text,
  p_rdays jsonb,
  p_advance integer,
  p_from date
) RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  days int[];
  i int;
  cand date;
  month_days int[];
  d int;
  dom int;
  next_month date;
  days_in_next int;
BEGIN
  IF p_rtype IN ('daily', 'custom') THEN
    RETURN p_from + GREATEST(COALESCE(p_advance, 1), 1);
  END IF;

  IF p_rtype IN ('weekly', 'biweekly') THEN
    SELECT array_agg(value::int) INTO days
      FROM jsonb_array_elements_text(COALESCE(p_rdays, '[]'::jsonb)) AS value
      WHERE value::int BETWEEN 0 AND 6;
    IF days IS NULL OR array_length(days, 1) IS NULL THEN RETURN NULL; END IF;
    -- weekly: first matching weekday after p_from. biweekly: same but >= 8 days out.
    FOR i IN 1 .. (CASE WHEN p_rtype = 'biweekly' THEN 28 ELSE 14 END) LOOP
      cand := p_from + i;
      IF EXTRACT(dow FROM cand)::int = ANY(days) THEN
        IF p_rtype = 'weekly' OR i >= 8 THEN
          RETURN cand;
        END IF;
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  IF p_rtype = 'monthly' THEN
    SELECT array_agg(value::int ORDER BY value::int) INTO month_days
      FROM jsonb_array_elements_text(COALESCE(p_rdays, '[]'::jsonb)) AS value
      WHERE value::int BETWEEN 1 AND 31;
    IF month_days IS NULL OR array_length(month_days, 1) IS NULL THEN RETURN NULL; END IF;
    dom := EXTRACT(day FROM p_from)::int;
    -- next configured day later this month
    FOREACH d IN ARRAY month_days LOOP
      IF d > dom AND d <= EXTRACT(day FROM (date_trunc('month', p_from) + interval '1 month - 1 day'))::int THEN
        RETURN date_trunc('month', p_from)::date + (d - 1);
      END IF;
    END LOOP;
    -- else smallest configured day next month (clamped to that month's length)
    next_month := (date_trunc('month', p_from) + interval '1 month')::date;
    days_in_next := EXTRACT(day FROM (date_trunc('month', next_month) + interval '1 month - 1 day'))::int;
    RETURN next_month + (LEAST(month_days[1], days_in_next) - 1);
  END IF;

  RETURN NULL;
END;
$$;

-- ── Daily generator ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ops_generate_due_recurring_tasks(p_date date DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t record;
  v_created integer := 0;
  v_next date;
  v_guard int;
BEGIN
  FOR t IN
    SELECT * FROM ops_work_items
    WHERE work_type = 'recurring'
      AND COALESCE(is_slot_default, false) = false
      AND active = true
      AND archived_at IS NULL
      AND next_due_date IS NOT NULL
  LOOP
    v_next := t.next_due_date;
    v_guard := 0;
    -- Catch up any missed occurrences (capped so a long-dormant template can't flood).
    WHILE v_next IS NOT NULL AND v_next <= p_date AND v_guard < 60 LOOP
      v_guard := v_guard + 1;

      IF NOT EXISTS (
        SELECT 1 FROM ops_work_items i
        WHERE i.parent_template_id = t.id AND i.due_date = v_next AND i.work_type = 'task'
      ) THEN
        INSERT INTO ops_work_items (
          work_type, title, description, department, project_id, priority, category,
          status, assignee_type, assignee_tm_id, due_date, due_shift, parent_template_id,
          created_by_name, updated_by_name
        ) VALUES (
          'task', t.title, t.description, t.department, t.project_id, t.priority, t.category,
          'not_started', t.assignee_type, t.assignee_tm_id, v_next, t.due_shift, t.id,
          'Recurrence generator', 'Recurrence generator'
        );
        v_created := v_created + 1;
      END IF;

      v_next := ops_next_recurrence_date(t.recurrence_type, t.recurrence_days, t.advance_days, v_next);
    END LOOP;

    IF v_next IS DISTINCT FROM t.next_due_date THEN
      UPDATE ops_work_items SET next_due_date = v_next, updated_at = now() WHERE id = t.id;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$$;

-- ── Schedule: daily at 09:00 (server tz) ─────────────────────────────────────
SELECT cron.unschedule('ops-generate-due-tasks')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ops-generate-due-tasks');
SELECT cron.schedule('ops-generate-due-tasks', '0 9 * * *', $cron$ SELECT ops_generate_due_recurring_tasks(); $cron$);

COMMIT;
