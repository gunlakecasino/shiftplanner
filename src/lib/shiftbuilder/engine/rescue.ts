/**
 * engine/rescue.ts — the ONE coverage rescue ladder (P1-6, decisions D1 + D7).
 *
 * When a required slot has no "clean" candidate (all are prior-3 rotation
 * repeats or carry a hard-avoid preference), coverage is tier 1 and an open
 * zone is a real operational hole — so the engine relaxes constraints in a
 * fixed, auditable order rather than leaving the slot empty:
 *
 *     clean  →  relax rotation prior-3  →  relax hard-avoid preference
 *
 * Rules:
 *  - Every rung below "clean" is recorded in provenance (`relaxations`) and
 *    surfaced in the UI — a relaxed placement is a flagged conversation, never
 *    a silent one.
 *  - Hard-avoid is only ever relaxed for a **required** (non-optional) slot AND
 *    only when rungs 0 and 1 produced no candidate at all — i.e. only when the
 *    rung-2 pick is the difference between a filled required slot and an empty
 *    one (D1.2). An optional Z1/Z2 is left open instead.
 *  - Pure *improvement* moves (optimizer replace/swap, week polish) trade within
 *    a tier and never buy coverage, so they are capped at
 *    `MAX_RELAX_FOR_IMPROVEMENT` (rung 1) and may never reach rung 2.
 *  - The planner and the optimizer both call `rescueLadder` + `bestByHierarchy`,
 *    so on a starved roster they descend the ladder identically and pick the
 *    same TM (invariant I5).
 *
 * Before unification these two components disagreed (F3): the planner would
 * place a hard-avoid TM under pressure while the optimizer's `canHold` never
 * would.
 */

import type { Relaxation, SlotModel } from "./types";

/** Relaxation rungs. Higher = more broken. See D1 doctrine. */
export const RELAX_NONE = 0; // clean
export const RELAX_ROTATION = 1; // may break the prior-3 same-area rotation gate
export const RELAX_HARD_AVOID = 2; // may additionally break a hard-avoid preference
export type RelaxLevel = 0 | 1 | 2;

/** The ladder in order — iterate this rather than hand-rolling `0..2` loops. */
export const RELAX_RUNGS: readonly RelaxLevel[] = [
  RELAX_NONE,
  RELAX_ROTATION,
  RELAX_HARD_AVOID,
];

/**
 * The highest rung a *pure improvement* move may use. Improvement moves trade
 * within a tier; they never buy coverage, so they may never reach
 * RELAX_HARD_AVOID. Only coverage rescue (an otherwise-empty required slot)
 * may descend to RELAX_HARD_AVOID.
 */
export const MAX_RELAX_FOR_IMPROVEMENT: RelaxLevel = RELAX_ROTATION;

export interface RescueCandidate {
  tmId: string;
  tmName: string;
  /** Planner weighted total (preferences + skill + matrix fairness). */
  score: number;
  /** Rotation health points (engine/health/model). */
  healthPoints: number;
  isCritical: boolean;
  /** Same deployment area within the TM's prior-3 grave placements. */
  isPrior3: boolean;
  /** Carries a hard-avoid preference for this slot. */
  isHardAvoid: boolean;
}

/**
 * Coverage-equal tiebreak honoring rotation > preferences > skill.
 * Rotation-tracked slots rank by health first (rotation), then planner score
 * (preferences + skill), then id for determinism. Non-tracked slots (admin,
 * overlap) have no rotation signal, so they rank by planner score.
 */
export function bestByHierarchy(
  cands: RescueCandidate[],
  slot: SlotModel,
): RescueCandidate | null {
  if (cands.length === 0) return null;
  const sorted = [...cands].sort((a, b) => {
    if (slot.isRotationTracked) {
      if (b.healthPoints !== a.healthPoints) return b.healthPoints - a.healthPoints;
    }
    if (b.score !== a.score) return b.score - a.score;
    return a.tmId < b.tmId ? -1 : a.tmId > b.tmId ? 1 : 0;
  });
  return sorted[0];
}

export interface RescueResult {
  pick: RescueCandidate;
  relaxations: Relaxation[];
}

/**
 * Descend the relaxation ladder and return the pick + the rungs used, or null
 * if the slot must stay open. `cands` must already be hard-eligibility-filtered
 * and free of TMs used elsewhere this night.
 */
export function rescueLadder(
  slot: SlotModel,
  cands: RescueCandidate[],
): RescueResult | null {
  if (cands.length === 0) return null;

  // Rung 0 — clean: no rotation prior-3, no hard-avoid.
  const clean = cands.filter((c) => !c.isPrior3 && !c.isHardAvoid);
  const cleanPick = bestByHierarchy(clean, slot);
  if (cleanPick) return { pick: cleanPick, relaxations: [] };

  // Rung 1 — relax rotation prior-3 (still no hard-avoid).
  const noAvoid = cands.filter((c) => !c.isHardAvoid);
  const noAvoidPick = bestByHierarchy(noAvoid, slot);
  if (noAvoidPick) {
    return {
      pick: noAvoidPick,
      relaxations: noAvoidPick.isPrior3 ? ["rotation-prior3"] : [],
    };
  }

  // Rung 2 — relax hard-avoid, required slots only (D1). Optional slots stay open.
  if (slot.isOptional) return null;
  const anyPick = bestByHierarchy(cands, slot);
  if (!anyPick) return null;
  const relaxations: Relaxation[] = [];
  if (anyPick.isPrior3) relaxations.push("rotation-prior3");
  if (anyPick.isHardAvoid) relaxations.push("hard-avoid");
  return { pick: anyPick, relaxations };
}
