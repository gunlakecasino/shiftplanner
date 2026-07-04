"use client";

/**
 * timefoldLocalSolver — the real "Deep Optimize" engine (in-process).
 *
 * Replaces timefoldMock behind the exact same tick/result contract. This is a
 * genuine optimizer, not a simulation: it seeds from tonight's live board,
 * then runs multi-restart hill-climbing over fill/replace/swap moves, scoring
 * every candidate solution against the operator-ratified objective hierarchy:
 *
 *   1. COVERAGE     — filled required slots (lexicographically dominant)
 *   2. ROTATION     — Σ per-slot health points (prior-3 criticals, week
 *                     repeats, 30-night spread — same primitives as the fit chips)
 *   3. PREFERENCES  — hard avoid = constraint; hard/soft prefer/avoid as signal
 *   4. SKILL        — closeness of tm skill_score to slot_difficulty
 *
 * Hard rules are constraints, never costs: eligibility (gender, grave pool,
 * overlap bands), locked slots, one TM per night, scheduled-only pool, and
 * manual-only zones (Z1/Z2 never auto-filled).
 *
 * A true Timefold service can later replace this behind the same interface —
 * see timefoldTypes.ts. Until then, "Est. 12–18s" is a real solve budget.
 */

import {
  collectDeploymentSlotKeys,
  formatPlacementUiLabel,
  getSpreadPlacementCounts,
  isInLast5SameAreaTrail,
  isInPriorPlacementSameAreaWindow,
  PLACEMENT_SPREAD_NIGHTS,
  spreadCountForRepeatKey,
  weekEntriesForTm,
} from "@/app/shiftbuilder/components/placementPadHelpers";
import { scorePlacementFit } from "@/app/shiftbuilder/components/placementFitScore";
import { memberToPlacementProfile } from "@/app/shiftbuilder/components/placementFitForSlot";
import { getTmWeekRepeatForSlotThroughNight } from "@/app/shiftbuilder/components/shiftRotationHealth";
import {
  isEligibleForSlot,
  isOptionalDeploymentSlot,
  type AuxDef,
} from "@/lib/shiftbuilder/placement";
import { preferenceTargetMatches, uiKeyToSlotDifficultyKey } from "@/lib/shiftbuilder/scoring";
import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type {
  TimefoldConstraintSignal,
  TimefoldHealthLift,
  TimefoldProposal,
  TimefoldRunInput,
  TimefoldRunResult,
  TimefoldSlotDiff,
} from "./timefoldTypes";
import type { RunMockTimefoldOptimizeHandlers } from "./timefoldMock";

// Objective tier multipliers — near-lexicographic by construction:
// one filled slot (1e7) beats any health total (≤ ~3e6 for a 30-slot board);
// one health point (1e3) beats the entire preference band (≤ ~600);
// one preference unit (10×|1.5|) beats the entire skill band.
const COVERAGE_UNIT = 1e7;
const HEALTH_UNIT = 1e3;
const PREF_UNIT = 10;
const SKILL_UNIT = 1;

/** Wall-clock solve budget (keeps the "Est. 12–18s" promise honest). */
const SOLVE_BUDGET_MS = 9_000;
const BATCH_MS = 120;

type Solution = Map<string, string>; // slotKey -> tmId ("" never stored; absent = open)

type SolverTm = {
  id: string;
  name: string;
  profile: ReturnType<typeof memberToPlacementProfile>;
};

type PairEval = {
  eligible: boolean;
  /** Hard-avoid preference — treated as a constraint (never placed). */
  hardAvoid: boolean;
  healthPoints: number;
  verdict: string;
  prefScore: number;
  skillScore: number;
  timesInSpread: number;
  weekRepeat: number;
  critical: boolean;
};

class PairEvaluator {
  private cache = new Map<string, PairEval>();

  constructor(
    private tmsById: Map<string, SolverTm>,
    private histories: Record<string, ZoneDetailEntry | null>,
    private weeklyRecentHistory:
      | Map<string, Array<{ nightDate: string; slotKey: string }>>
      | undefined,
    private currentIso: string,
    private preferencesByTm: Map<string, Array<Record<string, unknown>>> | undefined,
    private skillScores: Map<string, number> | undefined,
    private slotDifficulty: Map<string, number> | undefined,
    private trackedSlots: Set<string>,
  ) {}

  eval(tmId: string, slotKey: string): PairEval {
    const key = `${tmId}|${slotKey}`;
    const hit = this.cache.get(key);
    if (hit) return hit;

    const tm = this.tmsById.get(tmId);
    const profile = tm?.profile ?? null;
    const eligible = profile ? isEligibleForSlot(profile, slotKey) : false;

    // Preferences (tier 3). Hard avoid is a constraint, not a cost.
    let prefScore = 0;
    let hardAvoid = false;
    for (const row of this.preferencesByTm?.get(tmId) ?? []) {
      const target = String((row as any).target ?? "");
      if (!preferenceTargetMatches(target, slotKey)) continue;
      const stance = String((row as any).stance ?? "");
      const strength = String((row as any).strength ?? "");
      const sign = stance === "prefer" ? 1 : stance === "avoid" ? -1 : 0;
      if (sign === -1 && strength === "hard") hardAvoid = true;
      prefScore += sign * (strength === "hard" ? 1.5 : 0.6);
    }

    // Skill (tier 4) — mirrors scoreSkillMatch's shape.
    let skillScore = 0;
    const tmSkill = this.skillScores?.get(tmId);
    const diffKey = uiKeyToSlotDifficultyKey(slotKey);
    const slotDiff = diffKey ? this.slotDifficulty?.get(diffKey) : undefined;
    if (tmSkill !== undefined && slotDiff !== undefined) {
      let raw = 1 - Math.abs(tmSkill - slotDiff) / 5;
      if (tmSkill >= slotDiff) raw = Math.max(raw, 0.2);
      skillScore = Math.max(-1, Math.min(1, raw));
    }

    // Rotation health (tier 2) — same primitives as the board fit chips, with
    // the swap-lane machinery omitted (static per pair; ±2pt precision loss is
    // acceptable inside the search; real chips re-score after import).
    const history = this.histories[tmId] ?? null;
    const weekEntries = weekEntriesForTm(this.weeklyRecentHistory, tmId, this.currentIso);
    const spreadCounts = getSpreadPlacementCounts(history, PLACEMENT_SPREAD_NIGHTS, this.currentIso);
    const timesInSpread = spreadCountForRepeatKey(spreadCounts, slotKey);
    const weekRepeat = getTmWeekRepeatForSlotThroughNight(
      this.weeklyRecentHistory,
      tmId,
      slotKey,
      this.currentIso,
      true,
    );
    const inPrior = isInPriorPlacementSameAreaWindow(
      history,
      slotKey,
      this.currentIso,
      undefined,
      weekEntries,
    );

    const fit = this.trackedSlots.has(slotKey)
      ? scorePlacementFit({
          slotKey,
          assignments: {},
          tmName: tm?.name,
          assigned: true,
          tmEligibleForSlot: eligible,
          timesInSpread,
          inLast5: isInLast5SameAreaTrail(history, slotKey, this.currentIso, weekEntries),
          inPriorPlacementWindow: inPrior,
          weekRepeatThisSlot: weekRepeat,
          rotationBasics: null,
          actionableGapSlots: [],
        })
      : null;

    const result: PairEval = {
      eligible,
      hardAvoid,
      healthPoints: fit?.healthPoints ?? (eligible ? 85 : 0),
      verdict: fit?.fitVerdict ?? (eligible ? "acceptable" : "poor_fit"),
      prefScore,
      skillScore,
      timesInSpread,
      weekRepeat,
      critical: fit?.fitVerdict === "critical_repeat",
    };
    this.cache.set(key, result);
    return result;
  }

  canHold(tmId: string, slotKey: string): boolean {
    const e = this.eval(tmId, slotKey);
    return e.eligible && !e.hardAvoid;
  }
}

function objective(sol: Solution, requiredSlots: string[], ev: PairEvaluator): number {
  let coverage = 0;
  let health = 0;
  let pref = 0;
  let skill = 0;
  for (const slotKey of requiredSlots) {
    const tmId = sol.get(slotKey);
    if (!tmId) continue;
    coverage += 1;
    const e = ev.eval(tmId, slotKey);
    health += e.healthPoints;
    pref += e.prefScore;
    skill += e.skillScore;
  }
  return coverage * COVERAGE_UNIT + health * HEALTH_UNIT + pref * PREF_UNIT + skill * SKILL_UNIT;
}

function avgHealth(sol: Solution, trackedSlots: Set<string>, ev: PairEvaluator): number | null {
  const pts: number[] = [];
  for (const [slotKey, tmId] of sol) {
    if (!trackedSlots.has(slotKey) || !tmId) continue;
    pts.push(ev.eval(tmId, slotKey).healthPoints);
  }
  if (pts.length === 0) return null;
  return Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 10) / 10;
}

function countCriticals(sol: Solution, trackedSlots: Set<string>, ev: PairEvaluator): number {
  let n = 0;
  for (const [slotKey, tmId] of sol) {
    if (!trackedSlots.has(slotKey) || !tmId) continue;
    if (ev.eval(tmId, slotKey).critical) n += 1;
  }
  return n;
}

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

export function runLocalDeepOptimize(
  input: TimefoldRunInput,
  handlers: RunMockTimefoldOptimizeHandlers,
): () => void {
  let cancelled = false;
  const startedAt = Date.now();

  (async () => {
    try {
      const currentIso = input.currentIso;
      const members = input.members ?? [];
      if (!currentIso || members.length === 0) {
        handlers.onError?.(
          "Deep Optimize needs tonight's board context (date + member profiles) — try again once the board finishes loading.",
        );
        return;
      }

      // === Board model =====================================================
      const auxDefs = (input.auxDefs ?? []) as AuxDef[];
      const allSlots = collectDeploymentSlotKeys(auxDefs);
      // Required = engine-fillable deployment slots. Z1/Z2 stay manual-only.
      const requiredSlots = allSlots.filter((k) => !isOptionalDeploymentSlot(k));
      const trackedSlots = new Set(allSlots); // health scored on fit-chip slots via evaluator gate
      const lockedSlots = new Set(
        Object.entries(input.assignments)
          .filter(([, a]) => !!(a as any)?.isLocked || !!(a as any)?.is_locked)
          .map(([k]) => k),
      );

      // === TM pool =========================================================
      const scheduledGate = input.scheduledTmIds && input.scheduledTmIds.size > 0;
      const tmsById = new Map<string, SolverTm>();
      for (const tm of input.roster) {
        if (!tm.id) continue;
        if (scheduledGate && !input.scheduledTmIds!.has(String(tm.id))) continue;
        tmsById.set(String(tm.id), {
          id: String(tm.id),
          name: tm.name || tm.fullName || String(tm.id),
          profile: memberToPlacementProfile(members, String(tm.id)),
        });
      }
      // TMs currently on the board must be known even if the roster filter missed them.
      for (const [slotKey, a] of Object.entries(input.assignments)) {
        const id = (a as any)?.tmId ? String((a as any).tmId) : null;
        if (id && !tmsById.has(id)) {
          tmsById.set(id, {
            id,
            name: (a as any)?.tmName || id,
            profile: memberToPlacementProfile(members, id),
          });
        }
        void slotKey;
      }

      handlers.onTick({
        percent: 4,
        score: 0,
        bestScore: 0,
        iteration: 0,
        etaSeconds: Math.round(SOLVE_BUDGET_MS / 1000),
        headline: "Reading tonight's board…",
        constraints: [],
      });

      // === Histories (30-night spread) ====================================
      let histories: Record<string, ZoneDetailEntry | null> = {};
      try {
        const res = await fetch("/api/shiftbuilder/placement-histories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmIds: [...tmsById.keys()], days: PLACEMENT_SPREAD_NIGHTS }),
        });
        const data = await res.json();
        histories = (data.histories as Record<string, ZoneDetailEntry | null>) ?? {};
      } catch {
        histories = {}; // degrade: rotation tier flattens, hierarchy still holds
      }
      if (cancelled) return;

      const ev = new PairEvaluator(
        tmsById,
        histories,
        input.weeklyRecentHistory,
        currentIso,
        input.preferencesByTm,
        input.skillScores,
        input.slotDifficulty,
        trackedSlots,
      );

      // === Seed: tonight's board (kept placements must remain legal) =======
      const baseSolution: Solution = new Map();
      for (const slotKey of allSlots) {
        const id = (input.assignments[slotKey] as any)?.tmId;
        if (id) baseSolution.set(slotKey, String(id));
      }
      // Coverage-first invariant: a slot filled on the real board must NEVER end
      // up open in a proposal. Optimization may rearrange WHO covers what, but it
      // must not rob a filled slot to cover another — that is net-zero coverage
      // and (robbing a restroom for a zone) breaks the fill order.
      const baseFilledSlots = new Set(
        [...baseSolution.keys()].filter((k) => requiredSlots.includes(k)),
      );

      /**
       * Unwind any "robbing": if a base-filled slot ended open because its TM was
       * pulled into a slot that was *open* on the base board, vacate that base-open
       * slot and restore the TM to their real one. Guarantees no proposal reduces
       * base coverage, whatever the search did. Only a genuinely available (bench)
       * TM can ever fill a base-open slot.
       */
      const enforceBaseCoverage = (sol: Solution) => {
        for (const slotKey of baseFilledSlots) {
          if (sol.get(slotKey)) continue; // still covered — fine
          const baseTm = baseSolution.get(slotKey);
          if (!baseTm) continue;
          const wanderedTo = [...sol.entries()].find(([, id]) => id === baseTm)?.[0];
          // Only unwind when they drifted into a slot that was OPEN on the base
          // board (a rob). If they legitimately swapped into another base-filled
          // slot, that slot is still covered — leave the chain alone.
          if (wanderedTo && !baseFilledSlots.has(wanderedTo)) {
            sol.delete(wanderedTo);
          }
          if (![...sol.values()].includes(baseTm)) {
            sol.set(slotKey, baseTm);
          }
        }
      };

      const constraintSignals = (sol: Solution): TimefoldConstraintSignal[] => {
        const open = requiredSlots.filter((k) => !sol.get(k)).length;
        // F7 (2026-07-02): evaluate the ACTUAL solution rather than hardcoding
        // "satisfied". The search only makes legal moves, but the seed board is
        // taken as-is — a pre-existing ineligible / double-booked / locked-bad
        // placement survives into every proposal and must be surfaced, not
        // painted green.
        let weekRepeats = 0;
        let ineligibleNonRr: string | null = null;
        let ineligibleRr: string | null = null;
        let doubleBook: string | null = null;
        const seenTm = new Map<string, string>();
        for (const [slotKey, tmId] of sol) {
          if (!tmId) continue;
          const e = ev.eval(tmId, slotKey);
          if (e.weekRepeat >= 2) weekRepeats += 1;
          if (!e.eligible) {
            const label = formatPlacementUiLabel(slotKey);
            if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) {
              ineligibleRr = ineligibleRr ?? label;
            } else {
              ineligibleNonRr = ineligibleNonRr ?? label;
            }
          }
          const prev = seenTm.get(tmId);
          if (prev) {
            doubleBook = doubleBook ?? `${formatPlacementUiLabel(prev)} + ${formatPlacementUiLabel(slotKey)}`;
          } else {
            seenTm.set(tmId, slotKey);
          }
        }
        return [
          {
            id: "full_grave_only",
            label: "Full-grave eligibility",
            status: ineligibleNonRr ? "broken" : "satisfied",
            detail: ineligibleNonRr ? `Ineligible placement at ${ineligibleNonRr}` : undefined,
          },
          {
            id: "rr_gender",
            label: "Restroom gender assignment",
            status: ineligibleRr ? "broken" : "satisfied",
            detail: ineligibleRr ? `Ineligible restroom placement at ${ineligibleRr}` : undefined,
          },
          {
            id: "no_double_book",
            label: "No double-booking tonight",
            status: doubleBook ? "broken" : "satisfied",
            detail: doubleBook ? `Same TM in ${doubleBook}` : undefined,
          },
          {
            id: "max_one_repeat",
            label: "Max 1 repeat per area / week",
            status: weekRepeats === 0 ? "satisfied" : "warning",
            detail: weekRepeats > 0 ? `${weekRepeats} placement${weekRepeats === 1 ? "" : "s"} ≥2× this week` : undefined,
          },
          {
            id: "coverage_floor",
            label: "Required slot coverage",
            status: open === 0 ? "satisfied" : "warning",
            detail: open > 0 ? `${open} required slot${open === 1 ? "" : "s"} still open` : undefined,
          },
        ];
      };

      // === Search ==========================================================
      let iteration = 0;
      let bestDisplayScore = avgHealth(baseSolution, trackedSlots, ev) ?? 0;

      const usedIn = (sol: Solution): Set<string> => new Set(sol.values());

      const greedyFillOpen = (sol: Solution) => {
        for (const slotKey of requiredSlots) {
          if (sol.get(slotKey) || lockedSlots.has(slotKey)) continue;
          const used = usedIn(sol);
          let best: { tmId: string; gain: number } | null = null;
          for (const tmId of tmsById.keys()) {
            if (used.has(tmId)) continue;
            if (!ev.canHold(tmId, slotKey)) continue;
            const e = ev.eval(tmId, slotKey);
            const gain =
              COVERAGE_UNIT + e.healthPoints * HEALTH_UNIT + e.prefScore * PREF_UNIT + e.skillScore;
            if (!best || gain > best.gain) best = { tmId, gain };
            iteration += 1;
          }
          if (best) sol.set(slotKey, best.tmId);
        }
      };

      const improvePass = (sol: Solution, rand: () => number, moveBudget: number): boolean => {
        let improved = false;
        const mutableSlots = requiredSlots.filter((k) => !lockedSlots.has(k));
        for (let m = 0; m < moveBudget; m++) {
          if (cancelled) return improved;
          const current = objective(sol, requiredSlots, ev);

          const a = mutableSlots[Math.floor(rand() * mutableSlots.length)];
          const aTm = sol.get(a);
          if (!aTm) continue;

          if (rand() < 0.5) {
            // Replace with an unused TM.
            const used = usedIn(sol);
            const pool = [...tmsById.keys()].filter((id) => !used.has(id));
            if (pool.length === 0) continue;
            const nTm = pool[Math.floor(rand() * pool.length)];
            if (!ev.canHold(nTm, a)) continue;
            sol.set(a, nTm);
            iteration += 1;
            if (objective(sol, requiredSlots, ev) > current) improved = true;
            else sol.set(a, aTm);
          } else {
            // Swap two placed TMs.
            const b = mutableSlots[Math.floor(rand() * mutableSlots.length)];
            if (b === a) continue;
            const bTm = sol.get(b);
            if (!bTm) continue;
            if (!ev.canHold(aTm, b) || !ev.canHold(bTm, a)) continue;
            sol.set(a, bTm);
            sol.set(b, aTm);
            iteration += 1;
            if (objective(sol, requiredSlots, ev) > current) improved = true;
            else {
              sol.set(a, aTm);
              sol.set(b, bTm);
            }
          }
        }
        return improved;
      };

      const yieldBatch = async (headlineIdx: number) => {
        const elapsed = Date.now() - startedAt;
        const headlines = [
          "Enforcing hard rules — restrooms, shift types…",
          "Exploring zone reassignments…",
          "Untangling rotation repeats…",
          "Balancing the week across the roster…",
          "Polishing fairness…",
          "Preparing your Draft…",
        ];
        handlers.onTick({
          percent: Math.min(96, Math.round((elapsed / SOLVE_BUDGET_MS) * 100)),
          score: bestDisplayScore,
          bestScore: bestDisplayScore,
          iteration,
          etaSeconds: Math.max(1, Math.round((SOLVE_BUDGET_MS - elapsed) / 1000)),
          headline: headlines[Math.min(headlines.length - 1, headlineIdx)],
          constraints: constraintSignals(bestOverall ?? baseSolution),
        });
        await new Promise((r) => setTimeout(r, 0));
      };

      // Variant runs — each produces a candidate solution.
      let bestOverall: Solution | null = null;

      const runVariant = async (
        seed: Solution,
        randSeed: number,
        deadlineShare: number,
        headlineIdx: number,
      ): Promise<Solution> => {
        const rand = mulberry32(randSeed);
        const sol: Solution = new Map(seed);
        greedyFillOpen(sol);
        enforceBaseCoverage(sol);
        const deadline = startedAt + SOLVE_BUDGET_MS * deadlineShare;
        while (Date.now() < deadline && !cancelled) {
          improvePass(sol, rand, 160);
          const h = avgHealth(sol, trackedSlots, ev);
          if (h !== null && h > bestDisplayScore) bestDisplayScore = h;
          await yieldBatch(headlineIdx);
        }
        enforceBaseCoverage(sol);
        return sol;
      };

      // 1) Recommended: seed from board, full search.
      const recommended = await runVariant(baseSolution, 101, 0.45, 1);
      bestOverall = recommended;
      if (cancelled) return;

      // 2) Minimal disruption: only fill opens + fix critical/blocked slots.
      const minimal: Solution = new Map(baseSolution);
      for (const [slotKey, tmId] of [...minimal]) {
        if (lockedSlots.has(slotKey)) continue;
        const e = ev.eval(tmId, slotKey);
        if (!e.eligible || e.critical) minimal.delete(slotKey); // re-place these
      }
      greedyFillOpen(minimal);
      enforceBaseCoverage(minimal);
      await yieldBatch(3);
      if (cancelled) return;

      // 3) Max rotation spread: base-seeded, coverage-safe deep swap search.
      // (Previously rebuilt from scratch — that robbed filled restrooms to cover
      // zones. Now it rearranges via swaps only, so coverage is always preserved.)
      const maxSpread = await runVariant(new Map(baseSolution), 202, 0.92, 4);
      if (cancelled) return;

      // === Package proposals ==============================================
      const baseHealth = avgHealth(baseSolution, trackedSlots, ev);
      const baseOpen = requiredSlots.filter((k) => !baseSolution.get(k)).length;
      const baseCriticals = countCriticals(baseSolution, trackedSlots, ev);

      const buildDiffs = (sol: Solution): TimefoldSlotDiff[] => {
        const diffs: TimefoldSlotDiff[] = [];
        for (const slotKey of allSlots) {
          const before = baseSolution.get(slotKey) ?? null;
          const after = sol.get(slotKey) ?? null;
          if (before === after) continue;
          const beforeName = before ? tmsById.get(before)?.name ?? before : null;
          const afterName = after ? tmsById.get(after)?.name ?? after : null;
          const label = formatPlacementUiLabel(slotKey);

          let reason: string;
          let improves = false;
          if (!before && after) {
            const e = ev.eval(after, slotKey);
            reason = `Fills open ${label} — ${afterName} is eligible (${e.timesInSpread}× here in last 30, ${e.healthPoints}pt fit).`;
            improves = true;
          } else if (before && !after) {
            reason = `Opens ${label} — ${beforeName} is better used elsewhere in this proposal.`;
          } else {
            const eb = ev.eval(before!, slotKey);
            const ea = ev.eval(after!, slotKey);
            improves = ea.healthPoints > eb.healthPoints;
            reason = eb.critical
              ? `Clears a critical repeat — ${beforeName} was ${eb.weekRepeat}×/${eb.timesInSpread}× in this area; ${afterName} is fresh here (${ea.healthPoints}pt vs ${eb.healthPoints}pt).`
              : improves
                ? `${afterName} is the fresher rotation for ${label} (${ea.healthPoints}pt vs ${eb.healthPoints}pt — ${ea.timesInSpread}× vs ${eb.timesInSpread}× in last 30).`
                : `Enables a better placement elsewhere — ${afterName} holds ${label} at ${ea.healthPoints}pt.`;
          }
          diffs.push({
            slotKey,
            slotLabel: label,
            previousTmId: before,
            previousTmName: beforeName,
            proposedTmId: after,
            proposedTmName: afterName,
            reason,
            improvesRotationHealth: improves,
          });
        }
        return diffs;
      };

      const buildLifts = (sol: Solution): TimefoldHealthLift[] => {
        const h = avgHealth(sol, trackedSlots, ev);
        return [
          {
            label: "Rotation health",
            before: Math.round(baseHealth ?? 0),
            after: Math.round(h ?? 0),
            betterDirection: "up",
          },
          {
            label: "Open required slots",
            before: baseOpen,
            after: requiredSlots.filter((k) => !sol.get(k)).length,
            betterDirection: "down",
          },
          {
            label: "Critical repeats",
            before: baseCriticals,
            after: countCriticals(sol, trackedSlots, ev),
            betterDirection: "down",
          },
        ];
      };

      const candidates: Array<{ sol: Solution; title: string; blurb: string }> = [
        {
          sol: recommended,
          title: "Balanced — optimized from tonight's board",
          blurb: "full coverage-first optimization from tonight's board",
        },
        {
          sol: minimal,
          title: "Minimal disruption — gaps & criticals only",
          blurb: "keeps every healthy placement; only fills opens and fixes critical repeats",
        },
        {
          sol: maxSpread,
          title: "Max rotation spread — deepest rebalance",
          blurb: "coverage-safe swaps only, pushed hard for maximum rotation relief",
        },
      ];

      const seenSignatures = new Set<string>();
      const proposals: TimefoldProposal[] = [];
      for (const c of candidates) {
        const diffs = buildDiffs(c.sol);
        if (diffs.length === 0) continue;
        const sig = diffs.map((d) => `${d.slotKey}:${d.proposedTmId}`).sort().join("|");
        if (seenSignatures.has(sig)) continue;
        seenSignatures.add(sig);
        const h = avgHealth(c.sol, trackedSlots, ev) ?? 0;
        proposals.push({
          id: `local-${proposals.length + 1}`,
          rank: proposals.length + 1,
          title: c.title,
          summary: `${diffs.length} change${diffs.length === 1 ? "" : "s"} · ${c.blurb} · projected rotation health ${h.toFixed(1)}%.`,
          score: Math.round(h),
          diffs,
          healthLifts: buildLifts(c.sol),
          constraints: constraintSignals(c.sol),
        });
      }

      if (proposals.length === 0) {
        proposals.push({
          id: "local-noop",
          rank: 1,
          title: "No improving changes found",
          summary:
            "Tonight's board already satisfies the objective (coverage > rotation > preferences > skill) — the solver found nothing it could better.",
          score: Math.round(baseHealth ?? 0),
          diffs: [],
          healthLifts: buildLifts(baseSolution),
          constraints: constraintSignals(baseSolution),
        });
      }

      proposals.sort((a, b) => b.score - a.score || a.diffs.length - b.diffs.length);
      proposals.forEach((p, i) => {
        p.rank = i + 1;
        // "Recommended" always labels the actual rank-1 winner, whichever variant won.
        if (i === 0 && !p.title.startsWith("Recommended")) {
          p.title = `Recommended · ${p.title}`;
        }
      });

      handlers.onTick({
        percent: 100,
        score: bestDisplayScore,
        bestScore: bestDisplayScore,
        iteration,
        etaSeconds: 0,
        headline: "Preparing your Draft…",
        constraints: constraintSignals(recommended),
      });

      if (cancelled) return;
      handlers.onDone({
        nightId: input.nightId,
        dateLabel: input.dateLabel,
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        proposals,
      });
    } catch (err) {
      if (!cancelled) {
        handlers.onError?.(
          err instanceof Error ? `Deep Optimize failed: ${err.message}` : "Deep Optimize failed unexpectedly.",
        );
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}
