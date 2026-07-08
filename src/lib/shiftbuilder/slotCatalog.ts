// Canonical, reusable slot vocabulary for assigning work to a location
// (zone / restroom / aux / overlap). DB-keyed to match ops_work_items.slot_key /
// slot_type / rr_side and the night board. Mirrors the slot derivation in
// DefaultsTab.buildSlotDefs so a task's slot lines up with its card.

import {
  ZONE_DEFS,
  RR_DEFS,
  AUX_ROLE_PRESETS,
} from "./constants";
import type { AuxRole } from "./placement";

export type SlotCatalogSection = "zone" | "rr" | "aux" | "am-overlap" | "pm-overlap";

export interface SlotCatalogEntry {
  /** Stable option value: `${slotKey}|${rrSide}` (rrSide '' for non-RR). */
  value: string;
  slotKey: string; // DB key: zone_1, rr_6, admin, overlap_am_0 …
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide: "" | "mens" | "womens";
  label: string;
  section: SlotCatalogSection;
}

/** DB slot_key for an aux role (matches DefaultsTab ROLE_DB_KEYS). */
const AUX_ROLE_DB_KEYS: Record<string, string> = {
  z9sr: "z9_sr",
  admin: "admin",
  trash: "trash_1",
  support: "support_1",
};

function rrDbKey(num: number): string {
  return num === 1 ? "rr_1_2" : `rr_${num}`;
}

function buildCatalog(): SlotCatalogEntry[] {
  const out: SlotCatalogEntry[] = [];

  // Zones
  for (const z of ZONE_DEFS) {
    const num = z.key.replace("Z", "");
    out.push({
      value: `zone_${num}|`,
      slotKey: `zone_${num}`,
      slotType: "zone",
      rrSide: "",
      label: `Zone ${num}`,
      section: "zone",
    });
  }

  // Restrooms — men's then women's per RR number
  for (const rr of RR_DEFS) {
    const dbKey = rrDbKey(rr.num);
    out.push({
      value: `${dbKey}|mens`,
      slotKey: dbKey,
      slotType: "rr",
      rrSide: "mens",
      label: `${rr.label} (Men's)`,
      section: "rr",
    });
    out.push({
      value: `${dbKey}|womens`,
      slotKey: dbKey,
      slotType: "rr",
      rrSide: "womens",
      label: `${rr.label} (Women's)`,
      section: "rr",
    });
  }

  // AUX roles
  for (const [role, preset] of Object.entries(AUX_ROLE_PRESETS)) {
    const dbKey = AUX_ROLE_DB_KEYS[role] ?? role;
    const label = preset.label ?? preset.labelBase ?? role;
    out.push({
      value: `${dbKey}|`,
      slotKey: dbKey,
      slotType: "aux",
      rrSide: "",
      label,
      section: "aux",
    });
  }

  // AM + PM overlaps — 6 cards each
  for (let i = 0; i < 6; i++) {
    out.push({
      value: `overlap_am_${i}|`,
      slotKey: `overlap_am_${i}`,
      slotType: "overlap",
      rrSide: "",
      label: `AM Overlap ${i + 1}`,
      section: "am-overlap",
    });
  }
  for (let i = 0; i < 6; i++) {
    out.push({
      value: `overlap_pm_${i}|`,
      slotKey: `overlap_pm_${i}`,
      slotType: "overlap",
      rrSide: "",
      label: `PM Overlap ${i + 1}`,
      section: "pm-overlap",
    });
  }

  return out;
}

export const SLOT_CATALOG: SlotCatalogEntry[] = buildCatalog();

/** Ordered sections for grouped <optgroup> rendering. */
export const SLOT_CATALOG_SECTIONS: Array<{ id: SlotCatalogSection; label: string }> = [
  { id: "zone", label: "Zones" },
  { id: "rr", label: "Restrooms" },
  { id: "aux", label: "AUX / Support" },
  { id: "am-overlap", label: "AM Overlaps" },
  { id: "pm-overlap", label: "PM Overlaps" },
];

const BY_VALUE = new Map(SLOT_CATALOG.map((e) => [e.value, e]));

/** The option value for a stored (slotKey, rrSide) pair. */
export function slotValue(slotKey: string | null, rrSide: string | null): string {
  if (!slotKey) return "";
  return `${slotKey}|${rrSide ?? ""}`;
}

/** Resolve an option value back to its catalog entry (slotKey/slotType/rrSide). */
export function slotEntryFromValue(value: string): SlotCatalogEntry | null {
  return BY_VALUE.get(value) ?? null;
}

/** Human label for a stored (slotKey, rrSide), or null if not a known slot. */
export function slotCatalogLabel(slotKey: string | null, rrSide: string | null): string | null {
  if (!slotKey) return null;
  return BY_VALUE.get(slotValue(slotKey, rrSide))?.label ?? null;
}

/**
 * Authoritative (slotKey, slotType, rrSide) triple for a stored slotKey + rrSide,
 * looked up from the catalog. Used server-side so a partial/inconsistent client
 * payload can't corrupt the row. Returns all-null for an empty slotKey.
 */
export function resolveSlotTriple(
  slotKey: string | null | undefined,
  rrSide: string | null | undefined,
): { slotKey: string | null; slotType: string | null; rrSide: string | null } {
  if (!slotKey) return { slotKey: null, slotType: null, rrSide: null };
  const entry = BY_VALUE.get(slotValue(slotKey, rrSide ?? null));
  if (entry) return { slotKey: entry.slotKey, slotType: entry.slotType, rrSide: entry.rrSide || null };
  // Unknown to the catalog — keep the slotKey, best-effort type unknown.
  return { slotKey, slotType: null, rrSide: rrSide || null };
}

/** DB slot key for an aux role (falls back to a UI/legacy key for custom aux). */
export function auxDbSlotKey(role: string | null | undefined, fallback: string): string {
  return (role && AUX_ROLE_DB_KEYS[role]) || fallback;
}

/** DB slot composite key for a restroom side, e.g. rrDbSlotComposite(6, "mens") → "rr_6|mens". */
export function rrDbSlotComposite(num: number, rrSide: "mens" | "womens"): string {
  return `${rrDbKey(num)}|${rrSide}`;
}

export type { AuxRole };
