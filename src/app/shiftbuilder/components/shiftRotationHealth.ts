import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isOptionalDeploymentSlot } from "@/lib/shiftbuilder/placement";
import { ZONE_DEFS, RR_DEFS } from "@/lib/shiftbuilder/constants";
import {
  collectDeploymentSlotKeys,
  placementRepeatKey,
  placementRepeatKeysMatch,
  shouldShowPlacementFitChip,
} from "./placementPadHelpers";
import {
  resolveSlotAssignmentRow,
  type DraftAssignmentRow,
  type SlotAssignmentRow,
} from "./placementFitForSlot";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import { signalNumber } from "./placementFitScore";

/** Operator target for a healthy grave board before break. */
export const ROTATION_HEALTH_TARGET = 85;

/** Amber band floor — below target, above this is warning (not green). */
export const ROTATION_HEALTH_AMBER_MIN = 70;

// === Week repeat-policy tuning (was inline magic numbers) =====================
/** Base week score when no per-day daily healths are available. */
export const WEEK_POLICY_FALLBACK_BASE = 92;
/** Penalty when the worst TM×area repeat this week is exactly 2. */
export const WEEK_POLICY_REPEAT2_PENALTY = 12;
/** Penalty at 3 repeats; each repeat beyond 3 adds WEEK_POLICY_REPEAT_STEP more. */
export const WEEK_POLICY_REPEAT3_PENALTY = 35;
export const WEEK_POLICY_REPEAT_STEP = 9;
/** Cap for the max-repeat penalty component. */
export const WEEK_POLICY_REPEAT_PENALTY_CAP = 55;
/** Per-violation drag (×2 each) capped here — spreads scores in the 70–95 band. */
export const WEEK_POLICY_VIOLATION_PENALTY_CAP = 14;
/** Week score never drops below this floor. */
export const WEEK_POLICY_FLOOR = 40;
/** Max total points xAI coverage justification can forgive per (tm, area) violator. */
export const WEEK_POLICY_XAI_FORGIVENESS_CAP = 15;

export type RotationHealthTier = "unknown" | "red" | "amber" | "green";

/** Round to one decimal — matches granular picker / tracker precision. */
export function roundRotationHealthValue(percent: number): number {
  return Math.round(percent * 10) / 10;
}

/** One-decimal % shown to operators; also drives color tiers. */
export function normalizeRotationHealthPercent(
  percent: number | null | undefined,
): number | null {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return null;
  }
  return roundRotationHealthValue(percent);
}

/** Display helper for tracker, orb, and nav surfaces. */
export function formatRotationHealthPercent(
  percent: number | null | undefined,
): string {
  const n = normalizeRotationHealthPercent(percent);
  return n === null ? "—%" : `${n.toFixed(1)}%`;
}

/** Mean of per-slot granular health points (picker-aligned). */
export function averageGranularHealthScores(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return roundRotationHealthValue(avg);
}

export function rotationHealthTier(
  percent: number | null | undefined,
): RotationHealthTier {
  const n = normalizeRotationHealthPercent(percent);
  if (n === null) return "unknown";
  if (n >= ROTATION_HEALTH_TARGET) return "green";
  if (n >= ROTATION_HEALTH_AMBER_MIN) return "amber";
  return "red";
}

export function rotationHealthTextColor(
  percent: number | null | undefined,
): string {
  switch (rotationHealthTier(percent)) {
    case "green":
      return "#15803d";
    case "amber":
      return "#b45309";
    case "red":
      return "#b91c1c";
    default:
      return "#9ca3af";
  }
}

export function rotationHealthIconColor(
  percent: number | null | undefined,
): string | undefined {
  switch (rotationHealthTier(percent)) {
    case "green":
      return "#16a34a";
    case "amber":
      return "#d97706";
    case "red":
      return "#dc2626";
    default:
      return undefined;
  }
}

/** Grave schedule week label (Fri → Thu). */
export const GRAVE_WEEK_LABEL = "Fri–Thu";

/**
 * Pure arithmetic mean of per-day health % for built days in the grave week.
 * This is the small "wk avg" number in the rotation health cluster (not repeat-penalty adjusted).
 */
export function computeWeekAverageHealth(
  weekDailyHealths?: Record<string, number>,
  /** Grave week day ISO keys in order (Fri→Thu). Averages only built days present in the map. */
  orderedDateKeys?: string[],
): number | null {
  if (!weekDailyHealths) return null;
  const vals = orderedDateKeys
    ? orderedDateKeys
        .map((k) => weekDailyHealths[k])
        .filter((v): v is number => typeof v === "number")
    : Object.values(weekDailyHealths).filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return roundRotationHealthValue(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Fallback bucket points when granular healthPoints are unavailable. */
export const VERDICT_POINTS: Record<PlacementFitVerdict, number> = {
  strong_fit: 95,
  acceptable: 84,
  questionable: 62,
  critical_repeat: 50,
  needs_swap: 45,
  poor_fit: 0,
  open_gap: 0,
};

export type WeekNightRecord = { nightDate: string; slotKey: string };

/** Grave-week history through a viewed night only (no forward-looking repeats). */
export function filterWeeklyHistoryThroughNight(
  weeklyRecentHistory: Map<string, WeekNightRecord[]> | undefined,
  throughIso: string,
): Map<string, WeekNightRecord[]> | undefined {
  if (!weeklyRecentHistory) return undefined;
  const out = new Map<string, WeekNightRecord[]>();
  for (const [tmId, records] of weeklyRecentHistory.entries()) {
    const filtered = records.filter((r) => r.nightDate <= throughIso);
    if (filtered.length > 0) out.set(tmId, filtered);
  }
  return out;
}

/**
 * Times a TM appears in slotKey's *repeat area* in the grave week through throughIso
 * (inclusive). Area-merged via placementRepeatKey so MRR8/WRR8 count as the same
 * restroom — aligned with the engine's prior-3 hard gate, which always merged them.
 * (Previously exact-key: a TM alternating MRR8/WRR8 all week showed zero repeats
 * here while the engine hard-blocked them nightly.)
 * Does not double-count tonight when the night is already in the history map.
 */
export function getTmWeekRepeatForSlotThroughNight(
  weeklyRecentHistory: Map<string, WeekNightRecord[]> | undefined,
  tmId: string | null | undefined,
  slotKey: string,
  throughIso: string,
  /** Add 1 when assigned tonight but not yet mirrored into weeklyRecentHistory. */
  countTonightIfAssigned = false,
): number {
  if (!weeklyRecentHistory || !tmId) return countTonightIfAssigned ? 1 : 0;
  const records = weeklyRecentHistory.get(tmId) || [];
  const matches = records.filter(
    (r) => placementRepeatKeysMatch(r.slotKey, slotKey) && r.nightDate <= throughIso,
  );
  let count = matches.length;
  if (countTonightIfAssigned && !matches.some((r) => r.nightDate === throughIso)) {
    count += 1;
  }
  return count;
}

/** Resolve slot health contribution — prefers continuous healthPoints from fit scoring. */
export function slotHealthPoints(fit: PrerenderedPlacementFit): number {
  if (typeof fit.healthPoints === "number") return fit.healthPoints;
  return VERDICT_POINTS[fit.fitVerdict] ?? 70;
}

export type ShiftRotationHealth = {
  /** Raw daily health for the selected/viewed day (avg of per-slot verdicts). Matches tracker pills. */
  dailyPercent: number | null;
  /** Legacy blend: 0.7 × dailyPercent + 0.3 × weekPolicyPercent when week data exists. */
  percent: number | null;
  /** Week repeat-policy score (max-1-per-area); separate from nightly fit average. */
  weekPolicyPercent?: number;
  meetsTarget: boolean;
  scoredCount: number;
  openGaps: number;
  counts: {
    strong_fit: number;
    acceptable: number;
    questionable: number;
    critical_repeat: number;
    needs_swap: number;
    poor_fit: number;
    open_gap: number;
  };
  /**
   * Stable week average health (0-100) for the entire grave week.
   * This value is computed in a day-independent way from the full week repeat data.
   * It should be the same number no matter which day of the week is currently selected.
   * It represents the average health percentage of the week as a whole.
   * Policy: max 1 per TM per area per week is ideal (repeats pull the number down).
   * The raw maxWeeklyRepeat, repeatViolations, and violations[] list are the diagnostics for *why* it is not higher.
   * Undefined if no weekly data provided.
   */
  /** @deprecated Use weekPolicyPercent — same value, clearer name. */
  weeklyBalance?: number;
  /** Highest number of times any single TM was placed in one area this week (from zoneDates counts). */
  maxWeeklyRepeat?: number;
  /** Number of (tm, area) pairs with count > 1 this week (repeat violations of the max-1 policy). */
  repeatViolations?: number;
  /** Total penalty points reduced by xAI fairnessSignals on the current placements that contributed to week repeats.
   *  E.g. if xAI gave high "coverage" signal for a must-cover placement despite history, the repeat penalty for health is lowered.
   *  This is how xAI "works into" the rotation health calculation (using existing provenance data from engine placements).
   */
  xaiRepeatPenaltyReduction?: number;
  /**
   * Actionable list of repeat violations for the week (from full committed week data, independent of viewed day).
   * Each entry is a (TM, slot) that appears >1 time in the week plan; used by health UI, advisor, xAI week scan,
   * PlacementPad, and RotationHealth surfaces to list "what is hurting the wk % and what to move".
   */
  violations?: WeekRepeatViolation[];
};

/** A single (TM + slot/area) that is repeated >1 time in the current grave week's plan.
 *  count = total occurrences across the days that have data (full week as built so far).
 *  Used to drive "what could be moved where" suggestions + to explain why weeklyBalance < 100.
 */
export type WeekRepeatViolation = {
  tmId: string;
  slotKey: string;
  count: number;
  /** ISO dates (YYYY-MM-DD) for the nights this TM was on this slotKey in the week window. */
  nights: string[];
  /** 2 = starts the penalty, 3+ steeper. Mirrors the penalty tiers in compute. */
  severity: number;
  /** Whether this violation had xAI fairnessSignals (coverage justification) on at least one of its placements. */
  hasXaiSignal?: boolean;
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
    /**
     * Optional per-day daily health percentages (raw from fit verdicts), for insight and per-day
     * displays. The main week average numeric is computed independently from week repeat data for
     * stability (does not alter with selected day).
     */
    weekDailyHealths?: Record<string, number>;
  },
): ShiftRotationHealth {
  const isDraftMode = options?.isDraftMode ?? false;
  const draftAssignments = options?.draftAssignments ?? {};

  const counts = {
    strong_fit: 0,
    acceptable: 0,
    questionable: 0,
    critical_repeat: 0,
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
      // Open gaps are informational only — never penalize unfilled slots in the %.
      if (!isOptionalDeploymentSlot(slotKey)) openGaps += 1;
      continue;
    }

    const fit = fitBySlot[slotKey];
    if (!fit) continue;
    if (fit.healthPending) continue; // placeholder verdict while history loads — don't score it

    scores.push(slotHealthPoints(fit));
    counts[fit.fitVerdict] += 1;
  }

  // Daily health for the *currently selected/viewed day only*.
  // This is the average of the detailed prerender fit verdicts (strong_fit=100, acceptable=85, etc.)
  // for the assigned relevant slots on this specific day. It legitimately varies by the day you are looking at.
  const percent = scores.length > 0
    ? roundRotationHealthValue(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  // === Weekly rotation health (the stable "week average") ===
  // Per user direction: this must be a *consistent* value for the whole week — the average health percentage of that week.
  // It must not change when you switch the selected day / column.
  //
  // It is computed in a day-independent way (see the calculation inside the weeklyRecent block below).
  // It uses only the full-week repeat data (from weeklyRecentHistory) + a representative base.
  //
  // The per-day `percent` (above) is still used for today-specific displays, the blend, and per-day analysis.
  // The 0.7 daily + 0.3 week blend will still move with the day you're viewing, while the dedicated "week" number stays fixed.
  //
  // Source data: the full committed week (plannedThisWeekRecentHistory / weeklyRecentHistory) so the week average
  // is stable regardless of selected day.
  // xAI fairnessSignals on violating placements can still reduce the penalty.
  let weeklyBalance: number | undefined;
  let maxWeeklyRepeat = 0;
  let repeatViolations = 0;
  let xaiRepeatPenaltyReduction = 0;
  let violations: WeekRepeatViolation[] | undefined;
  // F6 (2026-07-02): the old `weeklyHistories` branch was removed. It computed
  // maxWeeklyRepeat/repeatViolations by *exact* slot key (so MRR8/WRR8
  // alternation read as zero repeats), never computed weekPolicyPercent, and
  // had no live callers. All week-repeat math now flows through the single
  // area-merged builder (buildWeekRepeatData) via the recent-map path below.
  const weeklyRecent = (options as any)?.weeklyRecentHistory as Map<string, Array<{nightDate: string; slotKey: string}>> | undefined;
  let hasWeeklyData = false;

  if (weeklyRecent && weeklyRecent.size > 0) {
    hasWeeklyData = true;

    // Use the shared pure builder — eliminates duplication with getWeekRepeatViolations
    // and any other callers (advisor, overview, etc.). This is the core Speed improvement.
    const weekData = buildWeekRepeatData(weeklyRecent);
    const { tmSlotCounts, tmSlotNights, violList, maxWeeklyRepeat: computedMax, repeatViolations: computedViol } = weekData;

    // max/repeatViolations/violations now come from the shared builder (only relevant slots).
    maxWeeklyRepeat = computedMax;
    repeatViolations = computedViol;
    violations = violList.length > 0 ? violList : undefined;

    // xAI adjustment: look at *current* (viewed day / draft) assignments' provenance for placements
    // that are part of week violations. High coverage signal relative to repeat cost = xAI "forgave"
    // some of the penalty for the health display. This is numeric only; explanations stay in glass/pad.
    const currentToMergeForXai = isDraftMode && draftAssignments && Object.keys(draftAssignments).length > 0
      ? draftAssignments
      : assignments;
    for (const [sk, row] of Object.entries(currentToMergeForXai)) {
      const r = row as any;
      const tmId = r?.tmId || (isDraftMode ? r?.proposedTmId : null);
      if (!tmId) continue;
      // Counts are keyed by repeat-area (see buildWeekRepeatData) — translate the
      // assignment's raw slot key before lookup.
      const areaKey = placementRepeatKey(sk);
      const effCount = tmSlotCounts[tmId]?.[areaKey] || 0;
      if (effCount <= 1) continue;
      const signals = r?.provenance?.fairnessSignals;
      if (signals) {
        const coverage = signalNumber(signals, 'coverage') || 0;
        const repeatCost = signalNumber(signals, 'repeat') || 50;
        const justify = Math.max(0, coverage - repeatCost * 0.6);
        xaiRepeatPenaltyReduction += Math.min(WEEK_POLICY_XAI_FORGIVENESS_CAP, justify / 5);
        // Mark the corresponding violation(s) as having xAI signal for UI (e.g. purple hint in lists).
        const v = violList.find((vv) => vv.tmId === tmId && placementRepeatKeysMatch(vv.slotKey, sk));
        if (v) v.hasXaiSignal = true;
      }
    }

    // Stable "week average" health percentage for the entire week.
    // This value must be the same no matter which day of the week the operator has selected or is viewing.
    // It is the consistent average health % for the week as a whole.
    //
    // When a complete `weekDailyHealths` (one entry per day with plan data) is provided, we use the
    // true arithmetic mean of the per-day health percentages as the base, then apply the distribution
    // penalty from repeats. This makes the week number the average of the tracked daily percentages
    // (rich for visited days, consistent proxies for others) while penalizing for the max-1 policy.
    // The set of days comes from the full week plan, so the average is consistent independent of
    // selected day.
    //
    // Fallback to representative base if no/incomplete daily data.
    if (hasWeeklyData) {
      const dailyHealths = (options as any)?.weekDailyHealths as Record<string, number> | undefined;
      let base: number;

      if (dailyHealths && Object.keys(dailyHealths).length > 0) {
        const vals = Object.values(dailyHealths).filter((v) => typeof v === 'number');
        base = vals.length > 0
          ? roundRotationHealthValue(vals.reduce((a, b) => a + b, 0) / vals.length)
          : WEEK_POLICY_FALLBACK_BASE;
      } else {
        base = WEEK_POLICY_FALLBACK_BASE;
      }

      let repeatPenalty = 0;
      if (maxWeeklyRepeat >= 3) {
        repeatPenalty = Math.min(
          WEEK_POLICY_REPEAT_PENALTY_CAP,
          WEEK_POLICY_REPEAT3_PENALTY + (maxWeeklyRepeat - 3) * WEEK_POLICY_REPEAT_STEP,
        );
      } else if (maxWeeklyRepeat === 2) {
        repeatPenalty = WEEK_POLICY_REPEAT2_PENALTY;
      }
      repeatPenalty = Math.max(0, repeatPenalty - xaiRepeatPenaltyReduction);

      // Each violation drags policy score — scaled by severity for more spread in the 70–95 band.
      if (repeatViolations > 0) {
        repeatPenalty += Math.min(WEEK_POLICY_VIOLATION_PENALTY_CAP, repeatViolations * 2);
      }

      weeklyBalance = roundRotationHealthValue(
        Math.max(WEEK_POLICY_FLOOR, base - repeatPenalty),
      );
    }
  }

  const weekPolicyPercent = weeklyBalance;

  if (scores.length === 0) {
    return {
      dailyPercent: null,
      percent: null,
      meetsTarget: false,
      scoredCount: 0,
      openGaps,
      counts,
      weekPolicyPercent,
      // weekly fields may be populated from recent fallback even if no scored slots tonight
      weeklyBalance,
      maxWeeklyRepeat,
      repeatViolations,
      xaiRepeatPenaltyReduction: xaiRepeatPenaltyReduction || 0,
      violations,
    };
  }

  // (percent already computed above — this is the health for the *currently selected day*.)

  // Blend for the main headline health %:
  // 0.7 * (today's detailed daily health) + 0.3 * (stable week average).
  // This way the prominent number reflects what you're looking at right now, while the week component is consistent for the whole week.
  let effectivePercentForDisplay = percent;
  if (weeklyBalance !== undefined) {
    effectivePercentForDisplay = roundRotationHealthValue(
      percent * 0.7 + weeklyBalance * 0.3,
    );
  }

  return {
    dailyPercent: percent,
    percent: effectivePercentForDisplay,
    // meetsTarget reads the SAME number the operator sees (the blended headline
    // %), not the unblended daily. Before this fix the two could disagree — a
    // board could display 85.2% with meetsTarget:false, or the reverse (F5).
    // Per decision D2 the 0.7 daily / 0.3 week blend is the authoritative metric.
    meetsTarget: (() => {
      const n = normalizeRotationHealthPercent(effectivePercentForDisplay);
      return n !== null && n >= ROTATION_HEALTH_TARGET;
    })(),
    scoredCount: scores.length,
    openGaps,
    counts,
    weekPolicyPercent,
    weeklyBalance,
    maxWeeklyRepeat,
    repeatViolations,
    xaiRepeatPenaltyReduction: xaiRepeatPenaltyReduction || 0,
    violations,
  };
}

/** Pure helper: given the recent 7-night history map and a TM + target slot, return how many
 * times the TM appears in that slot's *repeat area* in the window (this-week / recent repeats).
 * Area-merged via placementRepeatKey (MRR8/WRR8 = RR8) to match the engine's hard gate.
 * Does not include "tonight" — caller adds +1 when the current assignment is for this TM+slot.
 */
export function getTmThisWeekRepeatForSlot(
  weeklyRecentHistory: Map<string, Array<{ nightDate: string; slotKey: string }>> | undefined,
  tmId: string | null | undefined,
  targetSlotKey: string
): { count: number; dates: string[] } {
  if (!weeklyRecentHistory || !tmId) return { count: 0, dates: [] };
  const records = weeklyRecentHistory.get(tmId) || [];
  const matches = records.filter((r) => placementRepeatKeysMatch(r.slotKey, targetSlotKey));
  return {
    count: matches.length,
    dates: matches.map((r) => r.nightDate).slice(-4), // recent few for display
  };
}

type RgbTriplet = readonly [number, number, number];

function lerpRgb(a: RgbTriplet, b: RgbTriplet, t: number): RgbTriplet {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  ];
}

function rgbToHex([r, g, b]: RgbTriplet): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

const ORB_RED: RgbTriplet = [220, 38, 38];
const ORB_RED_HI: RgbTriplet = [248, 113, 113];
const ORB_ORANGE: RgbTriplet = [234, 88, 12];
const ORB_ORANGE_HI: RgbTriplet = [251, 146, 60];
const ORB_GREEN: RgbTriplet = [22, 163, 74];
const ORB_GREEN_MID: RgbTriplet = [34, 197, 94];
const ORB_GREEN_HI: RgbTriplet = [56, 189, 110];
const ORB_GREEN_LITE: RgbTriplet = [110, 231, 163];

/** Continuous red → orange → green palette for the health orb shader. */
export function rotationHealthOrbPalette(percent: number | null | undefined): {
  primary: string;
  secondary: string;
  tail: string;
  background: string;
  ring: string;
  accent: string;
} {
  const n = normalizeRotationHealthPercent(percent);
  if (n === null) {
    return {
      primary: "#8e8e93",
      secondary: "#aeaeb2",
      tail: "#6b7280",
      background: "#2c2c2e",
      ring: "rgba(142, 142, 147, 0.45)",
      accent: "rgba(142, 142, 147, 0.25)",
    };
  }

  let primary: RgbTriplet;
  let secondary: RgbTriplet;

  if (n <= ROTATION_HEALTH_AMBER_MIN) {
    const t = n / ROTATION_HEALTH_AMBER_MIN;
    primary = lerpRgb(ORB_RED, ORB_ORANGE, t);
    secondary = lerpRgb(ORB_RED_HI, ORB_ORANGE_HI, t);
  } else if (n < ROTATION_HEALTH_TARGET) {
    const t =
      (n - ROTATION_HEALTH_AMBER_MIN) /
      (ROTATION_HEALTH_TARGET - ROTATION_HEALTH_AMBER_MIN);
    primary = lerpRgb(ORB_ORANGE, ORB_GREEN, t);
    secondary = lerpRgb(ORB_ORANGE_HI, ORB_GREEN_HI, t);
  } else {
    const t = Math.min(1, (n - ROTATION_HEALTH_TARGET) / (100 - ROTATION_HEALTH_TARGET));
    primary = lerpRgb(ORB_GREEN, ORB_GREEN_MID, t);
    secondary = lerpRgb(ORB_GREEN_HI, ORB_GREEN_LITE, t);
  }

  const core = lerpRgb(primary, [18, 20, 24], 0.58);
  const rim = lerpRgb(primary, [48, 50, 56], 0.55);

  return {
    primary: rgbToHex(primary),
    secondary: rgbToHex(secondary),
    tail: "#6b7280",
    background: rgbToHex(core),
    ring: rgbToHex(rim),
    accent: rgbToHex(lerpRgb(primary, [220, 255, 230], 0.35)),
  };
}

export function rotationHealthFloaterColors(
  percent: number | null | undefined,
): { bg: string; border: string; text: string } {
  switch (rotationHealthTier(percent)) {
    case "green":
      return {
        bg: "rgba(22,163,74,0.75)",
        border: "rgba(34,197,94,0.35)",
        text: "#ecfdf5",
      };
    case "amber":
      return {
        bg: "rgba(180,83,9,0.75)",
        border: "rgba(251,191,36,0.35)",
        text: "#fffbeb",
      };
    case "red":
      return {
        bg: "rgba(185,28,28,0.75)",
        border: "rgba(248,113,113,0.35)",
        text: "#fef2f2",
      };
    default:
      return {
        bg: "rgba(0,0,0,0.75)",
        border: "#3a3a3c",
        text: "#a1a1aa",
      };
  }
}

/**
 * Compute just the daily (tonight) health percent for a single day.
 * Reusable for capture in callers (Client) so we can record the raw daily health %
 * for each visited/built day without needing the full week compute.
 * This enables the true arithmetic week average.
 */
export function computeDailyHealthPercent(
  auxDefs: AuxDef[],
  assignments: Record<string, SlotAssignmentRow>,
  fitBySlot: Record<string, PrerenderedPlacementFit>,
  isDraftMode = false,
  draftAssignments: Record<string, DraftAssignmentRow> = {},
): number | null {
  const counts = {
    strong_fit: 0,
    acceptable: 0,
    questionable: 0,
    critical_repeat: 0,
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
    if (fit.healthPending) continue; // placeholder verdict while history loads — don't score it

    scores.push(slotHealthPoints(fit));
    counts[fit.fitVerdict] += 1;
  }

  if (scores.length === 0) return null;

  return averageGranularHealthScores(scores);
}

/** Pure, reusable builder for week repeat data.
 *  Centralizes the aggregation from weeklyRecentHistory so health compute,
 *  getWeekRepeatViolations, advisor prep, and overview all share identical logic.
 *  This is the Speed win (no duplicate O(n) passes) and foundation for richer per-day
 *  health tracking and insight.
 */
export interface WeekRepeatData {
  tmSlotCounts: Record<string, Record<string, number>>;
  tmSlotNights: Record<string, Record<string, string[]>>;
  violList: WeekRepeatViolation[];
  maxWeeklyRepeat: number;
  repeatViolations: number;
}

export function buildWeekRepeatData(
  weeklyRecentHistory: Map<string, Array<{ nightDate: string; slotKey: string }>> | undefined
): WeekRepeatData {
  if (!weeklyRecentHistory || weeklyRecentHistory.size === 0) {
    return {
      tmSlotCounts: {},
      tmSlotNights: {},
      violList: [],
      maxWeeklyRepeat: 0,
      repeatViolations: 0,
    };
  }

  const tmSlotCounts: Record<string, Record<string, number>> = {};
  const tmSlotNights: Record<string, Record<string, string[]>> = {};

  for (const [tmId, records] of weeklyRecentHistory.entries()) {
    tmSlotCounts[tmId] = tmSlotCounts[tmId] || {};
    tmSlotNights[tmId] = tmSlotNights[tmId] || {};
    for (const rec of records) {
      if (!shouldShowPlacementFitChip(rec.slotKey)) continue; // only main deployment slots
      // Aggregate by repeat-area key (MRR8/WRR8 → RR8) so the week policy counts
      // the same physical area the engine's prior-3 hard gate does.
      const sk = placementRepeatKey(rec.slotKey);
      tmSlotCounts[tmId][sk] = (tmSlotCounts[tmId][sk] || 0) + 1;
      if (!tmSlotNights[tmId][sk]) tmSlotNights[tmId][sk] = [];
      tmSlotNights[tmId][sk].push(rec.nightDate);
    }
  }

  let maxWeeklyRepeat = 0;
  let repeatViolations = 0;
  const violList: WeekRepeatViolation[] = [];

  for (const [tmId, slotCounts] of Object.entries(tmSlotCounts)) {
    for (const [sk, c] of Object.entries(slotCounts)) {
      if (c > maxWeeklyRepeat) maxWeeklyRepeat = c;
      if (c > 1) {
        repeatViolations++;
        const nights = (tmSlotNights[tmId]?.[sk] || []).slice().sort();
        violList.push({
          tmId,
          slotKey: sk,
          count: c,
          nights,
          severity: c,
        });
      }
    }
  }

  return {
    tmSlotCounts,
    tmSlotNights,
    violList,
    maxWeeklyRepeat,
    repeatViolations,
  };
}

/** Pure extractor: given the full-week recent history map (the same one passed to compute for stable week-as-whole),
 * return the list of (tmId, slotKey) that appear more than once. This is the canonical list of what is
 * dragging the weeklyBalance down. Callers (health floater, week overview, pad, advisor) use this to
 * render "N viol." and "what to move" lists without re-aggregating.
 *
 * Now implemented as a thin wrapper over the shared builder for consistency and speed.
 */
export function getWeekRepeatViolations(
  weeklyRecentHistory: Map<string, Array<{ nightDate: string; slotKey: string }>> | undefined,
): WeekRepeatViolation[] {
  return buildWeekRepeatData(weeklyRecentHistory).violList;
}

/** Local, zero-token suggestion engine for rotation health fixes.
 *  Given the violations (from getWeek... or health.violations) and the week history,
 *  proposes a small number of concrete "what to move where" actions that would reduce
 *  maxWeeklyRepeat / repeatViolations (and therefore raise weeklyBalance and blended health %).
 *  Uses swap-lane eligibility + basic spread/gap awareness (prefers giving the repeated TM a fresh
 *  slot they have 0× on this week, and finds a reasonable occupant for the vacated slot).
 *  These are fast deterministic hints; xAI advisor can validate/rank/embellish them.
 *  Returns at most a handful, sorted by estimated impact (highest repeat first).
 */
export type RotationMoveSuggestion = {
  /** The violating placement to change. */
  from: { tmId: string; tmName?: string; slotKey: string; nightDate?: string };
  /** Target: either a different slot for the same TM on (ideally) a different night, or a bilateral swap. */
  to: { slotKey: string; nightDate?: string; viaSwapWith?: { tmId: string; tmName?: string } };
  /** Short operator-facing reason (no xAI text; factual from data). */
  reason: string;
  /** Rough severity of the source violation (higher = more urgent). */
  impact: number;
};

export function suggestLocalRotationMoves(
  violations: WeekRepeatViolation[] | undefined,
  weeklyRecentHistory: Map<string, Array<{ nightDate: string; slotKey: string }>> | undefined,
  auxDefs: AuxDef[],
  /** Optional lookup for display names when caller has roster. */
  getTmName?: (tmId: string) => string | undefined,
): RotationMoveSuggestion[] {
  if (!violations || violations.length === 0 || !weeklyRecentHistory) return [];
  // Sort by severity desc so worst repeats surface first.
  const sorted = [...violations].sort((a, b) => b.count - a.count);
  const suggestions: RotationMoveSuggestion[] = [];

  // Build a reverse index: for each slotKey, which (tmId, night) occupy it this week.
  const occupantsBySlot: Record<string, Array<{ tmId: string; night: string }>> = {};
  for (const [tmId, recs] of weeklyRecentHistory.entries()) {
    for (const r of recs) {
      (occupantsBySlot[r.slotKey] ||= []).push({ tmId, night: r.nightDate });
    }
  }

  for (const v of sorted) {
    if (suggestions.length >= 4) break; // keep it small and actionable
    const { tmId, slotKey, count, nights } = v;

    if (!shouldShowPlacementFitChip(slotKey)) continue; // do not think about / try to fix repeats on overlaps or admin via rotation advisor

    const tmName = getTmName ? getTmName(tmId) : undefined;

    // 1) Look for a "gap" night/slot for this TM in the same zone family (prefer different day).
    //    We scan other records for this TM to find a slot they have 0 count on.
    const thisTmRecords = weeklyRecentHistory.get(tmId) || [];
    const thisTmUsed = new Set(thisTmRecords.map((r) => r.slotKey));

    // Candidate targets: other slots in same "tier" (Z* stay in zones, RR stay in RR, valid aux) that this TM has 0 on.
    // Only relevant deployment slots — never overlaps (OL-*) or admin (ADM*).
    // Families derive from the real board defs (ZONE_DEFS / RR_DEFS) — the earlier hardcoded
    // lists proposed restrooms that don't exist (MRR2–MRR5) and skipped Z9/Z10 entirely.
    const zoneMatch = /^Z\d/.test(slotKey);
    const rrMatch = /^([MW]RR)\d/.test(slotKey);
    const auxMatch = /^SP/.test(slotKey) || /^AUX/.test(slotKey);

    const familySlots = zoneMatch
      ? ZONE_DEFS.map((z) => z.key)
          .concat("Z9SR")
          .filter(
            (k) =>
              k !== slotKey &&
              !isOptionalDeploymentSlot(k) && // Z1/Z2 are manual-only — never suggest them
              shouldShowPlacementFitChip(k),
          )
      : rrMatch
      ? RR_DEFS.map((d) => `${slotKey.startsWith("M") ? "M" : "W"}RR${d.num}`).filter(
          (k) => k !== slotKey && shouldShowPlacementFitChip(k),
        )
      : auxMatch
      ? (auxDefs || []).map((d) => d.key).filter((k) => !k.startsWith("SP") && k !== slotKey && shouldShowPlacementFitChip(k))
      : [];

    const fromNight = nights[0];
    // A target is only actionable when the TM hasn't held it this week AND nobody
    // occupies it on the night we'd move — suggestions the operator can't act on
    // cost more trust than they're worth.
    const freshSlots = familySlots.filter((cand) => !thisTmUsed.has(cand));
    const targetSlot =
      freshSlots.find(
        (cand) =>
          !(occupantsBySlot[cand] || []).some((o) => o.night === fromNight),
      ) ?? null;

    if (targetSlot) {
      suggestions.push({
        from: { tmId, tmName, slotKey, nightDate: fromNight },
        to: { slotKey: targetSlot },
        reason: `Gives ${tmName || "TM"} a fresh ${targetSlot} (0× this week, open on ${fromNight}) while freeing a repeat on ${slotKey}.`,
        impact: count,
      });
      continue;
    }

    // 2) Bilateral swap heuristic within swap lanes (same tier, different specific slot).
    //    Find another TM who is on a peer slot this week and who has low/no exposure to the viol slot.
    //    Use the canSuggestSwapBetween logic indirectly by looking for peer occupants.
    //    For simplicity here we just note a possible swap partner on a peer slot the viol TM hasn't done.
    //    Only relevant (non-overlap, non-admin) slots.
    const peerSlots = zoneMatch
      ? familySlots.slice(0, 3)
      : rrMatch
      ? familySlots.slice(0, 2)
      : [];

    for (const peer of peerSlots) {
      const peers = occupantsBySlot[peer] || [];
      for (const p of peers) {
        if (p.tmId === tmId) continue;
        // Very light: if the peer TM also has some repeat pressure elsewhere, or just offer the cross.
        const peerRecs = weeklyRecentHistory.get(p.tmId) || [];
        const peerUsed = new Set(peerRecs.map((r) => r.slotKey));
        if (!peerUsed.has(slotKey)) {
          const pName = getTmName ? getTmName(p.tmId) : undefined;
          suggestions.push({
            from: { tmId, tmName, slotKey, nightDate: nights[0] },
            to: { slotKey: peer, nightDate: p.night, viaSwapWith: { tmId: p.tmId, tmName: pName } },
            reason: `Bilateral with ${pName || "peer"} on ${peer} — ${tmName || "TM"} gets rotation relief; partner gets exposure to ${slotKey}.`,
            impact: count,
          });
          break;
        }
      }
      if (suggestions.length >= 4) break;
    }
  }

  return suggestions.slice(0, 3);
}