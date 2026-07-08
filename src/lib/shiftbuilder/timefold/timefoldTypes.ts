/**
 * Types for "Deep Optimize with Timefold" (Phase 3 solver integration).
 *
 * As of 2026-07-01 the run is backed by timefoldLocalSolver.ts — a real
 * in-process local-search optimizer over the live board (eligibility, locks,
 * rotation health, week repeats, preferences). timefoldMock.ts remains only
 * as a UI-development fallback. A true Timefold service can later replace the
 * local solver behind this same tick/result contract — the hook/UI layer
 * should not need to change.
 *
 * Declared objective hierarchy (operator-ratified 2026-07-01):
 *   coverage > rotation > preferences > skill
 */

export type TimefoldRunPhase =
  | "idle"
  | "running"
  | "results"
  | "importing"
  | "imported"
  | "error";

export type TimefoldConstraintStatus = "satisfied" | "warning" | "broken";

export interface TimefoldConstraintSignal {
  id: string;
  label: string;
  status: TimefoldConstraintStatus;
  /** Short operator-facing note, e.g. "3 soft violations remaining". */
  detail?: string;
}

/** One tick of simulated solver progress, emitted while phase === "running". */
export interface TimefoldProgressTick {
  /** 0–100 */
  percent: number;
  /** Climbing score, higher is better — purely illustrative for the mock. */
  score: number;
  /** Best score seen so far this run. */
  bestScore: number;
  iteration: number;
  constraints: TimefoldConstraintSignal[];
  /** Seconds remaining, best-effort estimate. */
  etaSeconds: number;
  headline: string;
}

/** A single "was -> proposed" change against tonight's board. */
export interface TimefoldSlotDiff {
  slotKey: string;
  slotLabel: string;
  previousTmId: string | null;
  previousTmName: string | null;
  proposedTmId: string | null;
  proposedTmName: string | null;
  /** Why the solver made this specific change — shown in the per-change "Why?" sidebar. */
  reason: string;
  /** True when this diff resolves a rotation-health gap/critical repeat. */
  improvesRotationHealth: boolean;
}

export interface TimefoldHealthLift {
  label: string;
  before: number;
  after: number;
  /** Larger-is-better for this metric (health %, coverage %) vs smaller-is-better (open gaps, critical repeats). */
  betterDirection: "up" | "down";
}

export interface TimefoldProposal {
  id: string;
  /** Rank 1 = recommended/starred. */
  rank: number;
  title: string;
  summary: string;
  score: number;
  diffs: TimefoldSlotDiff[];
  healthLifts: TimefoldHealthLift[];
  constraints: TimefoldConstraintSignal[];
}

export interface TimefoldRunResult {
  nightId: string | null;
  dateLabel: string;
  durationSeconds: number;
  proposals: TimefoldProposal[];
}

export interface TimefoldRunInput {
  nightId: string | null;
  dateLabel: string;
  assignments: Record<
    string,
    { tmId?: string | null; tmName?: string | null; isLocked?: boolean | null }
  >;
  auxDefs: Array<{ key: string; label?: string; role?: string; locations?: string[] }>;
  roster: Array<{ id: string; name?: string; fullName?: string }>;

  // === Rich context for the in-process local solver ======================
  // All optional so the legacy mock path still typechecks; the local solver
  // errors out with a clear message when the pieces it needs are missing.
  /** Full member profiles (gender, gravePool, overlap flags) for eligibility. */
  members?: Array<Record<string, unknown>>;
  /** Tonight's ISO date (YYYY-MM-DD) — scopes history windows. */
  currentIso?: string;
  /** Grave-week plan entries per TM (week-repeat objective + prior windows). */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  /** TM ids scheduled tonight — the solver only places scheduled TMs. */
  scheduledTmIds?: Set<string>;
  /** Preference rows by TM (hard prefs act as constraints, soft as tier-3 objective). */
  preferencesByTm?: Map<string, Array<Record<string, unknown>>>;
  /** tmId → skill_score for the tier-4 objective. */
  skillScores?: Map<string, number>;
  /** slot_difficulty map (slot_difficulty table keys) for the tier-4 objective. */
  slotDifficulty?: Map<string, number>;
}
