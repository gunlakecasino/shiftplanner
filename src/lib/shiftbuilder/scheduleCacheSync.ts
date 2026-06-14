import type { QueryClient } from "@tanstack/react-query";
import type { AuxDef } from "./placement";
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
 * Bust server bundle caches only — does NOT refetch TanStack queries.
 * Use after board mutations so optimistic UI is not overwritten by stale API data.
 */
export async function bustNightBoardServerCaches(isoDate?: string): Promise<void> {
  try {
    await revalidateNightBoardCaches(isoDate);
  } catch (e) {
    console.warn("[scheduleCacheSync] night board revalidate failed (non-fatal)", e);
  }
}

/** Keep TanStack nightCore auxDefs in sync after flex aux row edits. */
export function patchNightCoreAuxLayoutCache(
  queryClient: QueryClient,
  isoDate: string,
  auxDefs: AuxDef[],
): void {
  const patch = (old: { auxDefs?: AuxDef[] } | undefined) =>
    old ? { ...old, auxDefs } : old;
  queryClient.setQueryData(["nightCore", isoDate], patch);
}

/** Keep TanStack nightCore in sync with the live board store after drag/swap paths. */
export function patchNightCoreAssignmentsCache(
  queryClient: QueryClient,
  isoDate: string,
  assignments: Record<string, unknown>,
): void {
  const patch = (old: { assignments?: Record<string, unknown> } | undefined) =>
    old ? { ...old, assignments } : old;
  queryClient.setQueryData(["nightCore", isoDate], patch);
  queryClient.setQueryData(["night", isoDate], patch);
}

/** Keep TanStack nightSecondary tasks in sync after local task edits. */
export function patchNightSecondaryTasksCache(
  queryClient: QueryClient,
  isoDate: string,
  tasks: unknown[],
): void {
  queryClient.setQueryData(
    ["nightSecondary", isoDate],
    (old: { tasks?: unknown[] } | undefined) => (old ? { ...old, tasks } : old),
  );
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