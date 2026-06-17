/**
 * Per-slot break group resolution for placement cards + header counters.
 *
 * Sudo "Card Defaults" (slot_defaults) are the baseline for every night.
 * zone_assignments.break_group, when non-null, is an explicit operator override
 * (including 0 = off the break sheet). NULL in DB means inherit the default.
 */

import { dbToUi } from "./slot-keys";
import type { SlotDefault } from "./data";
import { graveBreakGroupSlotDefaults } from "./graveBreakGroupDefaults";

import { BREAK_GROUP_OVERLAPS } from "./constants";

export type BreakGroupValue = 0 | 1 | 2 | 3 | typeof BREAK_GROUP_OVERLAPS;

export type SlotDefaultBreakMap = Map<string, BreakGroupValue>;

export function slotDefaultLookupKey(
  dbSlotKey: string,
  rrSide: string | null | undefined,
): string {
  return `${dbSlotKey}|${rrSide ?? ""}`;
}

export function buildSlotDefaultBreakMap(
  defaults: SlotDefault[],
): SlotDefaultBreakMap {
  const map = new Map<string, BreakGroupValue>();
  for (const d of defaults) {
    map.set(
      slotDefaultLookupKey(d.slotKey, d.rrSide),
      d.defaultBreakGroup as BreakGroupValue,
    );
  }
  // DB rows win; fill any missing slots from the canonical GRAVE map.
  for (const d of graveBreakGroupSlotDefaults()) {
    const key = slotDefaultLookupKey(d.slotKey, d.rrSide);
    if (!map.has(key)) {
      map.set(key, d.defaultBreakGroup as BreakGroupValue);
    }
  }
  return map;
}

/** Serializable map for web worker postMessage. */
export function slotDefaultBreakMapToRecord(
  map: SlotDefaultBreakMap,
): Record<string, BreakGroupValue> {
  const out: Record<string, BreakGroupValue> = {};
  map.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export function slotDefaultBreakMapFromRecord(
  rec: Record<string, number> | undefined | null,
): SlotDefaultBreakMap {
  const map = new Map<string, BreakGroupValue>();
  if (!rec) return map;
  for (const [k, v] of Object.entries(rec)) {
    if (v === 0 || v === 1 || v === 2 || v === 3 || v === BREAK_GROUP_OVERLAPS) {
      map.set(k, v);
    }
  }
  return map;
}

/**
 * Pill value for a slot tonight.
 * Explicit stored break_group wins; otherwise sudo card default.
 */
export function resolveEffectiveBreakGroup(
  storedBreakGroup: number | null | undefined,
  dbSlotKey: string,
  rrSide: string | null | undefined,
  defaults: SlotDefaultBreakMap,
): BreakGroupValue {
  if (storedBreakGroup !== null && storedBreakGroup !== undefined) {
    const n = Number(storedBreakGroup);
    if (n === 0 || n === 1 || n === 2 || n === 3 || n === BREAK_GROUP_OVERLAPS) {
      return n as BreakGroupValue;
    }
  }
  const def = defaults.get(slotDefaultLookupKey(dbSlotKey, rrSide));
  if (def !== undefined) return def;
  return 0;
}

export type RawAssignmentForBreak = {
  slotKey: string;
  slotType?: string;
  rrSide?: string | null;
  tmId?: string | null;
  tmName?: string;
  breakGroup?: number | null;
};

/** Map DB assignment rows → UI keys with resolved break pills. */
export function enrichAssignmentsWithBreakGroups(
  dbAssignments: RawAssignmentForBreak[] | undefined | null,
  defaults: SlotDefaultBreakMap,
): Record<
  string,
  {
    tmId: string;
    tmName: string;
    breakGroup: BreakGroupValue;
    breakGroupExplicit?: boolean;
  }
> {
  const assignments: Record<string, any> = {};
  if (!Array.isArray(dbAssignments)) return assignments;

  for (const row of dbAssignments) {
    if (!row.tmId) continue;
    try {
      const uiKey = dbToUi(
        row.slotKey,
        row.slotType ?? "zone",
        row.rrSide ?? null,
      );
      if (uiKey.startsWith("UNK:")) continue;

      const explicit =
        row.breakGroup !== null && row.breakGroup !== undefined;
      const breakGroup = resolveEffectiveBreakGroup(
        row.breakGroup,
        row.slotKey,
        row.rrSide,
        defaults,
      );

      assignments[uiKey] = {
        tmId: row.tmId,
        tmName: row.tmName || row.tmId,
        breakGroup,
        ...(explicit ? { breakGroupExplicit: true } : {}),
      };
    } catch {
      // skip malformed rows
    }
  }
  return assignments;
}