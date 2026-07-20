/**
 * useLiveAssignments.ts
 *
 * Generic, reusable hook for live/optimistic assignment mutations in the Shift Builder.
 *
 * Provides:
 * - assign(uiKey, tmId, tmName, options?)
 * - unassign(uiKey, options?)
 * - toggleLock(uiKey, nextLocked)
 * - updateBreakGroup(...) (for Phase 1 break cycling)
 *
 * Every mutation is **optimistic-first**:
 *   1. Immediately updates TanStack Query cache (["night", dateKey]) via setQueryData
 *   2. Immediately updates the Zustand liveAssignmentsStore (for any live listeners)
 *   3. Fires the real persist (re-using existing race-free nightId capture + upsertZoneAssignment)
 *
 * On any server error (including conflicts from another operator's simultaneous write):
 *   - Perfect rollback of both caches using the snapshot captured in onMutate
 *   - User-visible sonner toast: "Change rolled back — another operator modified this slot"
 *   - Console.warn with full context for debugging
 *
 * Draft Mode contract (sacred, never violated):
 * - This hook updates the **committed / live server view**.
 * - When `isDraftMode === true` in the caller (ShiftBuilderClient), the caller is
 *   responsible for ALSO writing the change into `draftAssignments` / useShiftHistory.
 * - Final "Apply Draft" path continues to be the only thing that calls the real
 *   server writes for the operator's proposal. Live mutations are for instant
 *   feedback + cross-client sync on the base layer.
 *
 * Integration points (see callers in Phase 1):
 * - Will be consumed by updated ZoneCard / RRCard / AuxCard / OverlapSlot
 * - Will replace direct `setAssignments` + `persistAssign` calls in onDragEnd
 * - Used alongside useCurrentNight (which provides the base query data + queryClient)
 * - Multi-operator refresh comes from night query poll + mutation invalidation (KD-13).
 *
 * @see liveCache.ts (optimistic mirrors + poll registration)
 * @see ShiftBuilderClient.tsx (original persistAssign – we wrap, do not replace yet)
 * @see useCurrentNight.ts (the query whose data we optimistically mutate)
 */

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  liveAssignmentsStore,
  initLiveCacheForNight,
  getBoardAssignmentsDayKey,
} from "./liveCache";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";
import { patchNightCoreAssignmentsCache } from "./scheduleCacheSync";
import type { UpsertAssignmentParams } from "@/lib/shiftbuilder/data";
import { formatLocalDateISO, type DayDef } from "@/lib/shiftbuilder/dateUtils";
import { uiToDb } from "@/lib/shiftbuilder/slot-keys";   // canonical mapping (Z9SR→z9_sr+aux, Z9→zone_9+zone, etc.)
import {
  BREAK_GROUP_OVERLAPS,
} from "@/lib/shiftbuilder/constants";
import {
  resolveEffectiveBreakGroup,
  slotDefaultBreakMapFromRecord,
} from "@/lib/shiftbuilder/breakGroupResolve";

// ============================================================================
// Types
// ============================================================================

export interface LiveAssignOptions {
  /** Captured at the moment the user initiated the gesture (critical for race-free) */
  captureDate: Date;
  captureDayName: string;
  /** If we already resolved the nightId (from onDragStart etc.), pass it to avoid extra roundtrip */
  targetNightId?: string | null;
  /** Whether we are currently in Draft Mode (affects how the caller layers the change) */
  isDraftMode?: boolean;
  /** Called only after the server persist succeeds (after optimistic update). */
  onPersisted?: () => void;
  /** Called when persist fails and optimistic state was rolled back. */
  onPersistFailed?: (error: unknown) => void;
}

export interface UseLiveAssignmentsResult {
  assign: (uiKey: string, tmId: string, tmName: string, opts: LiveAssignOptions) => void;
  unassign: (uiKey: string, opts: LiveAssignOptions) => void;
  toggleLock: (uiKey: string, nextLocked: boolean, opts: LiveAssignOptions) => void;
  // Break group cycling will be added in the break-specific update in Phase 1-6
  isMutating: boolean;
}

// ============================================================================
// The Hook
// ============================================================================

export function useLiveAssignments(selectedDay: DayDef) {
  const queryClient = useQueryClient();
  const dateKey = formatLocalDateISO(selectedDay.date);

  // Register night for poll-sync status (idempotent). KD-13 — no Realtime socket.
  // The caller (ShiftBuilderClient) should call initLiveCacheForNight once we have a real nightId.
  const ensureRealtime = useCallback((nightId: string | null) => {
    if (nightId) {
      initLiveCacheForNight(nightId, dateKey, queryClient);
    }
  }, [dateKey, queryClient]);

  // Core optimistic mutation factory (keeps the pattern consistent for assign/unassign/lock)
  const createOptimisticMutation = <TParams extends { uiKey: string; [k: string]: any }>(
    mutationFn: (params: TParams & { nightId: string }) => Promise<any>,
    getOptimisticPatch: (params: TParams) => Partial<any>
  ) => {
    return useMutation({
      meta: { suppressGlobalError: true },
      mutationFn: async (params: any) => {
        let { resolvedNightId, uiKey, captureDate, captureDayName, ...rest } = params;

        // Robust nightId resolution (the key fix for unassign not persisting)
        if (!resolvedNightId && captureDate && captureDayName) {
          try {
            const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
            resolvedNightId = await getOrCreateNightForDate(
              new Date(captureDate),
              captureDayName
            );
          } catch (e) {
            console.error("[useLiveAssignments] Failed to resolve nightId", e);
          }
        }

        if (!resolvedNightId) {
          throw new Error(`Could not resolve nightId for ${uiKey} — assignment not saved to Supabase`);
        }

        const auxDefs = useShiftBuilderStore.getState().auxDefs;
        const { slot_key, slot_type, rr_side } = uiToDb(uiKey, auxDefs);

        // For unassign (tmId null), use the robust delete that also cleans
        // legacy keys (e.g. "Z9" vs "zone_9"). This is the permanent fix for
        // ghost assignments from old data.
        //
        // CRITICAL: pass dbSlotKey = the layout-aware mapping (AUX3+support →
        // support_1). Assign already writes slot_key; without dbSlotKey the
        // server remaps AUXn → aux_n and the real row survives refresh.
        if ((rest as any).tmId == null) {
          const { deleteZoneAssignment } = await import("@/lib/shiftbuilder/data");
          return deleteZoneAssignment({
            nightId: resolvedNightId,
            uiKey,
            slotType: slot_type,
            // pass explicit rrSide so delete is side-aware even if uiKey ever arrives in DB form
            rrSide: rr_side,
            dbSlotKey: slot_key,
          });
        }

        const upsertParams: UpsertAssignmentParams = {
          nightId: resolvedNightId,
          slotKey: slot_key,
          slotType: slot_type as any,
          rrSide: rr_side as any,
          tmId: (rest as any).tmId,
          isLocked: (rest as any).isLocked,
        };

        const { upsertZoneAssignment, applySlotDefaultBreakForAssignment } =
          await import("@/lib/shiftbuilder/data");
        const result = await upsertZoneAssignment(upsertParams);
        const appliedBreak = await applySlotDefaultBreakForAssignment({
          nightId: resolvedNightId,
          dbSlotKey: slot_key,
          rrSide: rr_side,
          tmId: (rest as any).tmId,
          uiSlotRef: uiKey,
        });
        return { ...result, appliedBreak };
      },

      onMutate: async (params: TParams & LiveAssignOptions) => {
        // 1. Cancel any outgoing refetches so they don't overwrite our optimistic update
        await queryClient.cancelQueries({ queryKey: ["nightCore", dateKey] });
        await queryClient.cancelQueries({ queryKey: ["night", dateKey] });

        // 2. Snapshot the current Query cache (for perfect rollback)
        const previousNightData = queryClient.getQueryData<any>(["night", dateKey]);

        // 3. Snapshot Zustand (for rollback)
        const previousStoreState = liveAssignmentsStore.getState().assignmentsByNight[dateKey] ?? {};
        // Snapshot the actual board store before any optimistic patch. Capturing
        // this after setAssignments would make a failed save "roll back" to the
        // failed optimistic value and leave the board out of sync with the DB.
        const previousMainAssignments = useShiftBuilderStore.getState().assignments;

        // 4. Optimistically update BOTH layers (instant UI for this client + any live listeners)
        const patch = getOptimisticPatch(params as TParams);

        // Query cache — write to BOTH the legacy key (for any remaining listeners) AND the real one
        // used by useCurrentNight (nightCore). This is why live updates were invisible.
        const applyPatchToAssignmentsShape = (old: any) => {
          if (!old) return old;
          const nextAssignments = { ...(old.assignments || {}) };
          if (patch.tmId === null || patch.tmId === undefined) {
            delete nextAssignments[params.uiKey];
          } else {
            nextAssignments[params.uiKey] = {
              ...nextAssignments[params.uiKey],
              ...patch,
            };
          }
          return { ...old, assignments: nextAssignments };
        };

        queryClient.setQueryData(["night", dateKey], applyPatchToAssignmentsShape);
        queryClient.setQueryData(["nightCore", dateKey], applyPatchToAssignmentsShape);

        // Zustand mirror (liveAssignmentsStore for cross-client / listeners)
        if (patch.tmId === null) {
          liveAssignmentsStore.getState().removeAssignment(dateKey, params.uiKey);
        } else {
          liveAssignmentsStore.getState().patchAssignment(dateKey, params.uiKey, patch as any);
        }

        // === CRITICAL FIX: also drive the main board store ===
        // ShiftBuilderBoard + cards now primarily subscribe via useAssignments() (narrow Zustand).
        // Without this, live.assign / live.unassign / realtime updates are invisible until refresh.
        try {
          const mainStore = useShiftBuilderStore.getState();
          if (patch.tmId === null || patch.tmId === undefined) {
            mainStore.setAssignments((prev: any) => {
              const copy = { ...prev };
              // When deleting, we intentionally drop the whole entry (including breakGroup).
              // A future re-assign will get a fresh break group.
              delete copy[params.uiKey];
              return copy;
            });
          } else {
            mainStore.setAssignments((prev: any) => ({
              ...prev,
              [params.uiKey]: {
                ...prev[params.uiKey],
                ...patch,
                tmId: patch.tmId,
                tmName: (patch as any).tmName ?? prev[params.uiKey]?.tmName,
                slotKey: params.uiKey,
                // Preserve existing breakGroup unless the new patch explicitly provides one
                breakGroup: (patch as any).breakGroup ?? prev[params.uiKey]?.breakGroup,
              },
            }));
          }
        } catch (e) {
          console.warn("[useLiveAssignments] failed to patch main useShiftBuilderStore", e);
        }

        return { previousNightData, previousStoreState, dateKey, uiKey: params.uiKey, previousMainAssignments };
      },

      onError: (err, params, context: any) => {
        params.onPersistFailed?.(err);

        // PERFECT ROLLBACK (all three layers + correct core key)
        if (context?.previousNightData) {
          queryClient.setQueryData(["night", context.dateKey], context.previousNightData);
          queryClient.setQueryData(["nightCore", context.dateKey], context.previousNightData);
        }
        if (context?.previousStoreState) {
          liveAssignmentsStore.setState((s) => ({
            assignmentsByNight: {
              ...s.assignmentsByNight,
              [context.dateKey]: context.previousStoreState,
            },
          }));
        }
        if (context?.previousMainAssignments) {
          try {
            useShiftBuilderStore.getState().setAssignments(context.previousMainAssignments);
          } catch {}
        }

        const message = err instanceof Error ? err.message : "unknown error";
        console.warn("[useLiveAssignments] Mutation rolled back", {
          uiKey: params.uiKey,
          error: message,
          params,
        });

        // Honest copy: only claim multi-operator conflict when the server said so.
        const multiOp =
          /another operator|reload and try again|409|concurrent/i.test(message);
        const title = multiOp
          ? `Change rolled back — another operator modified ${params.uiKey}`
          : `Change rolled back on ${params.uiKey}`;
        const description = multiOp
          ? "Your optimistic update was reverted. Reload if the board looks stale."
          : message ||
            "The server rejected this change. The board was restored to the last known good state.";

        toast.error(title, {
          description,
          duration: 6000,
        });
      },

      onSuccess: (_data, params, context: any) => {
        // Re-assert store → query after DB write so day switches use patched cache, not stale bundles.
        // Never copy the currently visible Day B store into Day A's cache when
        // a Day A mutation resolves after the operator has already switched.
        if (context?.dateKey && getBoardAssignmentsDayKey() === context.dateKey) {
          const store = useShiftBuilderStore.getState().assignments ?? {};
          patchNightCoreAssignmentsCache(queryClient, context.dateKey, store);
        }
        params.onPersisted?.();
      },

      // Do not invalidateQueries here — refetch can return stale server-cached bundles
      // and overwrite the optimistic nightCore patch from onMutate (board reverts until refresh).
      onSettled: () => {},
    });
  };

  // Public API – the mutationFn is provided by the factory (which now reliably calls upsertZoneAssignment)
  const assignMutation = createOptimisticMutation(
    async () => ({} as any), // ignored by factory
    (p: any) => {
      const core = queryClient.getQueryData<any>(["nightCore", dateKey]);
      const defaults = slotDefaultBreakMapFromRecord(core?.slotDefaultBreaks);
      const overlapBreakTmIds = new Set<string>(core?.overlapBreakTmIdsTonight ?? []);
      let breakGroup = 0;
      try {
        const auxDefs = useShiftBuilderStore.getState().auxDefs;
        const { slot_key, rr_side } = uiToDb(p.uiKey, auxDefs);
        breakGroup = overlapBreakTmIds.has(p.tmId)
          ? BREAK_GROUP_OVERLAPS
          : resolveEffectiveBreakGroup(
              null,
              slot_key,
              rr_side,
              defaults,
            );
      } catch {
        breakGroup = 0;
      }
      return {
        tmId: p.tmId,
        tmName: p.tmName,
        breakGroup,
        breakGroupExplicit: false,
      };
    },
  );

  const unassignMutation = createOptimisticMutation(
    async () => ({} as any), // ignored by factory
    () => ({ tmId: null, tmName: null })
  );

  // TanStack Query keeps `.mutate` referentially stable across renders; the
  // mutation result object itself is not. Depending on `.mutate` keeps
  // assign/unassign — and therefore the memoized `live` object below — stable.
  const assignMutate = assignMutation.mutate;
  const unassignMutate = unassignMutation.mutate;

  const assign = useCallback(
    (uiKey: string, tmId: string, tmName: string, opts: LiveAssignOptions) => {
      const resolvedNightId = opts.targetNightId;

      if (!resolvedNightId) {
        console.warn("[useLiveAssignments] assign called without targetNightId — will resolve inside mutation");
      }

      assignMutate({
        uiKey,
        tmId,
        tmName,
        ...opts,
        resolvedNightId, // pass as-is; mutationFn will resolve if missing
      } as any);

      ensureRealtime(resolvedNightId ?? null);
    },
    [assignMutate, ensureRealtime]
  );

  const unassign = useCallback(
    (uiKey: string, opts: LiveAssignOptions) => {
      const resolvedNightId = opts.targetNightId;

      if (!resolvedNightId) {
        console.warn("[useLiveAssignments] unassign called without targetNightId — will resolve inside mutation (this was the main cause of DB not updating)");
      }

      unassignMutate({
        uiKey,
        ...opts,
        resolvedNightId, // pass as-is; mutationFn will resolve if missing
        // Explicitly ensure tmId is null for the delete path
        tmId: null,
      } as any);

      ensureRealtime(resolvedNightId ?? null);
    },
    [unassignMutate, ensureRealtime]
  );

  const toggleLock = useCallback(
    (uiKey: string, nextLocked: boolean, opts: LiveAssignOptions) => {
      // For lock we can reuse a similar optimistic path (small extension of the pattern)
      // For surgical Phase 1 we keep the existing persistLock for now and only wrap the
      // core assign/unassign. Full lock migration follows the same template.
      console.log("[useLiveAssignments] toggleLock called (Phase 1 – delegates to existing path)", uiKey);
      // TODO Phase 1-6/7: add full optimistic lock mutation using the same factory
    },
    []
  );

  const isMutating = assignMutation.isPending || unassignMutation.isPending;

  // Stable object identity so `live={live}` doesn't defeat React.memo on the
  // board; it only changes when a member genuinely changes.
  return useMemo(
    () => ({
      assign,
      unassign,
      toggleLock,
      isMutating,
      ensureRealtime, // exposed so the client can wire it when nightId becomes available
    }),
    [assign, unassign, toggleLock, isMutating, ensureRealtime],
  );
}
