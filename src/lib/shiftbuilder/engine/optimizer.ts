/**
 * engine/optimizer.ts — deterministic local search (P2-2).
 *
 * Successor to timefoldLocalSolver, rebuilt on the unified primitives. Seeds
 * from the planner draft, then hill-climbs fill / replace / swap moves, scoring
 * every candidate solution with the ONE objective (tier multipliers) and the
 * ONE health model (static variant for the hot loop). A move is accepted only
 * when it raises the objective — so by construction the result's scorecard is
 * ≥ the seed's (invariant I3), which means it can never trade coverage for
 * rotation (N1).
 *
 * Determinism (N7/I8): the search runs on a fixed *move budget* driven by a
 * seeded RNG — never wall-clock — so identical (context, seed, budget) yields
 * byte-identical output. The standalone "Deep Optimize" UI can wrap this with
 * wall-clock progress ticks; the core stays deterministic.
 */

import type { Draft, NightContext, Relaxation, SlotModel, SlotPlacement } from "./types";
import { canPlace } from "./eligibility";
import { rotationHealthPointsStatic } from "./health/model";
import { prefScoreFor, skillScoreFor, hasHardAvoid, tierMultipliers, type TierMultipliers } from "./objective";
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

    const eligible = canPlace(tm, slotKey, {
      eligibilityRules: this.ctx.eligibilityRules,
      scheduledTmIds: this.ctx.scheduledTmIds,
      knowledge: this.ctx.knowledge,
    }).ok;

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

  /** Hard placement legality at a relaxation level (0 clean, 1 prior-3 ok, 2 hard-avoid ok). */
  canHold(tmId: string, slotKey: string, relaxLevel: number): boolean {
    const e = this.eval(tmId, slotKey);
    if (!e.eligible) return false;
    if (e.isHardAvoid && relaxLevel < 2) return false;
    if (e.isPrior3 && relaxLevel < 1) return false;
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

  const greedyFillOpen = (sol: Solution) => {
    for (const slotKey of requiredSlots) {
      if (sol.get(slotKey) || lockedSlots.has(slotKey)) continue;
      const slot = slotByKey.get(slotKey)!;
      const used = usedIn(sol);
      for (let relax = 0; relax <= 2; relax++) {
        let best: { tmId: string; key: number } | null = null;
        for (const tmId of allTmIds) {
          if (used.has(tmId)) continue;
          if (!ev.canHold(tmId, slotKey, relax)) continue;
          const e = ev.eval(tmId, slotKey);
          const key = slot.isRotationTracked ? e.healthPoints * 1000 + e.prefScore : e.prefScore * 1000 + e.skillScore;
          if (!best || key > best.key) best = { tmId, key };
        }
        if (best) { sol.set(slotKey, best.tmId); break; }
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
        // Replace with an unused TM.
        const used = usedIn(sol);
        const pool = allTmIds.filter((id) => !used.has(id) && ev.canHold(id, a, 2));
        if (pool.length === 0) continue;
        const nTm = pool[Math.floor(rand() * pool.length)];
        sol.set(a, nTm);
        if (objective(sol) <= cur) sol.set(a, aTm);
      } else {
        // Swap two placed TMs.
        const b = mutable[Math.floor(rand() * mutable.length)];
        if (b === a) continue;
        const bTm = sol.get(b);
        if (!bTm) continue;
        if (!ev.canHold(aTm, b, 2) || !ev.canHold(bTm, a, 2)) continue;
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
          if (!ev.canHold(aTm, b, 2) || !ev.canHold(bTm, a, 2)) continue;
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
  let bestObj = objective(bestSolution);

  for (let r = 0; r < restarts; r++) {
    const rand = mulberry32(seed + r * 7919);
    const sol: Solution = r === 0 ? new Map(bestSolution) : buildScratch(seedSolution, lockedSlots);
    greedyFillOpen(sol);
    improvePass(sol, rand, moveBudget);
    repairCriticals(sol);
    const obj = objective(sol);
    if (obj > bestObj) { bestObj = obj; bestSolution = sol; }
  }

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

  // Optional/preserved slots from the seed pass through untouched.
  for (const [slotKey, p] of Object.entries(seedDraft)) {
    if (slotByKey.get(slotKey)?.isOptional || p.provenance.stage === "preserved") {
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
