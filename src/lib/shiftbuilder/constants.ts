// ── ShiftBuilder constants ────────────────────────────────────────────────────
// All module-level definitions extracted from ShiftBuilderClient.tsx.
// Do NOT re-declare these in the component files — import from here.

import type { AuxDef, AuxRole } from "./placement";

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

// Flex aux row — per-night typed shells (see auxLayout.ts)
export const MAX_AUX_SLOTS = 10;

export const AUX_ROLE_PRESETS: Record<
  Exclude<AuxRole, "blank">,
  { label?: string; labelBase?: string; locations: string[] }
> = {
  z9sr: { label: "Z9 SR", locations: ["Z9 Smoking Room"] },
  admin: { label: "ADMIN", locations: ["Floor Admin"] },
  trash: { labelBase: "TRASH", locations: ["West Trash Run"] },
  support: { labelBase: "SUPPORT", locations: ["Float Support"] },
};

export function defaultLabelForAuxRole(role: AuxRole, nthAmongRole = 0): string {
  if (role === "blank") return "";
  const preset = AUX_ROLE_PRESETS[role as Exclude<AuxRole, "blank">];
  if (role === "trash" || role === "support") {
    return `${preset.labelBase ?? role} ${nthAmongRole + 1}`;
  }
  return preset.label ?? role.toUpperCase();
}

export const BLANK_AUX_DEFS: AuxDef[] = Array.from({ length: 6 }, (_, i) => ({
  key: `AUX${i + 1}`,
  role: "blank" as const,
  label: "",
  locations: [],
}));

/** @deprecated Legacy fixed layout — use BLANK_AUX_DEFS + per-night aux_layout */
export const DEFAULT_AUX_DEFS: AuxDef[] = [
  { key: "Z9SR", role: "z9sr", label: "Z9 SR", locations: ["Z9 Smoking Room"] },
  { key: "ADM", role: "admin", label: "ADMIN", locations: ["Floor Admin"] },
  { key: "TR1", role: "trash", label: "TRASH 1", locations: ["West Trash Run"] },
  { key: "TR2", role: "trash", label: "TRASH 2", locations: ["East Trash Run"] },
  { key: "SP1", role: "support", label: "SUPPORT 1", locations: ["Float Support"] },
  { key: "SP2", role: "support", label: "SUPPORT 2", locations: ["Float Support"] },
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
export const AUX_ROLE_ICONS: Record<Exclude<AuxRole, "blank">, string> = {
  z9sr: "☾",
  admin: "❖",
  trash: "✖",
  support: "✦",
};

export const AUX_ICONS: Record<string, string> = {
  Z9SR: "☾",
  ADM:  "❖",
  TR1:  "✖",
  TR2:  "✖",
  SP1:  "✦",
  SP2:  "✦",
};

export const getAuxIconForRole = (role: AuxRole): string =>
  role === "blank" ? "+" : AUX_ROLE_ICONS[role] ?? "✦";

export const getAuxIcon = (key: string, role?: AuxRole) => {
  if (role && role !== "blank") return getAuxIconForRole(role);
  return AUX_ICONS[key] || "✦";
};

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
export const AUX_ROLE_COLORS: Record<Exclude<AuxRole, "blank">, string> = {
  z9sr: "#E53935",
  admin: "#B7679A",
  trash: "#FB8C00",
  support: "#1976D2",
};

export const AUX_COLORS: Record<string, string> = {
  Z9SR: "#E53935",
  ADM:  "#B7679A",
  TR1:  "#FB8C00",
  TR2:  "#FB8C00",
  SP1:  "#1976D2",
  SP2:  "#1976D2",
};

export const getAuxAccentForRole = (role: AuxRole): string => {
  if (role === "blank") return "#9CA3AF";
  return AUX_ROLE_COLORS[role] ?? "#6B7280";
};

export const getAuxAccent = (key: string, role?: AuxRole): string => {
  if (role && role !== "blank") return getAuxAccentForRole(role);
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
