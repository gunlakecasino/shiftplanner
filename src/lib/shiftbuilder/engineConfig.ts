/**
 * Engine config loader.
 *
 * The active `engine_config` row owns the soft-weight bag, scoring thresholds,
 * slot-priority overrides, and the `placement_method` selector. Everything in
 * the scoring layer reads from here — no weights are hard-coded in TypeScript.
 *
 * This is intentional: the operator can tune weights via SQL (or, eventually,
 * a settings panel) without redeploying the app.
 */

import { supabase } from "../supabase";

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
  skill_stretch_reward?: number;
  sweeper_rotation_penalty?: number;
}

export interface EngineThresholds {
  rotation_weeks?: number;
  fatigue_window_days?: number;
  override_load_threshold?: number;
  override_difficulty_threshold?: number;
}

export type PlacementMethod = "greedy" | "weighted" | "grok-hybrid";

export interface EngineConfig {
  id: string;
  isActive: boolean;
  weights: EngineWeights;
  thresholds: EngineThresholds;
  slotPriority: Record<string, number>; // slot → priority override
  placementMethod: PlacementMethod;
  notes: string | null;
  createdAt: string;
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
  skill_stretch_reward: 0.3,
  sweeper_rotation_penalty: 0.3,
};

export const DEFAULT_THRESHOLDS: Required<EngineThresholds> = {
  rotation_weeks: 8,
  fatigue_window_days: 7,
  override_load_threshold: 6.0,
  override_difficulty_threshold: 6.0,
};

export const FALLBACK_CONFIG: EngineConfig = {
  id: "fallback",
  isActive: true,
  weights: { ...DEFAULT_WEIGHTS },
  thresholds: { ...DEFAULT_THRESHOLDS },
  slotPriority: {},
  placementMethod: "weighted",
  notes: "Synthesized fallback — no active engine_config row found.",
  createdAt: new Date().toISOString(),
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
  const { data, error } = await supabase
    .from("engine_config")
    .select(
      "id, is_active, weights, thresholds, slot_priority, placement_method, notes, created_at, created_by"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("[engineConfig] fetch failed, using fallback:", error.message);
    return FALLBACK_CONFIG;
  }

  if (!data || data.length === 0) {
    console.warn("[engineConfig] no active row found, using fallback");
    return FALLBACK_CONFIG;
  }

  const row = data[0] as any;
  const method = (row.placement_method ?? "weighted") as string;
  return {
    id: row.id,
    isActive: !!row.is_active,
    weights: (row.weights ?? {}) as EngineWeights,
    thresholds: (row.thresholds ?? {}) as EngineThresholds,
    slotPriority: (row.slot_priority ?? {}) as Record<string, number>,
    placementMethod: (["greedy", "weighted", "grok-hybrid"].includes(method)
      ? method
      : "weighted") as PlacementMethod,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  };
}
