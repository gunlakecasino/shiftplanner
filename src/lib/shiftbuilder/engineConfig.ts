/**
 * Engine config loader.
 *
 * The active `engine_config` row owns the soft-weight bag, scoring thresholds,
 * slot-priority overrides, and the `placement_method` selector.
 *
 * As of the 2026-05-28 migration, engine_config also supports versioning
 * (version_name, parent_id, is_preset) + normalized overrides via
 * engine_signal_overrides and engine_eligibility_rules tables.
 *
 * Everything in the scoring and placement layers should prefer
 * FullyResolvedEngineConfig (from engineOverrides.ts) over raw EngineConfig
 * when possible.
 *
 * This is intentional: the operator can tune weights via SQL (or, eventually,
 * a settings panel) without redeploying the app.
 */

import { supabase } from "../supabase";
import { readEngineConfigCache, writeEngineConfigCache } from "./clientQueryCache";

// ---------------------------------------------------------------
// Types — match the JSON shape we expect in `engine_config` columns.
// All fields are optional with sensible defaults because the JSON
// blobs can drift; we never want a missing key to crash the engine.
// ---------------------------------------------------------------

export interface EngineWeights {
  skill_match?: number;
  fatigue_index?: number;
  pair_affinity?: number;
  within_repeat?: number;
  area_diversity?: number;
  preference_fit?: number;
  soft_prefer_set?: number;
  cross_week_rotation?: number;
  weekly_load_balance?: number;
  prior_run_continuity?: number;

  // skill_stretch_reward + sweeper_rotation_penalty were removed 2026-07-02 (F11,
  // decision D3): both were tunable in config but implemented by no signal — dead
  // dials with no data source (there is no sweeper flag on tm_profiles today). DB
  // rows carrying these keys are harmless (EngineWeights is non-exact and they are
  // simply ignored). Reintroduce with a real signal + data source if ever needed.

  /**
   * @deprecated Retired from scoring (2026-07-01): the planner walks PLACEMENT_ORDER
   * slot-by-slot, so a per-slot constant can never change a candidate pick — it only
   * inflated Why?-panel totals. Kept in the type so existing config rows still parse.
   */
  order_priority?: number;

  /**
   * Absolute penalty (positive number) applied when a candidate hits the RR
   * side-family soft repeat (different RR, same side, in the prior-3 window).
   * Deliberately large — a near-hard deterrent that coverage can still override.
   */
  rr_side_family_repeat?: number;
}

export interface EngineThresholds {
  rotation_weeks?: number;
  fatigue_window_days?: number;
  override_load_threshold?: number;
  override_difficulty_threshold?: number;
}

export type PlacementMethod = "greedy" | "weighted" | "grok-hybrid";

/** Controls how much chain-of-thought Grok 4.3 spends when running the hybrid engine. */
export type GrokReasoningEffort = "none" | "low" | "medium" | "high";

export interface EngineConfig {
  id: string;
  isActive: boolean;

  // === Versioning fields (added in 2026-05-28 migration) ===
  /** Human-readable name for this config version (e.g. "GRAVE-Standard-v2") */
  versionName?: string | null;
  /** Description of what this version does or why it exists */
  description?: string | null;
  /** Parent config this version was forked from (enables history tree) */
  parentId?: string | null;
  /** True if this is a built-in or saved preset that operators can fork from */
  isPreset: boolean;

  weights: EngineWeights;
  thresholds: EngineThresholds;
  slotPriority: Record<string, number>; // slot → priority override
  placementMethod: PlacementMethod;
  /** Grok 4.3 reasoning depth used only when placementMethod === "grok-hybrid" (default high for decently hard thinking; token cost managed by on-demand calls + server cache in pad paths) */
  grokReasoningEffort: GrokReasoningEffort;

  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  createdBy: string | null;
}

// ---------------------------------------------------------------
// Defaults — used if no active row exists OR if a field is missing
// from the JSON blob. These mirror what the active row currently
// has so the engine never falls off a cliff.
// ---------------------------------------------------------------

export const DEFAULT_WEIGHTS: Required<EngineWeights> = {
  skill_match: 1.0,
  fatigue_index: 0.8,
  pair_affinity: 1.0,
  within_repeat: 1.0,
  area_diversity: 0.7,
  preference_fit: 1.5,
  soft_prefer_set: 0.6,
  cross_week_rotation: 0.5,
  weekly_load_balance: 0.5,
  prior_run_continuity: 0.4,

  // Deprecated — no longer read by scoring (see EngineWeights.order_priority).
  order_priority: 2.5,

  // Was hardcoded at 48 inside scoring.ts; now operator-tunable like every other weight.
  rr_side_family_repeat: 48,
};

export const DEFAULT_THRESHOLDS: Required<EngineThresholds> = {
  rotation_weeks: 8,
  fatigue_window_days: 7,
  override_load_threshold: 6.0,
  override_difficulty_threshold: 6.0,
};

export const DEFAULT_GROK_REASONING_EFFORT: GrokReasoningEffort = "high"; // deeper Grok 4.3 thinking for placement engine (token-friendly via on-demand + cache in related paths)

export const FALLBACK_CONFIG: EngineConfig = {
  id: "fallback",
  isActive: true,

  // Versioning fields for fallback
  versionName: "Fallback",
  description: "Hardcoded safe defaults when no active engine_config row exists.",
  parentId: null,
  isPreset: false,

  weights: { ...DEFAULT_WEIGHTS },
  thresholds: { ...DEFAULT_THRESHOLDS },
  slotPriority: {},
  placementMethod: "weighted",
  grokReasoningEffort: DEFAULT_GROK_REASONING_EFFORT,

  notes: "Synthesized fallback — no active engine_config row found.",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: null,
};

/**
 * Merges the operator's weight overrides with defaults, so consumers can read
 * `cfg.weights.skill_match` without an `?? 0` everywhere.
 */
export function resolvedWeights(cfg: EngineConfig): Required<EngineWeights> {
  return { ...DEFAULT_WEIGHTS, ...cfg.weights };
}

export function resolvedThresholds(cfg: EngineConfig): Required<EngineThresholds> {
  return { ...DEFAULT_THRESHOLDS, ...cfg.thresholds };
}

// ---------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------

/**
 * Returns the currently active engine_config row. Returns FALLBACK_CONFIG
 * (with defaults) if no active row exists or the query fails — the engine
 * should never block on this.
 */
export async function getActiveEngineConfig(): Promise<EngineConfig> {
  const cached = readEngineConfigCache<EngineConfig>();
  if (cached) return cached;

  const { data, error } = await supabase
    .from("engine_config")
    .select(
      "id, is_active, version_name, description, parent_id, is_preset, " +
      "weights, thresholds, slot_priority, placement_method, grok_reasoning_effort, " +
      "notes, created_at, updated_at, created_by"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("[engineConfig] fetch failed, using fallback:", error.message);
    writeEngineConfigCache(FALLBACK_CONFIG);
    return FALLBACK_CONFIG;
  }

  if (!data || data.length === 0) {
    console.warn("[engineConfig] no active row found, using fallback");
    writeEngineConfigCache(FALLBACK_CONFIG);
    return FALLBACK_CONFIG;
  }

  const row = data[0] as any;
  const method = (row.placement_method ?? "weighted") as string;
  const reasoning = (row.grok_reasoning_effort ?? DEFAULT_GROK_REASONING_EFFORT) as string;
  const validReasoning: GrokReasoningEffort = (["none", "low", "medium", "high"].includes(reasoning)
    ? reasoning
    : DEFAULT_GROK_REASONING_EFFORT) as GrokReasoningEffort;

  const config: EngineConfig = {
    id: row.id,
    isActive: !!row.is_active,

    // New versioning fields (2026-05-28)
    versionName: row.version_name ?? null,
    description: row.description ?? null,
    parentId: row.parent_id ?? null,
    isPreset: !!row.is_preset,

    weights: (row.weights ?? {}) as EngineWeights,
    thresholds: (row.thresholds ?? {}) as EngineThresholds,
    slotPriority: (row.slot_priority ?? {}) as Record<string, number>,
    placementMethod: (["greedy", "weighted", "grok-hybrid"].includes(method)
      ? method
      : "weighted") as PlacementMethod,
    grokReasoningEffort: validReasoning,

    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    createdBy: row.created_by ?? null,
  };

  writeEngineConfigCache(config);
  return config;
}

// =============================================================================
// Phase 1 (2026-05-28) — Granular Engine Model Extensions
// Added after migration 20260528_engine_granular_overrides_and_matrix.sql
// These types are the contract between the new normalized tables and the rest
// of the engine (scoring, placement, overrides resolver, Sudo UI).
// See engineOverrides.ts for the heavy lifting (getFullyResolvedEngineConfig etc.)
// =============================================================================

/**
 * A single granular override for one signal inside a specific engine_config version.
 * Stored in the new engine_signal_overrides table (normalized, not JSONB).
 */
export interface SignalOverride {
  id: string;
  configId: string;
  signalName: string;                    // matches keys in EngineWeights
  overrideType: 'multiplier' | 'absolute' | 'disabled';
  value: number | null;
  priority: number;
  isActive: boolean;
  notes?: string | null;
}

/**
 * A custom eligibility rule attached to a config version.
 * Stored in engine_eligibility_rules. The condition JSONB is intentionally
 * flexible so the placement layer can evolve without schema changes.
 *
 * ruleType: only "hard_exclude" is implemented today (isEligibleUnderRules
 * in engineOverrides.ts only branches on that value). Other values are
 * accepted/stored (the DB column has no enum constraint) but have zero
 * effect until a soft-scoring or min-experience interpreter is written —
 * don't assume a rule with ruleType "soft_prefer" etc. does anything yet.
 */
export interface EligibilityRule {
  id: string;
  configId: string;
  ruleName: string;
  ruleType: string;
  description?: string | null;
  condition: Record<string, any>;
  priority: number;
  isActive: boolean;
}

/**
 * The fully resolved config after walking the version parent chain,
 * applying all active signal overrides, and merging eligibility rules.
 * This is what scoring.ts and placement.ts should consume going forward.
 */
export interface FullyResolvedEngineConfig extends EngineConfig {
  /** All active signal overrides for this version (already sorted by priority) */
  signalOverrides: SignalOverride[];
  /** All active eligibility rules for this version */
  eligibilityRules: EligibilityRule[];
  /** Whether this config is a preset (affects UI copy + "reset to preset" behavior) */
  isPreset: boolean;
}
