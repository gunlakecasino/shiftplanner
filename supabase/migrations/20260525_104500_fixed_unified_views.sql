-- =============================================================================
-- Phase 1: Fixed Unified Assignment Views (Corrected for Real Schema)
-- =============================================================================

BEGIN;

DROP VIEW IF EXISTS public.v_unified_assignments;

CREATE OR REPLACE VIEW public.v_unified_assignments AS

-- Zone assignments (rich schema)
SELECT 
  za.night_id as grave_shift_id,
  za.slot_type,
  za.slot_key,
  za.tm_id,
  'zone' as category,
  za.is_filled,
  za.is_locked,
  za.updated_at
FROM zone_assignments za

UNION ALL

-- Break / RR assignments (uses slot_ref)
SELECT 
  ba.night_id,
  'rr' as slot_type,
  ba.slot_ref as slot_key,
  ba.tm_id,
  'restroom' as category,
  true as is_filled,           -- assuming filled if row exists
  ba.is_wave_locked as is_locked,
  ba.created_at as updated_at
FROM break_assignments ba

UNION ALL

-- Overlap / Aux assignments
SELECT 
  oa.night_id,
  oa.slot_type,
  oa.slot_key,
  oa.tm_id,
  'aux_or_overlap' as category,
  oa.is_filled,
  oa.is_locked,
  oa.updated_at
FROM overlap_assignments oa;

COMMENT ON VIEW public.v_unified_assignments IS 
'Phase 1 corrected unified view over legacy assignment tables. Accounts for real schema differences (slot_ref vs slot_key, etc.).';

COMMIT;