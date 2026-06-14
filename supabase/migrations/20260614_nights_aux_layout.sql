-- Per-night flex aux row layout (AuxDef[] JSON)
ALTER TABLE nights ADD COLUMN IF NOT EXISTS aux_layout jsonb;

COMMENT ON COLUMN nights.aux_layout IS 'ShiftBuilder flex aux row: array of { key, role, label, locations }';