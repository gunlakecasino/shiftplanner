-- Server-side PIN verification for sudo_admin re-auth (admin confirm PIN).

BEGIN;

CREATE OR REPLACE FUNCTION public.verify_user_pin(p_user_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.verify_user_pin(uuid, text) TO service_role;

COMMIT;