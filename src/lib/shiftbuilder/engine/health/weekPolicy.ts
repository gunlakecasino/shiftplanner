/**
 * engine/health/weekPolicy.ts — the ONE week repeat-policy scorer (P1-3).
 *
 * Centralizes the "max 1 per TM per area per grave week" policy score so the
 * week engine, the tracker, and the AI brief all read the same number. Wraps
 * the existing `buildWeekRepeatData` (area-merged via placementRepeatKey, so
 * MRR8/WRR8 count as one restroom — the same key the engine's prior-3 hard gate
 * uses) and the tuned penalty ladder from shiftRotationHealth.ts.
 *
 * Area-merged counting is the fix behind F6: the half-implemented
 * `weeklyHistories` branch counted by exact key, hiding MRR8/WRR8 alternation.
 */

import {
  buildWeekRepeatData,
  roundRotationHealthValue,
  WEEK_POLICY_FALLBACK_BASE,
  WEEK_POLICY_REPEAT2_PENALTY,
  WEEK_POLICY_REPEAT3_PENALTY,
  WEEK_POLICY_REPEAT_STEP,
  WEEK_POLICY_REPEAT_PENALTY_CAP,
  WEEK_POLICY_VIOLATION_PENALTY_CAP,
  WEEK_POLICY_FLOOR,
  type WeekRepeatViolation,
} from "@/lib/shiftbuilder/rotation/shiftRotationHealth";
import type { WeekNightRecord } from "../types";

export interface WeekPolicyResult {
  percent: number;
  maxWeeklyRepeat: number;
  repeatViolations: number;
  violations: WeekRepeatViolation[];
}

/**
 * Week repeat-policy score (0–100). `base` is the mean nightly health across
 * built days when available (so a strong week floats near its nightly average),
 * else the neutral fallback base. Repeats and violations drag it down per the
 * tuned ladder; never below WEEK_POLICY_FLOOR.
 */
export function weekPolicyScore(
  weeklyRecentHistory: Map<string, WeekNightRecord[]> | undefined,
  base: number = WEEK_POLICY_FALLBACK_BASE,
): WeekPolicyResult {
  const data = buildWeekRepeatData(weeklyRecentHistory);
  const { maxWeeklyRepeat, repeatViolations, violList } = data;

  let repeatPenalty = 0;
  if (maxWeeklyRepeat >= 3) {
    repeatPenalty = Math.min(
      WEEK_POLICY_REPEAT_PENALTY_CAP,
      WEEK_POLICY_REPEAT3_PENALTY + (maxWeeklyRepeat - 3) * WEEK_POLICY_REPEAT_STEP,
    );
  } else if (maxWeeklyRepeat === 2) {
    repeatPenalty = WEEK_POLICY_REPEAT2_PENALTY;
  }
  if (repeatViolations > 0) {
    repeatPenalty += Math.min(WEEK_POLICY_VIOLATION_PENALTY_CAP, repeatViolations * 2);
  }

  return {
    percent: roundRotationHealthValue(Math.max(WEEK_POLICY_FLOOR, base - repeatPenalty)),
    maxWeeklyRepeat,
    repeatViolations,
    violations: violList,
  };
}
