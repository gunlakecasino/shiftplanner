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
};

export function useCurrentNight(selectedDay: DayDef, options?: UseCurrentNightOptions) {
  const queryClient = useQueryClient();
  const dateKey = formatLocalDateISO(selectedDay.date);
  const coreEnabled = options?.enabled !== false;

  const coreQuery = useQuery({
    queryKey: ["nightCore", dateKey],
    queryFn: () =>
      fetchNightCoreData(selectedDay, { todayPolicy: options?.todayPolicy }),
    enabled: coreEnabled,
    // Long stale window — optimistic patches + realtime own same-session freshness.
    // Short stale + refetch was overwriting edits with cached bundle API responses.
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const secondaryQuery = useQuery({
    queryKey: ["nightSecondary", dateKey],
    queryFn: () => fetchNightSecondaryData(selectedDay),
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    enabled: coreEnabled && (!!coreQuery.data || !coreQuery.isLoading),
  });

  const combinedData = {
    ...coreQuery.data,
    ...secondaryQuery.data,
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
      queryFn: () => fetchNightCoreData(dayDef),
      staleTime: 1000 * 60 * 5,
    });

    queryClient.prefetchQuery({
      queryKey: ["nightSecondary", prefetchDateKey],
      queryFn: () => fetchNightSecondaryData(dayDef),
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
    isSecondaryLoading: secondaryQuery.isLoading,
  };
}