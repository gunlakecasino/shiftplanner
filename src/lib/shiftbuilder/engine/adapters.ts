/**
 * engine/adapters.ts — integration bridges (P2-4 / P2-5 / P3-4 seam).
 *
 * The engine core is intentionally decoupled from the UI: it consumes a
 * `NightContext`/`WeekEngineInput`, not the client's ad-hoc state. These
 * adapters map the data the interactive board and batch planner already hold in
 * memory onto the engine entry points, so switching a surface to the unified
 * pipeline is a single call behind the `unified_pipeline` feature flag — no
 * duplicated context assembly (that duplication is exactly what P1-1 removed).
 *
 * Nothing here executes until a caller opts in; importing this module has no
 * side effects, so the live board is unaffected until the flag is flipped.
 */

import type {
  ZoneDetailEntry,
  TmZoneMatrixRow,
  TMPreferenceRow,
  TMPairAffinityRow,
  TMAccommodationRow,
} from "../data";
import type { EngineConfig, EligibilityRule } from "../engineConfig";
import type { AuxDef } from "../placement";
import { buildNightContext } from "./context";
import { runNightEngine, type RunNightEngineOptions } from "./index";
import { runWeekEngine, type WeekEngineInput, type RunWeekEngineOptions } from "./week";
import type { SlotRanking as LegacySlotRanking } from "../placement";
import type { SignalBreakdown } from "../scoring";
import type {
  NightContext,
  NightRunResult,
  ScoredCandidate,
  SlotAssignmentRow,
  WeekNightRecord,
  WeekRunResult,
} from "./types";

/** The exact bag the interactive engine handler / batch planner already builds. */
export interface ClientNightInputs {
  nightIso: string;
  config: EngineConfig;
  eligibilityRules?: EligibilityRule[];
  auxDefs: AuxDef[];
  /** Roster/member rows in whatever id/pool shape the client holds. */
  members: Array<Record<string, unknown>>;
  scheduledTmIds?: Set<string>;
  assignments: Record<string, SlotAssignmentRow>;
  histories: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  zoneMatrix?: Map<string, Map<string, TmZoneMatrixRow>>;
  skillScores?: Map<string, number>;
  slotDifficulty?: Map<string, number>;
  preferencesByTm?: Map<string, TMPreferenceRow[]>;
  pairAffinitiesByTm?: Map<string, TMPairAffinityRow[]>;
  accommodationsByTm?: Map<string, TMAccommodationRow[]>;
  knowledge?: import("../opsKnowledge/types").OpsKnowledge;
}

/** Build a NightContext from client-held inputs (shared by the runners). */
export function buildNightContextFromClient(inputs: ClientNightInputs): NightContext {
  return buildNightContext({
    nightIso: inputs.nightIso,
    config: inputs.config,
    eligibilityRules: inputs.eligibilityRules,
    auxDefs: inputs.auxDefs,
    members: inputs.members,
    scheduledTmIds: inputs.scheduledTmIds,
    assignments: inputs.assignments,
    histories: inputs.histories,
    weeklyRecentHistory: inputs.weeklyRecentHistory,
    zoneMatrix: inputs.zoneMatrix,
    skillScores: inputs.skillScores,
    slotDifficulty: inputs.slotDifficulty,
    preferencesByTm: inputs.preferencesByTm,
    pairAffinitiesByTm: inputs.pairAffinitiesByTm,
    accommodationsByTm: inputs.accommodationsByTm,
    knowledge: inputs.knowledge,
  });
}

/** Run the unified night engine from client-held inputs. */
export function runNightEngineFromClient(
  inputs: ClientNightInputs,
  opts?: RunNightEngineOptions,
): NightRunResult {
  return runNightEngine(buildNightContextFromClient(inputs), opts);
}

/** Run the engine and also return the context — needed to build the AI brief + guard. */
export function runNightEngineFromClientWithContext(
  inputs: ClientNightInputs,
  opts?: RunNightEngineOptions,
): { result: NightRunResult; ctx: NightContext } {
  const ctx = buildNightContextFromClient(inputs);
  return { result: runNightEngine(ctx, opts), ctx };
}

/** Run the unified week engine from per-night client inputs (Fri→Thu order). */
export function runWeekEngineFromClient(
  weekStartIso: string,
  nights: ClientNightInputs[],
  opts?: RunWeekEngineOptions,
): WeekRunResult {
  const input: WeekEngineInput = {
    weekStartIso,
    nights: nights.map((n) => ({
      nightIso: n.nightIso,
      config: n.config,
      eligibilityRules: n.eligibilityRules,
      auxDefs: n.auxDefs,
      members: n.members,
      scheduledTmIds: n.scheduledTmIds,
      assignments: n.assignments,
      histories: n.histories,
      weeklyRecentHistory: n.weeklyRecentHistory,
      zoneMatrix: n.zoneMatrix,
      skillScores: n.skillScores,
      slotDifficulty: n.slotDifficulty,
      preferencesByTm: n.preferencesByTm,
      pairAffinitiesByTm: n.pairAffinitiesByTm,
      accommodationsByTm: n.accommodationsByTm,
    })),
  };
  return runWeekEngine(input, opts);
}

// =====================================================================
// Draft-mode bridge — map a unified NightRunResult onto the exact shapes
// the existing Draft Mode consumes (applyPlannerResultAsDraft), so the board,
// Why? panel, and card provenance render with zero UI changes.
// =====================================================================

export interface LegacyDraftShapes {
  proposedAssignments: Record<string, string>;
  breakdown: Record<string, LegacySlotRanking>;
  reasoningBySlot: Record<string, { source: "engine" | "grok"; reason?: string }>;
}

/** Synthesize a minimal per-candidate signal breakdown so the Why? panel is rich. */
function synthCandidateBreakdown(c: ScoredCandidate): SignalBreakdown {
  return {
    rotation_health: {
      raw: Math.max(-1, Math.min(1, (c.healthPoints - 70) / 30)),
      weighted: c.healthPoints,
      note: c.isCritical ? "critical repeat" : `${Math.round(c.healthPoints)}pt rotation fit`,
    },
  };
}

export function nightResultToLegacyDraft(result: NightRunResult): LegacyDraftShapes {
  const proposedAssignments: Record<string, string> = {};
  const reasoningBySlot: LegacyDraftShapes["reasoningBySlot"] = {};

  for (const [slotKey, p] of Object.entries(result.draft)) {
    proposedAssignments[slotKey] = p.tmId;
    const relax = p.provenance.relaxations?.length
      ? ` · relaxed: ${p.provenance.relaxations.join(", ")}`
      : "";
    reasoningBySlot[slotKey] = {
      source: p.provenance.stage === "ai" ? "grok" : "engine",
      reason: `${p.provenance.reason}${relax}`,
    };
  }

  const breakdown: Record<string, LegacySlotRanking> = {};
  for (const [slotKey, ranking] of Object.entries(result.breakdown)) {
    breakdown[slotKey] = {
      preserved: ranking.preserved,
      pickedTmId: ranking.pickedTmId,
      topCandidates: ranking.topCandidates.map((c) => ({
        tmId: c.tmId,
        tmName: c.tmName,
        total: c.total,
        excluded: c.excluded,
        excludeReason: c.excludeReason,
        breakdown: synthCandidateBreakdown(c),
      })),
    };
  }

  return { proposedAssignments, breakdown, reasoningBySlot };
}

// =====================================================================
// Thought Process — structured reasoning for the visible engine panel.
// =====================================================================

export interface EngineThoughtStage {
  name: string;
  ms: number;
  coverage: number;
  health: number;
}

export interface EngineThoughtAi {
  provider: string;
  accepted: Array<{ slot: string; tmId: string; tmName: string; rationale: string }>;
  rejected: Array<{ slot: string; reason: string }>;
  notes?: string;
}

export interface EngineThoughtProcess {
  /** Tonight's date — tags feedback captured from this run's AI overrides. */
  nightIso: string;
  summary: string;
  feasibility: string;
  coverage: number;
  healthTotal: number;
  totalMs: number;
  stages: EngineThoughtStage[];
  relaxations: string[];
  overflowFilled: string[];
  rescues: Array<{ slot: string; tmName: string; reason: string; relaxations: string[] }>;
  criticals: Array<{ slot: string; tmName: string }>;
  unplaced: { count: number; names: string[] };
  ai?: EngineThoughtAi;
}

/** Build the structured reasoning object the Thought Process panel renders. */
export function nightResultToThoughtProcess(
  result: NightRunResult,
  nameById: (id: string) => string,
  ai?: EngineThoughtAi,
): EngineThoughtProcess {
  const rescues: EngineThoughtProcess["rescues"] = [];
  const criticals: EngineThoughtProcess["criticals"] = [];
  const overflowFilled: string[] = [];

  for (const [slot, p] of Object.entries(result.draft)) {
    if (p.provenance.relaxations?.length) {
      rescues.push({
        slot,
        tmName: p.tmName,
        reason: p.provenance.reason,
        relaxations: p.provenance.relaxations,
      });
    }
    if (p.provenance.scorecard.isCritical) criticals.push({ slot, tmName: p.tmName });
    if ((slot === "Z1" || slot === "Z2") && p.provenance.reason.startsWith("Overflow")) {
      overflowFilled.push(slot);
    }
  }

  const feasibility =
    result.telemetry.stages.flatMap((s) => s.notes).find((n) => n.startsWith("Feasibility")) ?? "";

  const unplacedNames = result.unassignedTmIds.map(nameById).filter(Boolean);

  const summaryParts = [`${result.scorecard.coverage} required slots covered`];
  if (overflowFilled.length) summaryParts.push(`+${overflowFilled.length} overflow (${overflowFilled.join(", ")})`);
  if (ai && ai.accepted.length) summaryParts.push(`${ai.accepted.length} AI refinement${ai.accepted.length === 1 ? "" : "s"}`);
  if (criticals.length) summaryParts.push(`${criticals.length} unavoidable rotation repeat${criticals.length === 1 ? "" : "s"}`);
  else summaryParts.push("no rotation repeats");
  if (unplacedNames.length) summaryParts.push(`${unplacedNames.length} available to float`);

  return {
    nightIso: result.nightIso,
    summary: summaryParts.join(" · "),
    ai,
    feasibility,
    coverage: result.scorecard.coverage,
    healthTotal: Math.round(result.scorecard.healthTotal),
    totalMs: Math.round(result.telemetry.totalMs),
    stages: result.telemetry.stages.map((s) => ({
      name: s.stage,
      ms: Math.round(s.ms),
      coverage: s.scorecard.coverage,
      health: Math.round(s.scorecard.healthTotal),
    })),
    relaxations: result.telemetry.relaxationsUsed,
    overflowFilled,
    rescues,
    criticals,
    unplaced: { count: unplacedNames.length, names: unplacedNames },
  };
}

/** Operator-facing one-liner summarizing the unified run (shown in Draft Mode). */
export function nightResultExplanation(result: NightRunResult): string {
  const feas = result.telemetry.stages
    .flatMap((s) => s.notes)
    .find((n) => n.startsWith("Feasibility"));
  const relax = result.telemetry.relaxationsUsed;
  const stageTimes = result.telemetry.stages
    .map((s) => `${s.stage} ${Math.round(s.ms)}ms`)
    .join(" → ");
  return [
    `Unified engine · ${result.scorecard.coverage} required slots covered · rotation Σ ${Math.round(result.scorecard.healthTotal)}pt`,
    relax.length ? `coverage rescues: ${relax.join(", ")}` : "no rotation relaxations needed",
    feas ?? "",
    stageTimes,
  ]
    .filter(Boolean)
    .join(" — ");
}
