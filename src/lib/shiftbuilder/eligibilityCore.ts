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

/**
 * Slot-key families the liturgy knows how to gate (P1-14).
 *
 * Deliberately covers all three live vocabularies — the UI board keys
 * (`Z4`, `MRR8`, `AUX3`, `OL-AM-2`), the `zone_assignments` DB family keys
 * (`zone_4`, `trash_2`, `overlap_am_2`) and the per-TM trail codes
 * (`RR8M`, `TSH1`, `SUP1`, `STEP`) — because `canPlace` is reached from
 * surfaces that hold each of them.
 *
 * `"unknown"` is the fail-CLOSED bucket: a key nobody here recognizes is not
 * silently eligible for the whole roster. Teaching the board a new slot
 * vocabulary means teaching this function about it; forgetting now blocks
 * placements loudly instead of quietly waving overlap TMs onto full-night
 * positions.
 */
export type SlotFamily =
  | "zone"
  | "overlap-am"
  | "overlap-pm"
  | "mrr"
  | "wrr"
  | "full-night"
  | "unknown";

export function slotFamilyForKey(slotKey: string): SlotFamily {
  const u = String(slotKey ?? "").trim().toUpperCase();
  if (!u) return "unknown";

  // Overlap bands — UI (OL-AM-2), DB (overlap_am_2), legacy label (AM-Overlap).
  if (u.startsWith("OL-AM") || u.includes("AM-OVERLAP") || /^OVERLAP_AM(_\d+)?$/.test(u)) {
    return "overlap-am";
  }
  if (u.startsWith("OL-PM") || u.includes("PM-OVERLAP") || /^OVERLAP_PM(_\d+)?$/.test(u)) {
    return "overlap-pm";
  }

  // Restrooms — board keys (MRR8 / WRR8) and per-TM trail codes (RR8M / RR8W).
  if (/^MRR\d+$/.test(u) || /^RR\d+M$/.test(u)) return "mrr";
  if (/^WRR\d+$/.test(u) || /^RR\d+W$/.test(u)) return "wrr";

  // Zones + the Z9 smoking room.
  if (/^Z\d+$/.test(u) || u === "Z9SR" || u === "Z9_SR" || /^ZONE_\d+$/.test(u)) return "zone";

  // Full-night, non-gendered positions (admin / trash / support / oasis /
  // job coach / step up / flex aux shells), in all three vocabularies.
  if (
    u === "ADM" ||
    u === "ADMIN" ||
    u === "JC" ||
    u === "JOB_COACH" ||
    u === "STEP" ||
    u === "STEP_UP" ||
    /^(TR|TSH|SP|SUP|OAS|AUX)\d+$/.test(u) ||
    /^(TRASH|SUPPORT|OASIS)_\d+$/.test(u)
  ) {
    return "full-night";
  }

  return "unknown";
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
 *
 * Fails CLOSED in both directions (P1-14, 2026-07-18):
 *   - an unrecognized slot key (`slotFamilyForKey` -> `"unknown"`) is eligible
 *     for **nobody**, rather than for everyone including overlap TMs;
 *   - a TM with missing/unparseable gender holds **neither** restroom, which is
 *     the same population `engine/feasibility.ts` counts toward neither the
 *     male nor the female pool. Gate and feasibility now derive that answer
 *     from this one function, so they cannot drift apart again.
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

  const isFullNightOnly =
    !isOverlapByPool && !isAMOverlapAssigned && !isPMOverlapAssigned;

  switch (slotFamilyForKey(slotKey)) {
    // Main Zone Deployment + Z9 Smoking Room — strict full-grave only
    case "zone":
      return isFullGrave;

    // Overlap Tab AM — accept TMs flagged as AM by either signal
    case "overlap-am":
      return isGrave && (isAMOverlapAssigned || gravePoolKind === "AM");

    // Overlap Tab PM — accept TMs flagged as PM by either signal
    case "overlap-pm":
      return isGrave && (isPMOverlapAssigned || gravePoolKind === "PM");

    // Men's Restrooms — full-night grave shift, male TMs only. Unknown gender
    // is NOT male (fail closed) — see the docstring.
    case "mrr":
      return isGrave && isFullNightOnly && normalizeGender(tm.gender) === "M";

    // Women's Restrooms — full-night grave shift, female TMs only.
    case "wrr":
      return isGrave && isFullNightOnly && normalizeGender(tm.gender) === "F";

    // Admin, Trash, Support, Oasis, Job Coach, Step Up, AUX — full-night
    // positions, no gender restriction. AM/PM overlap TMs work partial shifts
    // (10pm–3am or 3am–7am) and cannot hold one. Only full-grave TMs (or
    // non-grave active TMs on the roster) are eligible here.
    case "full-night":
      return isFullNightOnly;

    // Unrecognized slot key — nobody is eligible (fail closed).
    default:
      return false;
  }
}
