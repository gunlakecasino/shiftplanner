"use client";

import { useCallback, useState } from "react";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { formatLocalDateISO, type DayDef } from "@/lib/shiftbuilder/dateUtils";
import { uiToDb } from "@/lib/shiftbuilder/slot-keys";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";
import { patchNightCoreAssignmentsCache } from "@/lib/shiftbuilder/scheduleCacheSync";
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
    const map: Record<string, string> = {
      admin: "ADM",
      z9_sr: "Z9SR",
      Z9: "Z9",
    };
    return map[key] || key;
  }
}

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

export function useTodayDragDrop({
  nightId,
  selectedDay,
  isScheduleReadOnly,
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
          onAssign(slotKey, a.tmId, a.tmName);
        }
        return;
      }

      if (a.type === "task" && a.taskLabel && a.fromSlot) {
        if (over?.data.current?.type !== "slot") return;
        const toUiKey = safeNormalizeSlotKey((over.data.current as { slotKey: string }).slotKey);
        const fromUiKey = safeNormalizeSlotKey(a.fromSlot);
        if (toUiKey === fromUiKey) return;

        const { slot_key: toSlotKey, slot_type: toSlotType, rr_side: toRrSide } = uiToDb(toUiKey);
        const { slot_key: fromSlotKey, slot_type: fromSlotType, rr_side: fromRrSide } =
          uiToDb(fromUiKey);

        setSelectedTasks((prev) => {
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

        void (async () => {
          let nid = nightId;
          if (!nid) {
            const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
            nid = await getOrCreateNightForDate(selectedDay.date, selectedDay.name);
          }
          if (!nid) return;
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
          } catch (e) {
            console.error("[today] task move persist failed", e);
            showToast("Task moved on screen but failed to save", "error");
          }
        })();
        return;
      }

      if (a.type === "assigned" && a.fromSlot && a.tmId && a.tmName) {
        const fromKey = safeNormalizeSlotKey(a.fromSlot);

        if (over?.data.current?.type === "slot") {
          const toKey = safeNormalizeSlotKey((over.data.current as { slotKey: string }).slotKey);
          if (toKey === fromKey) return;

          const mainAssignments = useShiftBuilderStore.getState().assignments || {};
          const movingFromMain = mainAssignments[fromKey];
          const displacedFromMain = mainAssignments[toKey];
          const movingTmId = movingFromMain?.tmId ?? a.tmId;
          const movingTmName = movingFromMain?.tmName ?? a.tmName;
          const displacedTmId = displacedFromMain?.tmId ?? null;
          const displacedTmName = displacedFromMain?.tmName ?? null;

          useShiftBuilderStore.getState().setAssignments((prev: Record<string, any>) => {
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

          const dateKey = formatLocalDateISO(selectedDay.date);
          patchNightCoreAssignmentsCache(
            queryClient,
            dateKey,
            useShiftBuilderStore.getState().assignments ?? {},
          );

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
          } else {
            logChange({
              action: "unassign",
              slotKey: fromKey,
              previousTmId: movingTmId,
              previousTmName: movingTmName,
              payload: { dragMove: true, dragTo: toKey },
            });
          }

          void (async () => {
            let nid = nightId;
            if (!nid) {
              const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
              nid = await getOrCreateNightForDate(selectedDay.date, selectedDay.name);
            }
            if (!nid) return;
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
            } catch (e) {
              console.error("[today] assignment drag persist failed", e);
              showToast("Move applied on screen but failed to save", "error");
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