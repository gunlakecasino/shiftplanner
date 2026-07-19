/**
 * Unified Placement Intelligence System — core types.
 *
 * One vocabulary shared by every stage (planner, optimizer, AI, guard) and both
 * scopes (night, week). See docs/UNIFIED_ENGINE_PLAN.md §3.
 *
 * Design rule: a `Draft` (slot → placement with provenance) plus a `Scorecard`
 * is the single artifact every stage emits and consumes. A stage may only
 * replace the incumbent draft with one whose scorecard is lexicographically ≥
 * on (coverage, health, prefs, skill). That rule mechanically enforces the
 * ratified hierarchy `coverage > rotation > preferences > skill` across all
 * four components (principle N1).
 */

import type { ZoneDetailEntry, TmZoneMatrixRow, TMPreferenceRow, TMPairAffinityRow, TMAccommodationRow } from "../data";
import type { EngineConfig, EligibilityRule } from "../engineConfig";
import type { AuxDef } from "../placement";
import type { PlacementFitVerdict } from "../placementPadInsightSchema";

/** One grave-week history record (a TM on a slot on a night). */
export type WeekNightRecord = { nightDate: string; slotKey: string };

// =====================================================================
// Board model — normalized once by the context loader (P1-1)
// =====================================================================

/**
 * Canonical TM shape for the engine. The loader collapses the historical
 * id/tmId/tm_id and gravePool/grave_pool duality here so no downstream module
 * has to guess. `id` is always the board id (slug preferred — matches
 * zone_assignments + assignmentTmId).
 */
export interface TmModel {
  id: string;
  name: string;
  gender: "M" | "F" | "";
  gravePool: string | null;
  isAMOverlap: boolean;
  isPMOverlap: boolean;
  isFullGrave: boolean;
  /** Explicit Admin certification from tm_profiles.admin_training_status. */
  adminTrainingStatus: "trained" | "not_trained" | "expired" | "unknown";
  /** True when this TM is on tonight's graves_default_schedule (+ on-call). */
  scheduled: boolean;
  /**
   * Weeks the TM has held the grave role, for operator `min_weeks` rules.
   * `undefined` means UNKNOWN, never zero — there is no hire-date column on
   * `tm_profiles` today, so this is only populated when the roster row actually
   * carries one of the recognized fields (see `eligibility.weeksInRoleFromMemberRow`).
   */
  weeksInRole?: number;
}

/** One deployment slot with everything a stage needs to reason about it. */
export interface SlotModel {
  key: string;
  /** Coverage tier index (0 = restrooms, 1 = admin+zones, …). */
  tier: number;
  /** slot_difficulty value (0–10) when known. */
  difficulty: number | null;
  /** Z1/Z2 — engine never auto-fills; operator staffs manually. */
  isOptional: boolean;
  /** Restrooms/zones/aux carry rotation health; admin/overlap do not. */
  isRotationTracked: boolean;
  /** Hard-coverage tier (engine fights hardest to clear these). */
  isHardCoverage: boolean;
}

/** Live board assignment row (mirrors placementFitForSlot.SlotAssignmentRow). */
export interface SlotAssignmentRow {
  tmId?: string;
  tmName?: string;
  isLocked?: boolean;
  is_locked?: boolean;
  provenance?: {
    rationale?: string;
    fairnessSignals?: Record<string, number | string>;
  };
}

// =====================================================================
// Context — one loader, one shape (P1-1)
// =====================================================================

export interface NightContext {
  nightIso: string;
  config: EngineConfig;
  /** Operator eligibility rules (from engine_eligibility_rules). Empty = none. */
  eligibilityRules: EligibilityRule[];
  auxDefs: AuxDef[];
  slots: SlotModel[];
  slotByKey: Map<string, SlotModel>;
  roster: TmModel[];
  rosterById: Map<string, TmModel>;
  /** When non-empty, only these TMs may be placed (schedule gate). */
  scheduledTmIds: Set<string>;
  /** Live board (locks + provenance) at run start. */
  assignments: Record<string, SlotAssignmentRow>;
  /** 30-night spread history per TM id. */
  histories: Record<string, ZoneDetailEntry | null>;
  /** Grave-week history per TM id — ALWAYS pre-scoped to nights < nightIso. */
  weeklyRecentHistory: Map<string, WeekNightRecord[]>;
  zoneMatrix: Map<string, Map<string, TmZoneMatrixRow>>;
  skillScores: Map<string, number>;
  slotDifficulty: Map<string, number>;
  preferencesByTm: Map<string, TMPreferenceRow[]>;
  pairAffinitiesByTm: Map<string, TMPairAffinityRow[]>;
  accommodationsByTm: Map<string, TMAccommodationRow[]>;
  adjacency: Map<string, string[]>;
  /** Raw member rows (for memberToPlacementProfile-style lookups in health). */
  members: Array<Record<string, unknown>>;
  /** Supervisor Brain knowledge (dossiers, accommodations, policies, chemistry). */
  knowledge?: import("../opsKnowledge/types").OpsKnowledge;
}

export interface WeekContext {
  weekStartIso: string;
  /** Fri→Thu, ordered. Share immutable refs; per-night rosters/locks differ. */
  nights: NightContext[];
}

// =====================================================================
// Draft artifact + provenance (N6)
// =====================================================================

export type PlacementStage = "preserved" | "manual" | "planner" | "optimizer" | "ai";

/** Relaxation rungs the rescue ladder may descend (D1/D7). */
export type Relaxation = "rotation-prior3" | "rr-side-family" | "hard-avoid";

export interface SlotScorecard {
  eligible: boolean;
  healthPoints: number;
  isCritical: boolean;
  prefScore: number;
  skillScore: number;
}

export interface Provenance {
  stage: PlacementStage;
  reason: string;
  scorecard: SlotScorecard;
  aiRationale?: string;
  relaxations?: Relaxation[];
}

export interface SlotPlacement {
  tmId: string;
  tmName: string;
  provenance: Provenance;
}

/** slotKey → placement. Absent key = open slot. */
export type Draft = Record<string, SlotPlacement>;

// =====================================================================
// Objective (P1-4, N1)
// =====================================================================

export interface Scorecard {
  /** Count of filled required (non-optional) slots. */
  coverage: number;
  /** Σ per-slot health points over rotation-tracked filled slots. */
  healthTotal: number;
  /** Σ preference score. */
  prefTotal: number;
  /** Σ skill score. */
  skillTotal: number;
  /** Non-empty ⇒ draft is invalid (hard rule broken). Blocks all comparisons. */
  hardViolations: string[];
}

// =====================================================================
// Run request / result (P2-3)
// =====================================================================

export type EngineScope = "night" | "week";
export type EngineMode = "full" | "planner-only" | "optimizer-only" | "no-ai";
export type PreservePolicy = "locked-only" | "all-existing";

export interface StageTelemetry {
  stage: string;
  ms: number;
  scorecard: Scorecard;
  notes: string[];
}

export interface EngineRunTelemetryV2 {
  runId: string;
  scope: EngineScope;
  nightIso?: string;
  weekStartIso?: string;
  seed: number;
  mode: EngineMode;
  stages: StageTelemetry[];
  relaxationsUsed: Relaxation[];
  totalMs: number;
}

export interface NightRunResult {
  scope: "night";
  nightIso: string;
  draft: Draft;
  scorecard: Scorecard;
  /** Per-slot Top-K ranking for the Why? panel (planner-emitted). */
  breakdown: Record<string, SlotRanking>;
  unassignedTmIds: string[];
  telemetry: EngineRunTelemetryV2;
}

export interface WeekRunResult {
  scope: "week";
  weekStartIso: string;
  nights: Record<string, Draft>;
  weekScorecard: WeekScorecard;
  fairnessLedger: FairnessLedgerEntry[];
  violations: WeekRepeatViolationLite[];
  telemetry: EngineRunTelemetryV2;
}

// =====================================================================
// Planner breakdown (Why? panel — Top-K, mirrors CoveragePlannerResult)
// =====================================================================

export interface ScoredCandidate {
  tmId: string;
  tmName: string;
  total: number;
  excluded: boolean;
  excludeReason?: string;
  healthPoints: number;
  isCritical: boolean;
}

export interface SlotRanking {
  topCandidates: ScoredCandidate[];
  pickedTmId: string | null;
  preserved: boolean;
}

// =====================================================================
// Week fairness (P3-3/P3-5)
// =====================================================================

export interface WeekScorecard {
  /** Σ nightly coverage. */
  coverage: number;
  /** Mean granular nightly health minus week-policy penalty. */
  weekHealth: number;
  prefTotal: number;
  skillTotal: number;
  maxWeeklyRepeat: number;
  repeatViolations: number;
  hardViolations: string[];
}

export interface FairnessLedgerEntry {
  tmId: string;
  tmName: string;
  nightsWorked: number;
  uniqueAreas: number;
  repeatCount: number;
  /** Σ slot difficulty across the week (workload). */
  difficultyLoad: number;
  adminShare: number;
  rrShare: number;
}

export interface WeekRepeatViolationLite {
  tmId: string;
  tmName: string;
  slotKey: string;
  count: number;
  nights: string[];
}

export type { PlacementFitVerdict };
