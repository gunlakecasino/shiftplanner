-- Account lockout, temp PIN expiry enforcement, PIN change only when required.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS failed_pin_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

COMMENT ON COLUMN public.users.failed_pin_attempts IS
  'Consecutive failed PIN logins; resets on success.';
COMMENT ON COLUMN public.users.locked_until IS
  'When set and in the future, PIN login is blocked.';

-- Temp PINs expire 72 hours after issue.
CREATE OR REPLACE FUNCTION public.is_temp_pin_expired(p_pin_issued_at timestamptz, p_must_change_pin boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_must_change_pin, false)
    AND p_pin_issued_at IS NOT NULL
    AND p_pin_issued_at < (now() - interval '72 hours');
$$;

-- Change PIN only when must_change_pin (first-login / admin reset flow).
CREATE OR REPLACE FUNCTION public.change_user_pin(
  p_user_id uuid,
  p_current_pin text,
  p_new_pin text,
  p_require_must_change boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_hash text;
  must_change boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;
  IF p_current_pin IS NULL OR p_new_pin IS NULL THEN
    RAISE EXCEPTION 'current and new PIN are required';
  END IF;
  IF p_new_pin !~ '^\d{6}$' OR p_new_pin = '000000' THEN
    RAISE EXCEPTION 'New PIN must be exactly 6 digits';
  END IF;
  IF p_current_pin = p_new_pin THEN
    RAISE EXCEPTION 'New PIN must be different from current PIN';
  END IF;

  SELECT pin_hash, must_change_pin
  INTO stored_hash, must_change
  FROM public.users
  WHERE id = p_user_id AND is_active = true;

  IF stored_hash IS NULL THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  IF p_require_must_change AND NOT COALESCE(must_change, false) THEN
    RAISE EXCEPTION 'PIN change not authorized for this account state';
  END IF;

  IF public.is_temp_pin_expired(
    (SELECT pin_issued_at FROM public.users WHERE id = p_user_id),
    must_change
  ) THEN
    RAISE EXCEPTION 'Temporary PIN has expired — contact your administrator';
  END IF;

  IF stored_hash <> crypt(p_current_pin, stored_hash) THEN
    RAISE EXCEPTION 'Current PIN is incorrect';
  END IF;

  UPDATE public.users
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 12)),
      must_change_pin = false,
      last_pin_change_at = now(),
      pin_issued_at = NULL,
      failed_pin_attempts = 0,
      locked_until = NULL,
      updated_at = now()
  WHERE id = p_user_id;

  RETURN true;
END;
$$;

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
    SET locked_until = now() + interval '30 minutes'
    WHERE id = p_user_id;
  ELSIF attempts >= 5 THEN
    UPDATE public.users
    SET locked_until = now() + interval '5 minutes'
    WHERE id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_pin_attempts(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET failed_pin_attempts = 0,
      locked_until = NULL,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_failed_pin_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_pin_attempts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_temp_pin_expired(timestamptz, boolean) TO service_role;

COMMIT;