/**
 * engine/health/verdict.ts — fit verdict bands (P1-3, fixes F8).
 *
 * The old `pickerVerdictFromHealthPoints` used `points === 50` as the
 * critical_repeat sentinel. A genuine critical capped *below* 50 (e.g. a
 * week-repeat-3× landing at 43) then displayed as the milder "needs_swap".
 * Here criticality is an explicit flag carried by the scorer, never inferred
 * from an exact score.
 */

import type { PlacementFitVerdict } from "../types";

/** Points at/below which a placement is at best "needs a swap". */
export const NEEDS_SWAP_MAX = 49.9;
export const QUESTIONABLE_MIN = 50.0;
export const ACCEPTABLE_MIN = 76;
export const STRONG_MIN = 90;

/**
 * Map continuous health points (+ explicit critical flag) to a verdict band.
 * `isCritical` wins over the numeric band: a critical repeat always reads
 * `critical_repeat` regardless of where its capped score lands.
 */
export function verdictFromPoints(
  points: number,
  isCritical: boolean,
): PlacementFitVerdict {
  if (isCritical) return "critical_repeat";
  if (points >= STRONG_MIN) return "strong_fit";
  if (points >= ACCEPTABLE_MIN) return "acceptable";
  if (points >= QUESTIONABLE_MIN) return "questionable";
  if (points >= 20) return "needs_swap";
  return "poor_fit";
}
