/**
 * liveCache.ts
 *
 * Centralized live-state caching layer for the Shift Builder.
 *
 * Responsibilities:
 * - Lightweight Zustand store (useLiveAssignmentsStore) for optimistic / cross-surface
 *   assignment mirrors (MarkerPad, week overview, fit maps).
 * - Helpers to register the active night for multi-operator poll sync (KD-13).
 * - Works hand-in-hand with useLiveAssignments.ts for the optimistic write path.
 *
 * KD-13 (PR 11a): multi-operator sync is **poll (15–30s) + mutation invalidation**,
 * not Supabase Realtime on anon. Realtime would require residual anon SELECT and
 * blocks RLS revoke (PR 11c). Night board queries poll via useCurrentNight;
 * this module only tracks connection status for the Ops pill / resume hooks.
 *
 * Architecture notes (links to prior work):
 * - Builds directly on the TanStack Query foundation added in the 2026-05-27
 *   FloatingNav + day-switch migration (see providers.tsx and useCurrentNight.ts).
 * - Draft Mode remains the **only** source of truth for final apply. Live cache
 *   reflects committed server state; Draft is the proposal overlay.
 *
 * Rollback & Conflict policy (enforced in useLiveAssignments.ts consumers):
 * - Every optimistic mutation takes a snapshot in onMutate.
 * - On server error → rollback + sonner toast.
 * - Never silently lose data.
 *
 * Usage (typical):
 *   import { initLiveCacheForNight, liveAssignmentsStore } from "@/lib/shiftbuilder/liveCache";
 *   // In ShiftBuilderClient, after we have a nightId + dateKey:
 *   initLiveCacheForNight(nightId, dateKey, queryClient);
 *
 * @see useLiveAssignments.ts (the consumer hook with useMutation optimistic wrappers)
 * @see useCurrentNight.ts (poll + invalidation that keeps this layer fresh)
 * @see ShiftBuilderClient.tsx
 */

"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { QueryClient } from "@tanstack/react-query";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore"; // main board store (what ShiftBuilderBoard subscribes to)

/**
 * KD-13 multi-operator poll interval (ms) while the tab is visible.
 * Range guidance: 15–30s. Mutation invalidation still provides same-tab instant refresh.
 */
export const NIGHT_BOARD_POLL_MS = 20_000;

/** Local YYYY-MM-DD — use everywhere live cache keys assignments (never UTC slice). */
export function nightDateKey(date: Date): string {
  return formatLocalDateISO(date);
}

/**
 * Which grave night's assignments currently live in the main board store.
 * Prevents day-switch races from writing the previous day's board into the wrong dateKey.
 */
let boardAssignmentsDayKey: string | null = null;

type BoardAssignmentsDayKeyListener = (dayKey: string | null) => void;
const boardAssignmentsDayKeyListeners = new Set<BoardAssignmentsDayKeyListener>();

export function getBoardAssignmentsDayKey(): string | null {
  return boardAssignmentsDayKey;
}

export function subscribeBoardAssignmentsDayKey(
  listener: BoardAssignmentsDayKeyListener,
): () => void {
  boardAssignmentsDayKeyListeners.add(listener);
  return () => boardAssignmentsDayKeyListeners.delete(listener);
}

export function setBoardAssignmentsDayKey(dayKey: string | null): void {
  boardAssignmentsDayKey = dayKey;
  boardAssignmentsDayKeyListeners.forEach((listener) => {
    try {
      listener(dayKey);
    } catch {
      /* ignore subscriber errors */
    }
  });
}

/**
 * After drag/swap paths that only patch the main board store, mirror into
 * liveAssignmentsStore so MarkerPad / picker / padAssignments stay in sync.
 */
export function mirrorMainAssignmentsToLiveStore(date: Date): void {
  const dateKey = nightDateKey(date);
  if (boardAssignmentsDayKey !== dateKey) {
    return;
  }
  const main = useShiftBuilderStore.getState().assignments ?? {};
  const liveForNight: Record<string, LiveAssignment> = {};
  for (const [uiKey, row] of Object.entries(main)) {
    if (row?.tmId) {
      liveForNight[uiKey] = {
        tmId: row.tmId,
        tmName: row.tmName ?? null,
        isLocked: !!row.isLocked,
      };
    }
  }

  // Avoid redundant writes: if the live store already has an equivalent snapshot for this night,
  // skip the set. This prevents unnecessary subscriber notifications (and potential bumps)
  // when mirror is called with no material change.
  const existing = liveAssignmentsStore.getState().assignmentsByNight[dateKey] ?? {};
  const existingKeys = Object.keys(existing);
  const newKeys = Object.keys(liveForNight);
  if (existingKeys.length === newKeys.length) {
    const same = newKeys.every((k) => {
      const e = existing[k];
      const n = liveForNight[k];
      return e && n && e.tmId === n.tmId && e.tmName === n.tmName && !!e.isLocked === !!n.isLocked;
    });
    if (same) return;
  }

  liveAssignmentsStore.getState().setAssignmentsForNight(dateKey, liveForNight);
}

type DraftOverlayRow = {
  proposedTmId?: string;
  proposedTmName?: string;
  proposedClear?: boolean;
};

/**
 * Authoritative assignments for PlacementPad / picker surfaces.
 * Store is the source of truth; draft overlays apply only in draft mode.
 * Never layer stale legacy/query/live keys on top — deleted slots must disappear.
 */
export function buildPadAssignmentsFromStore(
  storeAssignments: Record<string, any> | null | undefined,
  storeDraftAssignments: Record<string, DraftOverlayRow> | null | undefined,
  isDraftMode: boolean,
): Record<string, any> {
  const merged: Record<string, any> = { ...(storeAssignments ?? {}) };

  if (isDraftMode && storeDraftAssignments) {
    for (const [slotKey, draft] of Object.entries(storeDraftAssignments)) {
      if (draft?.proposedClear) {
        delete merged[slotKey];
      } else if (draft?.proposedTmId || draft?.proposedTmName) {
        merged[slotKey] = {
          ...(typeof merged[slotKey] === "object" && merged[slotKey] !== null
            ? (merged[slotKey] as Record<string, unknown>)
            : {}),
          tmId: draft.proposedTmId,
          tmName: draft.proposedTmName ?? draft.proposedTmId,
          slotKey,
        };
      }
    }
  }

  return merged;
}

// ============================================================================
// ZUSTAND LIVE STORE (lightweight mirror of committed server state)
// ============================================================================

export interface LiveAssignment {
  tmId: string;
  tmName: string | null;
  isLocked?: boolean;
  updatedAt?: string;
}

interface LiveAssignmentsState {
  // Keyed by "YYYY-MM-DD" (the same dateKey used in useCurrentNight queryKey)
  assignmentsByNight: Record<string, Record<string, LiveAssignment>>; // uiKey -> assignment
  breakAssignmentsByNight: Record<string, any[]>; // simplified for Phase 1
  lastUpdated: Record<string, number>; // epoch ms for debugging / staleness UI

  // Poll / connectivity health per night (Ops pill + idle resume)
  connectionStatus: Record<string, "connected" | "connecting" | "error" | "disconnected">;

  // Actions (internal – called by optimistic hooks + poll registration)
  setAssignmentsForNight: (dateKey: string, assignments: Record<string, LiveAssignment>) => void;
  patchAssignment: (dateKey: string, uiKey: string, patch: Partial<LiveAssignment>) => void;
  removeAssignment: (dateKey: string, uiKey: string) => void;
  setConnectionStatus: (dateKey: string, status: LiveAssignmentsState["connectionStatus"][string]) => void;
}

export const liveAssignmentsStore = create<LiveAssignmentsState>()(
  subscribeWithSelector((set) => ({
  assignmentsByNight: {},
  breakAssignmentsByNight: {},
  lastUpdated: {},
  connectionStatus: {},

  setAssignmentsForNight: (dateKey, assignments) =>
    set((state) => ({
      assignmentsByNight: { ...state.assignmentsByNight, [dateKey]: assignments },
      lastUpdated: { ...state.lastUpdated, [dateKey]: Date.now() },
    })),

  patchAssignment: (dateKey, uiKey, patch) =>
    set((state) => {
      const existingNight = state.assignmentsByNight[dateKey] ?? {};
      return {
        assignmentsByNight: {
          ...state.assignmentsByNight,
          [dateKey]: {
            ...existingNight,
            [uiKey]: { ...existingNight[uiKey], ...patch },
          },
        },
        lastUpdated: { ...state.lastUpdated, [dateKey]: Date.now() },
      };
    }),

  removeAssignment: (dateKey, uiKey) =>
    set((state) => {
      const existingNight = { ...(state.assignmentsByNight[dateKey] ?? {}) };
      delete existingNight[uiKey];
      return {
        assignmentsByNight: { ...state.assignmentsByNight, [dateKey]: existingNight },
        lastUpdated: { ...state.lastUpdated, [dateKey]: Date.now() },
      };
    }),

  setConnectionStatus: (dateKey, status) =>
    set((state) => ({
      connectionStatus: { ...state.connectionStatus, [dateKey]: status },
    })),
})));

/** Wipe cross-day assignment mirrors after PIN session change (prevents role-to-role bleed). */
export function resetLiveCrossDayCache(): void {
  liveAssignmentsStore.setState({
    assignmentsByNight: {},
    breakAssignmentsByNight: {},
    lastUpdated: {},
  });
  setBoardAssignmentsDayKey(null);
}

// ============================================================================
// POLL REGISTRATION (KD-13 — replaces ops Realtime)
// ============================================================================

/** Active nights registered for poll status (no Realtime channels). */
const activeNights: Record<string, { nightId: string; dateKey: string; queryClient: QueryClient }> =
  {};

function parseNightKey(channelKey: string): { nightId: string; dateKey: string } | null {
  const sep = channelKey.indexOf(":");
  if (sep <= 0) return null;
  return {
    nightId: channelKey.slice(0, sep),
    dateKey: channelKey.slice(sep + 1),
  };
}

/**
 * Register a night for multi-operator poll sync status.
 * Idempotent — safe to call multiple times for the same night.
 *
 * Does **not** open Supabase Realtime (retired KD-13). Night queries poll via
 * useCurrentNight; mutations invalidate nightCore / nightSecondary.
 */
export function initLiveCacheForNight(
  nightId: string | null,
  dateKey: string,
  queryClient: QueryClient,
): () => void {
  if (!nightId) return () => {};

  const nightKey = `${nightId}:${dateKey}`;
  activeNights[nightKey] = { nightId, dateKey, queryClient };
  liveAssignmentsStore.getState().setConnectionStatus(dateKey, "connected");
  if (typeof window !== "undefined") {
    (window as any).__realtimeState = "LIVE";
  }

  return () => teardownLiveCacheForNight(nightId, dateKey);
}

function teardownLiveCacheForNight(nightId: string, dateKey: string) {
  const nightKey = `${nightId}:${dateKey}`;
  delete activeNights[nightKey];
  liveAssignmentsStore.getState().setConnectionStatus(dateKey, "disconnected");
  if (typeof window !== "undefined" && Object.keys(activeNights).length === 0) {
    (window as any).__realtimeState = "OFFLINE";
  }
}

/**
 * Re-mark active nights as connected after idle / resume and force a night refetch.
 * Kept for call-site compatibility (formerly re-subscribed Realtime channels).
 */
export function reconnectAllActiveLiveCache(queryClient?: QueryClient): void {
  for (const entry of Object.values(activeNights)) {
    const qc = queryClient ?? entry.queryClient;
    liveAssignmentsStore.getState().setConnectionStatus(entry.dateKey, "connected");
    if (typeof window !== "undefined") {
      (window as any).__realtimeState = "LIVE";
    }
    void qc.invalidateQueries({ queryKey: ["nightCore", entry.dateKey] });
    void qc.invalidateQueries({ queryKey: ["nightSecondary", entry.dateKey] });
  }
}

/** Routes that mount live cache (/today + ShiftBuilder). Global teardown only when last unmounts. */
let liveCacheMountCount = 0;

/** Call once per surface mount; returned release only tears down all nights when count hits 0. */
export function retainLiveCacheMount(): () => void {
  liveCacheMountCount += 1;
  return () => {
    liveCacheMountCount = Math.max(0, liveCacheMountCount - 1);
    if (liveCacheMountCount === 0) {
      teardownAllLiveCache();
    }
  };
}

// Convenience: full teardown (used on unmount / day change in the client)
export function teardownAllLiveCache() {
  for (const nightKey of Object.keys(activeNights)) {
    const parsed = parseNightKey(nightKey);
    if (parsed) {
      liveAssignmentsStore.getState().setConnectionStatus(parsed.dateKey, "disconnected");
    }
    delete activeNights[nightKey];
  }
  if (typeof window !== "undefined") {
    (window as any).__realtimeState = "OFFLINE";
  }
  console.log("[liveCache] Poll registration torn down (KD-13 — no Realtime channels)");
}
