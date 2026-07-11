/**
 * Batch Planner client surface — all privileged work goes through
 * postOpsMutation → /api/shiftbuilder/mutations (canRunEngine + admin server).
 *
 * Heavy engine logic lives in sudoBatchPlanner.server.ts (never imported here
 * into the browser static graph).
 */

import { postOpsMutation } from "./opsMutationClient";

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

function assertBrowser(fn: string): void {
  if (typeof window === "undefined") {
    throw new Error(`${fn} is browser-only; use *Server via mutations route`);
  }
}

/** Run weighted/unified engine for every night in a week (session + canRunEngine). */
export async function batchRunEngineForWeek(
  weekId: string,
  options: BatchRunOptions = {},
): Promise<BatchWeekResult> {
  assertBrowser("batchRunEngineForWeek");
  return postOpsMutation<BatchWeekResult>("batch_run_engine_week", {
    weekId,
    options,
  });
}

/** Run engine for a single night (session + canRunEngine). */
export async function batchRunEngineForNight(
  nightId: string,
  options: BatchRunOptions = {},
): Promise<BatchNightResult> {
  assertBrowser("batchRunEngineForNight");
  return postOpsMutation<BatchNightResult>("batch_run_engine_night", {
    nightId,
    options,
  });
}

/** Nights for Batch Planner week list. */
export async function listNightsForWeek(
  weekId: string,
): Promise<
  Array<{ nightId: string; nightDate: string; dayName: string; assignmentCount: number }>
> {
  assertBrowser("listNightsForWeek");
  const res = await postOpsMutation<{
    nights: Array<{
      nightId: string;
      nightDate: string;
      dayName: string;
      assignmentCount: number;
    }>;
  }>("list_batch_nights", { weekId });
  return res.nights ?? [];
}

/** Weeks that have nights (Batch Planner picker). */
export async function listWeeksWithNights(): Promise<
  Array<{ weekId: string; weekEnding: string; weekLabel: string; nightCount: number }>
> {
  assertBrowser("listWeeksWithNights");
  const res = await postOpsMutation<{
    weeks: Array<{
      weekId: string;
      weekEnding: string;
      weekLabel: string;
      nightCount: number;
    }>;
  }>("list_batch_weeks", {});
  return res.weeks ?? [];
}
