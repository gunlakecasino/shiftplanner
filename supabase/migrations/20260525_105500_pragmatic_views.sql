-- =============================================================================
-- Phase 1: Pragmatic Transition Views (Schema-Aware)
-- =============================================================================
-- These views are deliberately conservative to avoid breaking on real schema differences.
-- They provide useful unified access without forcing perfect unions yet.
-- =============================================================================

BEGIN;

-- Clean view for zone assignments only
CREATE OR REPLACE VIEW public.v_zone_assignments_current AS
SELECT 
  night_id as grave_shift_id,
  slot_key,
  tm_id,
  is_filled,
  is_locked,
  updated_at
FROM zone_assignments
WHERE slot_type = 'zone';

-- Basic view for overlap work (using actual columns)
CREATE OR REPLACE VIEW public.v_overlap_work_current AS
SELECT 
  night_id as grave_shift_id,
  overlap_window,
  position,
  tm_id,
  is_filled,
  task,
  updated_at
FROM overlap_assignments;

COMMENT ON VIEW public.v_zone_assignments_current IS 'Phase 1 safe view for zone work.';
COMMENT ON VIEW public.v_overlap_work_current IS 'Phase 1 view for overlap/aux work using actual schema.';

COMMIT;