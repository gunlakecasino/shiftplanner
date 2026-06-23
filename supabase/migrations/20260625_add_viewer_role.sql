-- Add Viewer role to the users.role enum (floor operators — published-night edits only).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role'
      AND e.enumlabel = 'viewer'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'viewer';
  END IF;
END $$;