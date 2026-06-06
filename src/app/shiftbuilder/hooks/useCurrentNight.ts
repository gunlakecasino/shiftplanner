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
export function useCurrentNight(selectedDay: DayDef) {
  const queryClient = useQueryClient();
  const dateKey = formatLocalDateISO(selectedDay.date);

  const coreQuery = useQuery({
    queryKey: ["nightCore", dateKey],
    queryFn: () => fetchNightCoreData(selectedDay),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });

  const secondaryQuery = useQuery({
    queryKey: ["nightSecondary", dateKey],
    queryFn: () => fetchNightSecondaryData(selectedDay),
    staleTime: 1000 * 60 * 5,
    enabled: !!coreQuery.data || !coreQuery.isLoading,
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