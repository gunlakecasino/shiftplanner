-- =============================================================================
-- Phase 1: Unified Assignment Views (Transition Layer)
-- =============================================================================
-- These views provide a clean, unified interface over the legacy fragmented
-- assignment tables. This allows new code (especially agents and future Ops Hub
-- features) to consume assignments without caring about the old fragmentation.
--
-- These views will evolve as we migrate to a single `shift_assignments` table.
-- =============================================================================

BEGIN;

-- Unified current assignments view (read-only transition helper)
CREATE OR REPLACE VIEW public.v_unified_assignments AS
SELECT 
  za.night_id as grave_shift_id,
  za.slot_type,
  za.slot_key,
  za.tm_id,
  'zone' as assignment_category,
  za.is_filled,
  za.updated_at
FROM zone_assignments za

UNION ALL

SELECT 
  ba.night_id,
  'rr' as slot_type,
  ba.slot_key,
  ba.tm_id,
  'restroom' as assignment_category,
  ba.is_filled,
  ba.updated_at
FROM break_assignments ba

UNION ALL

SELECT 
  oa.night_id,
  oa.slot_type,
  oa.slot_key,
  oa.tm_id,
  'aux_or_overlap' as assignment_category,
  oa.is_filled,
  oa.updated_at
FROM overlap_assignments oa;

COMMENT ON VIEW public.v_unified_assignments IS 
'Phase 1 transition view. Provides unified read access across all legacy assignment tables.';

COMMIT;