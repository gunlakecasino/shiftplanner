// ── ShiftBuilder constants ────────────────────────────────────────────────────
// All module-level definitions extracted from ShiftBuilderClient.tsx.
// Do NOT re-declare these in the component files — import from here.

import type { AuxDef, AuxRole } from "./placement";

// Zone identities — labels are rendered uppercase in the card per the Golden
export const ZONE_DEFS = [
  { key: "Z1",  label: "ZONE 1" },
  { key: "Z2",  label: "ZONE 2" },
  { key: "Z3",  label: "ZONE 3" },
  { key: "Z4",  label: "ZONE 4" },
  { key: "Z5",  label: "ZONE 5" },
  { key: "Z6",  label: "ZONE 6" },
  { key: "Z7",  label: "ZONE 7" },
  { key: "Z8",  label: "ZONE 8" },
  { key: "Z9",  label: "ZONE 9" },
  { key: "Z10", label: "ZONE 10" },
];

/** Preferred visual layout order for the ZONES grid in the builder canvas (and mirrored in print book/overview for consistency).
 *  Produces:
 *    Row 1: Z1 | Z3 | Z4 | Z5 | Z9
 *    Row 2: Z2 | Z6 | Z7 | Z8 | Z10
 */
export const ZONE_VISUAL_ORDER: string[] = ["Z1", "Z3", "Z4", "Z5", "Z9", "Z2", "Z6", "Z7", "Z8", "Z10"];

// Restrooms — labels match the Golden ("RR 1+2", "RR 6", etc.)
export const RR_DEFS = [
  { num: 1,  label: "RR 1+2" },
  { num: 6,  label: "RR 6" },
  { num: 7,  label: "RR 7" },
  { num: 8,  label: "RR 8" },
  { num: 10, label: "RR 10" },
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
export const EXTRA_AUX_COLORS = ["#ffcc00", "#34c759", "#30b0c7", "#5ac8fa", "#5856d6", "#a2845e"]; // iOS yellow, green, teal, cyan, indigo, brown etc.

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

// iOS 26 system colors for card title accents / highlights (from design tokens)
// Yellow, red, pink, blue, brown, green etc. respectively for visual identity
export const ZONE_COLORS: Record<string, string> = {
  Z1:  '#ffcc00', // yellow (gold/entry)
  Z2:  '#ffcc00', // yellow — matches Z1
  Z3:  '#ff3b30', // red
  Z4:  '#ff3b30', // red
  Z5:  '#ff3b30', // red
  Z6:  '#ff2d55', // pink
  Z7:  '#007aff', // blue
  Z8:  '#a2845e', // brown
  Z9:  '#ff3b30', // red
  Z10: '#34c759', // green
};

export const getZoneColor = (key: string) => ZONE_COLORS[key] || '#6B7280';

/** Vibrant gold-yellow ink on white cards (pairs with #ffcc00 stripe). */
export const SB_GOLD_INK = "#d4a800";

/** Readable header ink for bright display accents (e.g. iOS yellow on white cards). */
const CARD_ACCENT_INK: Record<string, string> = {
  "#ffcc00": SB_GOLD_INK,
  "#ffdb4d": SB_GOLD_INK,
};

export function cardAccentInk(displayColor: string): string {
  return CARD_ACCENT_INK[displayColor.trim().toLowerCase()] ?? displayColor;
}

export function isGoldAccent(displayColor: string): boolean {
  const key = displayColor.trim().toLowerCase();
  return key === "#ffcc00" || key === "#ffdb4d";
}

/** Slightly muted gold for coverage banners (less harsh than #ffcc00 stripe). */
export function coverageBarBg(displayColor: string): string {
  const key = displayColor.trim().toLowerCase();
  if (key === "#ffcc00" || key === "#ffdb4d") return "#D4A800";
  return displayColor;
}

export function getOverlapAccent(slotKey: string): string {
  if (slotKey.includes("-PM-")) return "#B45309";
  if (slotKey.includes("-AM-")) return "#059669";
  return "#B45309";
}

export function overlapSlotLabel(slotKey: string): string {
  const match = slotKey.match(/^OL-(PM|AM)-(\d+)$/);
  if (!match) return "Overlap";
  return `${match[1]} Overlap ${Number(match[2]) + 1}`;
}

// RR accent — mirrors the zone color of the area each RR serves (iOS 26 palette)
export const RR_COLORS: Record<number, string> = {
  1:  '#ffcc00', // yellow (Main Entry, paired with Z1/Z2)
  6:  '#ff2d55', // pink (Slots East, matches Z6)
  7:  '#007aff', // blue (High Limit, matches Z7)
  8:  '#a2845e', // brown (Table Games, paired with Z8)
  10: '#34c759', // green (Poker, paired with Z10)
};
export const getRRAccent = (num: number) => RR_COLORS[num] || '#6B7280';

// AUX accent palette — using iOS 26 colors for roles
export const AUX_ROLE_COLORS: Record<Exclude<AuxRole, "blank">, string> = {
  z9sr: "#ff3b30",   // red
  admin: "#ff2d55",  // pink
  trash: "#a2845e",  // brown
  support: "#007aff",// blue
};

export const AUX_COLORS: Record<string, string> = {
  Z9SR: "#ff3b30",
  ADM:  "#ff2d55",
  TR1:  "#a2845e",
  TR2:  "#a2845e",
  SP1:  "#007aff",
  SP2:  "#007aff",
};

export const getAuxAccentForRole = (role: AuxRole): string => {
  if (role === "blank") return "#d1d1d6"; // iOS gray-4 muted
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
//   0 (or no row) = off the break sheet this shift ("–" badge).
//   1/2/3         = grave break waves.
//   4 (OVERLAPS)  = overlaps break group — badge reads "OL".
// Cycle order is 1 → 2 → 3 → OL → – → 1. Choosing "–" removes the break record.
export const BREAK_GROUP_OVERLAPS = 4 as const;

export type BreakGroup = 0 | 1 | 2 | 3 | typeof BREAK_GROUP_OVERLAPS;

/** Break wave selector on the deployment board (not 0). */
export type BreakGroupFilter = 1 | 2 | 3 | typeof BREAK_GROUP_OVERLAPS;

/** Active GROUP filter — null means no filter (show full board). */
export type ActiveBreakGroupFilter = BreakGroupFilter | null;

export const BREAK_GROUP_FILTERS: BreakGroupFilter[] = [1, 2, 3, BREAK_GROUP_OVERLAPS];

export function breakGroupLabel(g: number): string {
  if (g === 0) return "–";
  if (g === BREAK_GROUP_OVERLAPS) return "OL";
  return String(g);
}

/** Header break mark for assignment cards (plain number, not a pill). */
export function breakHeaderMark(g: number): string {
  return breakGroupLabel(g);
}

export function isInBreakRotation(g: number): boolean {
  return g === 1 || g === 2 || g === 3 || g === BREAK_GROUP_OVERLAPS;
}

export const nextBreakGroup = (cur: BreakGroup): BreakGroup => {
  if (cur === 0) return 1;
  if (cur === 1) return 2;
  if (cur === 2) return 3;
  if (cur === 3) return BREAK_GROUP_OVERLAPS;
  return 0;
};

/** Whether a deployment slot should render under the active GROUP filter. */
export function shouldShowSlotForBreakFilter(
  slotKey: string,
  assignment: { tmId?: string | null; tmName?: string; breakGroup?: number } | undefined,
  filter: ActiveBreakGroupFilter,
): boolean {
  if (filter === null) return true;
  const g = assignment?.breakGroup ?? 0;
  const hasTm = !!(assignment?.tmId || assignment?.tmName);

  // Custom AUX slots are independent of main zone wave / break-group filters.
  // Always render them (whether assigned or not) so users can see/assign TMs to custom aux consistently.
  // Previously returning only hasTm could hide assigned cards under active filters.
  if (slotKey.toUpperCase().startsWith("AUX")) {
    return true;
  }

  if (filter === BREAK_GROUP_OVERLAPS) {
    if (slotKey.startsWith("OL-")) return true;
    return hasTm && g === BREAK_GROUP_OVERLAPS;
  }

  if (slotKey.startsWith("OL-")) return false;
  if (!hasTm) return false;
  return g === filter;
}

/** Height in px of a CoverageBar row — shared between ZoneCard and CoverageBar. */
export const COVERAGE_BAR_H = 19;

/** Label text size for coverage banners (builder + print/PDF). */
export const COVERAGE_BAR_FONT_SIZE = 10;
/** Slightly larger coverage label for Golden print / PDF export. */
export const COVERAGE_BAR_FONT_SIZE_PRINT = 11;
