-- =============================================================================
-- Phase 1: Evolve v1_ops_context to use new unified core
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
  v_shift record;
  v_result jsonb;
BEGIN
  -- Prefer grave_shifts if data exists, fall back to nights for transition period
  IF p_night_id IS NOT NULL THEN
    SELECT * INTO v_shift FROM grave_shifts WHERE id = p_night_id;
    IF v_shift.id IS NULL THEN
      SELECT * INTO v_shift FROM nights WHERE id = p_night_id;
    END IF;
  ELSIF p_night_date IS NOT NULL THEN
    SELECT * INTO v_shift FROM grave_shifts WHERE shift_date = p_night_date ORDER BY created_at DESC LIMIT 1;
    IF v_shift.id IS NULL THEN
      SELECT * INTO v_shift FROM nights WHERE night_date = p_night_date ORDER BY created_at DESC LIMIT 1;
    END IF;
  ELSE
    SELECT * INTO v_shift FROM grave_shifts ORDER BY shift_date DESC LIMIT 1;
    IF v_shift.id IS NULL THEN
      SELECT * INTO v_shift FROM nights ORDER BY night_date DESC LIMIT 1;
    END IF;
  END IF;

  IF v_shift.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Shift/Night not found', 'meta', jsonb_build_object('version', 'v1'));
  END IF;

  SELECT jsonb_build_object(
    'version', 'v1',
    'grave_shift', to_jsonb(v_shift),
    'assignments', jsonb_build_object(
      'zones', (SELECT jsonb_agg(to_jsonb(za)) FROM zone_assignments za WHERE za.night_id = COALESCE(v_shift.id, v_shift.id) LIMIT 50),
      'restrooms', (SELECT jsonb_agg(to_jsonb(ba)) FROM break_assignments ba WHERE ba.night_id = COALESCE(v_shift.id, v_shift.id) LIMIT 50),
      'overlaps', (SELECT jsonb_agg(to_jsonb(oa)) FROM overlap_assignments oa WHERE oa.night_id = COALESCE(v_shift.id, v_shift.id) LIMIT 50)
    ),
    'meta', jsonb_build_object(
      'generated_at', now(),
      'shift_id', v_shift.id,
      'shift_date', COALESCE(v_shift.shift_date, v_shift.night_date)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.v1_get_ops_context(date, uuid, boolean) IS 
'v1 operational context. Phase 1 version with awareness of new grave_shifts + shift_activities model (transition aware).';

COMMIT;