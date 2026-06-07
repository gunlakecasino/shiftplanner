"use client";

import React from "react";
import { useCurrentNight } from "./useCurrentNight";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO, parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import {
  useShiftBuilderStore,
  useAssignments,
  useDraftAssignments,
} from "../store/useShiftBuilderStore";
import {
  liveAssignmentsStore,
  mirrorMainAssignmentsToLiveStore,
  setBoardAssignmentsDayKey,
} from "@/lib/shiftbuilder/liveCache";
import { patchNightCoreAssignmentsCache } from "@/lib/shiftbuilder/scheduleCacheSync";

/**
 * useShiftData
 *
 * Central orchestration hook for the ShiftBuilder's core night data layer.
 *
 * Responsibilities (Slice 1 of Production Stabilization):
 * - Wraps useCurrentNight (TanStack Query for core + secondary via graves_default_schedule).
 * - Provides unified "effective*" values that prefer the modern query source while
 *   safely bridging legacy local state during the migration.
 * - Owns the critical hydration effect that syncs query results → Zustand store
 *   (for Board/cards narrow subs) + liveAssignmentsStore (for week overview, repeats, fit, health, xAI).
 * - Exposes clean loading flags, scheduled roster sets (Graves-sourced), and store selectors.
 * - Keeps cross-day week data (for Weekly Overview sheet and plannedThisWeekRecentHistory) fresh
 *   via mirrors and prefetch.
 *
 * This removes a large amount of bridge/effect code from the giant ShiftBuilderClient orchestrator,
 * making data ownership explicit and the Client more of a thin composer.
 *
 * Non-negotiables enforced here:
 * - Graves Default Schedule remains the sole source (via useCurrentNight + fetchNightCoreData).
 * - Draft Mode + history are untouched (this hook only deals with committed + optimistic live layer).
 * - Optimistic patches (from drag, engine draft, live realtime) continue to win over query for the current day.
 *
 * Consumers (Board, cards, MarkerPad, PlacementPad, WeeklyOverview, etc.) should prefer:
 *   - useAssignments() / useDraftAssignments() from store for the hottest mutable data.
 *   - Values returned from this hook for effective rosters, scheduled sets, loading state.
 */

export interface UseShiftDataReturn {
  // Raw from useCurrentNight (authoritative loaded data + loading + queryClient)
  currentNight: ReturnType<typeof useCurrentNight>;

  // Hot mutable state via narrow Zustand selectors (preferred by cards/Board)
  storeAssignments: ReturnType<typeof useAssignments>;
  storeDraftAssignments: ReturnType<typeof useDraftAssignments>;

  // Unified effective values (prefer currentNight query, fall back to legacy during migration)
  effectiveAssignments: Record<string, any>;
  effectiveScheduledTmIdsTonight: Set<string>;
  fullGraveScheduledTonight: Set<string>;
  pmOverlapScheduledTonight: Set<string>;
  amOverlapScheduledTonight: Set<string>;
  effectiveRealRoster: any[];
  effectiveGraveRoster: any[];
  effectiveRecentZoneHistory: any;
  effectiveCardBorders: Record<string, string>;

  // Loading / UI state derived from query + local payload check
  hasBoardPayload: boolean;
  boardColdLoading: boolean;
  boardBackgroundSync: boolean;

  // Live cross-day accumulator version (bump to force recompute of week-dependent memos)
  liveAssignVersion: number;
  bumpLiveAssignVersion: () => void;

  // Helpers exposed so Client can still trigger mirrors from action paths if needed
  mirrorCurrentDay: () => void;
  patchCurrentNightCache: (assignments: Record<string, any>) => void;
}

export function useShiftData(selectedDay: DayDef): UseShiftDataReturn {
  const currentNight = useCurrentNight(selectedDay);

  const storeAssignments = useAssignments();
  const storeDraftAssignments = useDraftAssignments();

  // === Effective bridges (Graves-sourced scheduled sets are authoritative) ===
  const effectiveRealRoster = currentNight.realRoster || [];
  const effectiveGraveRoster = currentNight.graveRoster || [];

  const fullGraveScheduledTonight: Set<string> =
    (currentNight.fullGraveScheduledTonight as Set<string> | undefined) ?? new Set();
  const pmOverlapScheduledTonight: Set<string> =
    (currentNight.pmOverlapScheduledTonight as Set<string> | undefined) ?? new Set();
  const amOverlapScheduledTonight: Set<string> =
    (currentNight.amOverlapScheduledTonight as Set<string> | undefined) ?? new Set();

  const effectiveScheduledTmIdsTonight: Set<string> =
    (currentNight.scheduledTmIdsTonight as Set<string> | undefined) ?? new Set();

  const effectiveRecentZoneHistory = currentNight.recentZoneHistory ?? null;
  const effectiveCardBorders = currentNight.cardBorders ?? {};

  // Assignments: the hottest state. Prefer query (server/committed), but during transition
  // we still support a thin legacy fallback (will be removed in later cleanup).
  // Note: actual optimistic/draft/live writes go through the Zustand store and liveAssignmentsStore.
  // This hook does NOT own draft — that stays in store + Draft Mode in the orchestrator.
  const effectiveAssignments: Record<string, any> =
    currentNight.assignments ?? {};

  const hasBoardPayload = React.useMemo(
    () => Object.keys(effectiveAssignments).length > 0 || currentNight.nightId != null,
    [effectiveAssignments, currentNight.nightId]
  );
  const boardColdLoading = currentNight.isCoreLoading && !hasBoardPayload;
  const boardBackgroundSync = currentNight.isCoreFetching && hasBoardPayload;

  // Live version for reactivity of "already placed this night" and week surfaces.
  const [liveAssignVersion, setLiveAssignVersion] = React.useState(0);
  const bumpLiveAssignVersion = React.useCallback(() => {
    setLiveAssignVersion((v) => v + 1);
  }, []);

  // === Hydration: query result → store + live cross-day accumulator (core of unification) ===
  // This effect (and its mirrors) is what allows the narrow store subscriptions in Board/cards
  // and the week-level consumers (Weekly Overview, repeats, fit/health, xAI context) to see data.
  const hydratedAssignmentsDayRef = React.useRef<string | null>(null);
  const previousHydratedDayRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const dayKey = formatLocalDateISO(selectedDay.date);
    if (hydratedAssignmentsDayRef.current === dayKey) return;
    if (boardColdLoading || currentNight.isCoreFetching) return;

    const fromQuery = currentNight.assignments;
    if (fromQuery === undefined) return;

    const prevDay = previousHydratedDayRef.current;
    const isDaySwitch = prevDay !== null && prevDay !== dayKey;

    if (isDaySwitch && prevDay) {
      try {
        mirrorMainAssignmentsToLiveStore(parseLocalDateISO(prevDay));
      } catch {}
    }

    previousHydratedDayRef.current = dayKey;

    let next: Record<string, any> = { ...fromQuery };

    // On same-day load (not switch), merge any in-flight store edits so optimistic work isn't lost.
    if (!isDaySwitch) {
      const store = useShiftBuilderStore.getState().assignments ?? {};
      for (const [k, v] of Object.entries(store)) {
        if (v?.tmId && (!next[k]?.tmId || next[k].tmId !== v.tmId)) {
          next[k] = { ...next[k], ...v };
        }
      }
    }

    // Push into the main board store (cards/Board subscribe narrowly here)
    useShiftBuilderStore.getState().setAssignments(next);
    setBoardAssignmentsDayKey(dayKey);
    hydratedAssignmentsDayRef.current = dayKey;

    // Mirror for cross-day week consumers (Weekly Overview sheet, plannedThisWeekRecentHistory, etc.)
    try {
      mirrorMainAssignmentsToLiveStore(selectedDay.date);
    } catch {}

    bumpLiveAssignVersion();

    // Keep the TanStack cache in sync if we merged anything.
    const qc = currentNight.queryClient;
    if (qc && !isDaySwitch && next !== fromQuery) {
      patchNightCoreAssignmentsCache(qc, dayKey, next);
    }
  }, [
    selectedDay.date,
    boardColdLoading,
    currentNight.isCoreFetching,
    currentNight.queryClient,
    currentNight.assignments,
    bumpLiveAssignVersion,
  ]);

  // Public helpers for action paths (applyDraft, drag persist, engine runs, etc.)
  const mirrorCurrentDay = React.useCallback(() => {
    try {
      mirrorMainAssignmentsToLiveStore(selectedDay.date);
      bumpLiveAssignVersion();
    } catch {}
  }, [selectedDay.date, bumpLiveAssignVersion]);

  const patchCurrentNightCache = React.useCallback(
    (assignments: Record<string, any>) => {
      const qc = currentNight.queryClient;
      const dayKey = formatLocalDateISO(selectedDay.date);
      if (qc) {
        patchNightCoreAssignmentsCache(qc, dayKey, assignments);
      }
    },
    [currentNight.queryClient, selectedDay.date]
  );

  return {
    currentNight,
    storeAssignments,
    storeDraftAssignments,
    effectiveAssignments,
    effectiveScheduledTmIdsTonight,
    fullGraveScheduledTonight,
    pmOverlapScheduledTonight,
    amOverlapScheduledTonight,
    effectiveRealRoster,
    effectiveGraveRoster,
    effectiveRecentZoneHistory,
    effectiveCardBorders,
    hasBoardPayload,
    boardColdLoading,
    boardBackgroundSync,
    liveAssignVersion,
    bumpLiveAssignVersion,
    mirrorCurrentDay,
    patchCurrentNightCache,
  };
}
