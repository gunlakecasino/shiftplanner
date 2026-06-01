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

import type { AuxDef } from "./placement";

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
}

/**
 * buildAssignmentsRecord
 * The mapping that used to live inside useCurrentNight coreQuery.
 * Pure and fast — ideal for worker.
 */
export function buildAssignmentsRecord(dbAssignments: any[] | undefined | null): Record<string, any> {
  const assignments: Record<string, any> = {};
  if (!Array.isArray(dbAssignments)) {
    return assignments; // defensive: nothing to process
  }
  dbAssignments.forEach((row: any) => {
    try {
      const uiKey = row.slotKey;
      if (row.tmId) {
        assignments[uiKey] = {
          tmId: row.tmId,
          tmName: row.tmName || row.tmId,
          breakGroup: row.breakGroup ?? 0,
        };
      }
    } catch {}
  });
  return assignments;
}

/**
 * computeBreakCounts
 * Was a useMemo in the giant client (and now also in the isolated board).
 * Moving the source of truth here lets a worker pre-compute it.
 */
export function computeBreakCounts(assignments: Record<string, any> | undefined | null): BreakCounts {
  const counts: BreakCounts = { 1: 0, 2: 0, 3: 0 };
  if (!assignments) return counts;
  Object.values(assignments).forEach((a: any) => {
    if (!a?.tmName) return;
    const g = (a.breakGroup ?? 0) as 1 | 2 | 3;
    if (g === 1 || g === 2 || g === 3) counts[g]++;
  });
  return counts;
}

export function computeInRotationCount(counts: BreakCounts): number {
  return counts[1] + counts[2] + counts[3];
}

/**
 * prepareBreaksWaveData
 * The expensive IIFE + helpers that lived inside the breaks view render.
 * Now pure + memoizable. A worker can return the pre-shaped wave columns.
 */
export interface WaveItem {
  slotKey: string;
  type: "zone" | "rr" | "aux";
  tmName: string;
  notPlaced?: boolean;
}

export interface WaveColumn {
  wave: 1 | 2 | 3;
  count: number;
  items: WaveItem[];
}

export function prepareBreaksWaveData(
  assignments: Record<string, any> | undefined | null,
  auxDefs: AuxDef[] = []
): WaveColumn[] {
  if (!assignments) return [];
  const slotRefType = (ref: string | null): "zone" | "rr" | "aux" => {
    if (!ref) return "zone";
    if (ref.startsWith("MRR") || ref.startsWith("WRR")) return "rr";
    if (/^Z\d+$/.test(ref)) return "zone";
    return "aux";
  };

  return [1, 2, 3].map((wave) => {
    const items = Object.entries(assignments)
      .map(([slotKey, a]: [string, any]) => {
        if (!a?.tmId || a.breakGroup !== wave) return null;
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
