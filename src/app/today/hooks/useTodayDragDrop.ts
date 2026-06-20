"use client";

import { useCallback, useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { formatLocalDateISO, type DayDef } from "@/lib/shiftbuilder/dateUtils";
import { uiToDb } from "@/lib/shiftbuilder/slot-keys";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";
import { mirrorMainAssignmentsToLiveStore } from "@/lib/shiftbuilder/liveCache";
import { patchNightCoreAssignmentsCache } from "@/lib/shiftbuilder/scheduleCacheSync";
import type { BreakGroup } from "@/lib/shiftbuilder/constants";
import type { DeploymentChangeAction } from "../lib/todayChangeLog";

export type TodayActiveDrag = {
  kind: "tm" | "assigned" | "task";
  label: string;
  fromSlot?: string;
};

type UseTodayDragDropParams = {
  nightId: string | null;
  selectedDay: DayDef;
  isScheduleReadOnly: boolean;
  isSlotLocked: (slotKey: string) => boolean;
  onAssign: (slotKey: string, tmId: string, tmName: string) => void;
  onClearSlot: (slotKey: string) => void;
  setSelectedTasks: React.Dispatch<React.SetStateAction<Record<string, NightSlotTask[]>>>;
  logChange: (params: {
    action: DeploymentChangeAction;
    slotKey?: string;
    previousTmId?: string | null;
    previousTmName?: string | null;
    newTmId?: string | null;
    newTmName?: string | null;
    payload?: Record<string, unknown>;
  }) => void;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
};

function safeNormalizeSlotKey(key: string): string {
  if (!key) return key;
  try {
    uiToDb(key);
    return key;
  } catch {
    // Legacy / aux key fallbacks for older data or direct aux keys that don't go through the standard zone/rr/aux mapping.
    // Keep this small and explicit; unknown keys are passed through so the caller (onAssign etc.) can still try.
    const map: Record<string, string> = {
      admin: "ADM",
      z9_sr: "Z9SR",
      Z9: "Z9",
    };
    return map[key] || key;
  }
}

/**
 * Pending drag helpers — bridge to the main ShiftBuilderStore so that
 * ShiftBuilderBoard (and its displayAssignments memo) can keep the source
 * card visually "occupied" with the original TM while a reassignment drag
 * is in flight. This prevents the card from going empty mid-gesture and
 * breaking the draggable state.
 *
 * The `typeof ... === "function"` checks are defensive (migration artifact
 * between store shapes). On /today we always expect the modern shape.
 */
function clearPendingDrag(): void {
  const store = useShiftBuilderStore.getState();
  if (typeof store.setPendingDrag === "function") {
    store.setPendingDrag(null);
  } else {
    useShiftBuilderStore.setState({ pendingDrag: null });
  }
}

function setPendingDrag(fromSlot: string, tmId: string, tmName: string): void {
  const store = useShiftBuilderStore.getState();
  const payload = { fromSlot, tmId, tmName };
  if (typeof store.setPendingDrag === "function") {
    store.setPendingDrag(payload);
  } else {
    useShiftBuilderStore.setState({ pendingDrag: payload });
  }
}

/**
 * Resolve (or lazily create) the nightId for persistence.
 * Used by both task-move and assigned-reassign drag paths when the caller
 * did not yet have a nightId (e.g. first edit on "tonight").
 * Centralizing here reduces duplication and makes the "create on demand"
 * behavior explicit for /today.
 */
async function resolveNightIdForDrag(
  nightId: string | null,
  selectedDay: DayDef,
): Promise<string | null> {
  if (nightId) return nightId;
  const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
  return getOrCreateNightForDate(selectedDay.date, selectedDay.name);
}

async function syncBreakAfterDrag(
  nightId: string,
  uiKey: string,
  tmId: string | null,
  breakGroup: number | null | undefined,
): Promise<void> {
  if (!tmId) return;
  const { updateSlotBreakGroup, deleteBreakAssignment, upsertBreakAssignment } =
    await import("@/lib/shiftbuilder/data");
  const { slot_key, rr_side } = uiToDb(uiKey);
  const group = (breakGroup ?? 0) as BreakGroup;
  await updateSlotBreakGroup(nightId, slot_key, rr_side, group, tmId);
  if (group === 0) {
    await deleteBreakAssignment(nightId, tmId);
  } else {
    await upsertBreakAssignment({ nightId, tmId, groupNum: group, slotRef: uiKey });
  }
}

export function useTodayDragDrop({
  nightId,
  selectedDay,
  isScheduleReadOnly,
  isSlotLocked,
  onAssign,
  onClearSlot,
  setSelectedTasks,
  logChange,
  showToast,
}: UseTodayDragDropParams) {
  const queryClient = useQueryClient();
  const [activeDrag, setActiveDrag] = useState<TodayActiveDrag | null>(null);

  const onDragStart = useCallback((event: DragStartEvent) => {
    const d = event.active.data.current as {
      type?: string;
      tmId?: string;
      tmName?: string;
      fromSlot?: string;
      taskLabel?: string;
    } | null;
    if (!d?.type) return;

    // Three drag sources on /today (all require the ancestor InteractiveStage DndContext):
    // - "tm": from the unilateral PlacementPad's TmPicker rows (when enableTmDragAssign)
    // - "assigned": dragging a placed TM from a card to another slot (reassign/swap)
    // - "task": dragging a task chip from one slot's task list to another slot
    if (d.type === "tm" && d.tmName) {
      setActiveDrag({ kind: "tm", label: d.tmName });
    } else if (d.type === "assigned" && d.tmName && d.fromSlot) {
      setActiveDrag({ kind: "assigned", label: d.tmName, fromSlot: d.fromSlot });
      setPendingDrag(d.fromSlot, d.tmId ?? "", d.tmName);
    } else if (d.type === "task" && d.taskLabel) {
      setActiveDrag({ kind: "task", label: d.taskLabel, fromSlot: d.fromSlot });
    }
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      clearPendingDrag();

      if (isScheduleReadOnly) return;

      const { active, over } = event;
      const a = active.data.current as {
        type?: string;
        tmId?: string;
        tmName?: string;
        fromSlot?: string;
        taskLabel?: string;
      } | null;
      if (!a?.type) return;

      if (a.type === "tm" && a.tmId && a.tmName) {
        if (over?.data.current?.type === "slot") {
          const slotKey = safeNormalizeSlotKey((over.data.current as { slotKey: string }).slotKey);
          if (isSlotLocked(slotKey)) {
            showToast(`${slotKey} is locked`, "error");
            return;
          }
          onAssign(slotKey, a.tmId, a.tmName);
        }
        return;
      }

      if (a.type === "task" && a.taskLabel && a.fromSlot) {
        if (over?.data.current?.type !== "slot") return;
        const toUiKey = safeNormalizeSlotKey((over.data.current as { slotKey: string }).slotKey);
        const fromUiKey = safeNormalizeSlotKey(a.fromSlot);
        if (toUiKey === fromUiKey) return;
        if (isSlotLocked(fromUiKey) || isSlotLocked(toUiKey)) {
          showToast("Locked slots can't receive task moves", "error");
          return;
        }

        const { slot_key: toSlotKey, slot_type: toSlotType, rr_side: toRrSide } = uiToDb(toUiKey);
        const { slot_key: fromSlotKey, slot_type: fromSlotType, rr_side: fromRrSide } =
          uiToDb(fromUiKey);

        let tasksSnapshot: Record<string, NightSlotTask[]> | null = null;
        setSelectedTasks((prev) => {
          tasksSnapshot = prev;
          const fromList = prev[fromUiKey] ?? [];
          const taskToMove = fromList.find((t) => t.taskLabel === a.taskLabel);
          if (!taskToMove) return prev;

          const newFrom = fromList.filter((t) => t.taskLabel !== a.taskLabel);
          const movedTask: NightSlotTask = {
            ...taskToMove,
            slotKey: toSlotKey,
            slotType: toSlotType,
            rrSide: toRrSide,
          };
          const newTo = [...(prev[toUiKey] ?? []), movedTask];
          return { ...prev, [fromUiKey]: newFrom, [toUiKey]: newTo };
        });

        void (async () => {
          const nid = await resolveNightIdForDrag(nightId, selectedDay);
          if (!nid) {
            if (tasksSnapshot) setSelectedTasks(tasksSnapshot);
            showToast("Couldn't save task move", "error");
            return;
          }
          try {
            const { moveNightSlotTask } = await import("@/lib/shiftbuilder/data");
            await moveNightSlotTask({
              nightId: nid,
              fromSlotKey,
              fromSlotType,
              fromRrSide,
              toSlotKey,
              toSlotType,
              toRrSide,
              taskLabel: a.taskLabel!,
            });
            logChange({
              action: "task_remove",
              slotKey: fromUiKey,
              payload: { taskLabel: a.taskLabel, movedTo: toUiKey },
            });
            logChange({
              action: "task_add",
              slotKey: toUiKey,
              payload: { taskLabel: a.taskLabel, movedFrom: fromUiKey },
            });
            showToast(`Moved task → ${toUiKey}`, "success");
          } catch (e) {
            console.error("[today] task move persist failed", e);
            if (tasksSnapshot) setSelectedTasks(tasksSnapshot);
            showToast("Couldn't move task — reverted", "error");
          }
        })();
        return;
      }

      // "assigned" drag: the user is dragging a TM that is already placed on the board
      // (from a Zone/RR/Aux card). This supports:
      // - Drop on another slot → move or swap (direct store mutation here, not via live.assign)
      // - Drop outside any slot → clear (delegates to onClearSlot → live.unassign)
      //
      // Why not go through the live hook for the slot-to-slot case?
      // The live hook's assign/unassign is optimized for "new placement from pad".
      // Reassignment needs explicit swap semantics + immediate update of the main
      // board store so that displayAssignments + pendingDrag visuals stay consistent
      // and the narrow Zustand subscribers in Board/cards see the change instantly.
      // We still patch the TanStack cache and emit the audit logs.
      if (a.type === "assigned" && a.fromSlot && a.tmId && a.tmName) {
        const fromKey = safeNormalizeSlotKey(a.fromSlot);

        if (over?.data.current?.type === "slot") {
          const toKey = safeNormalizeSlotKey((over.data.current as { slotKey: string }).slotKey);
          if (toKey === fromKey) return;
          if (isSlotLocked(fromKey) || isSlotLocked(toKey)) {
            showToast("Locked slots can't be moved or swapped", "error");
            return;
          }

          const assignmentsSnapshot = {
            ...(useShiftBuilderStore.getState().assignments || {}),
          };
          const movingFromMain = assignmentsSnapshot[fromKey];
          const displacedFromMain = assignmentsSnapshot[toKey];
          const movingTmId = movingFromMain?.tmId ?? a.tmId;
          const movingTmName = movingFromMain?.tmName ?? a.tmName;
          const displacedTmId = displacedFromMain?.tmId ?? null;
          const displacedTmName = displacedFromMain?.tmName ?? null;

          const dateKey = formatLocalDateISO(selectedDay.date);

          const applyOptimisticAssignments = () => {
            useShiftBuilderStore.getState().setAssignments((prev: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
              const next = { ...prev };
              if (displacedFromMain) {
                next[fromKey] = { ...displacedFromMain, slotKey: fromKey };
              } else {
                delete next[fromKey];
              }
              if (movingFromMain) {
                next[toKey] = { ...movingFromMain, slotKey: toKey };
              }
              return next;
            });
            patchNightCoreAssignmentsCache(
              queryClient,
              dateKey,
              useShiftBuilderStore.getState().assignments ?? {},
            );
          };

          const rollbackAssignments = () => {
            useShiftBuilderStore.getState().setAssignments(assignmentsSnapshot);
            patchNightCoreAssignmentsCache(queryClient, dateKey, assignmentsSnapshot);
          };

          applyOptimisticAssignments();
          mirrorMainAssignmentsToLiveStore(selectedDay.date);

          void (async () => {
            const nid = await resolveNightIdForDrag(nightId, selectedDay);
            if (!nid) {
              rollbackAssignments();
              showToast("Couldn't save assignment move", "error");
              return;
            }
            try {
              const { upsertZoneAssignment, deleteZoneAssignment } =
                await import("@/lib/shiftbuilder/data");
              const { slot_key, slot_type, rr_side } = uiToDb(toKey);
              await upsertZoneAssignment({
                nightId: nid,
                slotKey: slot_key,
                slotType: slot_type,
                rrSide: rr_side,
                tmId: movingTmId,
              });
              if (displacedTmId) {
                const fromMapped = uiToDb(fromKey);
                await upsertZoneAssignment({
                  nightId: nid,
                  slotKey: fromMapped.slot_key,
                  slotType: fromMapped.slot_type,
                  rrSide: fromMapped.rr_side,
                  tmId: displacedTmId,
                });
              } else {
                await deleteZoneAssignment({ nightId: nid, uiKey: fromKey });
              }

              await syncBreakAfterDrag(nid, toKey, movingTmId, movingFromMain?.breakGroup);
              if (displacedTmId) {
                await syncBreakAfterDrag(
                  nid,
                  fromKey,
                  displacedTmId,
                  displacedFromMain?.breakGroup,
                );
              }

              logChange({
                action: "assign",
                slotKey: toKey,
                previousTmId: displacedTmId,
                previousTmName: displacedTmName,
                newTmId: movingTmId,
                newTmName: movingTmName,
                payload: { dragFrom: fromKey },
              });
              if (displacedTmId) {
                logChange({
                  action: "assign",
                  slotKey: fromKey,
                  previousTmId: movingTmId,
                  previousTmName: movingTmName,
                  newTmId: displacedTmId,
                  newTmName: displacedTmName,
                  payload: { dragSwap: true, dragFrom: toKey },
                });
                showToast(`Swapped ${movingTmName} ↔ ${displacedTmName}`, "success");
              } else {
                logChange({
                  action: "unassign",
                  slotKey: fromKey,
                  previousTmId: movingTmId,
                  previousTmName: movingTmName,
                  payload: { dragMove: true, dragTo: toKey },
                });
                showToast(`Moved ${movingTmName} → ${toKey}`, "success");
              }
            } catch (e) {
              console.error("[today] assignment drag persist failed", e);
              rollbackAssignments();
              showToast("Couldn't save move — reverted", "error");
            }
          })();
          return;
        }

        if (!over) {
          onClearSlot(fromKey);
        }
      }
    },
    [
      isScheduleReadOnly,
      isSlotLocked,
      nightId,
      selectedDay,
      onAssign,
      onClearSlot,
      setSelectedTasks,
      logChange,
      showToast,
      queryClient,
    ],
  );

  return { activeDrag, onDragStart, onDragEnd };
}