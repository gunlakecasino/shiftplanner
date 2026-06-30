/**
 * GRAVE shift canonical default break groups (sudo Card Defaults baseline).
 *
 * Applied to every night via slot_defaults. Per-shift overrides live on
 * zone_assignments.break_group (explicit) or break_assignments.group_num.
 * NULL / unset assignment break_group inherits these defaults at display time.
 */

import type { BreakGroupValue } from "./breakGroupResolve";
import type { SlotDefault } from "./data";

export type GraveBreakGroupDefaultRow = {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide: string;
  defaultBreakGroup: BreakGroupValue;
  /** Operator-facing label (docs / sudo UI). */
  label: string;
};

/** Composite map key: `${slotKey}|${rrSide}` (rrSide '' for zone/aux). */
export function graveBreakGroupCompositeKey(
  slotKey: string,
  rrSide = "",
): string {
  return `${slotKey}|${rrSide}`;
}

/**
 * Grave break rotation map — zones 1–3 cycle, RR M/W can differ per restroom.
 */
export const GRAVE_BREAK_GROUP_DEFAULT_ROWS: GraveBreakGroupDefaultRow[] = [
  // Zones
  { slotKey: "zone_1", slotType: "zone", rrSide: "", defaultBreakGroup: 1, label: "ZONE 1" },
  { slotKey: "zone_2", slotType: "zone", rrSide: "", defaultBreakGroup: 2, label: "ZONE 2" },
  { slotKey: "zone_3", slotType: "zone", rrSide: "", defaultBreakGroup: 3, label: "ZONE 3" },
  { slotKey: "zone_4", slotType: "zone", rrSide: "", defaultBreakGroup: 1, label: "ZONE 4" },
  { slotKey: "zone_5", slotType: "zone", rrSide: "", defaultBreakGroup: 2, label: "ZONE 5" },
  { slotKey: "zone_6", slotType: "zone", rrSide: "", defaultBreakGroup: 3, label: "ZONE 6" },
  { slotKey: "zone_7", slotType: "zone", rrSide: "", defaultBreakGroup: 1, label: "ZONE 7" },
  { slotKey: "zone_8", slotType: "zone", rrSide: "", defaultBreakGroup: 2, label: "ZONE 8" },
  { slotKey: "zone_9", slotType: "zone", rrSide: "", defaultBreakGroup: 3, label: "ZONE 9" },
  { slotKey: "zone_10", slotType: "zone", rrSide: "", defaultBreakGroup: 1, label: "ZONE 10" },

  // Restrooms — women's (WRR) then men's (MRR) per operator sheet
  { slotKey: "rr_1_2", slotType: "rr", rrSide: "womens", defaultBreakGroup: 3, label: "RR 1+2 (W)" },
  { slotKey: "rr_1_2", slotType: "rr", rrSide: "mens", defaultBreakGroup: 2, label: "RR 1+2 (M)" },
  { slotKey: "rr_6", slotType: "rr", rrSide: "womens", defaultBreakGroup: 1, label: "RR 6 (W)" },
  { slotKey: "rr_6", slotType: "rr", rrSide: "mens", defaultBreakGroup: 2, label: "RR 6 (M)" },
  { slotKey: "rr_7", slotType: "rr", rrSide: "womens", defaultBreakGroup: 2, label: "RR 7 (W)" },
  { slotKey: "rr_7", slotType: "rr", rrSide: "mens", defaultBreakGroup: 3, label: "RR 7 (M)" },
  { slotKey: "rr_8", slotType: "rr", rrSide: "womens", defaultBreakGroup: 3, label: "RR 8 (W)" },
  { slotKey: "rr_8", slotType: "rr", rrSide: "mens", defaultBreakGroup: 1, label: "RR 8 (M)" },
  { slotKey: "rr_10", slotType: "rr", rrSide: "womens", defaultBreakGroup: 1, label: "RR 10 (W)" },
  { slotKey: "rr_10", slotType: "rr", rrSide: "mens", defaultBreakGroup: 3, label: "RR 10 (M)" },

  // Admin aux (ADM / AUX1 admin shell)
  { slotKey: "admin", slotType: "aux", rrSide: "", defaultBreakGroup: 2, label: "ADMIN" },

  // Overlaps default to the special OL group
  ...Array.from({ length: 6 }, (_, i) => ({
    slotKey: `overlap_am_${i}`,
    slotType: "overlap" as const,
    rrSide: "",
    defaultBreakGroup: 4 as BreakGroupValue,
    label: `AM Overlap ${i + 1}`,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    slotKey: `overlap_pm_${i}`,
    slotType: "overlap" as const,
    rrSide: "",
    defaultBreakGroup: 4 as BreakGroupValue,
    label: `PM Overlap ${i + 1}`,
  })),
];

const GRAVE_BREAK_GROUP_BY_KEY = new Map<string, BreakGroupValue>(
  GRAVE_BREAK_GROUP_DEFAULT_ROWS.map((r) => [
    graveBreakGroupCompositeKey(r.slotKey, r.rrSide),
    r.defaultBreakGroup,
  ]),
);

export function graveBreakGroupForCompositeKey(
  compositeKey: string,
): BreakGroupValue | undefined {
  return GRAVE_BREAK_GROUP_BY_KEY.get(compositeKey);
}

export function graveBreakGroupSlotDefaults(): SlotDefault[] {
  return GRAVE_BREAK_GROUP_DEFAULT_ROWS.map((r) => ({
    slotKey: r.slotKey,
    slotType: r.slotType,
    rrSide: r.rrSide,
    defaultBreakGroup: r.defaultBreakGroup,
  }));
}