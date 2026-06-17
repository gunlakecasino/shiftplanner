-- GRAVE shift canonical default break groups (zones, RR M/W, ADMIN).
-- Per-night overrides remain on zone_assignments.break_group when explicitly set.

INSERT INTO slot_defaults (slot_key, slot_type, rr_side, default_break_group, updated_at)
VALUES
  ('zone_1', 'zone', '', 1, now()),
  ('zone_2', 'zone', '', 2, now()),
  ('zone_3', 'zone', '', 3, now()),
  ('zone_4', 'zone', '', 1, now()),
  ('zone_5', 'zone', '', 2, now()),
  ('zone_6', 'zone', '', 3, now()),
  ('zone_7', 'zone', '', 1, now()),
  ('zone_8', 'zone', '', 2, now()),
  ('zone_9', 'zone', '', 3, now()),
  ('zone_10', 'zone', '', 1, now()),
  ('rr_1_2', 'rr', 'womens', 3, now()),
  ('rr_1_2', 'rr', 'mens', 2, now()),
  ('rr_6', 'rr', 'womens', 1, now()),
  ('rr_6', 'rr', 'mens', 2, now()),
  ('rr_7', 'rr', 'womens', 2, now()),
  ('rr_7', 'rr', 'mens', 3, now()),
  ('rr_8', 'rr', 'womens', 3, now()),
  ('rr_8', 'rr', 'mens', 1, now()),
  ('rr_10', 'rr', 'womens', 1, now()),
  ('rr_10', 'rr', 'mens', 3, now()),
  ('admin', 'aux', '', 2, now())
ON CONFLICT (slot_key, rr_side)
DO UPDATE SET
  default_break_group = EXCLUDED.default_break_group,
  slot_type = EXCLUDED.slot_type,
  updated_at = EXCLUDED.updated_at;