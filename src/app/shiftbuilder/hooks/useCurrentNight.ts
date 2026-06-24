"use client";

import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { fetchNightCoreData } from "./fetchNightCoreData";
import { fetchNightSecondaryData } from "./fetchNightSecondaryData";

/**
 * useCurrentNight
 *
 * Full TanStack Query commitment for the currently selected GRAVE night.
 * Replaces the manual useEffect + many setState calls with proper caching,
 * optimistic updates, and background refetching.
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
    // Long stale window keeps UI stable during live session; we rely on patches + server busts.
    // refetchOnMount: 'always' ensures hard refresh / remount sees latest server data
    // immediately (paired with { expire: 0 } revalidates after edits).
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
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
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    enabled: coreEnabled,
  });

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