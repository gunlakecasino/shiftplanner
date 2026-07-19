/**
 * engine/feasibility.ts — gender-aware coverage feasibility (P2-3, fixes F10).
 *
 * The legacy `calculateCoverageFeasibility(total)` checked only the headcount
 * against old 10/21 thresholds, so a roster of 21 full-grave men was declared "mathematically
 * possible" even though the five women's restrooms were unfillable. Tier 1
 * (restrooms) needs 5 eligible males AND 5 eligible females; this module reports
 * the shortfall per gender so the operator-facing reality check is honest.
 *
 * P1-14 (2026-07-18): the per-gender counts are no longer re-derived from
 * `tm.gender` here. They are probed through the ONE liturgy gate
 * (`isEligibleForSlot`) with a representative restroom key, so "who can hold a
 * men's restroom" has exactly one definition. Before this, a TM with missing
 * gender passed BOTH restroom gates but counted toward NEITHER pool — the gate
 * and the feasibility number actively disagreed.
 */

import { isEligibleForSlot } from "../eligibilityCore";
import type { NightContext } from "./types";

export interface GenderFeasibility {
  fullGraveMale: number;
  fullGraveFemale: number;
  fullGraveTotal: number;
  /** Tier 1 (10 restrooms) clearable — needs ≥5 of each gender. */
  tier1Clearable: boolean;
  maleShortfall: number;
  femaleShortfall: number;
  /** Critical board with conditional Admin clearable — needs ≥14 total. */
  tier2Clearable: boolean;
  totalShortfall: number;
}

const RR_PER_GENDER = 5;
/** Representative restroom keys — the liturgy gates every MRRn/WRRn alike. */
const MRR_PROBE_SLOT = "MRR1";
const WRR_PROBE_SLOT = "WRR1";
// Critical board: 10 restrooms (5M+5F) + Z4/Z5/Z9 + Admin at the 14-person
// threshold. Admin itself is separately hard-gated by Admin-trained status.
const CRITICAL_WITH_ADMIN_MIN_UNIQUE = 14;

export function computeFeasibility(ctx: NightContext): GenderFeasibility {
  let male = 0;
  let female = 0;
  for (const tm of ctx.roster) {
    if (ctx.scheduledTmIds.size > 0 && !tm.scheduled) continue;
    // Mutually exclusive by construction: the liturgy admits a TM to at most
    // one restroom family, so nobody is double-counted. The restroom branches
    // already require full-grave, so the old `!tm.isFullGrave` pre-filter is
    // subsumed rather than dropped.
    if (isEligibleForSlot(tm, MRR_PROBE_SLOT)) male += 1;
    else if (isEligibleForSlot(tm, WRR_PROBE_SLOT)) female += 1;
  }
  const total = male + female;
  const maleShortfall = Math.max(0, RR_PER_GENDER - male);
  const femaleShortfall = Math.max(0, RR_PER_GENDER - female);
  return {
    fullGraveMale: male,
    fullGraveFemale: female,
    fullGraveTotal: total,
    tier1Clearable: maleShortfall === 0 && femaleShortfall === 0,
    maleShortfall,
    femaleShortfall,
    tier2Clearable: total >= CRITICAL_WITH_ADMIN_MIN_UNIQUE && maleShortfall === 0 && femaleShortfall === 0,
    totalShortfall: Math.max(0, CRITICAL_WITH_ADMIN_MIN_UNIQUE - total),
  };
}

/** One-line operator-facing feasibility summary. */
export function feasibilityNote(ctx: NightContext): string {
  const f = computeFeasibility(ctx);
  if (f.tier2Clearable) {
    return `Feasibility: critical board + Admin possible (${f.fullGraveMale}M + ${f.fullGraveFemale}F full-grave).`;
  }
  const parts: string[] = [];
  if (!f.tier1Clearable) {
    if (f.femaleShortfall > 0) parts.push(`${f.femaleShortfall} more female TM(s) for WRRs`);
    if (f.maleShortfall > 0) parts.push(`${f.maleShortfall} more male TM(s) for MRRs`);
  }
  if (f.totalShortfall > 0) parts.push(`${f.totalShortfall} short of the 14 needed for restrooms + Z4/Z5/Z9 + Admin`);
  return `Feasibility: cannot clear full coverage — ${parts.join("; ")} (${f.fullGraveMale}M + ${f.fullGraveFemale}F full-grave).`;
}
