"use client";

import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
// data.ts helpers are dynamically imported inside the main load effect for Turbopack HMR stability
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

// Scheduled roster now loaded via API route to keep admin client creation on the server
// (prevents Multiple GoTrueClient warnings and auth issues in the browser).
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
      const {
        getNightIdForDate,
        getTeamMembersForNight,
        getNightAssignments,
        getGraveAvailableTeamMembers,
        getOnScheduleTmIdsForNight,
        getActiveTeamMembers,
      } = await import("@/lib/shiftbuilder/data");

      const id = await getNightIdForDate(selectedDay.date);

      const [
        members,
        dbAssignments,
        graveMembers,
        weekOnScheduleSet,
      ] = await Promise.all([
        // Use server-cached roster — this is the big remaining win for day switches
        id ? getTeamMembersForNight(id) : getActiveTeamMembers().then(all => all.map(tm => ({ ...tm, isOnSchedule: false }))),
        id ? getNightAssignments(id) : Promise.resolve([]),
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
              breakGroup: row.breakGroup ?? 0,
            };
          }
        } catch {}
      });

      // Enrich with breakGroup from the separate break_assignments table so BreakBadge
      // on ZoneCard / AuxCard / RRCard inside the isolated board actually shows 1/2/3 (or –).
      // This was missing after the core loader was introduced; the legacy paths had it but
      // the board now reads the narrow shape from currentNight.assignments → store.
      if (id) {
        try {
          const { getNightBreakAssignments } = await import("@/lib/shiftbuilder/data");
          const breaks = await getNightBreakAssignments(id);
          const breakByTm: Record<string, number> = {};
          (breaks || []).forEach((r: any) => {
            if (r.tmId && r.groupNum != null) breakByTm[r.tmId] = r.groupNum;
          });
          Object.keys(assignments).forEach((k) => {
            const a = assignments[k];
            if (a?.tmId && breakByTm[a.tmId] != null) {
              a.breakGroup = breakByTm[a.tmId];
            }
          });
        } catch (e) {
          // Non-fatal — break pills will just show "–" until next refetch
          console.warn("[useCurrentNight] could not load break groups for pills", e);
        }
      }

      // Enrich grave roster with week + overlap flags (authoritative source moved here for unification)
      const graveRoster = graveMembers.map((m: any) => ({
        ...m,
        isOnWeek: weekOnScheduleSet.has(m.id),
        isPMOverlap: m.gravePool === 'PM',
        isAMOverlap: m.gravePool === 'AM',
      }));

      // === CANONICAL SCHEDULED DATA — graves_default_schedule + night_on_call ===
      let canonicalScheduled = {
        allScheduled: [] as any[],
        fullGraveScheduled: [] as any[],
        pmOverlapScheduled: [] as any[],
        amOverlapScheduled: [] as any[],
        scheduledWithRoles: [] as any[],
      };

      try {
        const dateStr = formatLocalDateISO(selectedDay.date);
        const rosterUrl = id
          ? `/api/shiftbuilder/scheduled-roster?date=${dateStr}&night_id=${id}`
          : `/api/shiftbuilder/scheduled-roster?date=${dateStr}`;
        const res = await fetch(rosterUrl);
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error("[useCurrentNight] scheduled-roster API failed", {
            status: res.status,
            error: errorData,
          });
          throw new Error(`Scheduled roster API returned ${res.status}`);
        }
        
        const data = await res.json();
        canonicalScheduled = {
          allScheduled: data.allScheduled || [],
          fullGraveScheduled: data.fullGraveScheduled || [],
          pmOverlapScheduled: data.pmOverlapScheduled || [],
          amOverlapScheduled: data.amOverlapScheduled || [],
          scheduledWithRoles: data.scheduledWithRoles || [],
        };
        
        if (!canonicalScheduled.allScheduled.length) {
          console.warn("[useCurrentNight] API returned empty scheduled roster — this usually means the service role key is missing or the weekly roster hasn't been applied yet");
        }
      } catch (e) {
        console.error("[useCurrentNight] failed to load canonical scheduled data via API", e);
        // Optional: surface to user in a future toast
      }

      const scheduledId = (t: any) => t.tmId || t.tm_id || t.id;
      const fullGraveScheduledTonight = new Set(canonicalScheduled.fullGraveScheduled.map(scheduledId));
      const pmOverlapScheduledTonight = new Set(canonicalScheduled.pmOverlapScheduled.map(scheduledId));
      const amOverlapScheduledTonight = new Set(canonicalScheduled.amOverlapScheduled.map(scheduledId));

      // Enrich the main realRoster using the canonical partitioned sets
      const enrichedRealRoster = (members || []).map((m: any) => ({
        ...m,
        isPMOverlapTonight: pmOverlapScheduledTonight.has(m.id),
        isAMOverlapTonight: amOverlapScheduledTonight.has(m.id),
        isFullGraveTonight: fullGraveScheduledTonight.has(m.id),
      }));

      const enrichedGraveRoster = graveRoster.map((m: any) => ({
        ...m,
        isPMOverlapTonight: pmOverlapScheduledTonight.has(m.id),
        isAMOverlapTonight: amOverlapScheduledTonight.has(m.id),
        isFullGraveTonight: fullGraveScheduledTonight.has(m.id),
      }));

      // Legacy shape kept for broad compatibility during migration
      const scheduledTmIdsTonight: Set<string> = new Set(
        canonicalScheduled.allScheduled.map(scheduledId)
      );

      return {
        nightId: id,
        assignments,
        members,
        scheduledTmIdsTonight,
        realRoster: enrichedRealRoster,
        graveRoster: enrichedGraveRoster,
        // Partitioned scheduled sets from the Weekly Roster classification (Grave group + overlap groups).
        // These are the authoritative "who is scheduled in this specific roster role tonight".
        // Used by the MarkerPad picker to ensure a pure grave card only offers full-grave scheduled TMs,
        // and overlap cards only offer the corresponding overlap TMs.
        fullGraveScheduledTonight,
        pmOverlapScheduledTonight,
        amOverlapScheduledTonight,
        // All scheduled data now comes exclusively from the canonical getScheduledTmsForNight
        // (src/lib/shiftbuilder/schedules.ts) — the single source of truth.
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
      const {
        getNightIdForDate,
        getNightNotes,
        getNightSlotTasks,
        getNightBreakAssignments,
        getNightCardBorders,
        getRecentZoneHistory,
      } = await import("@/lib/shiftbuilder/data");

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
