-- =============================================================================
-- Phase 1: Corrected Pragmatic Unified Assignment Views
-- =============================================================================
-- Based on live schema inspection:
-- - zone_assignments: slot_key, slot_type, rich flags (is_sweeper, has_trainee, etc.)
-- - break_assignments: slot_ref (not slot_key), break_wave, group_num
-- - overlap_assignments: overlap_window, position, task
--
-- This view provides a normalized, queryable layer without breaking existing systems.
-- =============================================================================

BEGIN;

DROP VIEW IF EXISTS public.v_current_assignments;

CREATE OR REPLACE VIEW public.v_current_assignments AS
-- Zones (primary rich assignment)
SELECT 
  za.night_id AS grave_shift_id,
  za.slot_key,
  za.slot_type,
  za.tm_id,
  'zone' AS category,
  za.is_filled,
  za.is_locked,
  za.has_trainee,
  za.trainee_name,
  za.is_sweeper,
  za.sweeper_route,
  za.group_num,
  za.updated_at
FROM zone_assignments za
WHERE za.slot_type = 'zone'

UNION ALL

-- Restrooms / Breaks (using actual slot_ref)
SELECT 
  ba.night_id AS grave_shift_id,
  ba.slot_ref AS slot_key,
  'rr' AS slot_type,
  ba.tm_id,
  'restroom' AS category,
  true AS is_filled,  -- row existence implies assignment
  ba.is_wave_locked AS is_locked,
  false AS has_trainee,
  NULL AS trainee_name,
  false AS is_sweeper,
  NULL AS sweeper_route,
  ba.group_num,
  ba.created_at AS updated_at
FROM break_assignments ba

UNION ALL

-- Overlaps / Aux (using actual columns)
SELECT 
  oa.night_id AS grave_shift_id,
  COALESCE(oa.overlap_window, 'overlap_' || oa.position::text) AS slot_key,
  'overlap' AS slot_type,
  oa.tm_id,
  'aux_or_overlap' AS category,
  oa.is_filled,
  false AS is_locked,
  false AS has_trainee,
  NULL AS trainee_name,
  false AS is_sweeper,
  NULL AS sweeper_route,
  NULL AS group_num,
  oa.updated_at
FROM overlap_assignments oa;

COMMENT ON VIEW public.v_current_assignments IS 
'Phase 1 corrected unified view. Normalizes legacy fragmented assignment tables for new Ops Hub and agent consumption. Safe read layer.';

-- Helpful index suggestions (run manually if performance warrants)
-- CREATE INDEX IF NOT EXISTS idx_v_current_assignments_grave_shift ON public.v_current_assignments(grave_shift_id);

COMMIT;