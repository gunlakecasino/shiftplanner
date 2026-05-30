-- Helper functions for secure user management from Edge Functions (service role)

-- Create a new user with a hashed PIN using pgcrypto
CREATE OR REPLACE FUNCTION public.create_user_with_pin(
  p_full_name text,
  p_username text,
  p_email text DEFAULT NULL,
  p_role text DEFAULT 'utility_ops_super',
  p_pin text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  -- Basic validation
  IF p_full_name IS NULL OR p_username IS NULL OR p_pin IS NULL THEN
    RAISE EXCEPTION 'full_name, username, and pin are required';
  END IF;

  INSERT INTO public.users (
    full_name,
    username,
    email,
    role,
    is_active,
    pin_hash
  )
  VALUES (
    p_full_name,
    p_username,
    p_email,
    p_role,
    true,
    crypt(p_pin, gen_salt('bf', 12))
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Deactivate (soft delete) a user
CREATE OR REPLACE FUNCTION public.deactivate_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET is_active = false,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Reactivate a user (optional convenience)
CREATE OR REPLACE FUNCTION public.reactivate_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET is_active = true,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Grant execute to service_role (Edge Functions use service role)
GRANT EXECUTE ON FUNCTION public.create_user_with_pin(text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reactivate_user(uuid) TO service_role;