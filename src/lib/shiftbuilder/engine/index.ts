/**
 * engine/index.ts — the unified run pipeline (P2-3).
 *
 * One entry point (`runNightEngine`) orchestrates the stages:
 *   1. CONTEXT     (built by the caller / context.ts)
 *   2. FEASIBILITY gender-aware reality check
 *   3. PLANNER     deterministic fill-order seed
 *   4. OPTIMIZER   local search from the seed
 *   5. AI          (Phase 4 — not yet wired; passthrough)
 *   6. GUARD       validateDraft; illegal slots fall back to the seed
 *   7. RESULT      draft + provenance + scorecard + per-stage telemetry
 *
 * The stage gate is the whole design: a stage's output is only adopted when its
 * scorecard is lexicographically ≥ the incumbent's (compareScorecards). That
 * single rule makes every component honor coverage > rotation > preferences >
 * skill (N1) without re-implementing the hierarchy.
 *
 * Public surface for callers is `runNightEngine`; the week engine composes it.
 */

import type {
  Draft,
  EngineMode,
  EngineRunTelemetryV2,
  NightContext,
  NightRunResult,
  PreservePolicy,
  Relaxation,
  Scorecard,
  SlotRanking,
  StageTelemetry,
} from "./types";
import { runPlanner } from "./planner";
import { runOptimizer } from "./optimizer";
import { validateDraft } from "./guard";
import { scorecardFor, compareScorecards } from "./objective";
import { feasibilityNote } from "./feasibility";

export interface RunNightEngineOptions {
  mode?: EngineMode;
  preserve?: PreservePolicy;
  seed?: number;
  optimizerMoveBudget?: number;
  optimizerRestarts?: number;
}

let runCounter = 0;

export function runNightEngine(
  ctx: NightContext,
  opts: RunNightEngineOptions = {},
): NightRunResult {
  const mode: EngineMode = opts.mode ?? "full";
  const preserve: PreservePolicy = opts.preserve ?? "locked-only";
  const seed = opts.seed ?? hashSeed(ctx.nightIso);
  const t0 = now();
  const stages: StageTelemetry[] = [];
  const relaxationsUsed: Relaxation[] = [];

  const stage = (name: string, ms: number, draft: Draft, notes: string[]) => {
    stages.push({ stage: name, ms, scorecard: scorecardFor(draft, ctx), notes });
  };

  // ── Stage 2: feasibility ───────────────────────────────────────────────────
  const feasNotes = [feasibilityNote(ctx)];

  // ── Stage 3: planner seed ──────────────────────────────────────────────────
  const p0 = now();
  const planner = runPlanner(ctx, { preserve });
  let incumbent: Draft = planner.draft;
  let breakdown: Record<string, SlotRanking> = planner.breakdown;
  collectRelaxations(incumbent, relaxationsUsed);
  stage("planner", now() - p0, incumbent, [...feasNotes, ...planner.notes]);

  // ── Stage 4: optimizer ─────────────────────────────────────────────────────
  if (mode !== "planner-only") {
    const o0 = now();
    const optimized = runOptimizer(ctx, incumbent, {
      seed,
      moveBudget: opts.optimizerMoveBudget,
      restarts: opts.optimizerRestarts,
    });
    // Adopt only if the optimizer's scorecard is ≥ the seed's (I3).
    const before = scorecardFor(incumbent, ctx);
    const after = scorecardFor(optimized.draft, ctx);
    const notes: string[] = [];
    if (compareScorecards(after, before) >= 0) {
      incumbent = optimized.draft;
      relaxationsUsed.length = 0;
      collectRelaxations(incumbent, relaxationsUsed);
    } else {
      notes.push("Optimizer output rejected — did not improve on the planner seed");
    }
    stage("optimizer", now() - o0, incumbent, notes);
  }

  // ── Stage 5: AI (Phase 4) — passthrough for now ────────────────────────────
  // Wired in P4-4. The stage gate + guard already make AI overrides safe.

  // ── Stage 6: guard ─────────────────────────────────────────────────────────
  const g0 = now();
  const validation = validateDraft(incumbent, ctx);
  if (!validation.ok) {
    // Fall back offending slots to the planner seed (which is guard-clean by
    // construction). Never fail a whole run for a single bad slot.
    for (const [slotKey, res] of Object.entries(validation.perSlot)) {
      if (!res.ok) {
        const seedPlacement = planner.draft[slotKey];
        if (seedPlacement) incumbent[slotKey] = seedPlacement;
        else delete incumbent[slotKey];
      }
    }
  }
  stage("guard", now() - g0, incumbent, validation.hardViolations);

  // ── Stage 7: result ────────────────────────────────────────────────────────
  const scorecard = scorecardFor(incumbent, ctx);
  const placedIds = new Set(Object.values(incumbent).map((p) => p.tmId));
  const unassignedTmIds = ctx.roster.filter((t) => !placedIds.has(t.id)).map((t) => t.id);

  const telemetry: EngineRunTelemetryV2 = {
    runId: `night-${++runCounter}-${seed}`,
    scope: "night",
    nightIso: ctx.nightIso,
    seed,
    mode,
    stages,
    relaxationsUsed: dedupeRelaxations(relaxationsUsed),
    totalMs: now() - t0,
  };

  return {
    scope: "night",
    nightIso: ctx.nightIso,
    draft: incumbent,
    scorecard,
    breakdown,
    unassignedTmIds,
    telemetry,
  };
}

function collectRelaxations(draft: Draft, into: Relaxation[]): void {
  for (const p of Object.values(draft)) {
    if (p.provenance.relaxations) into.push(...p.provenance.relaxations);
  }
}

function dedupeRelaxations(list: Relaxation[]): Relaxation[] {
  return Array.from(new Set(list));
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

export type { Scorecard };
