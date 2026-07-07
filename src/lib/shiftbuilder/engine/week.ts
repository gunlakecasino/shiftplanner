/**
 * engine/week.ts — "Optimize Week" engine (P3).
 *
 * Uses runNightEngine (no-ai) in rolling fashion (with in-run history) + cross-night polish.
 * Powers the "Optimize Week" / "Run Week" preview (read-only sheet + per-night draft open).
 *
 * Note: Single-night "Run Engine" / full optimize uses the same night pipeline.
 * The old separate "run engine" for night is now this unified path.
 */

import type {
  Draft,
  FairnessLedgerEntry,
  NightContext,
  Relaxation,
  WeekContext,
  WeekRepeatViolationLite,
  WeekRunResult,
  WeekScorecard,
  WeekNightRecord,
  EngineRunTelemetryV2,
  StageTelemetry,
  PreservePolicy,
} from "./types";
import { buildNightContext, type BuildNightContextInput } from "./context";
import { runNightEngine } from "./index";
import { projectDraftHealth } from "./health/projections";
import { weekPolicyScore } from "./health/weekPolicy";
import { prefScoreFor, skillScoreFor } from "./objective";
import { canPlace } from "./eligibility";
import { resolvedWeights } from "../engineConfig";
import { buildWeekRepeatData } from "@/app/shiftbuilder/components/shiftRotationHealth";
import { placementRepeatKey } from "@/app/shiftbuilder/components/placementPadHelpers";

export interface WeekEngineInput {
  weekStartIso: string;
  /** Per-night raw inputs, in grave-week order (Fri→Thu). */
  nights: BuildNightContextInput[];
}

export interface RunWeekEngineOptions {
  seed?: number;
  preserve?: PreservePolicy;
  optimizerMoveBudget?: number;
  optimizerRestarts?: number;
  /** Deterministic move budget for the cross-night polish. */
  polishMoveBudget?: number;
}

/** Build per-night contexts (no rolling injection) — for inspection / AI brief. */
export function buildWeekContext(input: WeekEngineInput): WeekContext {
  return {
    weekStartIso: input.weekStartIso,
    nights: input.nights.map((n) => buildNightContext(n)),
  };
}

// =====================================================================
// Rolling week history
// =====================================================================

/** Merge base week history with placements from nights already solved this run. */
function rollingHistory(
  base: Map<string, WeekNightRecord[]> | undefined,
  solved: Array<{ nightIso: string; draft: Draft }>,
): Map<string, WeekNightRecord[]> {
  const out = new Map<string, WeekNightRecord[]>();
  if (base) {
    for (const [tmId, recs] of base.entries()) out.set(tmId, [...recs]);
  }
  for (const { nightIso, draft } of solved) {
    for (const [slotKey, placement] of Object.entries(draft)) {
      const list = out.get(placement.tmId) ?? [];
      list.push({ nightDate: nightIso, slotKey });
      out.set(placement.tmId, list);
    }
  }
  return out;
}

/** All placements across the solved week as one weeklyRecentHistory map. */
function fullWeekHistory(nights: Record<string, Draft>): Map<string, WeekNightRecord[]> {
  const out = new Map<string, WeekNightRecord[]>();
  for (const [nightIso, draft] of Object.entries(nights)) {
    for (const [slotKey, p] of Object.entries(draft)) {
      const list = out.get(p.tmId) ?? [];
      list.push({ nightDate: nightIso, slotKey });
      out.set(p.tmId, list);
    }
  }
  return out;
}

// =====================================================================
// Week scorecard
// =====================================================================

interface NightHealthCache {
  /** nightIso -> mean granular health (or null when no tracked slots filled). */
  byNight: Map<string, number | null>;
}

function nightMeanHealth(draft: Draft, ctx: NightContext): number | null {
  return projectDraftHealth(draft, ctx).percent;
}

function computeWeekScorecard(
  nights: Record<string, Draft>,
  ctxByNight: Map<string, NightContext>,
  healthCache: NightHealthCache,
): WeekScorecard {
  let coverage = 0;
  let prefTotal = 0;
  let skillTotal = 0;
  const nightlyHealths: number[] = [];

  for (const [nightIso, draft] of Object.entries(nights)) {
    const ctx = ctxByNight.get(nightIso)!;
    for (const [slotKey, p] of Object.entries(draft)) {
      const slot = ctx.slotByKey.get(slotKey);
      if (!slot) continue;
      if (!slot.isOptional) coverage += 1;
      const tm = ctx.rosterById.get(p.tmId);
      if (tm) {
        prefTotal += prefScoreFor(tm, slotKey, ctx);
        skillTotal += skillScoreFor(tm, slotKey, ctx);
      }
    }
    const h = healthCache.byNight.get(nightIso) ?? nightMeanHealth(draft, ctx);
    healthCache.byNight.set(nightIso, h);
    if (h !== null) nightlyHealths.push(h);
  }

  const meanNightly =
    nightlyHealths.length > 0
      ? nightlyHealths.reduce((a, b) => a + b, 0) / nightlyHealths.length
      : 0;

  const policy = weekPolicyScore(fullWeekHistory(nights), meanNightly);

  // P5-1 (D3): weekly_load_balance + fatigue_index — now real, placement-
  // controllable signals folded into the week-health tier. Both are things the
  // cross-night polish can improve by choosing WHO holds the hard slots.
  const penalties = weekFairnessPenalties(nights, ctxByNight);
  const weekHealth = Math.max(0, Math.min(100, policy.percent - penalties.loadBalance - penalties.fatigue));

  return {
    coverage,
    weekHealth,
    prefTotal,
    skillTotal,
    maxWeeklyRepeat: policy.maxWeeklyRepeat,
    repeatViolations: policy.repeatViolations,
    hardViolations: [],
  };
}

// Tunables kept small so fairness never outweighs coverage or the repeat policy.
const LOAD_BALANCE_SCALE = 12;
const LOAD_BALANCE_CAP = 8;
const FATIGUE_SCALE = 1.5;
const FATIGUE_CAP = 8;
const HIGH_DIFFICULTY = 6;

/** True when `b` is the calendar day immediately after `a`. */
function isConsecutive(aIso: string, bIso: string): boolean {
  const a = new Date(`${aIso}T12:00:00`).getTime();
  const b = new Date(`${bIso}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000) === 1;
}

/**
 * weekly_load_balance — penalize uneven difficulty-weighted load across TMs
 * (one person carrying every hard zone all week). fatigue_index — penalize a TM
 * holding a high-difficulty slot on back-to-back nights. Both scaled by their
 * config weight and capped so they can only ever refine within the health tier.
 */
function weekFairnessPenalties(
  nights: Record<string, Draft>,
  ctxByNight: Map<string, NightContext>,
): { loadBalance: number; fatigue: number } {
  const anyCtx = ctxByNight.values().next().value;
  const weights = anyCtx ? resolvedWeights(anyCtx.config) : null;
  if (!weights) return { loadBalance: 0, fatigue: 0 };

  const loadByTm = new Map<string, number>();
  const nightsByTm = new Map<string, Array<{ iso: string; difficulty: number }>>();

  for (const [nightIso, draft] of Object.entries(nights)) {
    const ctx = ctxByNight.get(nightIso)!;
    for (const [slotKey, p] of Object.entries(draft)) {
      const diff = ctx.slotByKey.get(slotKey)?.difficulty ?? 0;
      loadByTm.set(p.tmId, (loadByTm.get(p.tmId) ?? 0) + diff);
      const arr = nightsByTm.get(p.tmId) ?? [];
      arr.push({ iso: nightIso, difficulty: diff });
      nightsByTm.set(p.tmId, arr);
    }
  }

  // Load balance: coefficient of variation of per-TM difficulty load (0 = even).
  let loadBalance = 0;
  const loads = [...loadByTm.values()];
  if (loads.length > 1) {
    const mean = loads.reduce((a, b) => a + b, 0) / loads.length;
    if (mean > 0) {
      const variance = loads.reduce((a, b) => a + (b - mean) ** 2, 0) / loads.length;
      const cv = Math.sqrt(variance) / mean;
      loadBalance = Math.min(LOAD_BALANCE_CAP, cv * LOAD_BALANCE_SCALE * weights.weekly_load_balance);
    }
  }

  // Fatigue: consecutive nights both on high-difficulty slots.
  let fatigueCount = 0;
  for (const arr of nightsByTm.values()) {
    const sorted = [...arr].sort((a, b) => a.iso.localeCompare(b.iso));
    for (let i = 1; i < sorted.length; i++) {
      if (
        isConsecutive(sorted[i - 1].iso, sorted[i].iso) &&
        sorted[i].difficulty >= HIGH_DIFFICULTY &&
        sorted[i - 1].difficulty >= HIGH_DIFFICULTY
      ) {
        fatigueCount += 1;
      }
    }
  }
  const fatigue = Math.min(FATIGUE_CAP, fatigueCount * FATIGUE_SCALE * weights.fatigue_index);

  return { loadBalance, fatigue };
}

/** Lexicographic week comparison: coverage > week-health > prefs > skill. */
function compareWeek(a: WeekScorecard, b: WeekScorecard): -1 | 0 | 1 {
  const dims: Array<keyof WeekScorecard> = ["coverage", "weekHealth", "prefTotal", "skillTotal"];
  for (const dim of dims) {
    const av = a[dim] as number;
    const bv = b[dim] as number;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

// =====================================================================
// Cross-night polish
// =====================================================================

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

/** Swap the TMs on two slots within one night, if both remain eligible. */
function trySwapWithinNight(
  draft: Draft,
  ctx: NightContext,
  slotA: string,
  slotB: string,
): boolean {
  const a = draft[slotA];
  const b = draft[slotB];
  if (!a || !b) return false;
  const slotAModel = ctx.slotByKey.get(slotA);
  const slotBModel = ctx.slotByKey.get(slotB);
  if (slotAModel?.isOptional || slotBModel?.isOptional) return false;
  // Locked slots never move.
  if (isLocked(ctx, slotA) || isLocked(ctx, slotB)) return false;
  const tmA = ctx.rosterById.get(a.tmId);
  const tmB = ctx.rosterById.get(b.tmId);
  if (!tmA || !tmB) return false;
  if (!canPlace(tmA, slotB, gateOpts(ctx)).ok) return false;
  if (!canPlace(tmB, slotA, gateOpts(ctx)).ok) return false;
  draft[slotA] = { ...b };
  draft[slotB] = { ...a };
  return true;
}

function isLocked(ctx: NightContext, slotKey: string): boolean {
  const row = ctx.assignments[slotKey];
  return !!(row && (row.isLocked || row.is_locked));
}

function gateOpts(ctx: NightContext) {
  return { eligibilityRules: ctx.eligibilityRules, scheduledTmIds: ctx.scheduledTmIds };
}

/**
 * Bounded, deterministic cross-night polish. Within-night swaps evaluated
 * against the WEEK scorecard so repeats spanning nights get untangled. Only the
 * mutated night is re-scored per move; the week policy is recomputed exactly
 * from the full week.
 */
function polishWeek(
  nights: Record<string, Draft>,
  ctxByNight: Map<string, NightContext>,
  seed: number,
  moveBudget: number,
): { relaxations: Relaxation[] } {
  const healthCache: NightHealthCache = { byNight: new Map() };
  let current = computeWeekScorecard(nights, ctxByNight, healthCache);
  const rand = mulberry32(seed);
  const nightKeys = Object.keys(nights);

  for (let m = 0; m < moveBudget; m++) {
    const nightIso = nightKeys[Math.floor(rand() * nightKeys.length)];
    const ctx = ctxByNight.get(nightIso)!;
    const draft = nights[nightIso];
    const trackedFilled = Object.keys(draft).filter(
      (k) => ctx.slotByKey.get(k)?.isRotationTracked && !isLocked(ctx, k),
    );
    if (trackedFilled.length < 2) continue;

    const slotA = trackedFilled[Math.floor(rand() * trackedFilled.length)];
    const slotB = trackedFilled[Math.floor(rand() * trackedFilled.length)];
    if (slotA === slotB) continue;

    const beforeA = draft[slotA];
    const beforeB = draft[slotB];
    if (!trySwapWithinNight(draft, ctx, slotA, slotB)) continue;

    healthCache.byNight.delete(nightIso); // this night changed
    const next = computeWeekScorecard(nights, ctxByNight, healthCache);
    if (compareWeek(next, current) > 0) {
      current = next;
    } else {
      // Revert.
      draft[slotA] = beforeA;
      draft[slotB] = beforeB;
      healthCache.byNight.delete(nightIso);
    }
  }

  return { relaxations: [] };
}

// =====================================================================
// Fairness ledger (P3-5)
// =====================================================================

function buildFairnessLedger(
  nights: Record<string, Draft>,
  ctxByNight: Map<string, NightContext>,
): FairnessLedgerEntry[] {
  const acc = new Map<
    string,
    {
      tmName: string;
      nights: Set<string>;
      areas: Set<string>;
      areaCounts: Map<string, number>;
      difficultyLoad: number;
      admin: number;
      rr: number;
    }
  >();

  for (const [nightIso, draft] of Object.entries(nights)) {
    const ctx = ctxByNight.get(nightIso)!;
    for (const [slotKey, p] of Object.entries(draft)) {
      const slot = ctx.slotByKey.get(slotKey);
      const e =
        acc.get(p.tmId) ??
        { tmName: p.tmName, nights: new Set<string>(), areas: new Set<string>(), areaCounts: new Map<string, number>(), difficultyLoad: 0, admin: 0, rr: 0 };
      e.nights.add(nightIso);
      const areaKey = placementRepeatKey(slotKey);
      e.areas.add(areaKey);
      // Only rotation-tracked areas count toward repeatCount — admin-every-night
      // is intentional (a soft Admin preference), not a fairness violation, and
      // is excluded from the week policy for the same reason.
      if (slot?.isRotationTracked) {
        e.areaCounts.set(areaKey, (e.areaCounts.get(areaKey) ?? 0) + 1);
      }
      if (slot?.difficulty != null) e.difficultyLoad += slot.difficulty;
      if (slotKey === "ADM") e.admin += 1;
      if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) e.rr += 1;
      acc.set(p.tmId, e);
    }
  }

  const out: FairnessLedgerEntry[] = [];
  for (const [tmId, e] of acc) {
    let repeatCount = 0;
    for (const c of e.areaCounts.values()) if (c > 1) repeatCount += c - 1;
    out.push({
      tmId,
      tmName: e.tmName,
      nightsWorked: e.nights.size,
      uniqueAreas: e.areas.size,
      repeatCount,
      difficultyLoad: e.difficultyLoad,
      adminShare: e.admin,
      rrShare: e.rr,
    });
  }
  out.sort((a, b) => b.repeatCount - a.repeatCount || b.difficultyLoad - a.difficultyLoad);
  return out;
}

function weekViolations(nights: Record<string, Draft>): WeekRepeatViolationLite[] {
  const data = buildWeekRepeatData(fullWeekHistory(nights));
  const nameById = new Map<string, string>();
  for (const draft of Object.values(nights)) {
    for (const p of Object.values(draft)) nameById.set(p.tmId, p.tmName);
  }
  return data.violList.map((v) => ({
    tmId: v.tmId,
    tmName: nameById.get(v.tmId) ?? v.tmId,
    slotKey: v.slotKey,
    count: v.count,
    nights: v.nights,
  }));
}

// =====================================================================
// Public entry
// =====================================================================

let weekRunCounter = 0;

export function runWeekEngine(
  input: WeekEngineInput,
  opts: RunWeekEngineOptions = {},
): WeekRunResult {
  const seed = opts.seed ?? hashSeed(input.weekStartIso);
  const preserve: PreservePolicy = opts.preserve ?? "all-existing";
  const polishMoveBudget = opts.polishMoveBudget ?? 300;
  const t0 = now();
  const stages: StageTelemetry[] = [];
  const relaxationsUsed: Relaxation[] = [];

  const nights: Record<string, Draft> = {};
  const ctxByNight = new Map<string, NightContext>();
  const solved: Array<{ nightIso: string; draft: Draft }> = [];

  // ── Stage: rolling sequential solve (Fri→Thu) ──────────────────────────────
  const r0 = now();
  for (const nightInput of input.nights) {
    const augmentedWeek = rollingHistory(nightInput.weeklyRecentHistory, solved);
    const ctx = buildNightContext({ ...nightInput, weeklyRecentHistory: augmentedWeek });
    ctxByNight.set(ctx.nightIso, ctx);

    const nightResult = runNightEngine(ctx, {
      mode: "no-ai",
      preserve,
      seed,
      optimizerMoveBudget: opts.optimizerMoveBudget,
      optimizerRestarts: opts.optimizerRestarts,
    });
    nights[ctx.nightIso] = nightResult.draft;
    solved.push({ nightIso: ctx.nightIso, draft: nightResult.draft });
    relaxationsUsed.push(...nightResult.telemetry.relaxationsUsed);
  }
  {
    const cache: NightHealthCache = { byNight: new Map() };
    const sc = computeWeekScorecard(nights, ctxByNight, cache);
    stages.push({
      stage: "rolling-solve",
      ms: now() - r0,
      scorecard: { coverage: sc.coverage, healthTotal: sc.weekHealth, prefTotal: sc.prefTotal, skillTotal: sc.skillTotal, hardViolations: [] },
      notes: [`week repeats: ${sc.repeatViolations}, max ${sc.maxWeeklyRepeat}`],
    });
  }

  // ── Stage: cross-night polish ──────────────────────────────────────────────
  const p0 = now();
  polishWeek(nights, ctxByNight, seed, polishMoveBudget);
  const polishCache: NightHealthCache = { byNight: new Map() };
  const weekScorecard = computeWeekScorecard(nights, ctxByNight, polishCache);
  stages.push({
    stage: "cross-night-polish",
    ms: now() - p0,
    scorecard: { coverage: weekScorecard.coverage, healthTotal: weekScorecard.weekHealth, prefTotal: weekScorecard.prefTotal, skillTotal: weekScorecard.skillTotal, hardViolations: [] },
    notes: [`week repeats: ${weekScorecard.repeatViolations}, max ${weekScorecard.maxWeeklyRepeat}`],
  });

  const fairnessLedger = buildFairnessLedger(nights, ctxByNight);
  const violations = weekViolations(nights);

  const telemetry: EngineRunTelemetryV2 = {
    runId: `week-${++weekRunCounter}-${seed}`,
    scope: "week",
    weekStartIso: input.weekStartIso,
    seed,
    mode: "no-ai",
    stages,
    relaxationsUsed: Array.from(new Set(relaxationsUsed)),
    totalMs: now() - t0,
  };

  return {
    scope: "week",
    weekStartIso: input.weekStartIso,
    nights,
    weekScorecard,
    fairnessLedger,
    violations,
    telemetry,
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const now = (): number =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

// Re-export for the week test suite + callers.
export { compareWeek, weekFairnessPenalties };
export type { WeekScorecard };
