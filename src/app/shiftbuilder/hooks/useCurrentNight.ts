"use client";

import React from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { NIGHT_BOARD_POLL_MS } from "@/lib/shiftbuilder/liveCache";
import { fetchNightCoreData } from "./fetchNightCoreData";
import { fetchNightSecondaryData } from "./fetchNightSecondaryData";

/**
 * useCurrentNight
 *
 * Full TanStack Query commitment for the currently selected GRAVE night.
 * Replaces the manual useEffect + many setState calls with proper caching,
 * optimistic updates, and background refetching.
 *
 * KD-13 multi-operator sync: poll night bundles on an interval while the tab is
 * visible, plus mutation invalidation. Ops Realtime is retired (PR 11a).
 */
export type UseCurrentNightOptions = {
  /** When false, skips night-core + secondary fetches (e.g. unpublished history on /today). */
  enabled?: boolean;
  /** When true, night-core API enforces /today publish policy server-side. */
  todayPolicy?: boolean;
  /** Viewer role — server rejects unpublished nights; client clears stale day data. */
  publishedOnlyPolicy?: boolean;
};

export function useCurrentNight(selectedDay: DayDef, options?: UseCurrentNightOptions) {
  const queryClient = useQueryClient();
  const dateKey = formatLocalDateISO(selectedDay.date);
  const coreEnabled = options?.enabled !== false;

  const coreQuery = useQuery({
    queryKey: ["nightCore", dateKey],
    queryFn: () =>
      fetchNightCoreData(selectedDay, {
        todayPolicy: options?.todayPolicy,
        publishedOnlyPolicy: options?.publishedOnlyPolicy,
      }),
    enabled: coreEnabled,
    // Long stale window keeps UI stable during live session; poll + patches keep data fresh.
    // refetchOnMount: 'always' ensures hard refresh / remount sees latest server data
    // immediately (paired with { expire: 0 } revalidates after edits).
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: NIGHT_BOARD_POLL_MS,
    refetchIntervalInBackground: false,
    placeholderData: options?.publishedOnlyPolicy ? undefined : keepPreviousData,
  });

  const secondaryQuery = useQuery({
    queryKey: ["nightSecondary", dateKey],
    queryFn: () =>
      fetchNightSecondaryData(selectedDay, {
        publishedOnlyPolicy: options?.publishedOnlyPolicy,
      }),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: NIGHT_BOARD_POLL_MS,
    refetchIntervalInBackground: false,
    enabled: coreEnabled,
  });

  // Fail closed UX: surface session API failures (no silent empty board via anon fallback).
  React.useEffect(() => {
    if (!coreEnabled) return;
    if (coreQuery.isError) {
      toast.error("Failed to load night data — session API unavailable", {
        id: `night-core-error-${dateKey}`,
        description: "Check your connection and try again. Board will not use offline fallbacks.",
      });
      if (typeof window !== "undefined") {
        (window as any).__realtimeState = "OFFLINE";
      }
    } else if (coreQuery.isSuccess && typeof window !== "undefined") {
      (window as any).__realtimeState = "LIVE";
    }
  }, [coreEnabled, coreQuery.isError, coreQuery.isSuccess, dateKey]);

  React.useEffect(() => {
    if (!coreEnabled) return;
    if (secondaryQuery.isError) {
      toast.error("Failed to load night tasks/breaks — session API unavailable", {
        id: `night-secondary-error-${dateKey}`,
      });
    }
  }, [coreEnabled, secondaryQuery.isError, dateKey]);

  const combinedData = {
    ...coreQuery.data,
    ...secondaryQuery.data,
    accessBlocked: Boolean(
      (coreQuery.data as { accessBlocked?: boolean } | undefined)?.accessBlocked,
    ),
  };

  const fetchOptions = {
    todayPolicy: options?.todayPolicy,
    publishedOnlyPolicy: options?.publishedOnlyPolicy,
  };

  const prefetchNight = (date: Date) => {
    const prefetchDateKey = formatLocalDateISO(date);
    const dayDef = {
      date,
      index: 0,
      short: "",
      name: "",
      dateNum: date.getDate(),
      monthYear: "",
      color: "",
      meta: "",
    } as DayDef;

    queryClient.prefetchQuery({
      queryKey: ["nightCore", prefetchDateKey],
      queryFn: () => fetchNightCoreData(dayDef, fetchOptions),
      staleTime: 1000 * 60 * 5,
    });

    queryClient.prefetchQuery({
      queryKey: ["nightSecondary", prefetchDateKey],
      queryFn: () => fetchNightSecondaryData(dayDef, fetchOptions),
      staleTime: 1000 * 60 * 5,
    });
  };

  return {
    ...combinedData,
    isLoading: coreQuery.isLoading && !coreQuery.data,
    isFetching: coreQuery.isFetching || secondaryQuery.isFetching,
    error: coreQuery.error || secondaryQuery.error,
    prefetchNight,
    queryClient,
    isCoreLoading: coreQuery.isLoading,
    isCoreFetching: coreQuery.isFetching,
    /** True while nightCore is showing keepPreviousData from another day. */
    isCorePlaceholder: coreQuery.isPlaceholderData,
    isSecondaryLoading: secondaryQuery.isLoading,
  };
}
