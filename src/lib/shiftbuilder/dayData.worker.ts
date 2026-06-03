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
  dbAssignments?: any[];
  breakRows?: any[];
  auxDefs?: AuxDef[];
  /** Pre-resolved UI assignments (preferred for break counts — includes sudo defaults). */
  assignments?: Record<string, any>;
  slotDefaultBreaks?: Record<string, number>;
}

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'PROCESS_NIGHT') {
    const {
      dbAssignments = [],
      breakRows = [],
      auxDefs = [],
      assignments: prebuiltAssignments,
      slotDefaultBreaks,
    } = payload as ProcessNightPayload;

    try {
      const hasPrebuilt =
        prebuiltAssignments && Object.keys(prebuiltAssignments).length > 0;
      const hasDb =
        Array.isArray(dbAssignments) && dbAssignments.length > 0;

      if (!hasPrebuilt && !hasDb) {
        self.postMessage({
          type: 'PROCESSED_NIGHT',
          payload: {
            assignments: {},
            breakCounts: { 1: 0, 2: 0, 3: 0 },
            waves: [],
          },
        });
        return;
      }

      const assignments = hasPrebuilt
        ? prebuiltAssignments!
        : buildAssignmentsRecord(dbAssignments, slotDefaultBreaks);
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
