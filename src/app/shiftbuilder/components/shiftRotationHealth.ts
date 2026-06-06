import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isOptionalDeploymentSlot } from "@/lib/shiftbuilder/placement";
import {
  collectDeploymentSlotKeys,
  shouldShowPlacementFitChip,
} from "./placementPadHelpers";
import {
  resolveSlotAssignmentRow,
  type DraftAssignmentRow,
  type SlotAssignmentRow,
} from "./placementFitForSlot";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";

/** Operator target for a healthy grave board before break. */
export const ROTATION_HEALTH_TARGET = 85;

const VERDICT_POINTS: Record<PlacementFitVerdict, number> = {
  strong_fit: 100,
  acceptable: 85,
  questionable: 55,
  needs_swap: 40,
  poor_fit: 0,
  open_gap: 0,
};

export type ShiftRotationHealth = {
  /** Rounded 0–100; null when no assigned swap-eligible slots to score. This is the "tonight" fit-quality component (average of per-slot verdicts). */
  percent: number | null;
  meetsTarget: boolean;
  scoredCount: number;
  openGaps: number;
  counts: {
    strong_fit: number;
    acceptable: number;
    questionable: number;
    needs_swap: number;
    poor_fit: number;
    open_gap: number;
  };
  /**
   * Real weekly balance (0-100) derived from this-week (grave Fri-Thu) or recent history for current TMs.
   * Lower when TMs repeat areas multiple times/week (max repeat, violations).
   * Undefined if no weeklyHistories provided (for backward compat during rollout).
   */
  weeklyBalance?: number;
  /** Highest number of times any single TM was placed in one area this week (from zoneDates counts). */
  maxWeeklyRepeat?: number;
  /** Number of (tm, area) pairs with count > 1 this week (repeat violations). */
  repeatViolations?: number;
};

export function computeShiftRotationHealth(
  auxDefs: AuxDef[],
  assignments: Record<string, SlotAssignmentRow>,
  fitBySlot: Record<string, PrerenderedPlacementFit>,
  options?: {
    isDraftMode?: boolean;
    draftAssignments?: Record<string, DraftAssignmentRow>;
    /** Recent 7-night history for computing real weekly balance (TM x area repeats). */
    weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
    /** Optional full ZoneDetailEntry per-TM for this-week (preferred for exact grave week). */
    weeklyHistories?: Record<string, any>;
  },
): ShiftRotationHealth {
  const isDraftMode = options?.isDraftMode ?? false;
  const draftAssignments = options?.draftAssignments ?? {};

  const counts = {
    strong_fit: 0,
    acceptable: 0,
    questionable: 0,
    needs_swap: 0,
    poor_fit: 0,
    open_gap: 0,
  };

  let openGaps = 0;
  const scores: number[] = [];

  for (const slotKey of collectDeploymentSlotKeys(auxDefs)) {
    if (!shouldShowPlacementFitChip(slotKey)) continue;

    const row = resolveSlotAssignmentRow(
      slotKey,
      assignments,
      isDraftMode,
      draftAssignments,
    );
    const assigned = !!(row?.tmName || row?.tmId);
    if (!assigned) {
      if (!isOptionalDeploymentSlot(slotKey)) openGaps += 1;
      continue;
    }

    const fit = fitBySlot[slotKey];
    if (!fit) continue;

    scores.push(VERDICT_POINTS[fit.fitVerdict] ?? 70);
    counts[fit.fitVerdict] += 1;
  }

  // === NEW: Weekly rotation balance from real per-TM history (if provided) ===
  // Loads/builds a TM × area matrix for the current grave week (or recent window) and
  // computes repeat-based balance. This is what makes the % drop when the same TM
  // is in the same area multiple times a week (the user's reported mismatch).
  // Reuses existing ZoneDetailEntry (from getZoneDetailReport("this-week") or getTmPlacementHistory
  // + date filter, or getRecentZoneHistory) and the same beforeIso / spread patterns used for fits.
  // Board-driven (only TMs on current assignments) to match usePlacementFitMap perf model.
  let weeklyBalance: number | undefined;
  let maxWeeklyRepeat = 0;
  let repeatViolations = 0;
  const weeklyHist = (options as any)?.weeklyHistories as Record<string, ZoneDetailEntry> | undefined;
  const weeklyRecent = (options as any)?.weeklyRecentHistory as Map<string, Array<{nightDate: string; slotKey: string}>> | undefined;
  if (weeklyHist && Object.keys(weeklyHist).length > 0) {
    // Build lightweight matrix: tmId -> uiKey (area) -> count this week
    // (zoneDates lists are pre-bounded to the week by the caller using graveWeekRange / this-week report)
    for (const entry of Object.values(weeklyHist)) {
      for (const [zKey, dates] of Object.entries(entry.zoneDates || {})) {
        const count = dates.length;
        if (count > maxWeeklyRepeat) maxWeeklyRepeat = count;
        if (count > 1) repeatViolations++;
      }
    }
    // Simple, interpretable balance: start at 100, penalize by max repeat.
    // 1x everywhere = 100 (healthy); 2x = ~80; 3x+ = lower (down to 50 floor).
    // This directly surfaces the "several TM ... multiple times a week" problem.
    // Can be blended with tonight percent below; future: variance/entropy of loads.
    const repeatPenalty = Math.min(50, Math.max(0, (maxWeeklyRepeat - 1) * 20));
    weeklyBalance = Math.max(50, 100 - repeatPenalty);
  } else if (weeklyRecent && weeklyRecent.size > 0) {
    // Fallback / lighter path: use recent 7-night history (already loaded in secondary data)
    // to approximate "this week" repeats. Aggregate counts per (tm, slot) from the lists.
    for (const [tmId, records] of weeklyRecent.entries()) {
      const counts: Record<string, number> = {};
      for (const rec of records) {
        counts[rec.slotKey] = (counts[rec.slotKey] || 0) + 1;
      }
      for (const count of Object.values(counts)) {
        if (count > maxWeeklyRepeat) maxWeeklyRepeat = count;
        if (count > 1) repeatViolations++;
      }
    }
    const repeatPenalty = Math.min(50, Math.max(0, (maxWeeklyRepeat - 1) * 20));
    weeklyBalance = Math.max(50, 100 - repeatPenalty);
  }

  if (scores.length === 0) {
    return {
      percent: null,
      meetsTarget: false,
      scoredCount: 0,
      openGaps,
      counts,
      // weekly fields may be populated from recent fallback even if no scored slots tonight
      weeklyBalance,
      maxWeeklyRepeat,
      repeatViolations,
    };
  }

  const percent = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );

  // Optional blend: when we have a real weeklyBalance, produce a blended value callers
  // can use for the main "percent" display or the "wk" label. This makes the headline
  // number drop when weekly repeats exist, while still reflecting tonight fit quality.
  // (UI will decide presentation; e.g. use weeklyBalance || percent for "Weekly".)
  // Weighted toward tonight fit (historical data is noisier) but repeat penalty is visible.
  let effectivePercentForDisplay = percent;
  if (weeklyBalance !== undefined) {
    effectivePercentForDisplay = Math.round(percent * 0.7 + weeklyBalance * 0.3);
  }

  return {
    percent: effectivePercentForDisplay,
    meetsTarget: effectivePercentForDisplay >= ROTATION_HEALTH_TARGET,
    scoredCount: scores.length,
    openGaps,
    counts,
    weeklyBalance,
    maxWeeklyRepeat,
    repeatViolations,
  };
}

export function rotationHealthFloaterColors(
  percent: number | null,
): { bg: string; border: string; text: string } {
  if (percent === null) {
    return {
      bg: "rgba(0,0,0,0.75)",
      border: "#3a3a3c",
      text: "#a1a1aa",
    };
  }
  if (percent >= ROTATION_HEALTH_TARGET) {
    return {
      bg: "rgba(22,163,74,0.75)",
      border: "rgba(34,197,94,0.35)",
      text: "#ecfdf5",
    };
  }
  if (percent >= 70) {
    return {
      bg: "rgba(180,83,9,0.75)",
      border: "rgba(251,191,36,0.35)",
      text: "#fffbeb",
    };
  }
  return {
    bg: "rgba(185,28,28,0.75)",
    border: "rgba(248,113,113,0.35)",
    text: "#fef2f2",
  };
}