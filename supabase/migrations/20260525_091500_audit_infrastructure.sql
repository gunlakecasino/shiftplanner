-- =============================================================================
-- Phase 0: Audit Infrastructure & Updated_at Consistency
-- =============================================================================
-- Goal: Establish reliable, automatic audit trails across core operational tables.
-- This is a foundational requirement for the GRAVE Ops Shift Hub.
--
-- Includes:
--   1. Reusable `set_updated_at()` trigger function (idempotent).
--   2. Application of `updated_at` auto-maintenance to key mutable tables.
--   3. Optional lightweight audit columns (`created_by`, `updated_by`) on critical tables.
--
-- Tables targeted (core operational):
--   - nights
--   - zone_assignments
--   - break_assignments
--   - overlap_assignments
--   - night_slot_tasks
--   - slot_task_catalog
--   - night_tm_status (if it exists)
--   - engine_config
--
-- Future tables (agent, nightwatch, etc.) should follow the same pattern.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Reusable updated_at trigger function (standard pattern)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS 
'Standard trigger function to maintain updated_at timestamp. Used across GRAVE Ops Hub tables.';

-- -----------------------------------------------------------------------------
-- 2. Apply updated_at triggers to core tables (idempotent)
-- -----------------------------------------------------------------------------

-- nights
DROP TRIGGER IF EXISTS trg_nights_updated_at ON public.nights;
CREATE TRIGGER trg_nights_updated_at
  BEFORE UPDATE ON public.nights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- zone_assignments
DROP TRIGGER IF EXISTS trg_zone_assignments_updated_at ON public.zone_assignments;
CREATE TRIGGER trg_zone_assignments_updated_at
  BEFORE UPDATE ON public.zone_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- break_assignments
DROP TRIGGER IF EXISTS trg_break_assignments_updated_at ON public.break_assignments;
CREATE TRIGGER trg_break_assignments_updated_at
  BEFORE UPDATE ON public.break_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- overlap_assignments
DROP TRIGGER IF EXISTS trg_overlap_assignments_updated_at ON public.overlap_assignments;
CREATE TRIGGER trg_overlap_assignments_updated_at
  BEFORE UPDATE ON public.overlap_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- night_slot_tasks
DROP TRIGGER IF EXISTS trg_night_slot_tasks_updated_at ON public.night_slot_tasks;
CREATE TRIGGER trg_night_slot_tasks_updated_at
  BEFORE UPDATE ON public.night_slot_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- slot_task_catalog
DROP TRIGGER IF EXISTS trg_slot_task_catalog_updated_at ON public.slot_task_catalog;
CREATE TRIGGER trg_slot_task_catalog_updated_at
  BEFORE UPDATE ON public.slot_task_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- engine_config (if the table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_name = 'engine_config') THEN
    DROP TRIGGER IF EXISTS trg_engine_config_updated_at ON public.engine_config;
    CREATE TRIGGER trg_engine_config_updated_at
      BEFORE UPDATE ON public.engine_config
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- night_tm_status (if the table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' AND table_name = 'night_tm_status') THEN
    DROP TRIGGER IF EXISTS trg_night_tm_status_updated_at ON public.night_tm_status;
    CREATE TRIGGER trg_night_tm_status_updated_at
      BEFORE UPDATE ON public.night_tm_status
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Optional: Add lightweight audit columns on the most critical tables
--    (commented out by default — enable in a later migration when multi-user auth is ready)
-- -----------------------------------------------------------------------------

-- Example (uncomment when ready):
-- ALTER TABLE public.nights 
--   ADD COLUMN IF NOT EXISTS created_by TEXT,
--   ADD COLUMN IF NOT EXISTS updated_by TEXT;
--
-- ALTER TABLE public.zone_assignments
--   ADD COLUMN IF NOT EXISTS created_by TEXT,
--   ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- -----------------------------------------------------------------------------
-- Notes
-- -----------------------------------------------------------------------------
-- After this migration:
-- - All listed tables will reliably maintain `updated_at`.
-- - This enables better change detection, optimistic concurrency, and future auditing.
-- - The trigger function is reusable for all future tables in the Ops Hub.
--
-- Recommended follow-up:
-- - Add `updated_by` / actor tracking once auth + profiles are properly modeled.
-- - Consider adding a generic `audit_log` table + trigger-based logging for high-sensitivity tables.

COMMIT;