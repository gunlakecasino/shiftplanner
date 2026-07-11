"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  createBlankAuxSlot,
  applyAuxRole,
  applyAuxLabel,
  defaultAuxDefsForNewNight,
  ensureCoreAuxRoles,
  findRemovableEmptyAuxSlot,
} from "@/lib/shiftbuilder/auxLayout";
import type { AuxDef, AuxRole } from "@/lib/shiftbuilder/placement";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import {
  patchNightCoreAuxLayoutCache,
} from "@/lib/shiftbuilder/scheduleCacheSync";
import { MAX_AUX_SLOTS } from "@/lib/shiftbuilder/constants";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { shouldPersistAuxLayout } from "@/lib/shiftbuilder/auxLayoutHydrationGuard";

/**
 * useAuxLayout
 *
 * Per-night AUX slot layout: defaults, mutations, store sync, and persist.
 *
 * Critical invariant — never persist until the night's layout has been hydrated
 * from night-core (or the operator explicitly mutated a shell). A prior race
 * scheduled saves from the default Admin+Z9SR+blanks shell on mount / day
 * switch and overwrote real aux_layout rows (names vanished until hard refresh).
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
  /** Apply server/query layout for the current day; enables persist after this. */
  hydrateAuxLayout: (layout: AuxDef[], nightIdForFingerprint?: string | null) => void;
  /** True once night-core (or a user mutation) has established this day's layout. */
  isAuxLayoutHydrated: boolean;
  addAuxSlot: () => void;
  setAuxRole: (slotKey: string, role: AuxRole) => void;
  setAuxLabel: (slotKey: string, label: string) => void;
  canAddAux: boolean;
  canRemoveAux: boolean;
  lastAuxSlotLabel: string | null;
  removeLastAuxSlot: () => void;
  flushAuxLayoutSave: (nightIdOverride?: string | null, layoutOverride?: AuxDef[]) => Promise<void>;
  scheduleAuxLayoutSave: (delayMs?: number) => void;
}

function layoutFingerprint(nightId: string | null | undefined, layout: AuxDef[]): string {
  return `${nightId ?? ""}:${JSON.stringify(layout)}`;
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
  const [auxDefs, setAuxDefsState] = useState<AuxDef[]>(() =>
    defaultAuxDefsForNewNight().map((d) => ({ ...d }))
  );
  // Public setter that does not imply "hydrated" — only hydrateAuxLayout / mutations do.
  const setAuxDefs = useCallback(
    (updater: AuxDef[] | ((prev: AuxDef[]) => AuxDef[])) => {
      setAuxDefsState(updater);
    },
    [],
  );

  const auxDefsLatestRef = useRef(auxDefs);
  auxDefsLatestRef.current = auxDefs;

  const auxSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const auxLayoutSavedFingerprintRef = useRef<string>("");
  /** Persist is blocked until true for the current selected day. */
  const auxLayoutHydratedRef = useRef(false);
  const hydratedDayKeyRef = useRef<string | null>(null);
  const [isAuxLayoutHydrated, setIsAuxLayoutHydrated] = useState(false);

  const dayKey = formatLocalDateISO(selectedDay.date);

  // Day switch: drop hydration so we never write the previous night's shells
  // (or the pre-hydrate default) onto the newly selected night.
  useEffect(() => {
    auxLayoutHydratedRef.current = false;
    hydratedDayKeyRef.current = null;
    setIsAuxLayoutHydrated(false);
    if (auxSaveTimerRef.current) {
      clearTimeout(auxSaveTimerRef.current);
      auxSaveTimerRef.current = null;
    }
    return () => {
      if (auxSaveTimerRef.current) {
        clearTimeout(auxSaveTimerRef.current);
        auxSaveTimerRef.current = null;
      }
    };
  }, [dayKey]);

  // Sync to store for narrow consumption
  useEffect(() => {
    const storeAux = useShiftBuilderStore.getState().auxDefs;
    if (!storeAux || storeAux.length === 0) {
      useShiftBuilderStore.getState().setAuxDefs(auxDefs);
    }
  }, []);

  useEffect(() => {
    useShiftBuilderStore.getState().setAuxDefs(auxDefs);
  }, [auxDefs]);

  const flushAuxLayoutSave = useCallback(async (nightIdOverride?: string | null, layoutOverride?: AuxDef[]) => {
    if (auxSaveTimerRef.current) {
      clearTimeout(auxSaveTimerRef.current);
      auxSaveTimerRef.current = null;
    }

    // layoutOverride/nightIdOverride let a debounced call persist the exact snapshot it was
    // scheduled with, instead of re-reading "latest" state that a day switch may have already
    // replaced with the next night's data (see scheduleAuxLayoutSave).
    const layout = layoutOverride ?? auxDefsLatestRef.current;

    // Hard gate: never persist pre-hydrate defaults or cross-day ghosts.
    if (
      !shouldPersistAuxLayout({
        hydrated: auxLayoutHydratedRef.current,
        hydratedDayKey: hydratedDayKeyRef.current,
        currentDayKey: dayKey,
        layoutLength: layout?.length ?? 0,
      })
    ) {
      return;
    }

    const dateStr = dayKey;
    let nid = nightIdOverride ?? currentNightId ?? nightId;
    try {
      if (!nid) {
        const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
        nid = await getOrCreateNightForDate(selectedDay.date, selectedDay.name);
      }
      // Re-check gate after await (day may have switched mid-flight).
      if (
        !shouldPersistAuxLayout({
          hydrated: auxLayoutHydratedRef.current,
          hydratedDayKey: hydratedDayKeyRef.current,
          currentDayKey: dayKey,
          layoutLength: layout.length,
        })
      ) {
        return;
      }

      const fp = layoutFingerprint(nid, layout);
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
  }, [dayKey, selectedDay, currentNightId, nightId, queryClient, showToast]);

  const scheduleAuxLayoutSave = useCallback(
    (delayMs = 250) => {
      if (!auxLayoutHydratedRef.current) return;
      if (auxSaveTimerRef.current) clearTimeout(auxSaveTimerRef.current);
      // Capture which night + layout this save is for right now. If the operator switches
      // days before the timer fires, this snapshot still targets the night being edited,
      // rather than whatever night/layout is current by the time the timeout callback runs.
      const capturedNightId = currentNightId ?? nightId;
      const capturedLayout = auxDefsLatestRef.current;
      const capturedDayKey = dayKey;
      auxSaveTimerRef.current = setTimeout(() => {
        auxSaveTimerRef.current = null;
        // Drop if day switched before fire.
        if (hydratedDayKeyRef.current !== capturedDayKey) return;
        void flushAuxLayoutSave(capturedNightId, capturedLayout);
      }, delayMs);
    },
    [flushAuxLayoutSave, currentNightId, nightId, dayKey]
  );

  /**
   * Apply night-core (or undo snapshot) layout for this day.
   * Enables persist and stamps the saved fingerprint so we don't immediately
   * re-POST the same payload.
   */
  const hydrateAuxLayout = useCallback(
    (layout: AuxDef[], nightIdForFingerprint?: string | null) => {
      const normalized = (layout ?? []).map((d) => ({
        ...d,
        role: d.role ?? ("blank" as const),
      }));
      const ensured = ensureCoreAuxRoles(
        normalized.length > 0 ? normalized : defaultAuxDefsForNewNight(),
      );

      auxDefsLatestRef.current = ensured;
      auxLayoutHydratedRef.current = true;
      hydratedDayKeyRef.current = dayKey;
      setIsAuxLayoutHydrated(true);

      const nid = nightIdForFingerprint ?? currentNightId ?? nightId;
      if (nid) {
        auxLayoutSavedFingerprintRef.current = layoutFingerprint(nid, ensured);
      }

      setAuxDefsState(ensured);
      useShiftBuilderStore.getState().setAuxDefs(ensured);
    },
    [dayKey, currentNightId, nightId],
  );

  const persistAuxLayoutNowRef = useRef<(layout: AuxDef[]) => void>(() => {});
  useEffect(() => {
    persistAuxLayoutNowRef.current = (layout) => {
      // User mutation: allow persist even if night-core was slow (operator owns this layout).
      auxLayoutHydratedRef.current = true;
      hydratedDayKeyRef.current = dayKey;
      setIsAuxLayoutHydrated(true);
      auxDefsLatestRef.current = layout;
      void flushAuxLayoutSave(undefined, layout);
    };
  }, [flushAuxLayoutSave, dayKey]);

  const addAuxSlot = () => {
    if (auxDefs.length >= MAX_AUX_SLOTS) return;

    const beforeAux = [...auxDefs];
    if (recordAuxChange) {
      recordAuxChange(`Added blank AUX slot`, beforeAux);
    }

    setAuxDefsState((prev) => {
      const slot = createBlankAuxSlot(prev);
      if (!slot) return prev;
      const next = [...prev, slot];
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  const setAuxRole = (slotKey: string, role: AuxRole) => {
    const current = auxDefs.find((d) => d.key === slotKey);
    // Admin + Z9 SR are permanent shells — never clear back to blank.
    if (
      role === "blank" &&
      (current?.role === "admin" || current?.role === "z9sr")
    ) {
      showToast("Admin and Z9 SR cards cannot be cleared", "error");
      return;
    }

    setAuxDefsState((prev) => {
      const next = applyAuxRole(prev, slotKey, role);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });

    if (role === "blank" && handleBoardLiveUnassign) {
      handleBoardLiveUnassign(slotKey);
    }
  };

  const setAuxLabel = (slotKey: string, label: string) => {
    setAuxDefsState((prev) => {
      const next = applyAuxLabel(prev, slotKey, label);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  const removeLastAuxSlot = () => {
    const live = getAssignmentsSnapshot ? getAssignmentsSnapshot() : {};
    setAuxDefsState((prev) => {
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
  const hasRemovable = useMemo(() => {
    const live = getAssignmentsSnapshot ? getAssignmentsSnapshot() : {};
    return !!findRemovableEmptyAuxSlot(auxDefs, live);
  }, [auxDefs, getAssignmentsSnapshot]);
  const canRemoveAux = hasRemovable || auxDefs.length > 5;
  const lastAuxSlotLabel = auxDefs.length > 0 ? auxDefs[auxDefs.length - 1]?.label ?? null : null;

  return {
    auxDefs,
    setAuxDefs,
    hydrateAuxLayout,
    isAuxLayoutHydrated,
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
