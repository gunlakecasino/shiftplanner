/**
 * Batch Planner client surface — RETIRED.
 *
 * Live writes must go Run Engine → Draft → Apply. These wrappers throw
 * immediately and never POST. The mutations route also returns 410.
 *
 * Heavy engine logic remains in sudoBatchPlanner.server.ts for history only.
 */

import {
  BATCH_PLANNER_RETIRED_ERROR,
} from "./batchPlannerRetired";

export interface BatchNightResult {
  nightId: string;
  nightDate: string;
  dayName: string;
  status: "ok" | "skip" | "error";
  assigned: number;
  preserved: number;
  unfilled: number;
  notes: string[];
  errorMessage?: string;
}

export interface BatchWeekResult {
  weekId: string;
  weekEnding: string;
  nights: BatchNightResult[];
  totalAssigned: number;
  totalPreserved: number;
  totalUnfilled: number;
}

export interface BatchRunOptions {
  skipFilledNights?: boolean;
  requireSchedule?: boolean;
  filterBySchedule?: boolean;
}

function retired(): never {
  throw new Error(BATCH_PLANNER_RETIRED_ERROR);
}

/** Retired — throws. Use Run Engine → Draft → Apply. */
export async function batchRunEngineForWeek(
  _weekId: string,
  _options: BatchRunOptions = {},
): Promise<BatchWeekResult> {
  retired();
}

/** Retired — throws. Use Run Engine → Draft → Apply. */
export async function batchRunEngineForNight(
  _nightId: string,
  _options: BatchRunOptions = {},
): Promise<BatchNightResult> {
  retired();
}

/** Retired — throws. */
export async function listNightsForWeek(
  _weekId: string,
): Promise<
  Array<{ nightId: string; nightDate: string; dayName: string; assignmentCount: number }>
> {
  retired();
}

/** Retired — throws. */
export async function listWeeksWithNights(): Promise<
  Array<{ weekId: string; weekEnding: string; weekLabel: string; nightCount: number }>
> {
  retired();
}
