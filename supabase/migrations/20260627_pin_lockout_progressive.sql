-- Progressive PIN lockout: 5 → 10s, 6 → 30s, 7 → 1min, 8+ → admin unlock required.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_failed_pin_attempt(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  attempts integer;
BEGIN
  UPDATE public.users
  SET failed_pin_attempts = failed_pin_attempts + 1,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING failed_pin_attempts INTO attempts;

  IF attempts >= 8 THEN
    UPDATE public.users
    SET locked_until = '2099-12-31 00:00:00+00'::timestamptz
    WHERE id = p_user_id;
  ELSIF attempts >= 7 THEN
    UPDATE public.users
    SET locked_until = now() + interval '1 minute'
    WHERE id = p_user_id;
  ELSIF attempts >= 6 THEN
    UPDATE public.users
    SET locked_until = now() + interval '30 seconds'
    WHERE id = p_user_id;
  ELSIF attempts >= 5 THEN
    UPDATE public.users
    SET locked_until = now() + interval '10 seconds'
    WHERE id = p_user_id;
  END IF;
END;
$$;

COMMIT;