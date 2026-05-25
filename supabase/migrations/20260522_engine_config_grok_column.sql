-- =============================================================================
-- engine_config: add grok_reasoning_effort column
-- =============================================================================
-- The engineConfig.ts loader selects `grok_reasoning_effort` but this column
-- was never migrated to the DB, causing a 400 error on every page load.
-- This migration adds the column with a sensible default and a CHECK constraint
-- matching the GrokReasoningEffort type in TypeScript.
--
-- Safe to run multiple times (uses IF NOT EXISTS guard).
-- =============================================================================

BEGIN;

ALTER TABLE engine_config
  ADD COLUMN IF NOT EXISTS grok_reasoning_effort TEXT
    NOT NULL
    DEFAULT 'medium'
    CHECK (grok_reasoning_effort IN ('none', 'low', 'medium', 'high'));

-- Also add updated_at if it doesn't exist — sudoActions.ts writes this field
-- when updating a row, and it's missing from the original implicit schema.
ALTER TABLE engine_config
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

COMMENT ON COLUMN engine_config.grok_reasoning_effort IS
  'Controls chain-of-thought depth for Grok 4.3 when placement_method = grok-hybrid. '
  'Maps to GrokReasoningEffort type in engineConfig.ts.';

COMMIT;
