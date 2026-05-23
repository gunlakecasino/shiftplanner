-- =============================================================================
-- Nightwatch — Grave Shift Journal
-- Three tables: shift_notes, canvas_strokes, shift_events
--
-- shift_notes:     timestamped observations stamped to the freeform canvas
-- canvas_strokes:  SVG path data for Pencil/mouse ink strokes per shift
-- shift_events:    BEO / floor events (banquet, VIP, ops events) per shift
--
-- All tables key off night_id (FK → nights table from ShiftBuilder).
-- RLS: service-role key (used in dev) bypasses. Anon key would need
--       policies aligned to operator_id — add when auth is wired.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. shift_notes — observation stamps on the freeform canvas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_notes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  night_id          UUID        NOT NULL,       -- FK to nights table
  operator_id       UUID,                        -- auth.users(id) when auth wired
  body              TEXT        NOT NULL DEFAULT '',
  canvas_x          FLOAT       NOT NULL DEFAULT 100,
  canvas_y          FLOAT       NOT NULL DEFAULT 100,
  timeline_ts       TIMESTAMPTZ,                 -- if stamped to timeline strip
  linked_entity_type TEXT       CHECK (linked_entity_type IN ('zone','tm','rr',NULL)),
  linked_entity_id  TEXT,                        -- zone number, tm id, rr label
  urgency           TEXT        NOT NULL DEFAULT 'normal'
                                CHECK (urgency IN ('low','normal','urgent')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_notes_night
  ON shift_notes (night_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. canvas_strokes — ink strokes from Pencil or mouse drawing
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS canvas_strokes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  night_id      UUID        NOT NULL,
  operator_id   UUID,
  path_data     TEXT        NOT NULL,            -- SVG path 'd' attribute string
  color         TEXT        NOT NULL DEFAULT '#F2F2F4',
  stroke_width  FLOAT       NOT NULL DEFAULT 1.8,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvas_strokes_night
  ON canvas_strokes (night_id, created_at ASC);

-- ---------------------------------------------------------------------------
-- 3. shift_events — BEO / floor events (banquet, VIP, scheduled ops)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  night_id      UUID        NOT NULL,
  operator_id   UUID,
  event_time    TIMESTAMPTZ NOT NULL,
  label         TEXT        NOT NULL,
  location      TEXT        NOT NULL DEFAULT '',
  priority      TEXT        NOT NULL DEFAULT 'normal'
                            CHECK (priority IN ('low','normal','high')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_events_night
  ON shift_events (night_id, event_time ASC);

-- ---------------------------------------------------------------------------
-- RLS (permissive for now — tighten when auth.users wired)
-- Service-role key bypasses RLS entirely in dev.
-- ---------------------------------------------------------------------------
ALTER TABLE shift_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_strokes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_events   ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated + anon reads (operator sees their own shift data)
-- Replace with per-operator policies once auth is active.
CREATE POLICY "shift_notes_all"    ON shift_notes    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "canvas_strokes_all" ON canvas_strokes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "shift_events_all"   ON shift_events   FOR ALL USING (true) WITH CHECK (true);

COMMIT;
