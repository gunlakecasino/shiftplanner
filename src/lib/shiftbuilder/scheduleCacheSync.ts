import type { QueryClient } from "@tanstack/react-query";
import {
  revalidateNightBoardCaches,
  revalidateScheduledRosterCache,
} from "./revalidateOpsCache";

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

/** Invalidate core + secondary TanStack caches for one day or the whole week. */
export async function invalidateNightBoardQueries(
  queryClient: QueryClient,
  isoDate?: string,
): Promise<void> {
  if (isoDate) {
    await queryClient.invalidateQueries({ queryKey: ["nightCore", isoDate] });
    await queryClient.invalidateQueries({ queryKey: ["nightSecondary", isoDate] });
    return;
  }
  await queryClient.invalidateQueries({ queryKey: ["nightCore"] });
  await queryClient.invalidateQueries({ queryKey: ["nightSecondary"] });
}

/**
 * Call after placement, task, break, border, or notes mutations.
 * Busts server unstable_cache and optional in-tab TanStack queries.
 */
export async function notifyNightBoardChanged(
  queryClient?: QueryClient | null,
  isoDate?: string,
): Promise<void> {
  if (queryClient) {
    await invalidateNightBoardQueries(queryClient, isoDate);
  }
  try {
    await revalidateNightBoardCaches(isoDate);
  } catch (e) {
    console.warn("[scheduleCacheSync] night board revalidate failed (non-fatal)", e);
  }
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
  try {
    await revalidateScheduledRosterCache();
  } catch (e) {
    console.warn("[scheduleCacheSync] server cache revalidate failed (non-fatal)", e);
  }
  broadcastGravesDefaultScheduleChanged();
}