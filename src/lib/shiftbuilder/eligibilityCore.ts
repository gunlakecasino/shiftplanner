/**
 * eligibilityCore.ts — leaf liturgy for placement eligibility (KD-7).
 *
 * Pure hard constraints only:
 *   - gender (MRR / WRR)
 *   - grave pool vs full-grave vs overlap band
 *   - coarse slot type labels for operator-rule filters
 *
 * Import rules (constitution):
 *   - This module imports NOTHING from engine/, placement, UI, or data loaders.
 *   - engine/eligibility.ts (public `canPlace`) and placement.ts may import here.
 *   - placement.ts must NEVER import engine/eligibility (no placement↔eligibility cycle).
 *
 * Operator rules, schedule membership, and knowledge accommodations compose
 * ONLY in `canPlace` — never inside this liturgy.
 */

/**
 * Optional (never auto-filled) zones. Emptied 2026-07-03: Z1/Z2 are regular
 * zones in fill order. Kept as a shared Set so liturgy + placement agree.
 */
export const OPTIONAL_AUTO_FILL_ZONE_SLOTS = new Set<string>([]);

export function isOptionalDeploymentSlot(slotKey: string): boolean {
  return OPTIONAL_AUTO_FILL_ZONE_SLOTS.has(slotKey);
}

/**
 * Coarse slot type used by operator rule filters (`engine_eligibility_rules`
 * condition.slot_types). Shared so liturgy and canPlace never disagree.
 */
export function slotTypeForKey(slotKey: string): string {
  if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) return "rr";
  if (slotKey.startsWith("OL-")) return "overlap";
  if (slotKey.startsWith("Z")) return "zone";
  if (isOptionalDeploymentSlot(slotKey)) return "zone";
  return "aux";
}

export function normalizeGender(val: unknown): "M" | "F" | "" {
  const s = String(val || "").toUpperCase().trim();
  if (!s) return "";
  if (s === "F" || s === "FEMALE" || s === "WOMAN" || s === "WOMEN" || s.startsWith("F"))
    return "F";
  if (s === "M" || s === "MALE" || s === "MAN" || s === "MEN" || s.startsWith("M")) return "M";
  return "";
}

/**
 * Core liturgy gate — gender / grave-pool / overlap-band only.
 *
 * Does **not** accept operator eligibility rules (that was the hardcoded
 * `slotType: "zone"` footgun). Compose rules + schedule + knowledge via
 * `canPlace` in engine/eligibility.ts.
 */
export function isEligibleForSlot(tm: any, slotKey: string): boolean {
  const isAMOverlapAssigned = !!(tm.isAMOverlap || tm.isAMOverlapTonight);
  const isPMOverlapAssigned = !!(tm.isPMOverlap || tm.isPMOverlapTonight);
  const isFullGraveBySchedule = !!(tm.isFullGrave || tm.isFullGraveTonight);

  // `gravePool` on tm_profiles is a string enum, NOT a boolean. Common
  // values include "AM", "PM", "Full" (and truthy fallbacks). A TM whose
  // gravePool is "AM" or "PM" is an overlap-type grave employee — they
  // cover a partial shift and cannot hold a full-zone slot, regardless of
  // whether they happen to be assigned to an OL-AM/PM slot tonight.
  const gravePoolKind = String(tm.gravePool ?? "").toUpperCase();
  const isOverlapByPool = gravePoolKind === "AM" || gravePoolKind === "PM";
  const isGrave =
    !!tm.gravePool || isFullGraveBySchedule || isAMOverlapAssigned || isPMOverlapAssigned;
  const isFullGrave =
    isFullGraveBySchedule ||
    (isGrave && !isOverlapByPool && !isAMOverlapAssigned && !isPMOverlapAssigned);

  // Main Zone Deployment + Z9 Smoking Room — strict full-grave only
  if (slotKey.startsWith("Z")) {
    return isFullGrave;
  }

  // Overlap Tab AM — accept TMs flagged as AM by either signal
  if (slotKey.startsWith("OL-AM") || slotKey.includes("AM-Overlap")) {
    return isGrave && (isAMOverlapAssigned || gravePoolKind === "AM");
  }

  // Overlap Tab PM — accept TMs flagged as PM by either signal
  if (slotKey.startsWith("OL-PM") || slotKey.includes("PM-Overlap")) {
    return isGrave && (isPMOverlapAssigned || gravePoolKind === "PM");
  }

  // Men's Restrooms — full-night grave shift, male TMs only
  if (slotKey.startsWith("MRR")) {
    if (!isGrave) return false;
    if (isOverlapByPool || isAMOverlapAssigned || isPMOverlapAssigned) return false;
    const g = normalizeGender(tm.gender);
    if (g === "F") return false;
    return true;
  }

  // Women's Restrooms — full-night grave shift, female TMs only
  if (slotKey.startsWith("WRR")) {
    if (!isGrave) return false;
    if (isOverlapByPool || isAMOverlapAssigned || isPMOverlapAssigned) return false;
    const g = normalizeGender(tm.gender);
    if (g === "M") return false;
    return true;
  }

  // Admin, Trash, Support, AUX — full-night positions, no gender restriction.
  // AM/PM overlap TMs work partial shifts (10pm–3am or 3am–7am) and cannot
  // hold a full-night restroom or admin slot. Only full-grave TMs (or non-grave
  // active TMs on the roster) are eligible here.
  if (
    slotKey === "ADM" ||
    slotKey.startsWith("TR") ||
    slotKey.startsWith("AUX") ||
    slotKey.startsWith("SP")
  ) {
    if (isOverlapByPool || isAMOverlapAssigned || isPMOverlapAssigned) return false;
    return true;
  }

  return true;
}
