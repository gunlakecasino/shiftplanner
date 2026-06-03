"use client";

import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
// data.ts helpers are dynamically imported inside the main load effect for Turbopack HMR stability
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

// Scheduled roster now loaded via API route to keep admin client creation on the server
// (prevents Multiple GoTrueClient warnings and auth issues in the browser).
import { dbToUi } from "@/lib/shiftbuilder/slot-keys";
import { fetchNightCoreData } from "./fetchNightCoreData";
import { fetchNightSecondaryData } from "./fetchNightSecondaryData";

// Server-cached roster (huge win for day switch speed)
import {
  getCachedActiveTeamMembers,
  getCachedGraveAvailableTeamMembers,
  getCachedGravePMOverlapMembers,
  getCachedGraveAMOverlapMembers,
} from "@/lib/shiftbuilder/data.server";

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

  // === CORE / FAST PATH (what the visible board actually needs) ===
  // This is the critical path for fast day switching. We want this as fast as possible.
  const coreQuery = useQuery({
    queryKey: ["nightCore", dateKey],
    queryFn: () => fetchNightCoreData(selectedDay),
    staleTime: 1000 * 30,
    placeholderData: keepPreviousData,
  });

  // === SECONDARY / DEFERRED DATA (can load after the board is interactive) ===
  // These no longer block day switching. They load in background.
  const secondaryQuery = useQuery({
    queryKey: ["nightSecondary", dateKey],
    queryFn: () => fetchNightSecondaryData(selectedDay),
    staleTime: 1000 * 60 * 5,
    // We don't use placeholder here — we want this to feel optional
  });

  // Combined shape for backward compat in the big component
  const combinedData = {
    ...coreQuery.data,
    ...secondaryQuery.data,
  };

  const prefetchNight = (date: Date) => {
    const coreKey = ["nightCore", formatLocalDateISO(date)];
    const secondaryKey = ["nightSecondary", formatLocalDateISO(date)];

    // Fast core prefetch (what makes the board appear)
    queryClient.prefetchQuery({
      queryKey: coreKey,
      queryFn: async () => {
        const {
          getNightIdForDate,
          getTeamMembersForNight,
          getNightAssignments,
          getGraveAvailableTeamMembers,
          getOnScheduleTmIdsForNight,
          getActiveTeamMembers,
        } = await import("@/lib/shiftbuilder/data");

        const id = await getNightIdForDate(date);
        const [
          members,
          dbAssignments,
          _legacyScheduled,
          newRosterScheduledSet,
          graveMembers,
          weekOnScheduleSet,
        ] = await Promise.all([
          // Cached server roster for speed
          id ? getTeamMembersForNight(id) : getActiveTeamMembers().then(all => all.map(tm => ({ ...tm, isOnSchedule: false }))),
          id ? getNightAssignments(id) : Promise.resolve([]),
          // Old scheduled functions removed — using canonical getScheduledTmsForNight instead
          Promise.resolve(new Set<string>()),
          Promise.resolve(new Set<string>()),
          getGraveAvailableTeamMembers(),
          id ? getOnScheduleTmIdsForNight(id, date.toISOString().slice(0, 10)) : Promise.resolve(new Set<string>()),
        ]);
        const assignments: Record<string, any> = {};
        (dbAssignments as any[]).forEach((row: any) => {
          try {
            const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
            if (uiKey.startsWith("UNK:")) {
              console.warn("[useCurrentNight prefetch] unrecognized DB slot, skipping:", row);
              return;
            }
            if (row.tmId) assignments[uiKey] = { tmId: row.tmId, tmName: row.tmName || row.tmId, breakGroup: row.breakGroup ?? 0 };
          } catch {}
        });
        const graveRoster = graveMembers.map((m: any) => ({
          ...m,
          isOnWeek: weekOnScheduleSet.has(m.id),
          isPMOverlap: m.gravePool === 'PM',
          isAMOverlap: m.gravePool === 'AM',
        }));
        return { 
          nightId: id, 
          assignments, 
          members, 
          scheduledTmIdsTonight: newRosterScheduledSet,  // strict new roster
          realRoster: members, 
          graveRoster,
          rawDbAssignments: dbAssignments,
          rawBreakRows: [],
        };
      },
      staleTime: 1000 * 60 * 5,
    });

    // Secondary can be lower priority / fire-and-forget
    queryClient.prefetchQuery({
      queryKey: secondaryKey,
      queryFn: async () => {
        const {
          getNightIdForDate,
          getNightNotes,
          getNightSlotTasks,
          getNightBreakAssignments,
          getNightCardBorders,
          getRecentZoneHistory,
        } = await import("@/lib/shiftbuilder/data");

        const id = await getNightIdForDate(date);
        const [notesText, nightTaskRows, breakRows, nightBorderMap, recentHistory] = await Promise.all([
          id ? getNightNotes(id) : Promise.resolve(""),
          id ? getNightSlotTasks(id) : Promise.resolve([]),
          id ? getNightBreakAssignments(id) : Promise.resolve([]),
          id ? getNightCardBorders(id) : Promise.resolve({} as Record<string, string>),
          getRecentZoneHistory(date, 7),
        ]);
        return {
          notes: notesText,
          tasks: nightTaskRows,
          breakAssignments: breakRows,
          cardBorders: nightBorderMap,
          recentZoneHistory: recentHistory,
          calledOffIds: new Set<string>(),
          rawBreakRows: breakRows,
        };
      },
      staleTime: 1000 * 60 * 5,
    });
  };

  return {
    ...combinedData,
    // Critical fix for day switching: only treat as "loading" if we have literally no data at all.
    // During day switches, placeholderData + this logic keeps the previous board visible.
    isLoading: coreQuery.isLoading && !coreQuery.data,
    isFetching: coreQuery.isFetching || secondaryQuery.isFetching,
    error: coreQuery.error || secondaryQuery.error,
    prefetchNight,
    queryClient,
    // More granular for any components that want to show light loading indicators
    isCoreLoading: coreQuery.isLoading,
    isCoreFetching: coreQuery.isFetching,
    isSecondaryLoading: secondaryQuery.isLoading,
  };
}
