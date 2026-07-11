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
 * Re-establish ShiftBuilder connectivity after idle / background / network drop.
 * - Re-warms TLS to Supabase REST (non-ops ping)
 * - Re-registers poll status for the active night
 * - Refetches the active night's session API bundles
 *
 * KD-13: no Realtime re-subscribe — multi-operator sync is poll + invalidation.
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

let deepRefreshInFlight: Promise<void> | null = null;

/**
 * Deep refresh for the active grave night: bust server bundles, invalidate TanStack,
 * force refetch nightCore + nightSecondary, re-warm REST.
 */
export async function deepRefreshShiftBuilderDay(
  opts: ShiftBuilderResumeOptions,
): Promise<void> {
  if (deepRefreshInFlight) return deepRefreshInFlight;

  deepRefreshInFlight = (async () => {
    const { queryClient, nightId, dateKey } = opts;

    try {
      await fetch("/api/shiftbuilder/refresh-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ date: dateKey }),
      });
    } catch (e) {
      console.warn("[shiftBuilderResume] refresh-day API failed (non-fatal)", e);
    }

    await resumeShiftBuilderConnectivity({ queryClient, nightId, dateKey });

    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["nightCore", dateKey] }),
      queryClient.refetchQueries({ queryKey: ["nightSecondary", dateKey] }),
    ]);
  })().finally(() => {
    deepRefreshInFlight = null;
  });

  return deepRefreshInFlight;
}
