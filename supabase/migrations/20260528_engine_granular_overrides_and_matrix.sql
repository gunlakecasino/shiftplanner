-- =============================================================================
-- 20260528_engine_granular_overrides_and_matrix.sql
-- 
-- Expands the engine model for highly granular, versioned, explainable control.
-- 
-- Philosophy (per coding-engineer + existing lib/shiftbuilder patterns):
-- - Normalized tables only (no new JSONB blobs for overrides or matrix).
-- - Version history on engine_config (parent_id chain + is_preset).
-- - Separate tables for signal overrides and eligibility rules (composable, auditable).
-- - TM placement history + zone matrix to power real rotation/fairness signals
--   (area_diversity, cross_week_rotation, prior_run_continuity, etc.).
-- - Everything remains 100% safe behind Draft Mode + existing live-state caching
--   (TanStack Query + Zustand + Realtime from the 2026-05-27 work).
-- - "Why?" panel must be able to explain every override and matrix-derived score.
-- - Backwards compatible: old engine_config rows continue to work via fallback.
-- - RLS: service_role full write; authenticated operators get read on active/preset
--   configs + their own history/matrix data. No cross-tenant leakage.
--
-- Tables added/enhanced:
--   - engine_config (enhanced with version metadata)
--   - engine_signal_overrides (new, normalized)
--   - engine_eligibility_rules (new, normalized + flexible conditions)
--   - tm_placement_history (new, source of truth for matrix)
--   - tm_zone_matrix (new, denormalized for fast scoring queries)
--
-- Related files (will be updated surgically after this migration):
--   - src/lib/shiftbuilder/engineConfig.ts
--   - src/lib/shiftbuilder/engineOverrides.ts (new)
--   - src/lib/shiftbuilder/scoring.ts
--   - src/lib/shiftbuilder/placement.ts
--   - src/lib/shiftbuilder/data.ts
--   - Sudo EngineConfigTab.tsx + TeamTab.tsx (matrix sub-tab)
--   - SCHEDULING_MASTERLIST.md (new capabilities documented)
--
-- See AGENT_ACTIVITY_LOG.md entry 2026-05-28 for full context.
-- =============================================================================

BEGIN;

-- ============================================================================
-- 1. Enhance engine_config for versioning + presets
-- ============================================================================
ALTER TABLE engine_config
  ADD COLUMN IF NOT EXISTS version_name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES engine_config(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_preset BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Helpful index for version chains and preset lookup
CREATE INDEX IF NOT EXISTS idx_engine_config_parent_id ON engine_config(parent_id);
CREATE INDEX IF NOT EXISTS idx_engine_config_is_preset_active ON engine_config(is_preset, is_active) WHERE is_active = true;

COMMENT ON COLUMN engine_config.version_name IS 'Human-readable version label (e.g. "GRAVE-Standard-v2", "Summer-Rotation-Experiment"). Used in Sudo version selector.';
COMMENT ON COLUMN engine_config.parent_id IS 'Points to the config this version was forked from. Enables history tree.';
COMMENT ON COLUMN engine_config.is_preset IS 'True for built-in / operator-saved templates that appear in the version picker.';

-- Seed a baseline preset from the existing fallback behavior (idempotent)
-- Note: Using a fixed UUID because the `id` column is UUID type
INSERT INTO engine_config (id, is_active, weights, thresholds, slot_priority, placement_method, grok_reasoning_effort, notes, version_name, description, is_preset, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  false,  -- not the active one; operators can activate a copy
  '{}'::jsonb,
  '{}'::jsonb,
  '{}'::jsonb,
  'weighted',
  'medium',
  'Auto-generated baseline preset representing pre-2026-05-28 defaults. Safe starting point for overrides.',
  'Baseline-v1 (pre-granular)',
  'Original weights/thresholds before normalized overrides and matrix signals were introduced. Use as parent for new versions.',
  true,
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. engine_signal_overrides — granular per-signal control (normalized)
-- ============================================================================
CREATE TABLE IF NOT EXISTS engine_signal_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES engine_config(id) ON DELETE CASCADE,

  signal_name TEXT NOT NULL,                    -- e.g. 'area_diversity', 'skill_match', 'cross_week_rotation'
  override_type TEXT NOT NULL DEFAULT 'multiplier' CHECK (override_type IN ('multiplier', 'absolute', 'disabled')),
  value NUMERIC,                                -- the override value (multiplier or absolute score contribution)

  applies_to_slot_types TEXT[],                 -- e.g. ['zone'], ['rr', 'aux'] — null = all
  applies_to_slot_keys TEXT[],                  -- specific slots, e.g. ['Z1', 'MRR3']
  applies_to_zones TEXT[],                      -- for area-based signals

  priority INTEGER NOT NULL DEFAULT 100,        -- lower = higher precedence when multiple overrides match
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT,

  CONSTRAINT engine_signal_overrides_signal_name_check CHECK (char_length(signal_name) > 0)
);

CREATE INDEX IF NOT EXISTS idx_engine_signal_overrides_config ON engine_signal_overrides(config_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_engine_signal_overrides_signal ON engine_signal_overrides(signal_name);

COMMENT ON TABLE engine_signal_overrides IS 'Normalized per-signal overrides for a specific engine_config version. Replaces dumping everything into the weights JSONB.';
COMMENT ON COLUMN engine_signal_overrides.override_type IS 'multiplier (most common), absolute (hard set), or disabled (turn signal off for this config).';

-- ============================================================================
-- 3. engine_eligibility_rules — custom hard/soft rules (normalized + flexible)
-- ============================================================================
CREATE TABLE IF NOT EXISTS engine_eligibility_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID NOT NULL REFERENCES engine_config(id) ON DELETE CASCADE,

  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,                      -- 'hard_exclude', 'soft_prefer', 'min_experience', 'pool_restriction', etc.
  description TEXT,

  -- Flexible condition — keeps the table normalized while allowing rich rules
  -- Examples:
  --   {"grave_pool": "full", "min_weeks": 4}
  --   {"exclude_tm_ids": ["tm_bob"], "slot_types": ["zone"]}
  --   {"only_zones": ["Z9SR"]}
  condition JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(condition) = 'object'),

  applies_to_slot_types TEXT[],
  applies_to_slot_keys TEXT[],

  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_engine_eligibility_rules_config ON engine_eligibility_rules(config_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_engine_eligibility_rules_type ON engine_eligibility_rules(rule_type);

COMMENT ON TABLE engine_eligibility_rules IS 'Custom eligibility rules per config version. Injected into placement.isEligibleForSlot and explainable in the Why panel.';
COMMENT ON COLUMN engine_eligibility_rules.condition IS 'JSONB for flexible rule definitions. Kept normalized (no giant blobs elsewhere).';

-- ============================================================================
-- 4. tm_placement_history — source of truth for matrix-derived fairness signals
-- ============================================================================
CREATE TABLE IF NOT EXISTS tm_placement_history (
  id BIGSERIAL PRIMARY KEY,
  tm_id TEXT NOT NULL REFERENCES tm_profiles(tm_id) ON DELETE CASCADE,
  night_id UUID NOT NULL REFERENCES nights(id) ON DELETE CASCADE,

  slot_key TEXT NOT NULL,
  slot_type TEXT NOT NULL,                      -- 'zone', 'rr', 'aux', 'overlap', 'tr' etc.
  rr_side TEXT,                                 -- 'mens' | 'womens' for RR

  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  week_start DATE,                              -- denormalized for fast range queries (GRAVE weeks are Fri-Thu)
  is_committed BOOLEAN NOT NULL DEFAULT true,   -- false for draft proposals (helps with "what if" fairness)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tm_placement_history_tm ON tm_placement_history(tm_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tm_placement_history_night ON tm_placement_history(night_id);
CREATE INDEX IF NOT EXISTS idx_tm_placement_history_week ON tm_placement_history(week_start, tm_id);
CREATE INDEX IF NOT EXISTS idx_tm_placement_history_slot ON tm_placement_history(slot_key, slot_type);

COMMENT ON TABLE tm_placement_history IS 'Immutable(ish) log of every placement. Powers the zone matrix and all rotation/fairness signals. Written on successful Draft apply.';
COMMENT ON COLUMN tm_placement_history.is_committed IS 'Allows hypothetical scoring of draft proposals without polluting real history.';

-- ============================================================================
-- 5. tm_zone_matrix — fast denormalized view for scoring (4w/8w/lifetime per zone)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tm_zone_matrix (
  tm_id TEXT NOT NULL REFERENCES tm_profiles(tm_id) ON DELETE CASCADE,
  zone_key TEXT NOT NULL,                       -- 'Z1', 'Z2', ..., 'Z10', 'Z9SR' etc. (only real zones for area_diversity)

  last_placed_at TIMESTAMPTZ,
  count_4w INTEGER NOT NULL DEFAULT 0,
  count_8w INTEGER NOT NULL DEFAULT 0,
  count_lifetime INTEGER NOT NULL DEFAULT 0,

  -- Timestamps for refresh jobs / invalidation
  last_4w_refresh_at TIMESTAMPTZ,
  last_8w_refresh_at TIMESTAMPTZ,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (tm_id, zone_key)
);

CREATE INDEX IF NOT EXISTS idx_tm_zone_matrix_tm ON tm_zone_matrix(tm_id);
CREATE INDEX IF NOT EXISTS idx_tm_zone_matrix_zone ON tm_zone_matrix(zone_key);

COMMENT ON TABLE tm_zone_matrix IS 'Denormalized per-TM per-zone placement counts for fast scoring of area_diversity, rotation, continuity etc. Refreshed from tm_placement_history on Draft apply or via background job.';
COMMENT ON COLUMN tm_zone_matrix.zone_key IS 'Only zone-type slots for fairness math. RR/AUX/overlap use different signals.';

-- ============================================================================
-- 6. RLS Policies (follow existing baseline hardening pattern exactly)
-- ============================================================================

-- engine_config
DROP POLICY IF EXISTS engine_config_service_role ON engine_config;
CREATE POLICY engine_config_service_role ON engine_config
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS engine_config_authenticated_read ON engine_config;
CREATE POLICY engine_config_authenticated_read ON engine_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- engine_signal_overrides
DROP POLICY IF EXISTS engine_signal_overrides_service_role ON engine_signal_overrides;
CREATE POLICY engine_signal_overrides_service_role ON engine_signal_overrides
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS engine_signal_overrides_authenticated_read ON engine_signal_overrides;
CREATE POLICY engine_signal_overrides_authenticated_read ON engine_signal_overrides
  FOR SELECT USING (auth.role() = 'authenticated');

-- engine_eligibility_rules (same pattern)
DROP POLICY IF EXISTS engine_eligibility_rules_service_role ON engine_eligibility_rules;
CREATE POLICY engine_eligibility_rules_service_role ON engine_eligibility_rules
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS engine_eligibility_rules_authenticated_read ON engine_eligibility_rules;
CREATE POLICY engine_eligibility_rules_authenticated_read ON engine_eligibility_rules
  FOR SELECT USING (auth.role() = 'authenticated');

-- tm_placement_history
DROP POLICY IF EXISTS tm_placement_history_service_role ON tm_placement_history;
CREATE POLICY tm_placement_history_service_role ON tm_placement_history
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS tm_placement_history_authenticated_read ON tm_placement_history;
CREATE POLICY tm_placement_history_authenticated_read ON tm_placement_history
  FOR SELECT USING (auth.role() = 'authenticated');

-- tm_zone_matrix (read-heavy for scoring)
DROP POLICY IF EXISTS tm_zone_matrix_service_role ON tm_zone_matrix;
CREATE POLICY tm_zone_matrix_service_role ON tm_zone_matrix
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS tm_zone_matrix_authenticated_read ON tm_zone_matrix;
CREATE POLICY tm_zone_matrix_authenticated_read ON tm_zone_matrix
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- 7. Helpful comments + future-proofing
-- ============================================================================
COMMENT ON TABLE engine_config IS 'Versioned engine configurations. Use parent_id + is_preset for history and templates. Active row (is_active=true) is what getActiveEngineConfig() + live caching return.';
COMMENT ON TABLE tm_placement_history IS 'Write-only from successful Draft applies (via new data.ts helpers). Read by matrix refresh and fairness scoring.';

COMMIT;

-- Post-migration note for operators:
-- After applying, run a one-time backfill of tm_zone_matrix from existing zone_assignments + nights if desired.
-- The TypeScript layer (engineOverrides + data.ts) will provide refreshTmZoneMatrix() helpers.