"use client";

import type { QueryClient } from "@tanstack/react-query";
import { warmSupabaseConnection } from "@/lib/supabase";
import { initLiveCacheForNight, reconnectAllActiveLiveCache } from "./liveCache";

export type ShiftBuilderResumeOptions = {
  queryClient: QueryClient;
  nightId: string | null;
  dateKey: string;
};

let resumeInFlight: Promise<void> | null = null;

/**
 * Re-establish ShiftBuilder connectivity after idle / background / socket drop.
 * - Re-warms Supabase REST
 * - Re-subscribes assignment realtime
 * - Refetches the active night's query bundles
 */
export async function resumeShiftBuilderConnectivity(
  opts: ShiftBuilderResumeOptions,
): Promise<void> {
  if (resumeInFlight) return resumeInFlight;

  resumeInFlight = (async () => {
    const { queryClient, nightId, dateKey } = opts;

    try {
      await warmSupabaseConnection({ force: true });
    } catch (e) {
      console.warn("[shiftBuilderResume] warm failed (non-fatal)", e);
    }

    reconnectAllActiveLiveCache(queryClient);
    if (nightId) {
      initLiveCacheForNight(nightId, dateKey, queryClient);
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["nightCore", dateKey] }),
      queryClient.invalidateQueries({ queryKey: ["nightSecondary", dateKey] }),
      queryClient.invalidateQueries({ queryKey: ["night", dateKey] }),
    ]);
  })().finally(() => {
    resumeInFlight = null;
  });

  return resumeInFlight;
}