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
   * Policy: a TM should be placed in the same area at most 1× per week (max repeat = 1 is ideal).
   * Penalty starts at 2; 3+ is "real bad". Lower balance pulls the overall health % down via blend.
   * Undefined if no weekly data provided.
   */
  weeklyBalance?: number;
  /** Highest number of times any single TM was placed in one area this week (from zoneDates counts). */
  maxWeeklyRepeat?: number;
  /** Number of (tm, area) pairs with count > 1 this week (repeat violations of the max-1 policy). */
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

  // === Weekly rotation balance from real per-TM history (if provided) ===
  // Builds TM × area counts for the current grave week (or recent 7-night window).
  // Policy (operator): max repeat of 1 per TM per area per week is ideal/healthy.
  // Penalty starts at 2; 3+ counts as "real bad" (steeper balance drop).
  // This makes the overall health % drop when hand-review shows the same TM in one area
  // multiple times in a week (previously 91% could mask the problem).
  // Reuses ZoneDetailEntry / recentZoneHistory data already loaded for the board.
  // Board-driven (current assignments) to match the fit map model.
  let weeklyBalance: number | undefined;
  let maxWeeklyRepeat = 0;
  let repeatViolations = 0;
  const weeklyHist = (options as any)?.weeklyHistories as Record<string, ZoneDetailEntry> | undefined;
  const weeklyRecent = (options as any)?.weeklyRecentHistory as Map<string, Array<{nightDate: string; slotKey: string}>> | undefined;
  let hasWeeklyData = false;
  if (weeklyHist && Object.keys(weeklyHist).length > 0) {
    // zoneDates already week-bounded by caller (graveWeekRange / this-week report)
    for (const entry of Object.values(weeklyHist)) {
      for (const [zKey, dates] of Object.entries(entry.zoneDates || {})) {
        const count = dates.length;
        if (count > maxWeeklyRepeat) maxWeeklyRepeat = count;
        if (count > 1) repeatViolations++;
      }
    }
    hasWeeklyData = true;
  } else if (weeklyRecent && weeklyRecent.size > 0) {
    // Fallback: aggregate per-TM slot counts from the lighter recent history map.
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
    hasWeeklyData = true;
  }

  // Merge current board (tonight's assignments, or draft) into this week's repeat counts.
  // This is critical so that the *current placement* counts toward "times this week".
  // E.g. 1 prior in history + current assignment to same slot = effective 2 this week → penalty.
  if (hasWeeklyData && weeklyRecent && weeklyRecent.size > 0) {
    // Recompute using effective counts (history + current) for accurate max/viol this week.
    const effectiveTmSlotCounts: Record<string, Record<string, number>> = {};
    for (const [tmId, records] of weeklyRecent.entries()) {
      effectiveTmSlotCounts[tmId] = {};
      for (const rec of records) {
        const sk = rec.slotKey;
        effectiveTmSlotCounts[tmId][sk] = (effectiveTmSlotCounts[tmId][sk] || 0) + 1;
      }
    }
    // Add +1 for each current (or draft) placement. Init the tm entry if this is its first in the window.
    const currentToMerge = isDraftMode && draftAssignments && Object.keys(draftAssignments).length > 0
      ? draftAssignments
      : assignments;
    for (const [sk, row] of Object.entries(currentToMerge)) {
      const r = row as any;
      let tmId = r?.tmId;
      if (!tmId && isDraftMode) {
        // draft may have proposed
        tmId = r?.proposedTmId;
      }
      if (tmId) {
        if (!effectiveTmSlotCounts[tmId]) effectiveTmSlotCounts[tmId] = {};
        effectiveTmSlotCounts[tmId][sk] = (effectiveTmSlotCounts[tmId][sk] || 0) + 1;
      }
    }
    // Recompute max and violations from the *effective* (history + current) counts
    maxWeeklyRepeat = 0;
    repeatViolations = 0;
    for (const areas of Object.values(effectiveTmSlotCounts)) {
      for (const c of Object.values(areas)) {
        if (c > maxWeeklyRepeat) maxWeeklyRepeat = c;
        if (c > 1) repeatViolations++;
      }
    }
  }

  if (hasWeeklyData) {
    // Penalty model: 1 = perfect (100). Penalty at 2. Real bad (big drop) at 3+.
    // We penalize based on the worst single (TM, area) repeat count *this week including tonight*.
    let repeatPenalty = 0;
    if (maxWeeklyRepeat >= 3) {
      repeatPenalty = Math.min(60, 45 + (maxWeeklyRepeat - 3) * 10); // 3→45 (bal~55), 4→55 (bal~45), ...
    } else if (maxWeeklyRepeat === 2) {
      repeatPenalty = 20; // starts here → weekly balance 80
    }
    weeklyBalance = Math.max(40, 100 - repeatPenalty);
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

/** Pure helper: given the recent 7-night history map and a TM + target slot, return how many times
 * that exact slotKey appears for the TM in the window (this-week / recent repeats).
 * Does not include "tonight" — caller adds +1 when the current assignment is for this TM+slot.
 */
export function getTmThisWeekRepeatForSlot(
  weeklyRecentHistory: Map<string, Array<{ nightDate: string; slotKey: string }>> | undefined,
  tmId: string | null | undefined,
  targetSlotKey: string
): { count: number; dates: string[] } {
  if (!weeklyRecentHistory || !tmId) return { count: 0, dates: [] };
  const records = weeklyRecentHistory.get(tmId) || [];
  const matches = records.filter((r) => r.slotKey === targetSlotKey);
  return {
    count: matches.length,
    dates: matches.map((r) => r.nightDate).slice(-4), // recent few for display
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