/**
 * engine/health/model.ts — the ONE rotation-health scorer (P1-3, fixes F4).
 *
 * Canonical entry point for "how good is this TM on this slot tonight,
 * rotation-wise?" — returns continuous 0–100 points, an explicit criticality
 * flag (fixes F8), a verdict band, and the raw facts that drove the number.
 *
 * Every surface must funnel through this: fit chips, tracker %, orb, Assign-TM
 * picker, draft projections, the objective's rotation term, the optimizer's
 * pair evaluator, and the AI brief. Before unification these split into the
 * granular picker model (board surfaces) and the coarse verdict-band model
 * (projections + optimizer), so the same placement scored differently on
 * different screens.
 *
 * Implementation: this wraps the existing, tested granular picker
 * (`previewCandidateRotationFit`) rather than re-deriving the arithmetic — one
 * algorithm, one home. The static variant simply omits live-board context so
 * the optimizer's hot loop can score a pair without a full board.
 */

import type { ZoneDetailEntry } from "../../data";
import {
  previewCandidateRotationFit,
} from "../../rotationHealthEngineContext";
import { PRIOR_PLACEMENT_CRITICAL_WINDOW } from "@/lib/shiftbuilder/rotation/placementPadHelpers";
import type { SlotAssignmentRow as FitSlotAssignmentRow } from "@/lib/shiftbuilder/rotation/placementFitForSlot";
import type { AuxDef } from "../../placement";
import { verdictFromPoints } from "./verdict";
import type { PlacementFitVerdict, WeekNightRecord } from "../types";

export interface HealthFacts {
  timesInSpread: number;
  inLast5: boolean;
  last5Index: number;
  weekRepeat: number;
  weekNightsWorked: number;
  weekUniqueSlots: number;
  daysSinceInSlot: number | null;
  gapCount: number;
  topGaps: string[];
}

export interface HealthScore {
  points: number;
  isCritical: boolean;
  verdict: PlacementFitVerdict;
  facts: HealthFacts;
  /** Chip-ready one-liner. */
  summary: string;
}

export interface RotationHealthArgs {
  tmId: string;
  tmName: string;
  slotKey: string;
  nightIso: string;
  histories: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  members: Array<Record<string, unknown>>;
  auxDefs: AuxDef[];
  /**
   * Live board (or in-progress solution) for gap/swap-lane context. Omit for
   * the static variant — history-based terms (spread, last-5, week repeat,
   * recency) dominate; only the small gap/swap-lane term is affected.
   */
  assignments?: Record<string, FitSlotAssignmentRow>;
}

/**
 * Canonical rotation-health score for a hypothetical (tm → slot) placement.
 * The number and verdict here are what every surface must display.
 */
export function rotationHealthPoints(args: RotationHealthArgs): HealthScore {
  const preview = previewCandidateRotationFit({
    tmId: args.tmId,
    tmName: args.tmName,
    slotKey: args.slotKey,
    tonightIso: args.nightIso,
    assignments: args.assignments ?? {},
    auxDefs: args.auxDefs,
    histories: args.histories,
    weeklyRecentHistory: args.weeklyRecentHistory,
    members: args.members,
  });

  // Criticality is derived from the actual conditions, never from `points === 50`.
  // Prior-3 same-area repeat OR a 3×+ same-week repeat is a critical repeat.
  const priorThreeCritical =
    preview.last5Index >= 0 && preview.last5Index < PRIOR_PLACEMENT_CRITICAL_WINDOW;
  const isCritical = priorThreeCritical || preview.weekRepeat >= 3;

  return {
    points: preview.healthPoints,
    isCritical,
    verdict: verdictFromPoints(preview.healthPoints, isCritical),
    facts: {
      timesInSpread: preview.timesInSpread,
      inLast5: preview.inLast5,
      last5Index: preview.last5Index,
      weekRepeat: preview.weekRepeat,
      weekNightsWorked: preview.weekNightsWorked,
      weekUniqueSlots: preview.weekUniqueSlots,
      daysSinceInSlot: preview.daysSinceInSlot,
      gapCount: preview.gapCount,
      topGaps: preview.topGaps,
    },
    summary: preview.fitSummary,
  };
}

/**
 * Static variant for the optimizer's hot loop — no live board context.
 * Documented delta vs the full model: ≤ ±3pt (the gap/swap-lane term only).
 * Asserted in engine/__tests__/health.test.ts.
 */
export function rotationHealthPointsStatic(
  args: Omit<RotationHealthArgs, "assignments">,
): HealthScore {
  return rotationHealthPoints({ ...args, assignments: {} });
}
