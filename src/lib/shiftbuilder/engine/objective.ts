/**
 * engine/objective.ts — the ONE objective function (P1-4, principle N1).
 *
 * The ratified hierarchy `coverage > rotation > preferences > skill` is enforced
 * *lexicographically*. `compareScorecards` is the exact, authoritative ordering
 * (integer/float-safe, used by the guard and the pipeline stage gate).
 * `objectiveValue` collapses a scorecard to one number for the optimizer's hot
 * loop, using tier multipliers **derived from board bounds** (not magic numbers)
 * with a static guarantee that no lower tier can ever outweigh a higher one.
 *
 * A stage may only replace the incumbent draft with one whose scorecard is
 * `compareScorecards(next, prev) >= 0`. That single rule makes every component
 * honor the hierarchy without each re-implementing it.
 */

import type { Draft, NightContext, Scorecard, SlotModel, TmModel } from "./types";
import { rotationHealthPoints } from "./health/model";
import { resolvedWeights } from "../engineConfig";
import { preferenceTargetMatches, uiKeyToSlotDifficultyKey } from "../scoring";

const EMPTY_SCORECARD: Scorecard = {
  coverage: 0,
  healthTotal: 0,
  prefTotal: 0,
  skillTotal: 0,
  hardViolations: [],
};

// =====================================================================
// Per-slot tier contributions (preferences + skill; health via model.ts)
// =====================================================================

/** Preference contribution — hard prefer/avoid weighted above soft (matches solver + scoring.ts). */
export function prefScoreFor(tm: TmModel, slotKey: string, ctx: NightContext): number {
  const weights = resolvedWeights(ctx.config);
  const rows = ctx.preferencesByTm.get(tm.id) ?? [];
  let score = 0;
  for (const row of rows) {
    if (!row.target || !preferenceTargetMatches(row.target, slotKey)) continue;
    const sign = row.stance === "prefer" ? 1 : row.stance === "avoid" ? -1 : 0;
    const mag = row.strength === "hard" ? weights.preference_fit : weights.soft_prefer_set;
    score += sign * mag;
  }
  return score;
}

/** True when the TM has a hard-avoid preference for the slot (constraint candidate — D1). */
export function hasHardAvoid(tm: TmModel, slotKey: string, ctx: NightContext): boolean {
  const rows = ctx.preferencesByTm.get(tm.id) ?? [];
  return rows.some(
    (r) =>
      r.strength === "hard" &&
      r.stance === "avoid" &&
      r.target &&
      preferenceTargetMatches(r.target, slotKey),
  );
}

/** Skill closeness contribution — mirrors scoring.scoreSkillMatch. */
export function skillScoreFor(tm: TmModel, slotKey: string, ctx: NightContext): number {
  const weights = resolvedWeights(ctx.config);
  const tmSkill = ctx.skillScores.get(tm.id);
  const diffKey = uiKeyToSlotDifficultyKey(slotKey);
  const slotDiff = diffKey ? ctx.slotDifficulty.get(diffKey) : undefined;
  if (tmSkill === undefined || slotDiff === undefined) return 0;
  let raw = 1 - Math.abs(tmSkill - slotDiff) / 5;
  if (tmSkill >= slotDiff) raw = Math.max(raw, 0.2);
  raw = Math.max(-1, Math.min(1, raw));
  return raw * weights.skill_match;
}

// =====================================================================
// Whole-draft scorecard
// =====================================================================

export function scorecardFor(draft: Draft, ctx: NightContext): Scorecard {
  const board: Record<string, { tmId?: string; tmName?: string }> = {};
  for (const [k, p] of Object.entries(draft)) board[k] = { tmId: p.tmId, tmName: p.tmName };

  let coverage = 0;
  let healthTotal = 0;
  let prefTotal = 0;
  let skillTotal = 0;

  for (const [slotKey, placement] of Object.entries(draft)) {
    const slot = ctx.slotByKey.get(slotKey);
    if (!slot) continue;
    const tm = ctx.rosterById.get(placement.tmId);

    if (!slot.isOptional) coverage += 1;

    if (slot.isRotationTracked) {
      const score = rotationHealthPoints({
        tmId: placement.tmId,
        tmName: placement.tmName,
        slotKey,
        nightIso: ctx.nightIso,
        histories: ctx.histories,
        weeklyRecentHistory: ctx.weeklyRecentHistory,
        members: ctx.members,
        auxDefs: ctx.auxDefs,
        assignments: board,
      });
      healthTotal += score.points;
    }

    if (tm) {
      prefTotal += prefScoreFor(tm, slotKey, ctx);
      skillTotal += skillScoreFor(tm, slotKey, ctx);
    }
  }

  return { coverage, healthTotal, prefTotal, skillTotal, hardViolations: [] };
}

// =====================================================================
// Comparison + single-number collapse
// =====================================================================

/** -1 if a < b, 0 if equal, 1 if a > b — lexicographic; hard violations lose. */
export function compareScorecards(a: Scorecard, b: Scorecard): -1 | 0 | 1 {
  const aBad = a.hardViolations.length > 0;
  const bBad = b.hardViolations.length > 0;
  if (aBad !== bBad) return aBad ? -1 : 1;

  const dims: Array<keyof Scorecard> = ["coverage", "healthTotal", "prefTotal", "skillTotal"];
  for (const dim of dims) {
    const av = a[dim] as number;
    const bv = b[dim] as number;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export interface TierMultipliers {
  COVERAGE_UNIT: number;
  HEALTH_UNIT: number;
  PREF_UNIT: number;
  SKILL_UNIT: number;
}

/**
 * Derive tier multipliers from board size + weights so each tier strictly
 * dominates the sum of every lower tier. No magic numbers — and a guard that
 * the top multiplier stays inside IEEE-754 safe-integer range (precision-safe
 * for boards well beyond a full grave week).
 */
export function tierMultipliers(slotCount: number, ctx: NightContext): TierMultipliers {
  const weights = resolvedWeights(ctx.config);
  const n = Math.max(1, slotCount);
  const maxHealthPerSlot = 100;
  const maxPrefPerSlot = Math.abs(weights.preference_fit) + Math.abs(weights.soft_prefer_set) + 1;
  const maxSkillPerSlot = Math.abs(weights.skill_match) + 1;

  const SKILL_UNIT = 1;
  const PREF_UNIT = Math.ceil(n * maxSkillPerSlot * SKILL_UNIT) + 1;
  const HEALTH_UNIT = Math.ceil(n * maxPrefPerSlot * PREF_UNIT) + 1;
  const COVERAGE_UNIT = Math.ceil(n * maxHealthPerSlot * HEALTH_UNIT) + 1;

  if (n * COVERAGE_UNIT >= Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `[objective] tier multipliers overflow safe-integer range at slotCount=${slotCount}`,
    );
  }
  return { COVERAGE_UNIT, HEALTH_UNIT, PREF_UNIT, SKILL_UNIT };
}

/**
 * Collapse a scorecard to a single comparable number for the optimizer's hot
 * loop. Guaranteed to agree with `compareScorecards` for valid scorecards on a
 * board of `slotCount` slots. Hard violations sink to -Infinity.
 */
export function objectiveValue(sc: Scorecard, mult: TierMultipliers): number {
  if (sc.hardViolations.length > 0) return -Infinity;
  return (
    sc.coverage * mult.COVERAGE_UNIT +
    sc.healthTotal * mult.HEALTH_UNIT +
    sc.prefTotal * mult.PREF_UNIT +
    sc.skillTotal * mult.SKILL_UNIT
  );
}

export function emptyScorecard(): Scorecard {
  return { ...EMPTY_SCORECARD, hardViolations: [] };
}
