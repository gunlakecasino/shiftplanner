-- A/B position labels for dual-TM coverage (shown on the target card, e.g. 6A / 6B).
ALTER TABLE public.night_slot_tasks
ADD COLUMN IF NOT EXISTS coverage_side text;

ALTER TABLE public.night_slot_tasks
DROP CONSTRAINT IF EXISTS night_slot_tasks_coverage_side_check;

ALTER TABLE public.night_slot_tasks
ADD CONSTRAINT night_slot_tasks_coverage_side_check
CHECK (coverage_side IS NULL OR coverage_side IN ('A', 'B'));

COMMENT ON COLUMN public.night_slot_tasks.coverage_side IS
  'When is_coverage=true, optional A/B side for dual-coverer display on the target slot card.';