"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShiftData } from "@/app/shiftbuilder/hooks/useShiftData";
import { useToast } from "@/app/shiftbuilder/hooks/useToast";
import {
  useZoom,
  NATURAL_WIDTH,
  NATURAL_HEIGHT,
} from "@/app/shiftbuilder/hooks/useZoom";
import { useLiveAssignments } from "@/lib/shiftbuilder/useLiveAssignments";
import { initLiveCacheForNight, teardownAllLiveCache } from "@/lib/shiftbuilder/liveCache";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { uiToDb, dbToUi } from "@/lib/shiftbuilder/slot-keys";
import { BLANK_AUX_DEFS } from "@/lib/shiftbuilder/constants";
import { useShiftBuilderStore } from "@/app/shiftbuilder/store/useShiftBuilderStore";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { TmEntry } from "@/app/shiftbuilder/components/MarkerPad";
import {
  logDeploymentChange,
  type DeploymentChangeAction,
} from "../lib/todayChangeLog";
import { TODAY_STAGE_INSETS } from "../lib/constants";
import { printTodaySchedule } from "../lib/printTodaySchedule";
import type { TodayBoardView } from "./useTodayScheduleNav";
import { useTodayDragDrop } from "./useTodayDragDrop";
import {
  expandCoverageToKeys,
  getSlotAccentColor,
  getSlotCoverageLabel,
} from "../lib/coverageHelpers";

type UseTodayBoardParams = {
  selectedDay: DayDef;
  selectedDayIndex: number;
  operatorName: string;
  currentView: TodayBoardView;
  setCurrentView: (view: TodayBoardView) => void;
};

async function refreshTasksForNight(
  nightId: string,
  setSelectedTasks: React.Dispatch<React.SetStateAction<Record<string, NightSlotTask[]>>>,
) {
  const { getNightSlotTasks } = await import("@/lib/shiftbuilder/data");
  const fresh = await getNightSlotTasks(nightId);
  const byKey: Record<string, NightSlotTask[]> = {};
  for (const t of fresh) {
    const uiKey = dbToUi(t.slotKey, t.slotType, t.rrSide ?? null);
    if (uiKey.startsWith("UNK:")) continue;
    (byKey[uiKey] ??= []).push(t);
  }
  setSelectedTasks(byKey);
}

export function useTodayBoard({
  selectedDay,
  selectedDayIndex,
  operatorName,
  currentView,
  setCurrentView,
}: UseTodayBoardParams) {
  const { showToast } = useToast();
  const shiftData = useShiftData(selectedDay);
  const {
    currentNight,
    storeAssignments,
    effectiveAssignments,
    effectiveRealRoster,
    effectiveScheduledTmIdsTonight,
    effectiveCardBorders,
    boardColdLoading,
  } = shiftData;

  const nightId = currentNight.nightId ?? null;
  const queryNightId = nightId;
  const live = useLiveAssignments(selectedDay);

  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);
  const [isCurrentNightLocked, setIsCurrentNightLocked] = useState(false);
  const [nightStatus, setNightStatus] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<Record<string, NightSlotTask[]>>({});
  const [breakGroup, setBreakGroup] = useState<1 | 2 | 3>(1);
  const positioningRef = useRef<HTMLDivElement>(null);

  const { stageHostRef, scale, recomputeScale } = useZoom({
    rosterOpen: false,
    stageInsets: TODAY_STAGE_INSETS,
  });

  useEffect(() => {
    recomputeScale();
  }, [recomputeScale]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedSlotKey(null);
    setNightStatus(null);
    setIsCurrentNightLocked(false);
    setStatusLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedDay.date]); // Day-change resets: intentional synchronous UI clear (linter advisory for reset-on-dep-change)

  // Resolve publish status from the selected calendar date — not shiftData nightId
  // (which can lag a day behind during week navigation and flash the wrong board).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getNightIdForDate, getNightMeta } = await import("@/lib/shiftbuilder/data");
        const id = await getNightIdForDate(selectedDay.date);
        if (!id) {
          if (!cancelled) {
            setNightStatus(null);
            setIsCurrentNightLocked(false);
            setStatusLoading(false);
          }
          return;
        }
        const meta = await getNightMeta(id);
        if (!cancelled) {
          setIsCurrentNightLocked(!!meta.isLocked);
          setNightStatus(meta.status);
          setStatusLoading(false);
        }
      } catch {
        if (!cancelled) {
          setNightStatus(null);
          setIsCurrentNightLocked(false);
          setStatusLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDay.date]);

  const isPublished = nightStatus === "published";
  /** /today only surfaces published history; tonight stays available for quick edits. */
  const isScheduleHidden =
    !selectedDay.isToday && (statusLoading || !isPublished);

  /**
   * PRODUCTION POLICY:
   * Builder night-lock (isCurrentNightLocked from nights.is_locked) does NOT make
   * the schedule read-only on /today. /today is explicitly the "quick view + fast
   * corrections" surface for published (or tonight) schedules.
   *
   * The full /shiftbuilder respects the lock for normal operators.
   * We still compute isCurrentNightLocked from meta (for potential future use or
   * read-only indicators) but force isScheduleReadOnly=false here.
   *
   * See TodayPageClient.tsx where we pass isCurrentNightLocked={false} explicitly
   * into TodayArtboard (overriding the value from this hook).
   */
  const isScheduleReadOnly = false;
  const canPrint = !statusLoading && (selectedDay.isToday || isPublished);
  // scheduleBanner: reserved for future status / realtime / notice banners.
  // Currently always null; the UI conditional in TodayPageClient documents this.
  const scheduleBanner: string | null = null;

  useEffect(() => {
    if (!queryNightId || !currentNight.queryClient) return;
    const dateKey = formatLocalDateISO(selectedDay.date);
    const cleanup = initLiveCacheForNight(queryNightId, dateKey, currentNight.queryClient);
    return () => cleanup?.();
  }, [queryNightId, selectedDay.date, currentNight.queryClient]);

  useEffect(() => () => teardownAllLiveCache(), []);

  // Force the canonical aux list into the shared Zustand store.
  // This is a cross-cutting side effect: /today does not own custom aux defs.
  // If the operator also has the full ShiftBuilder open in another tab/window,
  // this can overwrite any operator-added aux in that session's store.
  // Acceptable for the current architecture (aux are stable defaults for graves).
  useEffect(() => {
    const fromNight = (currentNight as { auxDefs?: typeof BLANK_AUX_DEFS }).auxDefs;
    useShiftBuilderStore.getState().setAuxDefs(
      fromNight?.length ? fromNight : BLANK_AUX_DEFS,
    );
  }, [currentNight]);

  useEffect(() => {
    const rows = currentNight.tasks as NightSlotTask[] | undefined;
    if (!rows?.length) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSelectedTasks({});
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    const tasksByUiKey: Record<string, NightSlotTask[]> = {};
    rows.forEach((row) => {
      const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
      if (uiKey.startsWith("UNK:")) return;
      (tasksByUiKey[uiKey] ??= []).push(row);
    });
    setSelectedTasks(tasksByUiKey);
  }, [currentNight.tasks]); // syncing transformed tasks from remote to local state on change (the setSelectedTasks in empty case uses its own disable block)

  const assignments = useMemo(
    () => storeAssignments ?? effectiveAssignments ?? {},
    [storeAssignments, effectiveAssignments]
  ); // Memoized to stabilize for downstream useMemo (padAssignments) and avoid exhaustive-deps churn

  const padAssignments = useMemo(
    () => ({ ...effectiveAssignments, ...assignments }),
    [effectiveAssignments, assignments],
  );

  const alreadyAssignedTonight = useMemo(() => {
    const set = new Set<string>();
    Object.values(padAssignments).forEach((a: { tmId?: string }) => {
      if (a?.tmId) set.add(a.tmId);
    });
    return set;
  }, [padAssignments]);

  const markerAllEligibleTms = useMemo(
    () =>
      (effectiveRealRoster || [])
        .filter((tm: { id?: string }) => tm?.id && !alreadyAssignedTonight.has(tm.id))
        .map((tm: { id: string; name?: string; fullName?: string; displayName?: string }) => ({
          tmId: tm.id,
          tmName: tm.name || tm.fullName || tm.displayName || tm.id,
        })),
    [effectiveRealRoster, alreadyAssignedTonight],
  );

  const markerScheduledUnassigned = useMemo(() => {
    const out: TmEntry[] = [];
    effectiveScheduledTmIdsTonight.forEach((tmId) => {
      if (alreadyAssignedTonight.has(tmId)) return;
      const tm = effectiveRealRoster.find((t: { id: string }) => t.id === tmId);
      out.push({
        tmId,
        tmName: tm?.name || tm?.fullName || tmId,
      });
    });
    return out;
  }, [effectiveScheduledTmIdsTonight, alreadyAssignedTonight, effectiveRealRoster]);

  // recentTasks was historically used by the full MarkerPad quick-chip UI.
  // On the /today surface (unilateral PlacementPad with insights disabled),
  // it is not forwarded to TodayArtboard / ShiftBuilderBoard.
  // We keep the selectedTasks source of truth but skip the derived list
  // to avoid unnecessary work on every task change.
  // If a future iteration needs recent chips on /today, restore the memo here
  // and wire it through TodayArtboardProps + ShiftBuilderBoard + PlacementPad.

  const logChange = useCallback(
    (params: {
      action: DeploymentChangeAction;
      slotKey?: string;
      previousTmId?: string | null;
      previousTmName?: string | null;
      newTmId?: string | null;
      newTmName?: string | null;
      payload?: Record<string, unknown>;
    }) => {
      if (!nightId) return;
      logDeploymentChange({
        nightId,
        nightDate: formatLocalDateISO(selectedDay.date),
        operatorName,
        ...params,
        payload: { source: "today_marker_pad", ...params.payload },
      });
    },
    [nightId, selectedDay.date, operatorName],
  );

  const handleSlotToggle = useCallback(
    (slotKey: string) => {
      if (isScheduleReadOnly) {
        showToast("This night is locked — editing disabled", "error");
        return;
      }
      let resolved = slotKey;
      if (/^RR\d+$/.test(slotKey)) {
        const num = slotKey.replace(/^RR/, "");
        const merged = useShiftBuilderStore.getState().assignments ?? {};
        resolved = !merged[`MRR${num}`]?.tmName ? `MRR${num}` : `WRR${num}`;
      }
      setSelectedSlotKey((prev) => (prev === resolved ? null : resolved));
    },
    [isScheduleReadOnly, showToast],
  );

  const handleAssign = useCallback(
    (slotKey: string, tmId: string, tmName: string) => {
      if (isScheduleReadOnly) {
        showToast("This night is locked — editing disabled", "error");
        return;
      }
      if (/^RR\d+$/.test(slotKey)) {
        showToast("Select a specific M or W side on the RR card", "error");
        return;
      }
      const prev = padAssignments[slotKey];
      live.assign(slotKey, tmId, tmName, {
        captureDate: selectedDay.date,
        captureDayName: selectedDay.name,
        targetNightId: nightId,
        isDraftMode: false,
      });
      logChange({
        action: "assign",
        slotKey,
        previousTmId: prev?.tmId ?? null,
        previousTmName: prev?.tmName ?? null,
        newTmId: tmId,
        newTmName: tmName,
      });
      showToast(`Assigned ${tmName} → ${slotKey}`, "success");
    },
    [
      isScheduleReadOnly,
      padAssignments,
      selectedDay,
      nightId,
      live,
      logChange,
      showToast,
    ],
  );

  const handleClearSlot = useCallback(
    (slotKey: string) => {
      if (isScheduleReadOnly) {
        showToast("This night is locked — editing disabled", "error");
        return;
      }
      const prev = padAssignments[slotKey];
      live.unassign(slotKey, {
        captureDate: selectedDay.date,
        captureDayName: selectedDay.name,
        targetNightId: nightId,
        isDraftMode: false,
      });
      logChange({
        action: "unassign",
        slotKey,
        previousTmId: prev?.tmId ?? null,
        previousTmName: prev?.tmName ?? null,
      });
      setSelectedSlotKey(null);
      showToast(`Cleared ${slotKey}`, "success");
    },
    [
      isScheduleReadOnly,
      padAssignments,
      selectedDay,
      nightId,
      live,
      logChange,
      showToast,
    ],
  );

  const handleToggleLock = useCallback(
    async (slotKey: string) => {
      if (!nightId) return;
      const current = !!padAssignments[slotKey]?.isLocked;
      const nextLocked = !current;
      const { slot_key, slot_type, rr_side } = uiToDb(slotKey);
      try {
        const { toggleAssignmentLock } = await import("@/lib/shiftbuilder/data");
        await toggleAssignmentLock({
          nightId,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          currentLocked: current,
        });
        useShiftBuilderStore.getState().setAssignments((prev: Record<string, unknown>) => ({
          ...prev,
          [slotKey]: { ...(prev[slotKey] as object), isLocked: nextLocked },
        })); // 'as object' cast mirrors the loose typing of the shared Zustand assignments store
        logChange({
          action: nextLocked ? "lock" : "unlock",
          slotKey,
          previousTmId: padAssignments[slotKey]?.tmId ?? null,
          previousTmName: padAssignments[slotKey]?.tmName ?? null,
        });
        showToast(`${nextLocked ? "Locked" : "Unlocked"} ${slotKey}`, "success");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Couldn't update lock";
        showToast(msg, "error");
      }
    },
    [nightId, padAssignments, logChange, showToast],
  );

  const setBreakGroupForSlot = useCallback(
    async (slotKey: string, group: 0 | 1 | 2 | 3) => {
      if (!nightId || isScheduleReadOnly) return;
      try {
        const { updateSlotBreakGroup } = await import("@/lib/shiftbuilder/data");
        const { slot_key, rr_side } = uiToDb(slotKey);
        const tmId = padAssignments[slotKey]?.tmId ?? null;
        await updateSlotBreakGroup(nightId, slot_key, rr_side, group, tmId);
        useShiftBuilderStore.getState().setAssignments((prev: Record<string, unknown>) => ({
          ...prev,
          [slotKey]: { ...(prev[slotKey] as object), breakGroup: group },
        })); // 'as object' cast mirrors the loose typing of the shared Zustand assignments store
        logChange({
          action: "break_change",
          slotKey,
          payload: { breakGroup: group, tmId },
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Couldn't save break group";
        showToast(msg, "error");
      }
    },
    [nightId, isScheduleReadOnly, padAssignments, showToast, logChange],
  );

  const handleAddTask = useCallback(
    async (slotKey: string, taskLabel: string) => {
      if (isScheduleReadOnly) {
        showToast("This night is locked — cannot add tasks", "error");
        return;
      }
      if (!nightId || !taskLabel.trim()) return;
      try {
        const { addNightSlotTask } = await import("@/lib/shiftbuilder/data");
        const { slot_key, slot_type, rr_side } = uiToDb(slotKey);
        const label = taskLabel.trim();
        await addNightSlotTask({
          nightId,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          taskLabel: label,
          sortOrder: 50,
        });
        logChange({
          action: "task_add",
          slotKey,
          payload: { taskLabel: label },
        });
        await refreshTasksForNight(nightId, setSelectedTasks);
      } catch {
        showToast("Failed to save task", "error");
      }
    },
    [isScheduleReadOnly, nightId, showToast, logChange],
  );

  const handlePrint = useCallback(async () => {
    if (!canPrint) {
      showToast("Print is only available for tonight or published schedules", "error");
      return;
    }
    if (boardColdLoading) {
      showToast("Still loading — try again in a moment", "error");
      return;
    }
    setIsPrinting(true);
    try {
      await printTodaySchedule({
        currentView,
        setCurrentView,
        onSlotClose: () => setSelectedSlotKey(null),
      });
    } finally {
      setIsPrinting(false);
    }
  }, [canPrint, boardColdLoading, currentView, setCurrentView, showToast]);

  const handleRemoveTask = useCallback(
    async (slotKey: string, taskLabel: string) => {
      if (!nightId) return;
      setSelectedTasks((prev) => {
        const existing = prev[slotKey] || [];
        return { ...prev, [slotKey]: existing.filter((t) => t.taskLabel !== taskLabel) };
      });
      try {
        const { removeNightSlotTask } = await import("@/lib/shiftbuilder/data");
        const { slot_key, slot_type, rr_side } = uiToDb(slotKey);
        await removeNightSlotTask({
          nightId,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          taskLabel,
        });
        logChange({
          action: "task_remove",
          slotKey,
          payload: { taskLabel },
        });
      } catch {
        showToast("Failed to remove task", "error");
        await refreshTasksForNight(nightId, setSelectedTasks);
      }
    },
    [nightId, showToast, logChange],
  );

  const handleAssignSweeper = useCallback(
    async (slotKey: string, sweeperLabel: string) => {
      if (!nightId) {
        showToast("No active night selected", "error");
        return;
      }
      try {
        const { addNightSlotTask } = await import("@/lib/shiftbuilder/data");
        const { slot_key, slot_type, rr_side } = uiToDb(slotKey);
        await addNightSlotTask({
          nightId,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          taskLabel: sweeperLabel,
          sortOrder: 60,
          color: "#FF9F0A",
        });
        logChange({
          action: "task_add",
          slotKey,
          payload: { taskLabel: sweeperLabel, sweeper: true },
        });
        await refreshTasksForNight(nightId, setSelectedTasks);
      } catch {
        showToast("Failed to assign sweeper", "error");
      }
    },
    [nightId, showToast, logChange],
  );

  const handleAddCoverage = useCallback(
    async (sourceKey: string, targetKey: string) => {
      if (!nightId) {
        showToast("No active night selected", "error");
        return;
      }
      const accentColor = getSlotAccentColor(sourceKey);
      const targetLabel = getSlotCoverageLabel(targetKey);
      const sourceKeys = expandCoverageToKeys(sourceKey);
      try {
        const { addNightSlotTask } = await import("@/lib/shiftbuilder/data");
        for (const sk of sourceKeys) {
          const { slot_key, slot_type, rr_side } = uiToDb(sk);
          await addNightSlotTask({
            nightId,
            slotKey: slot_key,
            slotType: slot_type,
            rrSide: rr_side,
            taskLabel: `And ${targetLabel}`,
            isCoverage: true,
            color: accentColor,
            sortOrder: 99,
          });
          logChange({
            action: "coverage_add",
            slotKey: sk,
            payload: {
              taskLabel: `And ${targetLabel}`,
              targetKey,
              targetLabel,
              sourceKey,
            },
          });
        }
        await refreshTasksForNight(nightId, setSelectedTasks);
      } catch {
        showToast("Failed to add coverage", "error");
      }
    },
    [nightId, showToast, logChange],
  );

  const drag = useTodayDragDrop({
    nightId,
    selectedDay,
    isScheduleReadOnly,
    onAssign: handleAssign,
    onClearSlot: handleClearSlot,
    setSelectedTasks,
    logChange,
    showToast,
  });

  return {
    nightId,
    selectedDayIndex,
    assignments,
    padAssignments,
    selectedSlotKey,
    setSelectedSlotKey,
    selectedTasks,
    breakGroup,
    setBreakGroup,
    isCurrentNightLocked,
    isScheduleHidden,
    statusLoading,
    isScheduleReadOnly,
    nightStatus,
    canPrint,
    scheduleBanner, // always null in current /today (see comment above)
    isPrinting,
    handlePrint,
    boardColdLoading,
    effectiveCardBorders,
    effectiveRealRoster,
    markerScheduledUnassigned,
    markerAllEligibleTms,
    live,
    scale,
    stageHostRef,
    positioningRef,
    naturalWidth: NATURAL_WIDTH,
    naturalHeight: NATURAL_HEIGHT,
    handleSlotToggle,
    handleSlotClose: () => setSelectedSlotKey(null),
    handleAssign,
    handleClearSlot,
    handleToggleLock,
    setBreakGroupForSlot,
    handleAddTask,
    handleRemoveTask,
    handleAssignSweeper,
    handleAddCoverage,
    activeDrag: drag.activeDrag,
    onDragStart: drag.onDragStart,
    onDragEnd: drag.onDragEnd,
  };
}