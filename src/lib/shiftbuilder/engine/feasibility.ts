/**
 * engine/feasibility.ts — gender-aware coverage feasibility (P2-3, fixes F10).
 *
 * The legacy `calculateCoverageFeasibility(total)` checked only the headcount
 * against 10/21, so a roster of 21 full-grave men was declared "mathematically
 * possible" even though the five women's restrooms were unfillable. Tier 1
 * (restrooms) needs 5 eligible males AND 5 eligible females; this module reports
 * the shortfall per gender so the operator-facing reality check is honest.
 */

import type { NightContext } from "./types";

export interface GenderFeasibility {
  fullGraveMale: number;
  fullGraveFemale: number;
  fullGraveTotal: number;
  /** Tier 1 (10 restrooms) clearable — needs ≥5 of each gender. */
  tier1Clearable: boolean;
  maleShortfall: number;
  femaleShortfall: number;
  /** Tier 1 + Tier 2 (restrooms + admin + zones) clearable — needs ≥21 total. */
  tier2Clearable: boolean;
  totalShortfall: number;
}

const RR_PER_GENDER = 5;
// Two hard-coverage tiers: 10 restrooms (5M+5F) + 10 zones. Admin/Z9SR are the
// lower auxiliary tier (bonus), so full hard coverage needs 20 unique full-grave.
const TIER2_MIN_UNIQUE = 20;

export function computeFeasibility(ctx: NightContext): GenderFeasibility {
  let male = 0;
  let female = 0;
  for (const tm of ctx.roster) {
    if (!tm.isFullGrave) continue;
    if (ctx.scheduledTmIds.size > 0 && !tm.scheduled) continue;
    if (tm.gender === "M") male += 1;
    else if (tm.gender === "F") female += 1;
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
    tier2Clearable: total >= TIER2_MIN_UNIQUE && maleShortfall === 0 && femaleShortfall === 0,
    totalShortfall: Math.max(0, TIER2_MIN_UNIQUE - total),
  };
}

/** One-line operator-facing feasibility summary. */
export function feasibilityNote(ctx: NightContext): string {
  const f = computeFeasibility(ctx);
  if (f.tier2Clearable) {
    return `Feasibility: full Tier 1 + Tier 2 coverage possible (${f.fullGraveMale}M + ${f.fullGraveFemale}F full-grave).`;
  }
  const parts: string[] = [];
  if (!f.tier1Clearable) {
    if (f.femaleShortfall > 0) parts.push(`${f.femaleShortfall} more female TM(s) for WRRs`);
    if (f.maleShortfall > 0) parts.push(`${f.maleShortfall} more male TM(s) for MRRs`);
  }
  if (f.totalShortfall > 0) parts.push(`${f.totalShortfall} short of the 20 needed for restrooms + zones`);
  return `Feasibility: cannot clear full coverage — ${parts.join("; ")} (${f.fullGraveMale}M + ${f.fullGraveFemale}F full-grave).`;
}
