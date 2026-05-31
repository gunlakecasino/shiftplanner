/**
 * dayData.worker.ts
 *
 * Web Worker for offloading day/night data post-processing.
 *
 * This moves CPU-heavy work (assignment mapping, break count calculation,
 * wave preparation for the break sheet) off the main thread.
 *
 * Especially valuable on iPad for fast day switching.
 */

import {
  buildAssignmentsRecord,
  computeBreakCounts,
  prepareBreaksWaveData,
} from './processNightData';

import type { AuxDef } from './placement';

export interface ProcessNightPayload {
  dbAssignments: any[];
  breakRows?: any[];
  auxDefs?: AuxDef[];
}

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'PROCESS_NIGHT') {
    const { dbAssignments, breakRows = [], auxDefs = [] } = payload as ProcessNightPayload;

    try {
      const assignments = buildAssignmentsRecord(dbAssignments);
      const breakCounts = computeBreakCounts(assignments);
      const waves = prepareBreaksWaveData(assignments, auxDefs);

      self.postMessage({
        type: 'PROCESSED_NIGHT',
        payload: {
          assignments,
          breakCounts,
          waves,
        },
      });
    } catch (err) {
      self.postMessage({
        type: 'PROCESS_ERROR',
        payload: { error: (err as Error).message },
      });
    }
  }
};

export {}; // Make this a module
