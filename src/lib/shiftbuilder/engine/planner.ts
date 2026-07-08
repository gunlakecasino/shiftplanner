/**
 * engine/planner.ts — deterministic fill-order seed (P2-1).
 *
 * Successor to runWeightedPlanner, rebuilt on the unified primitives. Walks the
 * fill order (ctx.slots is already ordered), and for each slot:
 *   - preserves locked / existing placements per the preserve policy;
 *   - leaves optional Z1/Z2 open (manual-only);
 *   - otherwise scores every eligible, unused TM with the existing signal scorer
 *     (scoring.scoreAssignment — one scorer, N3), computes rotation health with
 *     the one health model, and picks via the shared rescue ladder so coverage
 *     is never sacrificed and relaxations are auditable (D1/I5).
 *
 * The pick honors rotation > preferences among coverage-equal candidates
 * (bestByHierarchy ranks health first on rotation-tracked slots), so the seed is
 * already rotation-aware — the optimizer then refines it globally.
 */

import { scoreAssignment, type ScoringContext } from "../scoring";
import { rotationHealthPoints } from "./health/model";
import { canPlace } from "./eligibility";
import { rescueLadder, bestByHierarchy, type RescueCandidate } from "./rescue";
import { prefScoreFor, skillScoreFor, hasHardAvoid } from "./objective";
import type {
  Draft,
  NightContext,
  PreservePolicy,
  ScoredCandidate,
  SlotPlacement,
  SlotRanking,
} from "./types";

export interface PlannerResult {
  draft: Draft;
  breakdown: Record<string, SlotRanking>;
  notes: string[];
}

export interface PlannerOptions {
  preserve?: PreservePolicy;
  topK?: number;
}


/** Finite score for ranking even when the signal scorer hard-excludes a candidate. */
function finiteScore(result: ReturnType<typeof scoreAssignment>): number {
  if (!result.excluded && Number.isFinite(result.total)) return result.total;
  let sum = 0;
  for (const s of Object.values(result.breakdown ?? {})) {
    if (Number.isFinite(s.weighted)) sum += s.weighted;
  }
  return sum;
}

export function runPlanner(ctx: NightContext, opts: PlannerOptions = {}): PlannerResult {
  const preserve: PreservePolicy = opts.preserve ?? "all-existing";
  const topK = opts.topK ?? 5;

  const draft: Draft = {};
  const breakdown: Record<string, SlotRanking> = {};
  const notes: string[] = [];
  const currentDraft = new Map<string, string>();

  const scoringCtxBase: Omit<ScoringContext, "currentDraft"> = {
    config: ctx.config,
    skillScores: ctx.skillScores,
    slotDifficulty: ctx.slotDifficulty,
    preferencesByTm: ctx.preferencesByTm,
    pairAffinitiesByTm: ctx.pairAffinitiesByTm,
    accommodationsByTm: ctx.accommodationsByTm,
    adjacency: ctx.adjacency,
    zoneMatrix: ctx.zoneMatrix,
    placementHistories: ctx.histories,
    weeklyRecentHistory: ctx.weeklyRecentHistory,
    tonightIso: ctx.nightIso,
  };

  const boardForHealth: Record<string, { tmId?: string; tmName?: string }> = {};

  // ── Pass 1: preserve locked / existing placements, seed the draft ──────────
  for (const slot of ctx.slots) {
    const existing = ctx.assignments[slot.key];
    if (!existing?.tmId) continue;
    const locked = !!(existing.isLocked || existing.is_locked);
    const shouldPreserve = preserve === "locked-only" ? locked : true;
    if (!shouldPreserve) continue;

    const tm = ctx.rosterById.get(existing.tmId);
    const name = existing.tmName ?? tm?.name ?? existing.tmId;
    const placement: SlotPlacement = {
      tmId: existing.tmId,
      tmName: name,
      provenance: {
        stage: "preserved",
        reason: locked ? "Locked — kept as-is" : "Existing placement preserved",
        scorecard: {
          eligible: true,
          healthPoints: 0,
          isCritical: false,
          prefScore: tm ? prefScoreFor(tm, slot.key, ctx) : 0,
          skillScore: tm ? skillScoreFor(tm, slot.key, ctx) : 0,
        },
      },
    };
    draft[slot.key] = placement;
    currentDraft.set(slot.key, existing.tmId);
    boardForHealth[slot.key] = { tmId: existing.tmId, tmName: name };
    breakdown[slot.key] = { topCandidates: [], pickedTmId: existing.tmId, preserved: true };
  }

  // ── Pass 2: fill the remaining slots in fill order ─────────────────────────
  for (const slot of ctx.slots) {
    if (draft[slot.key]) continue;
    if (slot.isOptional) {
      breakdown[slot.key] = { topCandidates: [], pickedTmId: null, preserved: false };
      continue;
    }

    const usedIds = new Set(currentDraft.values());
    const rescueCands: RescueCandidate[] = [];
    const scoredForPanel: ScoredCandidate[] = [];

    for (const tm of ctx.roster) {
      if (usedIds.has(tm.id)) continue;
      const gate = canPlace(tm, slot.key, {
        eligibilityRules: ctx.eligibilityRules,
        scheduledTmIds: ctx.scheduledTmIds,
        knowledge: ctx.knowledge,
      });
      if (!gate.ok) continue;

      const scoringCtx: ScoringContext = { ...scoringCtxBase, currentDraft };
      const result = scoreAssignment(tm, slot.key, scoringCtx);
      const score = finiteScore(result);
      const health = slot.isRotationTracked
        ? rotationHealthPoints({
            tmId: tm.id, tmName: tm.name, slotKey: slot.key, nightIso: ctx.nightIso,
            histories: ctx.histories, weeklyRecentHistory: ctx.weeklyRecentHistory,
            members: ctx.members, auxDefs: ctx.auxDefs, assignments: boardForHealth,
          })
        : { points: 0, isCritical: false };
      const isPrior3 = result.breakdown.prior_placement_repeat?.raw === -1;

      rescueCands.push({
        tmId: tm.id, tmName: tm.name, score,
        healthPoints: health.points, isCritical: health.isCritical,
        isPrior3, isHardAvoid: hasHardAvoid(tm, slot.key, ctx),
      });
      scoredForPanel.push({
        tmId: tm.id, tmName: tm.name, total: score,
        excluded: result.excluded, excludeReason: result.excludeReason,
        healthPoints: health.points, isCritical: health.isCritical,
      });
    }

    if (rescueCands.length === 0) {
      notes.push(`No eligible candidate for ${slot.key}`);
      breakdown[slot.key] = { topCandidates: [], pickedTmId: null, preserved: false };
      continue;
    }

    const rescue = rescueLadder(slot, rescueCands);
    if (!rescue) {
      notes.push(`${slot.key} left open — all candidates blocked and no relaxation available`);
      breakdown[slot.key] = {
        topCandidates: topKPanel(scoredForPanel, slot, topK),
        pickedTmId: null,
        preserved: false,
      };
      continue;
    }

    const pick = rescue.pick;
    const tm = ctx.rosterById.get(pick.tmId)!;
    const reason = rescue.relaxations.length
      ? `Coverage rescue (${rescue.relaxations.join(", ")} relaxed) — best available`
      : `Best rotation-aware fit`;
    draft[slot.key] = {
      tmId: pick.tmId,
      tmName: pick.tmName,
      provenance: {
        stage: "planner",
        reason,
        relaxations: rescue.relaxations.length ? rescue.relaxations : undefined,
        scorecard: {
          eligible: true,
          healthPoints: pick.healthPoints,
          isCritical: pick.isCritical,
          prefScore: prefScoreFor(tm, slot.key, ctx),
          skillScore: skillScoreFor(tm, slot.key, ctx),
        },
      },
    };
    currentDraft.set(slot.key, pick.tmId);
    boardForHealth[slot.key] = { tmId: pick.tmId, tmName: pick.tmName };
    breakdown[slot.key] = {
      topCandidates: topKPanel(scoredForPanel, slot, topK),
      pickedTmId: pick.tmId,
      preserved: false,
    };
    if (rescue.relaxations.length) {
      notes.push(`${slot.key} ← ${pick.tmName} (relaxed: ${rescue.relaxations.join(", ")})`);
    }
  }

  // (Overflow pass removed 2026-07-03: Z1/Z2 are now regular zones in the fill
  // order, staffed in-sequence by the main loop above — no special-casing.)

  return { draft, breakdown, notes };
}

/** Rank the Why?-panel candidates health-first for tracked slots, else by score. */
function topKPanel(
  cands: ScoredCandidate[],
  slot: { isRotationTracked: boolean },
  topK: number,
): ScoredCandidate[] {
  const sorted = [...cands].sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    if (slot.isRotationTracked && b.healthPoints !== a.healthPoints) {
      return b.healthPoints - a.healthPoints;
    }
    return b.total - a.total;
  });
  return sorted.slice(0, topK);
}
