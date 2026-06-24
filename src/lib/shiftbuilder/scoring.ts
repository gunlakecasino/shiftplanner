/**
 * Phase 1 weighted scoring layer.
 *
 * Pure, deterministic, side-effect-free. Given a (TM, slot) pair and a
 * reference-data context, returns a numeric score plus a per-signal
 * breakdown the UI can render in "Why?" mode.
 *
 * Signals implemented in Phase 1:
 *   • skill_match       (weight 1.0)  — closeness of tm.skill_score to slot.difficulty
 *   • preference_fit    (weight 1.5)  — tm_preferences with strength='hard'
 *   • soft_prefer_set   (weight 0.6)  — same table, strength='soft'
 *   • pair_affinity     (weight 1.0)  — tm_pair_affinities against neighbors already placed
 *   • within_repeat     (weight 1.0)  — hard gate, TM can't be in two slots tonight
 *   • prior_placement_repeat (hard)   — same area in last 3 grave nights (RR-normalized)
 *
 * Deferred to Phase 2 (need history queries):
 *   fatigue_index, area_diversity, cross_week_rotation, weekly_load_balance,
 *   prior_run_continuity, skill_stretch_reward, sweeper_rotation_penalty
 *
 * Hard gates (eligibility, accommodations) are NOT scored — they live in
 * placement.ts/isEligibleForSlot. This module assumes the caller has already
 * filtered the candidate roster through that gate.
 */

import type {
  TMPreferenceRow,
  TMPairAffinityRow,
  TMAccommodationRow,
  TmZoneMatrixRow,
  ZoneDetailEntry,
} from "./data";
import type { EngineConfig } from "./engineConfig";
import { resolvedWeights } from "./engineConfig";
import {
  isInPriorPlacementWindow,
  weekEntriesForTm,
} from "@/app/shiftbuilder/components/placementPadHelpers";
// (uiToDb intentionally unused — slot_difficulty uses its own key scheme; see uiKeyToSlotDifficultyKey)

// =====================================================================
// Types
// =====================================================================

export interface ScoringContext {
  /** Active engine_config (weights, thresholds) */
  config: EngineConfig;
  /** tmId → skill_score (0-10 typically) */
  skillScores: Map<string, number>;
  /** slot_id (DB convention) → difficulty (0-10) */
  slotDifficulty: Map<string, number>;
  /** All preference rows, grouped by tmId for fast lookup. */
  preferencesByTm: Map<string, TMPreferenceRow[]>;
  /** All pair affinity rows, grouped by tmId for fast lookup. */
  pairAffinitiesByTm: Map<string, TMPairAffinityRow[]>;
  /** Active accommodations, grouped by tmId. */
  accommodationsByTm: Map<string, TMAccommodationRow[]>;
  /**
   * Map of slot → tmId for placements made earlier in *this engine run*.
   * The planner updates this as it walks PLACEMENT_ORDER so within_repeat
   * and pair_affinity can see what's already on the board.
   */
  currentDraft: Map<string, string>;
  /**
   * Adjacency map: slotKey → list of slotKeys considered "neighbors" for
   * pair affinity. For Phase 1 we use a simple zone-number adjacency.
   */
  adjacency: Map<string, string[]>;
  /**
   * Preloaded tm_zone_matrix data for the fairness signals (area_diversity,
   * cross_week_rotation, prior_run_continuity). Loaded once per engine run
   * by the caller and passed in so scoring stays fully synchronous and fast.
   * Keyed by tmId → zoneKey (e.g. "Z2", "Z9SR").
   */
  zoneMatrix?: Map<string, Map<string, TmZoneMatrixRow>>;
  /** Per-TM placement history (tm_placement_history) for rotation gates. */
  placementHistories?: Record<string, ZoneDetailEntry | null>;
  /** In-week planned placements merged into prior-3 trail checks. */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  /** Tonight's ISO date — scopes prior-3 to nights before this one. */
  tonightIso?: string;
}

export interface SignalScore {
  /** Raw signal value before weight (typically -1..+1) */
  raw: number;
  /** Final weighted contribution (raw × weight) */
  weighted: number;
  /** Optional one-line explanation for the Why? panel */
  note?: string;
}

export type SignalBreakdown = Record<string, SignalScore>;

export interface ScoreResult {
  /** Sum of all weighted signal contributions */
  total: number;
  /** Per-signal breakdown for explainability */
  breakdown: SignalBreakdown;
  /** When true, this candidate is hard-excluded regardless of total */
  excluded: boolean;
  /** Reason for exclusion, if any */
  excludeReason?: string;
}

// =====================================================================
// Public API
// =====================================================================

export function scoreAssignment(
  tm: any,
  slotKey: string,
  ctx: ScoringContext
): ScoreResult {
  const breakdown: SignalBreakdown = {};
  let excluded = false;
  let excludeReason: string | undefined;

  // ---- within_repeat (hard) -----------------------------------------
  // If this TM is already proposed in another slot this run, exclude.
  for (const [otherSlot, tmId] of ctx.currentDraft) {
    if (otherSlot !== slotKey && tmId === tm.id) {
      excluded = true;
      excludeReason = `Already placed in ${otherSlot} this draft`;
      breakdown.within_repeat = {
        raw: -1,
        weighted: -Infinity,
        note: excludeReason,
      };
      break;
    }
  }

  if (!excluded) {
    breakdown.within_repeat = { raw: 0, weighted: 0 };
  }

  // ---- prior_placement_repeat (hard) --------------------------------
  // Same deployment area as one of the TM's last 3 grave placements.
  if (!excluded && ctx.placementHistories && ctx.tonightIso) {
    const history = ctx.placementHistories[tm.id] ?? null;
    const weekEntries = weekEntriesForTm(
      ctx.weeklyRecentHistory,
      tm.id,
      ctx.tonightIso,
    );
    if (isInPriorPlacementWindow(history, slotKey, ctx.tonightIso, undefined, weekEntries)) {
      excluded = true;
      excludeReason = `Same area in last 3 grave placements (prior-3 trail)`;
      breakdown.prior_placement_repeat = {
        raw: -1,
        weighted: -Infinity,
        note: excludeReason,
      };
    }
  }

  if (!excluded && !breakdown.prior_placement_repeat) {
    breakdown.prior_placement_repeat = { raw: 0, weighted: 0 };
  }

  // ---- skill_match --------------------------------------------------
  const skill = scoreSkillMatch(tm, slotKey, ctx);
  breakdown.skill_match = skill;

  // ---- preference_fit (hard preferences) ---------------------------
  const prefHard = scorePreference(tm, slotKey, ctx, "hard");
  breakdown.preference_fit = prefHard;

  // ---- soft_prefer_set ----------------------------------------------
  const prefSoft = scorePreference(tm, slotKey, ctx, "soft");
  breakdown.soft_prefer_set = prefSoft;

  // Hard "avoid" preference becomes a hard exclude.
  if (!excluded && prefHard.raw <= -1) {
    excluded = true;
    excludeReason = "Hard-avoid preference for this slot";
  }

  // ---- pair_affinity ------------------------------------------------
  const pair = scorePairAffinity(tm, slotKey, ctx);
  breakdown.pair_affinity = pair;

  // ---- 2026-05-28 matrix-derived fairness signals (Phase 1) ----------
  // These now read from tm_zone_matrix (populated from tm_placement_history).
  // They power area_diversity, cross_week_rotation, prior_run_continuity etc.
  // Data is preloaded by the caller into ctx.zoneMatrix (batched once per engine run).
  const matrixSignals = scoreMatrixFairnessSignals(tm, slotKey, ctx);
  Object.assign(breakdown, matrixSignals);

  // ---- order_priority (NEW: strongly incentivize filling in the declared order)
  const orderPrio = scoreOrderPriority(slotKey, ctx);
  breakdown.order_priority = orderPrio;

  // Hard pair-avoid becomes a hard exclude.
  if (!excluded && pair.raw <= -1 && pair.note?.includes("hard")) {
    excluded = true;
    excludeReason = pair.note;
  }

  // ---- Sum --------------------------------------------------------
  let total = 0;
  for (const k of Object.keys(breakdown)) {
    const w = breakdown[k].weighted;
    if (Number.isFinite(w)) total += w;
  }

  if (excluded) total = -Infinity;

  return { total, breakdown, excluded, excludeReason };
}

// =====================================================================
// Per-signal scorers
// =====================================================================

function scoreSkillMatch(
  tm: any,
  slotKey: string,
  ctx: ScoringContext
): SignalScore {
  const weights = resolvedWeights(ctx.config);
  const tmSkill = ctx.skillScores.get(tm.id);
  const slotDifficultyKey = uiKeyToSlotDifficultyKey(slotKey);
  const slotDiff = slotDifficultyKey ? ctx.slotDifficulty.get(slotDifficultyKey) : undefined;

  if (tmSkill === undefined || slotDiff === undefined) {
    return {
      raw: 0,
      weighted: 0,
      note:
        tmSkill === undefined
          ? "no skill_score on file"
          : "no slot_difficulty on file",
    };
  }

  // Closeness on a 0-10 scale → normalized to [-1, 1] where
  // perfect match = +1, max distance (10) = -1.
  // Slightly favor TMs whose skill >= slot difficulty by clamping
  // the penalty asymmetrically.
  const distance = Math.abs(tmSkill - slotDiff);
  let raw = 1 - distance / 5; // 5 = half of 10, so distance 5 → raw 0
  if (tmSkill >= slotDiff) raw = Math.max(raw, 0.2); // floor when overqualified
  raw = Math.max(-1, Math.min(1, raw));

  return {
    raw,
    weighted: raw * weights.skill_match,
    note: `skill ${tmSkill} vs difficulty ${slotDiff}`,
  };
}

function scorePreference(
  tm: any,
  slotKey: string,
  ctx: ScoringContext,
  strength: "hard" | "soft"
): SignalScore {
  const weights = resolvedWeights(ctx.config);
  const rows = ctx.preferencesByTm.get(tm.id) ?? [];
  // Match by exact slotKey (UI form) — preferences may also target a
  // category like "RR" or "Z9SR". We match exact and prefix (e.g. a
  // preference for "MRR" applies to all MRR* slots).
  const matches = rows.filter((r) => {
    if (r.strength !== strength) return false;
    if (!r.target) return false;
    return (
      r.target === slotKey ||
      slotKey.startsWith(r.target) ||
      r.target.toLowerCase() === slotKey.toLowerCase()
    );
  });

  if (matches.length === 0) {
    return { raw: 0, weighted: 0 };
  }

  // Treat multiple matches as a sum; prefer +1, avoid -1.
  let raw = 0;
  matches.forEach((m) => {
    if (m.stance === "prefer") raw += 1;
    else if (m.stance === "avoid") raw -= 1;
  });
  raw = Math.max(-1, Math.min(1, raw));

  const weight = strength === "hard" ? weights.preference_fit : weights.soft_prefer_set;
  return {
    raw,
    weighted: raw * weight,
    note: matches
      .map((m) => `${strength} ${m.stance} ${m.target}`)
      .join(", "),
  };
}

function scorePairAffinity(
  tm: any,
  slotKey: string,
  ctx: ScoringContext
): SignalScore {
  const weights = resolvedWeights(ctx.config);
  const rows = ctx.pairAffinitiesByTm.get(tm.id) ?? [];
  if (rows.length === 0) return { raw: 0, weighted: 0 };

  // Find the neighbors (already placed) we have affinity rows for.
  const neighbors = ctx.adjacency.get(slotKey) ?? [];
  const neighborTmIds = neighbors
    .map((n) => ctx.currentDraft.get(n))
    .filter((id): id is string => !!id);

  if (neighborTmIds.length === 0) return { raw: 0, weighted: 0 };

  let raw = 0;
  const notes: string[] = [];
  rows.forEach((r) => {
    const partnerId = r.withTmId;
    if (!partnerId) return;
    if (!neighborTmIds.includes(partnerId)) return;
    const sign = r.stance === "prefer" ? 1 : r.stance === "avoid" ? -1 : 0;
    const mag = r.strength === "hard" ? 1 : 0.5;
    raw += sign * mag;
    notes.push(`${r.stance}/${r.strength} with ${partnerId}`);
  });

  raw = Math.max(-1, Math.min(1, raw));
  return {
    raw,
    weighted: raw * weights.pair_affinity,
    note: notes.length > 0 ? notes.join(", ") : undefined,
  };
}

// =====================================================================
// Helpers
// =====================================================================

/**
 * Translate a UI slot key (e.g. "Z2", "ADM", "TR1", "MRR8") to the key
 * convention used by the `slot_difficulty` table (e.g. "Zone2", "Admin",
 * "Trash1", "MRR8"). The slot_difficulty table is a third naming scheme
 * separate from both the UI and the zone_assignments DB keys — values
 * pulled directly from the existing seeded rows.
 */
function uiKeyToSlotDifficultyKey(slotKey: string): string | null {
  if (slotKey === "Z9SR") return "Zone9SR";
  if (slotKey === "ADM") return "Admin";
  if (slotKey === "TR1") return "Trash1";
  if (slotKey === "TR2") return "Trash2";
  const zoneMatch = slotKey.match(/^Z(\d+)$/);
  if (zoneMatch) return `Zone${zoneMatch[1]}`;
  if (/^[MW]RR\d+$/.test(slotKey)) return slotKey; // MRR1, WRR10, etc. — identical
  if (/^SP\d+$/.test(slotKey)) return null; // not in slot_difficulty (yet)
  if (/^AUX\d*$/.test(slotKey)) return null;
  if (/^OL-(AM|PM)-\d+$/.test(slotKey)) return null;
  return null;
}

/**
 * Build a default adjacency map for the standard board layout. Zones are
 * adjacent to their numeric neighbors (Z1 ↔ Z2, Z2 ↔ Z3, etc.) and to the
 * RRs in the same numbered block. Non-zone slots (ADM, TR, SP) have no
 * adjacency by default — pair affinity simply doesn't apply.
 *
 * This is a starting heuristic; can be replaced with a DB-driven map later.
 */
export function buildDefaultAdjacency(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const setBoth = (a: string, b: string) => {
    if (!out.has(a)) out.set(a, []);
    if (!out.has(b)) out.set(b, []);
    out.get(a)!.push(b);
    out.get(b)!.push(a);
  };

  // Zone-to-zone linear adjacency
  for (let i = 1; i < 10; i++) {
    setBoth(`Z${i}`, `Z${i + 1}`);
  }

  // RR pairs at each restroom block share adjacency with adjacent zones.
  // Block 1 (RR 1+2): adjacent to Z1 and Z2
  // Block 6: adjacent to Z6
  // Block 7: adjacent to Z7
  // Block 8: adjacent to Z8
  // Block 10: adjacent to Z10
  const rrBlocks: Array<[number, string[]]> = [
    [1, ["Z1", "Z2"]],
    [6, ["Z6"]],
    [7, ["Z7"]],
    [8, ["Z8"]],
    [10, ["Z10"]],
  ];
  rrBlocks.forEach(([num, zones]) => {
    zones.forEach((z) => {
      setBoth(`MRR${num}`, z);
      setBoth(`WRR${num}`, z);
    });
    setBoth(`MRR${num}`, `WRR${num}`);
  });

  return out;
}

// =============================================================================
// 2026-05-28: Matrix-derived fairness signals (Phase 1)
// These read tm_zone_matrix (via ctx or direct data helper) and contribute to
// the weights that already existed in EngineWeights (area_diversity, etc.).
// The actual matrix data comes from tm_placement_history refreshed on Draft apply.
// =============================================================================

interface MatrixFairnessSignals {
  area_diversity?: SignalScore;
  cross_week_rotation?: SignalScore;
  prior_run_continuity?: SignalScore;
  // weekly_load_balance can be added here later when we have full-week aggregates
}

function scoreMatrixFairnessSignals(
  tm: any,
  slotKey: string,
  ctx: ScoringContext
): MatrixFairnessSignals {
  const weights = resolvedWeights(ctx.config);
  const breakdown: MatrixFairnessSignals = {};

  // 2026-05-30 fix: Use preloaded matrix (batched once by the engine caller in
  // ShiftBuilderClient + sudoActions). This eliminates the previous per-TM
  // Supabase N+1 inside the hot scoring loop (and fixes a latent bug where
  // promises were being treated as ScoreResult objects).
  // Falls back to zeros if not provided (graceful degradation).
  const matrix = ctx.zoneMatrix ?? new Map<string, Map<string, TmZoneMatrixRow>>();
  const zoneData = matrix.get(tm.id)?.get(slotKey);
  const matrixRow = zoneData
    ? {
        count_4w: zoneData.count4w ?? 0,
        count_8w: zoneData.count8w ?? 0,
        last_placed_at: zoneData.lastPlacedAt ?? null,
      }
    : { count_4w: 0, count_8w: 0, last_placed_at: null as string | null };

  // area_diversity: penalize heavy recent concentration in one area
  const areaDiversityRaw = Math.max(0, 1 - (matrixRow.count_4w / 6));
  breakdown.area_diversity = {
    raw: areaDiversityRaw,
    weighted: areaDiversityRaw * (weights.area_diversity ?? 0.7),
    note: `4w count in this zone: ${matrixRow.count_4w}`,
  };

  // cross_week_rotation
  const rotationRaw = matrixRow.count_8w > 3 ? 0.3 : 1.0;
  breakdown.cross_week_rotation = {
    raw: rotationRaw,
    weighted: rotationRaw * (weights.cross_week_rotation ?? 0.5),
    note: `8w count: ${matrixRow.count_8w}`,
  };

  // prior_run_continuity
  const continuityRaw = matrixRow.last_placed_at ? 0.8 : 0.4;
  breakdown.prior_run_continuity = {
    raw: continuityRaw,
    weighted: continuityRaw * (weights.prior_run_continuity ?? 0.4),
    note: matrixRow.last_placed_at ? "recent placement in zone" : "no recent history",
  };

  return breakdown;
}

/**
 * Scores how well this assignment respects the operator's declared fill order.
 * Earlier slots in PLACEMENT_ORDER get a strong positive bonus.
 * This is the main lever to "ensure coverage fills in the stated order".
 */
function scoreOrderPriority(slotKey: string, ctx: ScoringContext): SignalScore {
  const weights = resolvedWeights(ctx.config);
  const weight = weights.order_priority ?? 2.5;

  // Import here to avoid circular deps at module load
  const { PLACEMENT_ORDER } = require("./placement");

  const idx = PLACEMENT_ORDER.indexOf(slotKey);
  if (idx === -1) {
    // Unknown slot (extra AUX) — neutral
    return { raw: 0, weighted: 0, note: "not in core placement order" };
  }

  const total = PLACEMENT_ORDER.length;
  // Position 0 (first restroom) = +1.0, last = 0.0
  const positionFactor = 1 - (idx / Math.max(1, total - 1));
  const raw = positionFactor; // 0 to 1

  return {
    raw,
    weighted: raw * weight,
    note: `Priority position ${idx + 1}/${total} in fill order`,
  };
}

