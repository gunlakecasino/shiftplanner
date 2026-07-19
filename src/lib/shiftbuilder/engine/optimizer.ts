/**
 * engine/optimizer.ts — deterministic local search (P2-2).
 *
 * Successor to timefoldLocalSolver, rebuilt on the unified primitives. Seeds
 * from the planner draft, then hill-climbs fill / relocate / replace / swap
 * moves, scoring every candidate solution with the ONE objective (tier
 * multipliers) and the ONE health model (static variant for the hot loop). A
 * move is accepted only when it raises the objective — so by construction the
 * result's scorecard is ≥ the seed's (invariant I3), which means it can never
 * trade coverage for rotation (N1).
 *
 * PRESERVE SEMANTICS (P1-13, settled 2026-07-18). A **lock** pins a slot; a
 * *preserved* (unlocked) existing placement is a SEED, not a pin. Under either
 * preserve policy the optimizer may move an unlocked TM — including a manual
 * one — whenever doing so raises the objective, and coverage is the top term,
 * so an unlocked manual placement is only ever disturbed for a strictly better
 * board. Operators who want a placement untouched must lock it. Only
 * `lockedSlots` is treated as immutable anywhere in this module.
 *
 * COVERAGE RELOCATION (P0-3). Open required slots are not limited to unused
 * TMs: `relocateIntoOpen` can pull an unlocked placed TM into an open required
 * slot and backfill the vacated slot from the unused pool. Without it, the only
 * MRR-eligible free male being preserved in a zone left the restroom open all
 * night while a legal full-coverage board existed — coverage is tier 1.
 *
 * Determinism (N7/I8): the search runs on a fixed *move budget* driven by a
 * seeded RNG — never wall-clock — so identical (context, seed, budget) yields
 * byte-identical output. The standalone "Deep Optimize" UI can wrap this with
 * wall-clock progress ticks; the core stays deterministic.
 */

import type { Draft, NightContext, Relaxation, SlotModel, SlotPlacement } from "./types";
import { canPlace, gateOptionsFor } from "./eligibility";
import { rotationHealthPointsStatic } from "./health/model";
import { prefScoreFor, skillScoreFor, hasHardAvoid, tierMultipliers, type TierMultipliers } from "./objective";
import {
  MAX_RELAX_FOR_IMPROVEMENT,
  RELAX_HARD_AVOID,
  RELAX_ROTATION,
  RELAX_RUNGS,
  type RelaxLevel,
} from "./rescue";
import { isInPriorPlacementSameAreaWindow, weekEntriesForTm } from "@/lib/shiftbuilder/rotation/placementPadHelpers";

export interface OptimizerOptions {
  seed?: number;
  /** Deterministic move budget per restart. */
  moveBudget?: number;
  restarts?: number;
}

interface PairEval {
  eligible: boolean;
  healthPoints: number;
  isCritical: boolean;
  prefScore: number;
  skillScore: number;
  isPrior3: boolean;
  isHardAvoid: boolean;
}

type Solution = Map<string, string>; // slotKey -> tmId

/** Seeded PRNG (mulberry32) — same seed, same sequence, any machine. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class PairEvaluator {
  private cache = new Map<string, PairEval>();
  constructor(private ctx: NightContext) {}

  eval(tmId: string, slotKey: string): PairEval {
    const key = `${tmId}|${slotKey}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const tm = this.ctx.rosterById.get(tmId);
    const slot = this.ctx.slotByKey.get(slotKey);
    if (!tm || !slot) {
      const bad: PairEval = { eligible: false, healthPoints: 0, isCritical: false, prefScore: 0, skillScore: 0, isPrior3: false, isHardAvoid: false };
      this.cache.set(key, bad);
      return bad;
    }

    const eligible = canPlace(tm, slotKey, gateOptionsFor(this.ctx, tm)).ok;

    let healthPoints = 0;
    let isCritical = false;
    if (slot.isRotationTracked) {
      const h = rotationHealthPointsStatic({
        tmId, tmName: tm.name, slotKey, nightIso: this.ctx.nightIso,
        histories: this.ctx.histories, weeklyRecentHistory: this.ctx.weeklyRecentHistory,
        members: this.ctx.members, auxDefs: this.ctx.auxDefs,
      });
      healthPoints = h.points;
      isCritical = h.isCritical;
    }

    const weekEntries = weekEntriesForTm(this.ctx.weeklyRecentHistory, tmId, this.ctx.nightIso);
    const isPrior3 = slot.isRotationTracked
      ? isInPriorPlacementSameAreaWindow(this.ctx.histories[tmId] ?? null, slotKey, this.ctx.nightIso, undefined, weekEntries)
      : false;

    const out: PairEval = {
      eligible,
      healthPoints,
      isCritical,
      prefScore: prefScoreFor(tm, slotKey, this.ctx),
      skillScore: skillScoreFor(tm, slotKey, this.ctx),
      isPrior3,
      isHardAvoid: hasHardAvoid(tm, slotKey, this.ctx),
    };
    this.cache.set(key, out);
    return out;
  }

  /**
   * Hard placement legality at a relaxation rung (D1.2):
   *   RELAX_NONE (0)        — clean: no prior-3 repeat, no hard-avoid
   *   RELAX_ROTATION (1)    — the prior-3 same-area rotation gate may break
   *   RELAX_HARD_AVOID (2)  — a hard-avoid preference may additionally break
   *
   * Hard eligibility (`canPlace`) is never relaxable at any rung. Rung 2 is
   * reserved for coverage rescue on a required slot; pure improvement moves
   * must pass `MAX_RELAX_FOR_IMPROVEMENT`.
   */
  canHold(tmId: string, slotKey: string, relaxLevel: RelaxLevel): boolean {
    const e = this.eval(tmId, slotKey);
    if (!e.eligible) return false;
    if (e.isHardAvoid && relaxLevel < RELAX_HARD_AVOID) return false;
    if (e.isPrior3 && relaxLevel < RELAX_ROTATION) return false;
    return true;
  }
}

export interface OptimizerResult {
  draft: Draft;
  relaxationsUsed: Relaxation[];
}

export function runOptimizer(
  ctx: NightContext,
  seedDraft: Draft,
  opts: OptimizerOptions = {},
): OptimizerResult {
  const seed = opts.seed ?? 1;
  const restarts = opts.restarts ?? 4;
  const moveBudget = opts.moveBudget ?? 800;

  const ev = new PairEvaluator(ctx);
  const mult = tierMultipliers(ctx.slots.length, ctx);

  const requiredSlots = ctx.slots.filter((s) => !s.isOptional).map((s) => s.key);
  const trackedSlots = new Set(ctx.slots.filter((s) => s.isRotationTracked).map((s) => s.key));
  const lockedSlots = new Set(
    Object.entries(ctx.assignments)
      .filter(([, a]) => !!(a.isLocked || a.is_locked) && a.tmId)
      .map(([k]) => k),
  );
  const slotByKey = ctx.slotByKey;
  const allTmIds = ctx.roster.map((t) => t.id);

  const seedSolution: Solution = new Map();
  for (const [slotKey, p] of Object.entries(seedDraft)) {
    if (slotByKey.get(slotKey)?.isOptional) continue;
    seedSolution.set(slotKey, p.tmId);
  }

  const objective = (sol: Solution): number => {
    let coverage = 0, health = 0, pref = 0, skill = 0;
    for (const slotKey of requiredSlots) {
      const tmId = sol.get(slotKey);
      if (!tmId) continue;
      coverage += 1;
      const e = ev.eval(tmId, slotKey);
      if (trackedSlots.has(slotKey)) health += e.healthPoints;
      pref += e.prefScore;
      skill += e.skillScore;
    }
    return coverage * mult.COVERAGE_UNIT + health * mult.HEALTH_UNIT + pref * mult.PREF_UNIT + skill * mult.SKILL_UNIT;
  };

  const usedIn = (sol: Solution) => new Set(sol.values());
  const coverageOf = (sol: Solution) => {
    let n = 0;
    for (const slotKey of requiredSlots) if (sol.get(slotKey)) n += 1;
    return n;
  };

  const greedyFillOpen = (sol: Solution) => {
    for (const slotKey of requiredSlots) {
      if (sol.get(slotKey) || lockedSlots.has(slotKey)) continue;
      const slot = slotByKey.get(slotKey)!;
      const used = usedIn(sol);
      // Coverage rescue on a required slot: descend the ladder and stop at the
      // first rung that yields anybody, so rung 2 (hard-avoid) is only ever
      // reached when rungs 0 and 1 found nobody — D1.2.
      for (const relax of RELAX_RUNGS) {
        let best: { tmId: string; key: number } | null = null;
        for (const tmId of allTmIds) {
          if (used.has(tmId)) continue;
          if (!ev.canHold(tmId, slotKey, relax)) continue;
          const e = ev.eval(tmId, slotKey);
          // Rank by the SAME tier units as objective() — never ad-hoc constants.
          // The old `health*1000 + pref` inverted as soon as preference_fit
          // approached 1000 (P1-12); these units are derived from the clamped
          // per-slot maxima and are safe-integer-checked in tierMultipliers().
          const key = slot.isRotationTracked
            ? e.healthPoints * mult.HEALTH_UNIT + e.prefScore * mult.PREF_UNIT + e.skillScore * mult.SKILL_UNIT
            : e.prefScore * mult.PREF_UNIT + e.skillScore * mult.SKILL_UNIT;
          // Strict `>` over the fixed allTmIds order: ties resolve to roster
          // order deliberately, which is what keeps the search deterministic.
          if (!best || key > best.key) best = { tmId, key };
        }
        if (best) { sol.set(slotKey, best.tmId); break; }
      }
    }
  };

  /**
   * Coverage relocation (P0-3). An open required slot that no *unused* TM can
   * hold may still be fillable by an already-placed, unlocked TM — provided the
   * slot they vacate can then be backfilled. Tries each such relocation, runs
   * `greedyFillOpen` on the trial board to backfill the vacated slot, and keeps
   * it only on a strict objective gain (coverage is the top term, so a genuine
   * coverage win always wins).
   *
   * A relocation is accepted ONLY when it strictly raises coverage. Shuffling a
   * TM between two required slots at equal coverage is not this move's job (the
   * replace/swap passes own that) and would silently trade fill-order priority
   * — which the count-based coverage term cannot see — for a health gain.
   *
   * Ladder discipline: candidates are gathered rung by rung and the search stops
   * at the first rung with any candidate, so rung 2 is reachable only when rungs
   * 0/1 are empty (D1.2) — and since every accepted relocation raises coverage,
   * hard-avoid is never broken for a mere health/preference gain (D1.0).
   */
  const relocateIntoOpen = (sol: Solution) => {
    let improved = true;
    let guardCounter = 0;
    while (improved && guardCounter++ < 4) {
      improved = false;
      for (const target of requiredSlots) {
        if (sol.get(target) || lockedSlots.has(target)) continue;
        const cur = objective(sol);
        const curCoverage = coverageOf(sol);
        let best: { board: Solution; val: number } | null = null;

        for (const relax of RELAX_RUNGS) {
          const sources = requiredSlots.filter((source) => {
            if (source === target || lockedSlots.has(source)) return false;
            const tmId = sol.get(source);
            return !!tmId && ev.canHold(tmId, target, relax);
          });
          if (sources.length === 0) continue;

          for (const source of sources) {
            const trial = new Map(sol);
            trial.set(target, trial.get(source)!);
            trial.delete(source);
            greedyFillOpen(trial);
            if (coverageOf(trial) <= curCoverage) continue;
            const val = objective(trial);
            if (val > cur && (!best || val > best.val)) best = { board: trial, val };
          }
          break; // this rung had candidates — D1.2 forbids descending further
        }

        if (best) {
          sol.clear();
          for (const [k, v] of best.board) sol.set(k, v);
          improved = true;
        }
      }
    }
  };

  const improvePass = (sol: Solution, rand: () => number, budget: number) => {
    const mutable = requiredSlots.filter((k) => !lockedSlots.has(k));
    if (mutable.length === 0) return;
    for (let m = 0; m < budget; m++) {
      const cur = objective(sol);
      const a = mutable[Math.floor(rand() * mutable.length)];
      const aTm = sol.get(a);
      if (!aTm) continue;

      if (rand() < 0.5) {
        // Replace with an unused TM. Pure improvement move — capped at rung 1
        // (D1.3); a replace never buys coverage, so it may not break hard-avoid.
        const used = usedIn(sol);
        const pool = allTmIds.filter((id) => !used.has(id) && ev.canHold(id, a, MAX_RELAX_FOR_IMPROVEMENT));
        if (pool.length === 0) continue;
        const nTm = pool[Math.floor(rand() * pool.length)];
        sol.set(a, nTm);
        if (objective(sol) <= cur) sol.set(a, aTm);
      } else {
        // Swap two placed TMs. Also a pure improvement move: both destinations
        // are gated at rung 1 (D1.3). The gate applies to destinations only —
        // a TM currently sitting on a rung-2 rescue placement may still move out.
        const b = mutable[Math.floor(rand() * mutable.length)];
        if (b === a) continue;
        const bTm = sol.get(b);
        if (!bTm) continue;
        if (!ev.canHold(aTm, b, MAX_RELAX_FOR_IMPROVEMENT) || !ev.canHold(bTm, a, MAX_RELAX_FOR_IMPROVEMENT)) continue;
        sol.set(a, bTm); sol.set(b, aTm);
        if (objective(sol) <= cur) { sol.set(a, aTm); sol.set(b, bTm); }
      }
    }
  };

  // Deterministic critical-repair pass: exhaustively try to clear each critical
  // repeat by swapping with another tracked slot, accepting only strict objective
  // gains. Random hill-climbing can miss a specific beneficial swap among ~27
  // slots; this guarantees any *fixable* critical is fixed (and leaves genuinely
  // forced ones — e.g. 5 women for 5 restrooms — in place, flagged).
  const trackedMutable = ctx.slots
    .filter((s) => s.isRotationTracked && !s.isOptional && !lockedSlots.has(s.key))
    .map((s) => s.key);
  const repairCriticals = (sol: Solution) => {
    let improved = true;
    let guardCounter = 0;
    while (improved && guardCounter++ < 6) {
      improved = false;
      for (const a of trackedMutable) {
        const aTm = sol.get(a);
        if (!aTm || !ev.eval(aTm, a).isCritical) continue;
        const cur = objective(sol);
        let best: { b: string; val: number } | null = null;
        for (const b of trackedMutable) {
          if (b === a) continue;
          const bTm = sol.get(b);
          if (!bTm) continue;
          // Rung 1 cap (D1.3): a critical repeat that can only be cleared by
          // placing someone on a hard-avoid slot stays flagged-critical —
          // hard-avoid outranks rotation health.
          if (!ev.canHold(aTm, b, MAX_RELAX_FOR_IMPROVEMENT) || !ev.canHold(bTm, a, MAX_RELAX_FOR_IMPROVEMENT)) continue;
          sol.set(a, bTm); sol.set(b, aTm);
          const val = objective(sol);
          sol.set(a, aTm); sol.set(b, bTm); // revert to measure
          if (val > cur && (!best || val > best.val)) best = { b, val };
        }
        if (best) {
          const bTm = sol.get(best.b)!;
          sol.set(a, bTm); sol.set(best.b, aTm);
          improved = true;
        }
      }
    }
  };

  let bestSolution: Solution = new Map(seedSolution);
  greedyFillOpen(bestSolution);
  relocateIntoOpen(bestSolution);
  let bestObj = objective(bestSolution);

  for (let r = 0; r < restarts; r++) {
    const rand = mulberry32(seed + r * 7919);
    const sol: Solution = r === 0 ? new Map(bestSolution) : buildScratch(seedSolution, lockedSlots);
    greedyFillOpen(sol);
    relocateIntoOpen(sol);
    improvePass(sol, rand, moveBudget);
    repairCriticals(sol);
    const obj = objective(sol);
    if (obj > bestObj) { bestObj = obj; bestSolution = sol; }
  }

  // Final sweep: improve/repair passes can free a TM who unblocks a still-open
  // required slot, so relocate once more before repairing criticals.
  relocateIntoOpen(bestSolution);
  repairCriticals(bestSolution);
  return buildResultDraft(ctx, seedDraft, bestSolution, ev, slotByKey);
}

/** Scratch seed keeps only locked slots (max-spread restart variant). */
function buildScratch(seed: Solution, locked: Set<string>): Solution {
  const out: Solution = new Map();
  for (const slotKey of locked) {
    const id = seed.get(slotKey);
    if (id) out.set(slotKey, id);
  }
  return out;
}

function buildResultDraft(
  ctx: NightContext,
  seedDraft: Draft,
  sol: Solution,
  ev: PairEvaluator,
  slotByKey: Map<string, SlotModel>,
): OptimizerResult {
  const draft: Draft = {};
  const relaxationsUsed: Relaxation[] = [];

  // Optional slots are outside the search space entirely (they never entered
  // `seedSolution`), so they pass through untouched.
  //
  // Preserved slots do NOT pass through here (P1-13): they are seeds, not pins,
  // and the search may legitimately have moved or vacated them. Copying them
  // back unconditionally — as this loop used to — could resurrect a TM at their
  // old slot while the solution also placed them elsewhere, i.e. a double-book.
  // Unmoved preserved slots keep their original provenance via the
  // `seedPlacement.tmId === tmId` branch below; locks are immutable in the
  // search, so they always take that branch.
  for (const [slotKey, p] of Object.entries(seedDraft)) {
    if (slotByKey.get(slotKey)?.isOptional) {
      draft[slotKey] = p;
    }
  }

  for (const [slotKey, tmId] of sol) {
    const slot = slotByKey.get(slotKey);
    if (!slot) continue;
    const seedPlacement = seedDraft[slotKey];
    if (seedPlacement && seedPlacement.tmId === tmId) {
      // Unchanged — keep original provenance (planner/preserved).
      draft[slotKey] = seedPlacement;
      if (seedPlacement.provenance.relaxations) {
        relaxationsUsed.push(...seedPlacement.provenance.relaxations);
      }
      continue;
    }
    const tm = ctx.rosterById.get(tmId);
    const e = ev.eval(tmId, slotKey);
    const relaxations: Relaxation[] = [];
    if (e.isPrior3) relaxations.push("rotation-prior3");
    if (e.isHardAvoid) relaxations.push("hard-avoid");
    relaxationsUsed.push(...relaxations);
    const placement: SlotPlacement = {
      tmId,
      tmName: tm?.name ?? tmId,
      provenance: {
        stage: "optimizer",
        reason: relaxations.length
          ? `Optimizer pick (${relaxations.join(", ")} relaxed)`
          : `Optimizer improved rotation fit`,
        relaxations: relaxations.length ? relaxations : undefined,
        scorecard: {
          eligible: e.eligible,
          healthPoints: e.healthPoints,
          isCritical: e.isCritical,
          prefScore: e.prefScore,
          skillScore: e.skillScore,
        },
      },
    };
    draft[slotKey] = placement;
  }

  return { draft, relaxationsUsed };
}
