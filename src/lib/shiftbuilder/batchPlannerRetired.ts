/**
 * Batch Planner is retired. Live writes must go Run Engine → Draft → Apply.
 * Keep this helper as the single fail-closed message/status so the mutations
 * route, client wrappers, and tests cannot drift.
 */

export const BATCH_PLANNER_RETIRED_ERROR =
  "Batch Planner retired — use Run Engine → Draft → Apply";

export const BATCH_PLANNER_RETIRED_STATUS = 410;

export const RETIRED_BATCH_PLANNER_ACTIONS = [
  "batch_run_engine_week",
  "batch_run_engine_night",
  "list_batch_weeks",
  "list_batch_nights",
] as const;

export type RetiredBatchPlannerAction =
  (typeof RETIRED_BATCH_PLANNER_ACTIONS)[number];

export function isRetiredBatchPlannerAction(
  action: string,
): action is RetiredBatchPlannerAction {
  return (RETIRED_BATCH_PLANNER_ACTIONS as readonly string[]).includes(action);
}

export function retiredBatchPlannerResponse(): {
  error: string;
  status: number;
} {
  return {
    error: BATCH_PLANNER_RETIRED_ERROR,
    status: BATCH_PLANNER_RETIRED_STATUS,
  };
}
