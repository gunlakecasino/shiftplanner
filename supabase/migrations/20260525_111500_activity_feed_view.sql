-- =============================================================================
-- Phase 1/2: Shift Activity Feed View + Enhanced Context Support
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_shift_activity_feed AS
SELECT 
  sa.id,
  sa.grave_shift_id,
  sa.activity_type,
  sa.slot_key,
  sa.slot_type,
  sa.tm_id,
  sa.payload,
  sa.summary,
  sa.actor_type,
  sa.actor_id,
  sa.created_at
FROM shift_activities sa
ORDER BY sa.created_at DESC;

COMMENT ON VIEW public.v_shift_activity_feed IS 
'Phase 1/2 append-only activity feed view. Primary source for Ops Hub timelines, agent memory, and audits.';

-- RPC helper for recent feed (security definer for controlled access)
CREATE OR REPLACE FUNCTION public.get_recent_shift_activities(
  p_grave_shift_id uuid,
  p_limit int DEFAULT 50,
  p_since timestamptz DEFAULT NULL
)
RETURNS SETOF v_shift_activity_feed
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM v_shift_activity_feed
  WHERE grave_shift_id = p_grave_shift_id
    AND (p_since IS NULL OR created_at > p_since)
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_recent_shift_activities(uuid, int, timestamptz) IS 
'Controlled RPC for recent activity feed. Preferred over direct view access.';

COMMIT;