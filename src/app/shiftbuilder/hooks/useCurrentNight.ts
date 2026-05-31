"use client";

import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import {
  getNightIdForDate,
  getTeamMembersForNight,
  getNightAssignments,
  getNightNotes,
  getNightSlotTasks,
  getNightBreakAssignments,
  getNightCardBorders,
  getRecentZoneHistory,
  getScheduledTmIdsForNight,
  getScheduledTmIdsForNightFromNewRoster,
  getGraveAvailableTeamMembers,
  getOnScheduleTmIdsForNight,
  getActiveTeamMembers,
} from "@/lib/shiftbuilder/data";
import { dbToUi } from "@/lib/shiftbuilder/slot-keys";

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
  const dateKey = selectedDay.date.toISOString().slice(0, 10);

  // === CORE / FAST PATH (what the visible board actually needs) ===
  // This is the critical path for fast day switching. We want this as fast as possible.
  const coreQuery = useQuery({
    queryKey: ["nightCore", dateKey],
    queryFn: async () => {
      const id = await getNightIdForDate(selectedDay.date);

      const [
        members,
        dbAssignments,
        scheduledTonightSet,
        newRosterScheduledSet,
        graveMembers,
        weekOnScheduleSet,
      ] = await Promise.all([
        // Use server-cached roster — this is the big remaining win for day switches
        id ? getTeamMembersForNight(id) : getActiveTeamMembers().then(all => all.map(tm => ({ ...tm, isOnSchedule: false }))),
        id ? getNightAssignments(id) : Promise.resolve([]),
        id ? getScheduledTmIdsForNight(id) : Promise.resolve(new Set<string>()),
        id ? getScheduledTmIdsForNightFromNewRoster(selectedDay.date.toISOString().slice(0, 10)) : Promise.resolve(new Set<string>()),
        getGraveAvailableTeamMembers(),
        id ? getOnScheduleTmIdsForNight(id, selectedDay.date.toISOString().slice(0, 10)) : Promise.resolve(new Set<string>()),
      ]);

      const assignments: Record<string, any> = {};
      (dbAssignments as any[]).forEach((row: any) => {
        try {
          const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
          if (uiKey.startsWith("UNK:")) {
            console.warn("[useCurrentNight] unrecognized DB slot, skipping:", row);
            return;
          }
          if (row.tmId) {
            assignments[uiKey] = {
              tmId: row.tmId,
              tmName: row.tmName || row.tmId,
            };
          }
        } catch {}
      });

      // Enrich grave roster with week + overlap flags (authoritative source moved here for unification)
      const graveRoster = graveMembers.map((m: any) => ({
        ...m,
        isOnWeek: weekOnScheduleSet.has(m.id),
        isPMOverlap: m.gravePool === 'PM',
        isAMOverlap: m.gravePool === 'AM',
      }));

      // Strict new roster system (groups + defaults + weekly specials). Old night_tm_status is transitional only.
      const scheduledTmIdsTonight: Set<string> = newRosterScheduledSet;

      return {
        nightId: id,
        assignments,
        members,
        scheduledTmIdsTonight,
        realRoster: members,
        graveRoster,
        // Raw data for the Web Worker (3.2) so it can do heavy post-processing off main thread
        rawDbAssignments: dbAssignments,
        rawBreakRows: [], // will be populated from secondary when available
      };
    },
    staleTime: 1000 * 60 * 5,
    placeholderData: keepPreviousData,
  });

  // === SECONDARY / DEFERRED DATA (can load after the board is interactive) ===
  // These no longer block day switching. They load in background.
  const secondaryQuery = useQuery({
    queryKey: ["nightSecondary", dateKey],
    queryFn: async () => {
      const id = await getNightIdForDate(selectedDay.date);

      const [
        notesText,
        nightTaskRows,
        breakRows,
        nightBorderMap,
        recentHistory,
      ] = await Promise.all([
        id ? getNightNotes(id) : Promise.resolve(""),
        id ? getNightSlotTasks(id) : Promise.resolve([]),
        id ? getNightBreakAssignments(id) : Promise.resolve([]),
        id ? getNightCardBorders(id) : Promise.resolve({} as Record<string, string>),
        getRecentZoneHistory(selectedDay.date, 7),
      ]);

      return {
        notes: notesText,
        tasks: nightTaskRows,
        breakAssignments: breakRows,
        cardBorders: nightBorderMap,
        recentZoneHistory: recentHistory,
        calledOffIds: new Set<string>(), // TODO: wire real one
        rawBreakRows: breakRows,
      };
    },
    staleTime: 1000 * 60 * 5,
    // We don't use placeholder here — we want this to feel optional
  });

  // Combined shape for backward compat in the big component
  const combinedData = {
    ...coreQuery.data,
    ...secondaryQuery.data,
  };

  const prefetchNight = (date: Date) => {
    const coreKey = ["nightCore", date.toISOString().slice(0, 10)];
    const secondaryKey = ["nightSecondary", date.toISOString().slice(0, 10)];

    // Fast core prefetch (what makes the board appear)
    queryClient.prefetchQuery({
      queryKey: coreKey,
      queryFn: async () => {
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
          // legacy kept only for transitional reads during migration
          id ? getScheduledTmIdsForNight(id) : Promise.resolve(new Set<string>()),
          id ? getScheduledTmIdsForNightFromNewRoster(date.toISOString().slice(0, 10)) : Promise.resolve(new Set<string>()),
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
            if (row.tmId) assignments[uiKey] = { tmId: row.tmId, tmName: row.tmName || row.tmId };
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
