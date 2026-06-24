/**
 * liveCache.ts
 *
 * Centralized live-state caching layer for the Shift Builder.
 *
 * Responsibilities:
 * - Supabase Realtime bridge: subscribes to postgres_changes on zone_assignments,
 *   break_assignments, night_slot_tasks, etc. for the active night(s).
 * - On every remote change (from other operators / other browser tabs), instantly
 *   updates BOTH:
 *     1. TanStack Query cache via queryClient.setQueryData(["night", dateKey])
 *     2. A lightweight Zustand store (useLiveAssignmentsStore) for any non-Query
 *        consumers or cross-surface sync (future opsApp parity).
 * - Provides helpers to init/teardown subscriptions per night.
 * - Works hand-in-hand with useLiveAssignments.ts for the optimistic write path.
 *
 * Architecture notes (links to prior work):
 * - Builds directly on the TanStack Query foundation added in the 2026-05-27
 *   FloatingNav + day-switch migration (see providers.tsx and useCurrentNight.ts).
 * - Preserves the existing "capture nightId at action time + resolveNightIdForDate"
 *   race-free pattern from ShiftBuilderClient.tsx:3376 (persistAssign).
 * - Draft Mode (useShiftHistory + draftAssignments in ShiftBuilderClient) remains
 *   the **only** source of truth for final apply. Live cache reflects committed
 *   server state; Draft is the proposal overlay the operator reviews before persist.
 * - Follows Motion Auditor / Velvet principles for any future UI derived from this
 *   cache: only transform/opacity changes for live updates.
 *
 * Rollback & Conflict policy (enforced in useLiveAssignments.ts consumers):
 * - Every optimistic mutation takes a snapshot in onMutate.
 * - On server error or realtime conflict detection → rollback + sonner toast with
 *   clear "another operator changed X, your change was reverted" message.
 * - Never silently lose data.
 *
 * Usage (typical):
 *   import { initLiveCacheForNight, liveAssignmentsStore } from "@/lib/shiftbuilder/liveCache";
 *   // In ShiftBuilderClient, after we have a nightId + dateKey:
 *   initLiveCacheForNight(nightId, dateKey, queryClient);
 *
 * @see useLiveAssignments.ts (the consumer hook with useMutation optimistic wrappers)
 * @see useCurrentNight.ts (the query that this layer keeps fresh)
 * @see ShiftBuilderClient.tsx (the place that will call init + pass live hooks down)
 * @see SCHEDULING_MASTERLIST.md § "Current State of the Art" (will document this layer)
 */

"use client";

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { QueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../supabase"; // re-exported singleton from the data layer root
import type { RealtimeChannel } from "@supabase/supabase-js";
import { dbToUi } from "@/lib/shiftbuilder/slot-keys"; // correct DB→UI reverse (z9_sr + aux → Z9SR, zone_9 + zone → Z9, etc.)
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore"; // main board store (what ShiftBuilderBoard subscribes to)

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
          tmName: draft.proposedTmName,
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

  // Realtime connection health per night (for future status pill)
  connectionStatus: Record<string, "connected" | "connecting" | "error" | "disconnected">;

  // Actions (internal – called by the realtime bridge and optimistic hooks)
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
// REALTIME BRIDGE
// ============================================================================

const activeChannels: Record<string, RealtimeChannel> = {};
const channelQueryClients: Record<string, QueryClient> = {};
const reconnectTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function parseChannelKey(channelKey: string): { nightId: string; dateKey: string } | null {
  const sep = channelKey.indexOf(":");
  if (sep <= 0) return null;
  return {
    nightId: channelKey.slice(0, sep),
    dateKey: channelKey.slice(sep + 1),
  };
}

function scheduleLiveCacheReconnect(
  nightId: string,
  dateKey: string,
  queryClient: QueryClient,
  reason: string,
): void {
  const channelKey = `${nightId}:${dateKey}`;
  if (reconnectTimers[channelKey]) return;

  reconnectTimers[channelKey] = setTimeout(() => {
    delete reconnectTimers[channelKey];
    console.warn(`[liveCache] Reconnecting realtime (${reason}) for ${nightId} (${dateKey})`);
    teardownLiveCacheForNight(nightId, dateKey);
    initLiveCacheForNight(nightId, dateKey, queryClient);
  }, 1200);
}

/** Tear down and re-open all active assignment realtime channels. */
export function reconnectAllActiveLiveCache(queryClient?: QueryClient): void {
  const keys = Object.keys(activeChannels);
  for (const channelKey of keys) {
    const parsed = parseChannelKey(channelKey);
    if (!parsed) continue;
    const qc = queryClient ?? channelQueryClients[channelKey];
    if (!qc) continue;
    scheduleLiveCacheReconnect(parsed.nightId, parsed.dateKey, qc, "manual-resume");
  }

  // If channels were torn down but we still know the night, ensure at least one resubscribe attempt.
  for (const [channelKey, qc] of Object.entries(channelQueryClients)) {
    if (activeChannels[channelKey]) continue;
    const parsed = parseChannelKey(channelKey);
    if (!parsed) continue;
    initLiveCacheForNight(parsed.nightId, parsed.dateKey, qc);
  }
}

/** Routes that mount live cache (/today + ShiftBuilder). Global teardown only when last unmounts. */
let liveCacheMountCount = 0;

/** Call once per surface mount; returned release only tears down all channels when count hits 0. */
export function retainLiveCacheMount(): () => void {
  liveCacheMountCount += 1;
  return () => {
    liveCacheMountCount = Math.max(0, liveCacheMountCount - 1);
    if (liveCacheMountCount === 0) {
      teardownAllLiveCache();
    }
  };
}

/**
 * Initialize (or re-use) a Supabase Realtime subscription for a specific night.
 * Idempotent – safe to call multiple times for the same night.
 *
 * On any change to zone_assignments (and later break_assignments / tasks),
 * we:
 *   1. Update the Zustand live store (instant for any subscriber).
 *   2. Use queryClient.setQueryData to keep the TanStack ["night", dateKey] cache
 *      in sync without a full refetch (background refetch still happens on staleTime).
 *
 * This gives us "live from other operators" for free while keeping all the
 * intelligent caching / prefetch / invalidation behavior of useCurrentNight.
 */
export function initLiveCacheForNight(
  nightId: string | null,
  dateKey: string,
  queryClient: QueryClient
): () => void {
  if (!nightId) return () => {}; // nothing to subscribe to yet

  const channelKey = `${nightId}:${dateKey}`;

  // Already listening for this exact night+date combo
  if (activeChannels[channelKey]) {
    return () => teardownLiveCacheForNight(nightId, dateKey);
  }

  const supabase = getSupabaseClient();
  liveAssignmentsStore.getState().setConnectionStatus(dateKey, "connecting");

  // Unique suffix prevents any "after subscribe" races if the guard key
  // is ever bypassed (HMR, StrictMode, or overlapping nightId reuse).
  // The activeChannels guard still ensures we only keep one subscription per (nightId, dateKey).
  const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const channel = supabase
    .channel(`live-night-${nightId}-${nonce}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "zone_assignments",
        filter: `night_id=eq.${nightId}`,
      },
      (payload: any) => {
        handleAssignmentChange(payload, dateKey, queryClient);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "night_slot_tasks",
        filter: `night_id=eq.${nightId}`,
      },
      () => {
        void queryClient.invalidateQueries({ queryKey: ["nightSecondary", dateKey] });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "break_assignments",
        filter: `night_id=eq.${nightId}`,
      },
      () => {
        void queryClient.invalidateQueries({ queryKey: ["nightSecondary", dateKey] });
        void queryClient.invalidateQueries({ queryKey: ["nightCore", dateKey] });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "night_card_borders",
        filter: `night_id=eq.${nightId}`,
      },
      () => {
        void queryClient.invalidateQueries({ queryKey: ["nightSecondary", dateKey] });
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "nights",
        filter: `id=eq.${nightId}`,
      },
      (payload: { old?: { status?: string }; new?: { status?: string } }) => {
        const prev = payload.old?.status;
        const next = payload.new?.status;
        if (prev === next) return;
        void queryClient.invalidateQueries({ queryKey: ["todayPublishedDates"] });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("today-publish-meta-changed", {
              detail: { nightId, dateKey, status: next },
            }),
          );
        }
      },
    )
    .subscribe((status: any) => {
      if (status === "SUBSCRIBED") {
        liveAssignmentsStore.getState().setConnectionStatus(dateKey, "connected");
        if (typeof window !== "undefined") {
          (window as any).__realtimeState = "LIVE";
        }
        console.log(`[liveCache] Realtime connected for night ${nightId} (${dateKey})`);
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        liveAssignmentsStore.getState().setConnectionStatus(dateKey, "error");
        if (typeof window !== "undefined") {
          (window as any).__realtimeState = "OFFLINE";
        }
        console.warn(`[liveCache] Realtime ${status} for night ${nightId}`);
        scheduleLiveCacheReconnect(nightId, dateKey, queryClient, status);
      } else if (status === "SUBSCRIBING") {
        if (typeof window !== "undefined") {
          (window as any).__realtimeState = "SYNCING";
        }
      }
    });

  channelQueryClients[channelKey] = queryClient;
  activeChannels[channelKey] = channel;

  return () => teardownLiveCacheForNight(nightId, dateKey);
}

function teardownLiveCacheForNight(nightId: string, dateKey: string) {
  const channelKey = `${nightId}:${dateKey}`;
  if (reconnectTimers[channelKey]) {
    clearTimeout(reconnectTimers[channelKey]);
    delete reconnectTimers[channelKey];
  }
  const ch = activeChannels[channelKey];
  if (ch) {
    ch.unsubscribe();
    delete activeChannels[channelKey];
  }
  liveAssignmentsStore.getState().setConnectionStatus(dateKey, "disconnected");
  if (typeof window !== "undefined") {
    (window as any).__realtimeState = "OFFLINE";
  }
}

/**
 * Handle a single realtime payload from zone_assignments.
 * Converts DB row → uiKey shape used by the rest of the app, then updates both stores.
 */
function handleAssignmentChange(
  payload: any,
  dateKey: string,
  queryClient: QueryClient
) {
  const { eventType, new: newRow, old: oldRow } = payload;

  // Convert DB shape to the uiKey shape the UI has always used (Z9, Z9SR, MRR1, etc.)
  // Use the canonical dbToUi so aux slots (z9_sr + "aux") and zones (zone_9 + "zone") round-trip correctly.
  const rowForKey = newRow || oldRow;
  const uiKey = rowForKey
    ? dbToUi(rowForKey.slot_key, rowForKey.slot_type, rowForKey.rr_side ?? null)
    : null;
  if (!uiKey) return;

  const store = liveAssignmentsStore.getState();

  if (eventType === "DELETE" || (eventType === "UPDATE" && !newRow?.tm_id)) {
    // Removal / unassign
    store.removeAssignment(dateKey, uiKey);

    // Patch both the legacy + correct core TanStack keys
    const removeFromCache = (old: any) => {
      if (!old) return old;
      const next = { ...(old.assignments || {}) };
      delete next[uiKey];
      return { ...old, assignments: next };
    };
    queryClient.setQueryData(["night", dateKey], removeFromCache);
    queryClient.setQueryData(["nightCore", dateKey], removeFromCache);

    // Drive the main board store (the one ShiftBuilderBoard + cards actually read)
    try {
      useShiftBuilderStore.getState().setAssignments((prev: any) => {
        const copy = { ...prev };
        delete copy[uiKey];
        return copy;
      });
    } catch {}

    return;
  }

  if (eventType === "UPDATE" && newRow && !newRow.tm_id) {
    // Break-group-only or lock-only updates without a TM assignment row.
    if (newRow.break_group !== undefined && newRow.break_group !== null) {
      const breakGroup = Number(newRow.break_group);
      try {
        useShiftBuilderStore.getState().setAssignments((prev: any) => ({
          ...prev,
          [uiKey]: {
            ...prev[uiKey],
            slotKey: uiKey,
            breakGroup,
          },
        }));
      } catch {}
    }
    return;
  }

  if ((eventType === "INSERT" || eventType === "UPDATE") && newRow?.tm_id) {
    const breakGroup =
      newRow.break_group !== undefined && newRow.break_group !== null
        ? Number(newRow.break_group)
        : undefined;
    const liveAssignment: LiveAssignment = {
      tmId: newRow.tm_id,
      tmName: newRow.tm_name || newRow.tm_id,
      isLocked: newRow.is_locked ?? false,
      updatedAt: newRow.updated_at,
    };

    store.patchAssignment(dateKey, uiKey, liveAssignment);

    // Patch both legacy and the real core key used by the board
    const patchCache = (old: any) => {
      if (!old) return old;
      const existing = (old.assignments || {})[uiKey] ?? {};
      return {
        ...old,
        assignments: {
          ...(old.assignments || {}),
          [uiKey]: {
            tmId: liveAssignment.tmId,
            tmName: liveAssignment.tmName,
            isLocked: liveAssignment.isLocked,
            ...(breakGroup !== undefined ? { breakGroup } : {}),
            ...(existing.breakGroup !== undefined && breakGroup === undefined
              ? { breakGroup: existing.breakGroup }
              : {}),
          },
        },
      };
    };
    queryClient.setQueryData(["night", dateKey], patchCache);
    queryClient.setQueryData(["nightCore", dateKey], patchCache);

    // Drive the main board store so cards re-render instantly (fixes the "must refresh" bug)
    try {
      useShiftBuilderStore.getState().setAssignments((prev: any) => ({
        ...prev,
        [uiKey]: {
          ...prev[uiKey],
          tmId: liveAssignment.tmId,
          tmName: liveAssignment.tmName,
          isLocked: liveAssignment.isLocked,
          slotKey: uiKey,
          breakGroup:
            breakGroup !== undefined ? breakGroup : prev[uiKey]?.breakGroup,
        },
      }));
    } catch {}
  }
}

// Convenience: full teardown (used on unmount / day change in the client)
export function teardownAllLiveCache() {
  Object.keys(reconnectTimers).forEach((key) => {
    clearTimeout(reconnectTimers[key]);
    delete reconnectTimers[key];
  });
  Object.keys(activeChannels).forEach((key) => {
    activeChannels[key]?.unsubscribe();
    delete activeChannels[key];
  });
  Object.keys(channelQueryClients).forEach((key) => {
    delete channelQueryClients[key];
  });
  console.log("[liveCache] All realtime channels torn down");
}
