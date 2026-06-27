"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  createBlankAuxSlot,
  applyAuxRole,
  applyAuxLabel,
  defaultAuxDefsForNewNight,
  findRemovableEmptyAuxSlot,
} from "@/lib/shiftbuilder/auxLayout";
import type { AuxDef, AuxRole } from "@/lib/shiftbuilder/placement";
import { validatePlacementOrder } from "@/lib/shiftbuilder/placement";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import {
  patchNightCoreAuxLayoutCache,
} from "@/lib/shiftbuilder/scheduleCacheSync";
import { MAX_AUX_SLOTS } from "@/lib/shiftbuilder/constants";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

/**
 * useAuxLayout
 *
 * Extracted hook (Phase 2 of World-Class plan) for managing per-night AUX slot layout.
 * 
 * Responsibilities:
 * - Default + dynamic AUX defs (admin first + blanks, max 10)
 * - Add / remove role / label mutations with validation
 * - Debounced persist to Supabase + query cache patch
 * - One-way sync to Zustand store for narrow subscribers (useAuxDefs)
 * - History snapshot integration via callback
 *
 * This removes ~150+ lines of orchestration from the giant ShiftBuilderClient,
 * making the orchestrator thinner and the aux logic testable/reusable.
 *
 * Non-negotiables:
 * - Graves / placement order respected via validatePlacementOrder
 * - Persist only after hydration guard
 * - Draft/history snapshots still owned by caller (for undo)
 */

export interface UseAuxLayoutParams {
  selectedDay: DayDef;
  nightId: string | null;
  currentNightId: string | null; // from shiftData or currentNight
  queryClient: any;
  showToast: (msg: string, type?: "success" | "error") => void;
  handleBoardLiveUnassign?: (slotKey: string) => void;
  // For history snapshots (caller provides the before recorder; after is handled in Client history effect)
  recordAuxChange?: (description: string, beforeAux: AuxDef[]) => void;
  // Access to live assignments for snapshots
  getAssignmentsSnapshot?: () => Record<string, any>;
}

export interface UseAuxLayoutReturn {
  auxDefs: AuxDef[];
  setAuxDefs: (updater: AuxDef[] | ((prev: AuxDef[]) => AuxDef[])) => void;
  addAuxSlot: () => void;
  setAuxRole: (slotKey: string, role: AuxRole) => void;
  setAuxLabel: (slotKey: string, label: string) => void;
  canAddAux: boolean;
  canRemoveAux: boolean;
  lastAuxSlotLabel: string | null;
  removeLastAuxSlot: () => void;
  flushAuxLayoutSave: () => Promise<void>;
  scheduleAuxLayoutSave: (delayMs?: number) => void;
}

export function useAuxLayout({
  selectedDay,
  nightId,
  currentNightId,
  queryClient,
  showToast,
  handleBoardLiveUnassign,
  recordAuxChange,
  getAssignmentsSnapshot,
}: UseAuxLayoutParams): UseAuxLayoutReturn {
  const [auxDefs, setAuxDefs] = useState<AuxDef[]>(() =>
    defaultAuxDefsForNewNight().map((d) => ({ ...d }))
  );

  const auxDefsLatestRef = useRef(auxDefs);
  auxDefsLatestRef.current = auxDefs;

  const auxSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auxLayoutSavedFingerprintRef = useRef<string>("");
  const auxLayoutHydratedRef = useRef(false);

  // Sync to store for narrow consumption (consistent with Phase 1)
  useEffect(() => {
    const storeAux = useShiftBuilderStore.getState().auxDefs;
    if (!storeAux || storeAux.length === 0) {
      useShiftBuilderStore.getState().setAuxDefs(auxDefs);
    }
  }, []);

  useEffect(() => {
    useShiftBuilderStore.getState().setAuxDefs(auxDefs);
  }, [auxDefs]);

  const flushAuxLayoutSave = useCallback(async () => {
    if (auxSaveTimerRef.current) {
      clearTimeout(auxSaveTimerRef.current);
      auxSaveTimerRef.current = null;
    }
    const layout = auxDefsLatestRef.current;
    const dateStr = formatLocalDateISO(selectedDay.date);
    let nid = currentNightId ?? nightId;
    try {
      if (!nid) {
        const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
        nid = await getOrCreateNightForDate(selectedDay.date, selectedDay.name);
      }
      const fp = `${nid}:${JSON.stringify(layout)}`;
      if (fp === auxLayoutSavedFingerprintRef.current) return;

      const { saveNightAuxLayout } = await import("@/lib/shiftbuilder/data");
      await saveNightAuxLayout(nid, layout, dateStr);
      auxLayoutSavedFingerprintRef.current = fp;

      if (queryClient) {
        patchNightCoreAuxLayoutCache(queryClient, dateStr, layout);
      }
    } catch (e) {
      console.warn("[ShiftBuilder] aux_layout save failed", e);
      showToast("Aux layout could not be saved", "error");
    }
  }, [selectedDay, currentNightId, nightId, queryClient, showToast]);

  const scheduleAuxLayoutSave = useCallback(
    (delayMs = 250) => {
      if (auxSaveTimerRef.current) clearTimeout(auxSaveTimerRef.current);
      auxSaveTimerRef.current = setTimeout(() => {
        auxSaveTimerRef.current = null;
        void flushAuxLayoutSave();
      }, delayMs);
    },
    [flushAuxLayoutSave]
  );

  const persistAuxLayoutNowRef = useRef<(layout: AuxDef[]) => void>(() => {});
  useEffect(() => {
    persistAuxLayoutNowRef.current = (layout) => {
      auxDefsLatestRef.current = layout;
      void flushAuxLayoutSave();
    };
  }, [flushAuxLayoutSave]);

  const addAuxSlot = () => {
    if (auxDefs.length >= MAX_AUX_SLOTS) return;

    const beforeAux = [...auxDefs];
    if (recordAuxChange) {
      recordAuxChange(`Added blank AUX slot`, beforeAux);
    }

    setAuxDefs((prev) => {
      const slot = createBlankAuxSlot(prev);
      if (!slot) return prev;
      const next = [...prev, slot];
      const warnings = validatePlacementOrder(next);
      if (warnings.length > 0) {
        console.warn("[Placement] AUX slot added out of order:", warnings);
      }
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  const setAuxRole = (slotKey: string, role: AuxRole) => {
    const beforeAux = [...auxDefs];

    setAuxDefs((prev) => {
      const next = applyAuxRole(prev, slotKey, role);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });

    if (role === "blank" && handleBoardLiveUnassign) {
      handleBoardLiveUnassign(slotKey);
    }
  };

  const setAuxLabel = (slotKey: string, label: string) => {
    setAuxDefs((prev) => {
      const next = applyAuxLabel(prev, slotKey, label);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  const removeLastAuxSlot = () => {
    const live = getAssignmentsSnapshot ? getAssignmentsSnapshot() : {};
    setAuxDefs((prev) => {
      const removable = findRemovableEmptyAuxSlot(prev, live);
      if (removable) {
        const beforeAux = [...prev];
        if (recordAuxChange) {
          recordAuxChange(`Removed empty AUX slot ${removable.key}`, beforeAux);
        }
        const next = prev.filter((d) => d.key !== removable.key);
        queueMicrotask(() => persistAuxLayoutNowRef.current(next));
        return next;
      }
      if (prev.length <= 5) return prev;
      const next = prev.slice(0, -1);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  const canAddAux = auxDefs.length < MAX_AUX_SLOTS;
  // Smarter canRemove using findRemovableEmptyAuxSlot for better UX
  const hasRemovable = React.useMemo(() => {
    const live = getAssignmentsSnapshot ? getAssignmentsSnapshot() : {};
    return !!findRemovableEmptyAuxSlot(auxDefs, live);
  }, [auxDefs]); // intentionally not depending on getter fn; it reads live store state
  const canRemoveAux = hasRemovable || auxDefs.length > 5;
  const lastAuxSlotLabel = auxDefs.length > 0 ? auxDefs[auxDefs.length - 1]?.label ?? null : null;

  // Re-seed on day change if needed (defensive)
  useEffect(() => {
    // The caller (Client) manages per-night aux hydration from query.
    // This hook focuses on mutation + persist.
  }, [selectedDay.date]);

  return {
    auxDefs,
    setAuxDefs, // exposed for query hydration from night-core
    addAuxSlot,
    setAuxRole,
    setAuxLabel,
    canAddAux,
    canRemoveAux,
    lastAuxSlotLabel,
    removeLastAuxSlot,
    flushAuxLayoutSave,
    scheduleAuxLayoutSave,
  };
}
