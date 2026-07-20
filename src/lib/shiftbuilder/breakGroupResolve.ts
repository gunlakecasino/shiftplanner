/**
 * Per-slot break group resolution for placement cards + header counters.
 *
 * Sudo "Card Defaults" (slot_defaults) are the effective break groups every
 * night. Legacy per-night values may remain stored, but no longer override the
 * defaults. A TM marked OL Break on the active default-schedule row resolves
 * to the overlap group independently of the slot default.
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
  for (const [k, v] of Object.entries(rec ?? {})) {
    if (v === 0 || v === 1 || v === 2 || v === 3 || v === BREAK_GROUP_OVERLAPS) {
      map.set(k, v);
    }
  }
  for (const d of graveBreakGroupSlotDefaults()) {
    const key = slotDefaultLookupKey(d.slotKey, d.rrSide);
    if (!map.has(key)) {
      map.set(key, d.defaultBreakGroup as BreakGroupValue);
    }
  }
  return map;
}

/**
 * Pill value for a slot tonight.
 * Always resolve from the card default. The stored argument remains in the
 * signature while legacy assignment payloads are phased out.
 */
export function resolveEffectiveBreakGroup(
  _storedBreakGroup: number | null | undefined,
  dbSlotKey: string,
  rrSide: string | null | undefined,
  defaults: SlotDefaultBreakMap,
): BreakGroupValue {
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
  additionalCoverageSlots?: string[] | null;
};

/** Map DB assignment rows → UI keys with resolved break pills. */
export function enrichAssignmentsWithBreakGroups(
  dbAssignments: RawAssignmentForBreak[] | undefined | null,
  defaults: SlotDefaultBreakMap,
  overlapBreakTmIds: ReadonlySet<string> = new Set(),
): Record<
  string,
  {
    tmId: string;
    tmName: string;
    breakGroup: BreakGroupValue;
    breakGroupExplicit?: boolean;
    additionalCoverageSlots: string[];
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

      const breakGroup = overlapBreakTmIds.has(row.tmId)
        ? BREAK_GROUP_OVERLAPS
        : resolveEffectiveBreakGroup(
            row.breakGroup,
            row.slotKey,
            row.rrSide,
            defaults,
          );

      assignments[uiKey] = {
        tmId: row.tmId,
        tmName: row.tmName || row.tmId,
        breakGroup,
        additionalCoverageSlots: Array.isArray(row.additionalCoverageSlots)
          ? [...row.additionalCoverageSlots]
          : [],
      };
    } catch {
      // skip malformed rows
    }
  }
  return assignments;
}
