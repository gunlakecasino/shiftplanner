-- =============================================================================
-- Slot Task Selector — schema migration
-- =============================================================================
-- Adds two tables:
--   * slot_task_catalog: the menu of POSSIBLE tasks for each slot (zone/RR/aux).
--     Edited rarely; serves as the picklist the operator chooses from when
--     planning a night.
--   * night_slot_tasks: which catalog tasks are SELECTED for a specific night
--     and slot. One row per (night, slot, task). The catalog label is
--     denormalized onto each row so historical nights are unaffected if the
--     catalog is later renamed.
--
-- Replaces the hardcoded `locations:` arrays in src/app/shiftbuilder/
-- ShiftBuilderClient.tsx (Zone 1 = "Main Entry North", etc.). The catalog is
-- seeded with those same labels so behavior stays familiar after the cutover.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CATALOG: possible tasks per slot
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slot_task_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_key    TEXT NOT NULL,              -- "zone_1", "rr_1_2", "admin", "trash_1"
  slot_type   TEXT NOT NULL CHECK (slot_type IN ('zone','rr','aux')),
  rr_side     TEXT CHECK (rr_side IN ('mens','womens')),  -- nullable; only meaningful for rr
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique on (slot_key, slot_type, rr_side, label). COALESCE rr_side to a
-- sentinel so the unique index treats NULL as a distinct value.
CREATE UNIQUE INDEX IF NOT EXISTS slot_task_catalog_unique_label
  ON slot_task_catalog (slot_key, slot_type, COALESCE(rr_side, '_none_'), label);

CREATE INDEX IF NOT EXISTS slot_task_catalog_lookup_idx
  ON slot_task_catalog (slot_type, slot_key, rr_side, sort_order);

-- -----------------------------------------------------------------------------
-- 2. SELECTIONS: which catalog tasks are picked for a given night + slot
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS night_slot_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  night_id          UUID NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
  slot_key          TEXT NOT NULL,
  slot_type         TEXT NOT NULL CHECK (slot_type IN ('zone','rr','aux')),
  rr_side           TEXT CHECK (rr_side IN ('mens','womens')),
  task_label        TEXT NOT NULL,                -- denormalized snapshot
  catalog_task_id   UUID REFERENCES slot_task_catalog(id) ON DELETE SET NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS night_slot_tasks_unique
  ON night_slot_tasks (night_id, slot_key, slot_type, COALESCE(rr_side, '_none_'), task_label);

CREATE INDEX IF NOT EXISTS night_slot_tasks_night_idx
  ON night_slot_tasks (night_id);

-- -----------------------------------------------------------------------------
-- 3. SEED CATALOG with the labels that used to live in ZONE_DEFS / RR_DEFS /
--    DEFAULT_AUX_DEFS in ShiftBuilderClient.tsx.
-- -----------------------------------------------------------------------------

-- Zones (Z1..Z10)
INSERT INTO slot_task_catalog (slot_key, slot_type, rr_side, label, sort_order) VALUES
  ('zone_1',  'zone', NULL, 'Main Entry North',  0),
  ('zone_2',  'zone', NULL, 'Main Entry South',  0),
  ('zone_3',  'zone', NULL, 'Food Court North',  0),
  ('zone_4',  'zone', NULL, 'Food Court South',  0),
  ('zone_5',  'zone', NULL, 'Slots West',        0),
  ('zone_6',  'zone', NULL, 'Slots East',        0),
  ('zone_7',  'zone', NULL, 'High Limit',        0),
  ('zone_8',  'zone', NULL, 'Table Games North', 0),
  ('zone_9',  'zone', NULL, 'Table Games South', 0),
  ('zone_10', 'zone', NULL, 'Poker',             0)
ON CONFLICT DO NOTHING;

-- Restrooms — using values from RR_DEFS. If RR_DEFS has different mens/womens
-- labels per restroom number, replace these placeholders with the real strings.
INSERT INTO slot_task_catalog (slot_key, slot_type, rr_side, label, sort_order) VALUES
  ('rr_1_2', 'rr', 'mens',   'Mens RR 1+2',   0),
  ('rr_1_2', 'rr', 'womens', 'Womens RR 1+2', 0),
  ('rr_6',   'rr', 'mens',   'Mens RR 6',     0),
  ('rr_6',   'rr', 'womens', 'Womens RR 6',   0),
  ('rr_7',   'rr', 'mens',   'Mens RR 7',     0),
  ('rr_7',   'rr', 'womens', 'Womens RR 7',   0),
  ('rr_8',   'rr', 'mens',   'Mens RR 8',     0),
  ('rr_8',   'rr', 'womens', 'Womens RR 8',   0),
  ('rr_10',  'rr', 'mens',   'Mens RR 10',    0),
  ('rr_10',  'rr', 'womens', 'Womens RR 10',  0)
ON CONFLICT DO NOTHING;

-- Default AUX slots
INSERT INTO slot_task_catalog (slot_key, slot_type, rr_side, label, sort_order) VALUES
  ('z9_sr',     'aux', NULL, 'Z9 Smoking Room', 0),
  ('admin',     'aux', NULL, 'Floor Admin',     0),
  ('trash_1',   'aux', NULL, 'West Trash Run',  0),
  ('trash_2',   'aux', NULL, 'East Trash Run',  0),
  ('support_1', 'aux', NULL, 'Float Support',   0),
  ('support_2', 'aux', NULL, 'Float Support 2', 0)
ON CONFLICT DO NOTHING;

COMMIT;
