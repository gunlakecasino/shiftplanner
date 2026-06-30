/**
 * processNightData.ts
 *
 * Pure, framework-agnostic processors for night/day data.
 * Extracted during the 2026 day-switch performance push (board isolation + worker prep).
 *
 * These can be called from:
 *   - The main thread (current useCurrentNight / ShiftBuilderBoard)
 *   - A Web Worker (future: offload assignment mapping + wave prep + scoring for iPad main-thread relief)
 *   - Server actions / edge for even faster cache hits
 *
 * Goal: Make the post-query CPU work on day arrival as cheap and offloadable as possible.
 */

import { BREAK_GROUP_OVERLAPS } from "./constants";
import type { AuxDef } from "./placement";
import {
  enrichAssignmentsWithBreakGroups,
  slotDefaultBreakMapFromRecord,
  type SlotDefaultBreakMap,
} from "./breakGroupResolve";

export interface RawAssignmentRow {
  slotKey: string;
  tmId?: string;
  tmName?: string;
  breakGroup?: number;
}

export interface ProcessedNightCore {
  nightId: string | null;
  assignments: Record<string, { tmId: string; tmName: string; breakGroup?: number }>;
  members: any[];
  scheduledTmIdsTonight: Set<string>;
}

export interface BreakCounts {
  1: number;
  2: number;
  3: number;
  4: number;
}

/**
 * buildAssignmentsRecord
 * The mapping that used to live inside useCurrentNight coreQuery.
 * Pure and fast — ideal for worker.
 */
export function buildAssignmentsRecord(
  dbAssignments: any[] | undefined | null,
  slotDefaults?: SlotDefaultBreakMap | Record<string, number>,
): Record<string, any> {
  const defaults =
    slotDefaults instanceof Map
      ? slotDefaults
      : slotDefaultBreakMapFromRecord(slotDefaults);
  return enrichAssignmentsWithBreakGroups(dbAssignments, defaults);
}

/**
 * computeBreakCounts
 * Was a useMemo in the giant client (and now also in the isolated board).
 * Moving the source of truth here lets a worker pre-compute it.
 */
export function computeBreakCounts(assignments: Record<string, any> | undefined | null): BreakCounts {
  const counts: BreakCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  if (!assignments) return counts;
  Object.entries(assignments).forEach(([slotKey, a]: [string, any]) => {
    if (!a?.tmId && !a?.tmName) return;
    if (slotKey.startsWith("OL-")) return;
    const g = a.breakGroup ?? 0;
    if (g === 1) counts[1]++;
    else if (g === 2) counts[2]++;
    else if (g === 3) counts[3]++;
    else if (g === BREAK_GROUP_OVERLAPS) counts[4]++;
  });
  return counts;
}

export function computeInRotationCount(counts: BreakCounts): number {
  return counts[1] + counts[2] + counts[3] + counts[4];
}

/**
 * prepareBreaksWaveData
 * The expensive IIFE + helpers that lived inside the breaks view render.
 * Now pure + memoizable. A worker can return the pre-shaped wave columns.
 */
export interface WaveItem {
  slotKey: string;
  type: "zone" | "rr" | "aux" | "overlap";
  tmName: string;
  notPlaced?: boolean;
}

export interface WaveColumn {
  wave: 1 | 2 | 3 | typeof BREAK_GROUP_OVERLAPS;
  count: number;
  items: WaveItem[];
}

export function prepareBreaksWaveData(
  assignments: Record<string, any> | undefined | null,
  auxDefs: AuxDef[] = []
): WaveColumn[] {
  if (!assignments) return [];
  const slotRefType = (ref: string | null): "zone" | "rr" | "aux" | "overlap" => {
    if (!ref) return "zone";
    if (ref.startsWith("OL-")) return "overlap";
    if (ref.startsWith("MRR") || ref.startsWith("WRR")) return "rr";
    if (/^Z\d+$/.test(ref)) return "zone";
    return "aux";
  };

  return ([1, 2, 3, BREAK_GROUP_OVERLAPS] as const).map((wave) => {
    const items = Object.entries(assignments)
      .map(([slotKey, a]: [string, any]) => {
        if (!a?.tmId || (a.breakGroup ?? 0) !== wave || slotKey.startsWith("OL-")) return null;
        return {
          slotKey,
          type: slotRefType(slotKey),
          tmName: a.tmName,
          notPlaced: a.notPlaced,
        } as WaveItem;
      })
      .filter(Boolean) as WaveItem[];

    return {
      wave: wave as 1 | 2 | 3,
      count: items.length,
      items,
    };
  });
}

/**
 * Full day data processor (entry point for worker).
 * In the future a worker can do:
 *   self.onmessage = (e) => {
 *     const result = processNightData(e.data);
 *     self.postMessage(result);
 *   };
 */
export interface ProcessNightDataInput {
  rawDbAssignments: any[];
  members?: any[];
  scheduledSet?: Set<string>;
  auxDefs?: AuxDef[];
}

export interface ProcessNightDataResult {
  assignments: Record<string, any>;
  breakCounts: BreakCounts;
  inRotation: number;
  waves: WaveColumn[];
}

export function processNightData(input: ProcessNightDataInput): ProcessNightDataResult {
  const assignments = buildAssignmentsRecord(input.rawDbAssignments);
  const breakCounts = computeBreakCounts(assignments);
  const inRotation = computeInRotationCount(breakCounts);
  const waves = prepareBreaksWaveData(assignments, input.auxDefs);

  return {
    assignments,
    breakCounts,
    inRotation,
    waves,
  };
}
