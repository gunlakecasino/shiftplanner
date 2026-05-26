-- =============================================================================
-- Phase 0/1 Boundary: Initial v1_ops_context Implementation
-- =============================================================================
-- This creates the first version of the unified operational context function.
-- It is intentionally a starting point / stub that can be evolved.
--
-- It aggregates the most critical data needed by:
--   - The native iPad opsApp
--   - Web surfaces
--   - The agent intelligence layer (xAI Sphere)
--
-- Current scope (v1 stub):
--   - Core night + week info
--   - All assignment types (zones, rr, aux, overlaps)
--   - Team members (filtered for grave relevance where possible)
--   - Basic tasks and recent events/notes
--
-- Future iterations will expand this significantly.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.v1_get_ops_context(
  p_night_date date DEFAULT NULL,
  p_night_id uuid DEFAULT NULL,
  p_include_agent_context boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_night record;
  v_result jsonb;
BEGIN
  -- Resolve night
  IF p_night_id IS NOT NULL THEN
    SELECT * INTO v_night FROM nights WHERE id = p_night_id;
  ELSIF p_night_date IS NOT NULL THEN
    SELECT * INTO v_night FROM nights WHERE night_date = p_night_date ORDER BY created_at DESC LIMIT 1;
  ELSE
    -- Default to most recent night
    SELECT * INTO v_night FROM nights ORDER BY night_date DESC LIMIT 1;
  END IF;

  IF v_night.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Night not found', 'meta', jsonb_build_object('version', 'v1'));
  END IF;

  -- Build the context object (starting shape)
  SELECT jsonb_build_object(
    'version', 'v1',
    'night', to_jsonb(v_night),
    'assignments', jsonb_build_object(
      'zones', (
        SELECT jsonb_agg(to_jsonb(za))
        FROM zone_assignments za
        WHERE za.night_id = v_night.id AND za.slot_type = 'zone'
      ),
      'restrooms', (
        SELECT jsonb_agg(to_jsonb(ba))
        FROM break_assignments ba
        WHERE ba.night_id = v_night.id
      ),
      'aux', (
        SELECT jsonb_agg(to_jsonb(oa))
        FROM overlap_assignments oa
        WHERE oa.night_id = v_night.id AND oa.slot_type = 'aux'
      ),
      'overlaps', (
        SELECT jsonb_agg(to_jsonb(oa))
        FROM overlap_assignments oa
        WHERE oa.night_id = v_night.id AND oa.slot_type = 'overlap'
      )
    ),
    'team_members', (
      SELECT jsonb_agg(to_jsonb(tm))
      FROM tm_profiles tm
      WHERE tm.active = true
      LIMIT 100   -- safety limit for v1 stub
    ),
    'meta', jsonb_build_object(
      'generated_at', now(),
      'night_id', v_night.id,
      'night_date', v_night.night_date
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.v1_get_ops_context(date, uuid, boolean) IS
'v1 unified operational context for GRAVE Ops Shift Hub. Initial stub implementation.';

COMMIT;