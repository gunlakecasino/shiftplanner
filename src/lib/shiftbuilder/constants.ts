// ── ShiftBuilder constants ────────────────────────────────────────────────────
// All module-level definitions extracted from ShiftBuilderClient.tsx.
// Do NOT re-declare these in the component files — import from here.

import type { AuxDef } from "./placement";

// Zone identities — labels are rendered uppercase in the card per the Golden
export const ZONE_DEFS = [
  { key: "Z1",  label: "ZONE 1",  locations: ["Main Entry North"] },
  { key: "Z2",  label: "ZONE 2",  locations: ["Main Entry South"] },
  { key: "Z3",  label: "ZONE 3",  locations: ["Food Court North"] },
  { key: "Z4",  label: "ZONE 4",  locations: ["Food Court South"] },
  { key: "Z5",  label: "ZONE 5",  locations: ["Slots West"] },
  { key: "Z6",  label: "ZONE 6",  locations: ["Slots East"] },
  { key: "Z7",  label: "ZONE 7",  locations: ["High Limit"] },
  { key: "Z8",  label: "ZONE 8",  locations: ["Table Games North"] },
  { key: "Z9",  label: "ZONE 9",  locations: ["Table Games South"] },
  { key: "Z10", label: "ZONE 10", locations: ["Poker"] },
];

// Restrooms — labels match the Golden ("RR 1+2", "RR 6", etc.)
export const RR_DEFS = [
  { num: 1,  label: "RR 1+2", mensLoc: "Main Entry",  womensLoc: "Main Entry"  },
  { num: 6,  label: "RR 6",   mensLoc: "Slots",       womensLoc: "Slots"       },
  { num: 7,  label: "RR 7",   mensLoc: "High Limit",  womensLoc: "High Limit"  },
  { num: 8,  label: "RR 8",   mensLoc: "Table Games", womensLoc: "Table Games" },
  { num: 10, label: "RR 10",  mensLoc: "Poker",       womensLoc: "Poker"       },
];

// Auxiliary / Support slots
// NOTE: Placement order is now defined in the skill (target-derivation.ts / DEFAULT_PLACEMENT_ORDER)
// and re-exported here for backward compatibility. Support slots SP1/SP2 have fixed positions
// after Trash per the operator's required fill sequence.
export const DEFAULT_AUX_DEFS: AuxDef[] = [
  { key: "Z9SR", label: "Z9 SR",     locations: ["Z9 Smoking Room"] },
  { key: "ADM",  label: "ADMIN",     locations: ["Floor Admin"]     },
  { key: "TR1",  label: "TRASH 1",   locations: ["West Trash Run"]  },
  { key: "TR2",  label: "TRASH 2",   locations: ["East Trash Run"]  },
  { key: "SP1",  label: "SUPPORT 1", locations: ["Float Support"]   },
  { key: "SP2",  label: "SUPPORT 2", locations: ["Float Support"]   },
];

// Fallback accents for operator-added AUX slots (cycle through these so they
// don't all collapse to the same gray).
export const EXTRA_AUX_COLORS = ["#6B7280", "#0EA5E9", "#A855F7", "#16A34A", "#DC2626"];

// Per-zone identity glyphs — match the Golden's symbol-per-zone treatment.
export const ZONE_ICONS: Record<string, string> = {
  Z1:  "★", // ★ star
  Z2:  "◆", // ◆ diamond
  Z3:  "▲", // ▲ triangle up
  Z4:  "■", // ■ square
  Z5:  "⬟", // ⬟ black pentagon
  Z6:  "♥", // ♥ heart
  Z7:  "●", // ● circle
  Z8:  "◐", // ◐ half-disc
  Z9:  "☾", // ☾ moon
  Z10: "✚", // ✚ heavy cross
};

// RR cards reuse the zone glyph of the area they serve.
export const RR_ICONS: Record<number, string> = {
  1:  "★", // ★ — RR 1+2 paired with the Z1/Z2 zone identity
  6:  "♥", // ♥
  7:  "●", // ●
  8:  "◐", // ◐
  10: "✚", // ✚
};

// AUX glyphs — chosen to evoke each AUX role without conflicting with the
// zone glyphs. Operator-added AUX slots fall back to a generic ✦.
export const AUX_ICONS: Record<string, string> = {
  Z9SR: "☾", // ☾ moon (mirrors Z9)
  ADM:  "❖", // ❖ four-pointed-star (admin / paperwork)
  TR1:  "✖", // ✖ heavy cross (trash route)
  TR2:  "✖",
  SP1:  "✦", // ✦ four-pointed star
  SP2:  "✦",
};
export const getAuxIcon = (key: string) => AUX_ICONS[key] || "✦";

// Exact Golden palette (eyeballed from friday_golden_zoneCardSheet.png)
export const ZONE_COLORS: Record<string, string> = {
  Z1:  '#B89708', // gold
  Z2:  '#B89708', // gold — matches Z1 (Main Entry area)
  Z3:  '#E53935', // red
  Z4:  '#E53935', // red
  Z5:  '#E53935', // red
  Z6:  '#B7679A', // magenta
  Z7:  '#1976D2', // blue
  Z8:  '#6B5346', // brown
  Z9:  '#E53935', // red
  Z10: '#43A047', // green
};

export const getZoneColor = (key: string) => ZONE_COLORS[key] || '#6B7280';

// RR accent — mirrors the zone color of the area each RR serves
export const RR_COLORS: Record<number, string> = {
  1:  '#B89708', // RR 1+2 — gold (Main Entry, paired with Z1/Z2)
  6:  '#B7679A', // RR 6  — magenta (Slots East, matches Z6)
  7:  '#1976D2', // RR 7  — blue (High Limit, matches Z7)
  8:  '#6B5346', // RR 8  — brown (Table Games, paired with Z8)
  10: '#43A047', // RR 10 — green (Poker, paired with Z10)
};
export const getRRAccent = (num: number) => RR_COLORS[num] || '#6B7280';

// AUX accent palette
export const AUX_COLORS: Record<string, string> = {
  Z9SR: '#E53935', // red    (same as Z9)
  ADM:  '#B7679A', // magenta
  TR1:  '#FB8C00', // orange
  TR2:  '#FB8C00', // orange
  SP1:  '#1976D2', // blue
  SP2:  '#1976D2', // blue (kept in palette; SP2 is still a valid key if added back)
};
// Operator-added slots (keys like "AUX6", "AUX7") fall through to a stable
// color derived from the trailing digits so each added slot is visually
// distinct without needing a color picker yet.
export const getAuxAccent = (key: string): string => {
  if (AUX_COLORS[key]) return AUX_COLORS[key];
  const m = key.match(/(\d+)$/);
  const idx = m ? parseInt(m[1], 10) : 0;
  return EXTRA_AUX_COLORS[idx % EXTRA_AUX_COLORS.length];
};

// Break-group state model:
//   0 (or no row) = off the break sheet this shift ("–" badge) — used for overlaps
//                   and anyone deliberately not put on the break rotation.
//   1/2/3         = numeric break group.
// Cycle order is 1 → 2 → 3 → – → 1. Choosing "–" removes the break record.
export type BreakGroup = 0 | 1 | 2 | 3;

export const nextBreakGroup = (cur: BreakGroup): BreakGroup => {
  // 1→2, 2→3, 3→0 (off), 0→1
  if (cur === 0) return 1;
  if (cur === 3) return 0;
  return ((cur + 1) as BreakGroup);
};

/** Height in px of a CoverageBar row — shared between ZoneCard and CoverageBar. */
export const COVERAGE_BAR_H = 17;
