-- pgcrypto lives in the extensions schema on Supabase; SECURITY DEFINER functions
-- with search_path = public cannot resolve crypt()/gen_salt() without extensions.

BEGIN;

CREATE OR REPLACE FUNCTION public.change_user_pin(
  p_user_id uuid,
  p_current_pin text,
  p_new_pin text,
  p_require_must_change boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

CREATE OR REPLACE FUNCTION public.verify_user_pin(p_user_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  stored_hash text;
BEGIN
  IF p_user_id IS NULL OR p_pin IS NULL OR btrim(p_pin) = '' THEN
    RETURN false;
  END IF;

  IF p_pin !~ '^\d{6}$' THEN
    RETURN false;
  END IF;

  SELECT pin_hash INTO stored_hash
  FROM public.users
  WHERE id = p_user_id AND is_active = true;

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN stored_hash = crypt(p_pin, stored_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_user_with_pin(
  p_full_name text,
  p_username text,
  p_email text DEFAULT NULL,
  p_role text DEFAULT 'utility_ops_super',
  p_pin text DEFAULT NULL,
  p_permissions jsonb DEFAULT NULL,
  p_must_change_pin boolean DEFAULT true
)
RETURNS TABLE(user_id uuid, temporary_pin text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id uuid;
  raw_pin text;
BEGIN
  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'full_name is required';
  END IF;
  IF p_username IS NULL OR btrim(p_username) = '' THEN
    RAISE EXCEPTION 'username is required';
  END IF;

  IF p_pin IS NOT NULL AND btrim(p_pin) <> '' THEN
    raw_pin := btrim(p_pin);
  ELSE
    raw_pin := public.generate_six_digit_pin();
  END IF;

  IF raw_pin !~ '^\d{6}$' OR raw_pin = '000000' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 digits';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users u WHERE lower(u.username) = lower(btrim(p_username))) THEN
    RAISE EXCEPTION 'username already exists';
  END IF;

  INSERT INTO public.users (
    full_name,
    username,
    email,
    role,
    is_active,
    pin_hash,
    permissions,
    must_change_pin,
    pin_issued_at,
    updated_at
  )
  VALUES (
    btrim(p_full_name),
    btrim(p_username),
    NULLIF(btrim(p_email), ''),
    COALESCE(NULLIF(btrim(p_role), ''), 'utility_ops_super'),
    true,
    crypt(raw_pin, gen_salt('bf', 12)),
    p_permissions,
    COALESCE(p_must_change_pin, true),
    now(),
    now()
  )
  RETURNING id INTO new_id;

  user_id := new_id;
  temporary_pin := raw_pin;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_temporary_pin(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  raw_pin text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  raw_pin := public.generate_six_digit_pin();

  UPDATE public.users
  SET pin_hash = crypt(raw_pin, gen_salt('bf', 12)),
      must_change_pin = true,
      pin_issued_at = now(),
      updated_at = now()
  WHERE id = p_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found or inactive';
  END IF;

  RETURN raw_pin;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_user_pin(uuid, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_user_pin(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_user_with_pin(text, text, text, text, text, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.issue_temporary_pin(uuid) TO service_role;

COMMIT;