-- =============================================================================
-- Defaults cutover — final step: drop the legacy slot_default_tasks table
-- =============================================================================
-- Nightly default task chips are now materialized from slot-default Ops Tasks
-- (ops_work_items where is_slot_default=true) by applySlotDefaultsToNight. All
-- 49 legacy rows were imported into ops_work_items (verified byte-identical for
-- every zone/RR/AUX slot) and the July 20 night was confirmed to materialize
-- correctly through the live app path.
--
-- All code paths that read/wrote this table have been retired:
--   - slot-defaults API returns tasks:[]  (break-group defaults unaffected)
--   - getSlotDefaultTasks() returns []
--   - addSlotDefaultTask/removeSlotDefaultTask (+ *Server) throw "retired"
--   - DefaultsTab task-chip UI removed (break-group management kept)
--   - Apply Default/Overlap Tasks buttons removed
--
-- No inbound FKs, no dependent views (verified). The break-defaults table
-- (slot_defaults) is a SEPARATE table and is intentionally left untouched.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS slot_default_tasks;

COMMIT;
