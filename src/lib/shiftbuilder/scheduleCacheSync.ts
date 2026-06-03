import type { QueryClient } from "@tanstack/react-query";

/** Fired after graves_default_schedule edits so open ShiftBuilder tabs refresh. */
export const GRAVES_DEFAULT_SCHEDULE_CHANGED_EVENT =
  "shiftbuilder:graves-default-schedule-changed";

export function broadcastGravesDefaultScheduleChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GRAVES_DEFAULT_SCHEDULE_CHANGED_EVENT));
}

/** Invalidate every cached night (all days in the operational week). */
export async function invalidateNightCoreQueries(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["nightCore"] });
}

/**
 * Call after any graves default schedule mutation.
 * Always broadcasts (cross-tab / cross–QueryClient). Also invalidates when a client is available.
 */
export async function notifyGravesDefaultScheduleChanged(
  queryClient?: QueryClient | null,
): Promise<void> {
  if (queryClient) {
    await invalidateNightCoreQueries(queryClient);
  }
  broadcastGravesDefaultScheduleChanged();
}