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
import {
  invalidateNightBoardQueries,
  patchNightCoreAssignmentsCache,
} from "@/lib/shiftbuilder/scheduleCacheSync";
import { nightFetchOptionsForPermissions } from "../lib/viewerNightPolicy";
import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuthTypes";

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
  /** TM rail pool — graves_default_schedule (+ night_on_call) only. */
  effectiveGravesScheduleRoster: any[];
  effectiveRecentZoneHistory: any;
  effectiveCardBorders: Record<string, string>;

  // Loading / UI state derived from query + local payload check
  hasBoardPayload: boolean;
  /** Viewer on an unpublished night — schedule data is withheld. */
  nightAccessBlocked: boolean;
  boardColdLoading: boolean;
  boardBackgroundSync: boolean;
  /** True while nightCore is still showing keepPreviousData from another day. */
  isCorePlaceholder: boolean;

  // Live cross-day accumulator version (bump to force recompute of week-dependent memos)
  liveAssignVersion: number;
  bumpLiveAssignVersion: () => void;

  // Helpers exposed so Client can still trigger mirrors from action paths if needed
  mirrorCurrentDay: () => void;
  patchCurrentNightCache: (assignments: Record<string, any>) => void;
}

export type UseShiftDataOptions = {
  /** When false, skips night-core fetch (unpublished non-tonight on /today). */
  nightCoreEnabled?: boolean;
  /** Server-side publish gate for /today night-core requests. */
  todayPolicy?: boolean;
  /** Viewer role — only published nights are loaded. */
  publishedOnlyPolicy?: boolean;
  /** When set, derives publishedOnlyPolicy from effective permissions. */
  permissions?: Pick<
    ShiftBuilderPermissions,
    "canEditPublishedOnly" | "canSeeDraftData" | "canAccessSudo"
  > | null;
};

export function useShiftData(
  selectedDay: DayDef,
  options?: UseShiftDataOptions,
): UseShiftDataReturn {
  const nightCoreEnabled = options?.nightCoreEnabled !== false;
  const permissionFetchOptions = nightFetchOptionsForPermissions(options?.permissions);
  const publishedOnlyPolicy =
    options?.publishedOnlyPolicy ?? permissionFetchOptions.publishedOnlyPolicy;

  const currentNight = useCurrentNight(selectedDay, {
    enabled: nightCoreEnabled,
    todayPolicy: options?.todayPolicy,
    publishedOnlyPolicy,
  });

  const storeAssignments = useAssignments();
  const storeDraftAssignments = useDraftAssignments();
  const selectedDateKey = formatLocalDateISO(selectedDay.date);
  const stabilizedDateKeyRef = React.useRef(selectedDateKey);
  const rosterStabilizedForDateRef = React.useRef<string | null>(null);
  const hydratedAssignmentsDayRef = React.useRef<string | null>(null);

  // === Stable refs for effective values ===
  // Prevents fresh {} / new Set() / new [] literals on every render from query ?? defaults
  // or from TanStack re-renders. This is the root cause of max-update-depth when
  // these are used as effect deps that then call setState (cardBorders, fit recomputes etc).
  // Only the builder view is affected (print paths are never to be touched).
  const stableRefs = React.useRef({
    realRoster: [] as any[],
    graveRoster: [] as any[],
    gravesScheduleRoster: [] as any[],
    fullGrave: new Set<string>(),
    pmOverlap: new Set<string>(),
    amOverlap: new Set<string>(),
    scheduledTm: new Set<string>(),
    recentZoneHistory: null as any,
    cardBorders: {} as Record<string, string>,
    assignments: {} as Record<string, any>,
  });

  // Day switch: drop stabilized roster/scheduled snapshots so picker rails don't show the prior night.
  React.useEffect(() => {
    if (stabilizedDateKeyRef.current === selectedDateKey) return;
    stabilizedDateKeyRef.current = selectedDateKey;
    rosterStabilizedForDateRef.current = null;
    stableRefs.current.realRoster = [];
    stableRefs.current.graveRoster = [];
    stableRefs.current.gravesScheduleRoster = [];
    stableRefs.current.fullGrave = new Set<string>();
    stableRefs.current.pmOverlap = new Set<string>();
    stableRefs.current.amOverlap = new Set<string>();
    stableRefs.current.scheduledTm = new Set<string>();
    stableRefs.current.recentZoneHistory = null;
    stableRefs.current.cardBorders = {};
    stableRefs.current.assignments = {};
    hydratedAssignmentsDayRef.current = null;

    const qc = currentNight.queryClient;
    if (qc && nightCoreEnabled) {
      void invalidateNightBoardQueries(qc, selectedDateKey);
    }
  }, [selectedDateKey, currentNight.queryClient, nightCoreEnabled]);

  const rosterDataAuthoritative = !currentNight.isCorePlaceholder;

  // Lightweight content signature for small collections (roster ids, border keys, set members).
  // Handles Map (used by recentZoneHistory) so that sig diffing works for stabilization
  // even when query layer emits fresh Map instances with same logical entries.
  const sigOf = (v: any): string => {
    if (!v) return "";
    if (v instanceof Set) return Array.from(v).sort().join("|");
    if (v instanceof Map) {
      return Array.from(v.entries())
        .map(([k, vv]) => `${k}:${JSON.stringify(vv)}`)
        .sort()
        .join("||");
    }
    if (Array.isArray(v)) return v.length + "|" + (v[0]?.id || v[0]?.tmId || "") + "|" + (v[v.length - 1]?.id || v[v.length - 1]?.tmId || "");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  // === Effective bridges (Graves-sourced scheduled sets are authoritative) ===
  // Return *stable* ref for the value unless its content actually changed. This keeps
  // effect deps and downstream memos from thrashing on identity when data is logically same.
  const effectiveRealRoster = React.useMemo(() => {
    const src = currentNight.realRoster;
    if (!src || src.length === 0) return stableRefs.current.realRoster;
    const s = sigOf(src);
    if (s !== sigOf(stableRefs.current.realRoster)) {
      stableRefs.current.realRoster = [...src];
    }
    return stableRefs.current.realRoster;
  }, [currentNight.realRoster]);

  const effectiveGraveRoster = React.useMemo(() => {
    const src = currentNight.graveRoster;
    if (!src || src.length === 0) return stableRefs.current.graveRoster;
    const s = sigOf(src);
    if (s !== sigOf(stableRefs.current.graveRoster)) {
      stableRefs.current.graveRoster = [...src];
    }
    return stableRefs.current.graveRoster;
  }, [currentNight.graveRoster]);

  const effectiveGravesScheduleRoster = React.useMemo(() => {
    if (!rosterDataAuthoritative) return stableRefs.current.gravesScheduleRoster;
    const src = currentNight.gravesScheduleRoster;
    if (!src || src.length === 0) {
      return stableRefs.current.gravesScheduleRoster;
    }
    const s = `${selectedDateKey}|${sigOf(src)}`;
    const prev =
      rosterStabilizedForDateRef.current === selectedDateKey
        ? `${selectedDateKey}|${sigOf(stableRefs.current.gravesScheduleRoster)}`
        : "";
    if (s !== prev) {
      stableRefs.current.gravesScheduleRoster = [...src];
      rosterStabilizedForDateRef.current = selectedDateKey;
    }
    return stableRefs.current.gravesScheduleRoster;
  }, [currentNight.gravesScheduleRoster, rosterDataAuthoritative, selectedDateKey]);

  const stabilizeSet = (
    key: "fullGrave" | "pmOverlap" | "amOverlap" | "scheduledTm",
    src: Set<string> | undefined,
  ): Set<string> => {
    if (!src) return stableRefs.current[key];
    const s = sigOf(src);
    if (s !== sigOf(stableRefs.current[key])) {
      stableRefs.current[key] = new Set(src);
    }
    return stableRefs.current[key];
  };

  const fullGraveScheduledTonight = React.useMemo(
    () =>
      rosterDataAuthoritative
        ? stabilizeSet("fullGrave", currentNight.fullGraveScheduledTonight as Set<string> | undefined)
        : stableRefs.current.fullGrave,
    [currentNight.fullGraveScheduledTonight, rosterDataAuthoritative, selectedDateKey],
  );

  const pmOverlapScheduledTonight = React.useMemo(
    () =>
      rosterDataAuthoritative
        ? stabilizeSet("pmOverlap", currentNight.pmOverlapScheduledTonight as Set<string> | undefined)
        : stableRefs.current.pmOverlap,
    [currentNight.pmOverlapScheduledTonight, rosterDataAuthoritative, selectedDateKey],
  );

  const amOverlapScheduledTonight = React.useMemo(
    () =>
      rosterDataAuthoritative
        ? stabilizeSet("amOverlap", currentNight.amOverlapScheduledTonight as Set<string> | undefined)
        : stableRefs.current.amOverlap,
    [currentNight.amOverlapScheduledTonight, rosterDataAuthoritative, selectedDateKey],
  );

  const effectiveScheduledTmIdsTonight = React.useMemo(
    () =>
      rosterDataAuthoritative
        ? stabilizeSet("scheduledTm", currentNight.scheduledTmIdsTonight as Set<string> | undefined)
        : stableRefs.current.scheduledTm,
    [currentNight.scheduledTmIdsTonight, rosterDataAuthoritative, selectedDateKey],
  );

  const effectiveRecentZoneHistory = React.useMemo(() => {
    const src = currentNight.recentZoneHistory;
    if (!src) return stableRefs.current.recentZoneHistory;
    const s = sigOf(src);
    if (s !== sigOf(stableRefs.current.recentZoneHistory)) {
      stableRefs.current.recentZoneHistory = new Map(src as any); // canonical stable Map instance
    }
    return stableRefs.current.recentZoneHistory;
  }, [currentNight.recentZoneHistory]);

  const effectiveCardBorders = React.useMemo(() => {
    const src = currentNight.cardBorders;
    if (!src || typeof src !== "object") return stableRefs.current.cardBorders;
    const s = sigOf(src);
    if (s !== sigOf(stableRefs.current.cardBorders)) {
      stableRefs.current.cardBorders = { ...src };
    }
    return stableRefs.current.cardBorders;
  }, [currentNight.cardBorders]);

  // Assignments: the hottest state. Prefer query (server/committed), but during transition
  // we still support a thin legacy fallback (will be removed in later cleanup).
  // Note: actual optimistic/draft/live writes go through the Zustand store and liveAssignmentsStore.
  // This hook does NOT own draft — that stays in store + Draft Mode in the orchestrator.
  const effectiveAssignments: Record<string, any> = React.useMemo(() => {
    const src = currentNight.assignments;
    if (!src || typeof src !== "object") return stableRefs.current.assignments;
    const s = sigOf(src);
    if (s !== sigOf(stableRefs.current.assignments)) {
      stableRefs.current.assignments = { ...src };
    }
    return stableRefs.current.assignments;
  }, [currentNight.assignments]);

  const nightAccessBlocked = Boolean(
    (currentNight as { accessBlocked?: boolean }).accessBlocked,
  );

  const hasBoardPayload = React.useMemo(
    () =>
      !nightAccessBlocked &&
      (Object.keys(effectiveAssignments).length > 0 || currentNight.nightId != null),
    [effectiveAssignments, currentNight.nightId, nightAccessBlocked],
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
  const previousHydratedDayRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const dayKey = formatLocalDateISO(selectedDay.date);
    if (hydratedAssignmentsDayRef.current === dayKey) return;
    if (boardColdLoading || currentNight.isCoreFetching) return;

    if (nightAccessBlocked) {
      useShiftBuilderStore.getState().setAssignments({});
      setBoardAssignmentsDayKey(dayKey);
      hydratedAssignmentsDayRef.current = dayKey;
      return;
    }

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
    nightAccessBlocked,
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
    effectiveGravesScheduleRoster,
    effectiveRecentZoneHistory,
    effectiveCardBorders,
    hasBoardPayload,
    nightAccessBlocked,
    boardColdLoading,
    boardBackgroundSync,
    isCorePlaceholder: currentNight.isCorePlaceholder,
    liveAssignVersion,
    bumpLiveAssignVersion,
    mirrorCurrentDay,
    patchCurrentNightCache,
  };
}
