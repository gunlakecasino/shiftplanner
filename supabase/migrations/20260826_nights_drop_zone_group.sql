-- DROP ZONES rotation group lives on the night, not the TM.
-- 1 | 2 | 3. NULL = follow the 3-night cycle from grave date.
-- Survives TM reassignment.

ALTER TABLE public.nights
  ADD COLUMN IF NOT EXISTS drop_zone_group smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nights_drop_zone_group_check'
  ) THEN
    ALTER TABLE public.nights
      ADD CONSTRAINT nights_drop_zone_group_check
      CHECK (drop_zone_group IS NULL OR drop_zone_group IN (1, 2, 3));
  END IF;
END
$$;

COMMENT ON COLUMN public.nights.drop_zone_group IS
  'DROP ZONES rotation group (1|2|3). Night-level; survives TM moves. NULL = follow 3-night cycle from grave date.';
