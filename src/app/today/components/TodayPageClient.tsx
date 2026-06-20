"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTodayZenMode } from "../hooks/useTodayZenMode";
import { useAssignPulse } from "../hooks/useAssignPulse";
import { TodayZenOrb } from "./TodayZenOrb";
import { TodayRadialMenu, type RadialMenuAction } from "./TodayRadialMenu";
import { TodayColorLegend } from "./TodayColorLegend";
import { Toaster, toast } from "sonner";
import {
  clearTodayOperatorName,
  readTodayOperatorName,
  writeTodayOperatorName,
} from "../lib/todayChangeLog";
import { TodayNameGate } from "./TodayNameGate";
import { TodayLoadingShell } from "./TodayLoadingShell";

import { useTodayBoard } from "../hooks/useTodayBoard";
import { useTodayScheduleNav } from "../hooks/useTodayScheduleNav";
import { TodayArtboard } from "./TodayArtboard";
import FloatingNav from "@/app/shiftbuilder/components/FloatingNav";
import { TODAY_STAGE_INSETS } from "../lib/constants";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

/** Floor kiosk safety: clear operator name after inactivity. */
const OPERATOR_IDLE_MS = 45 * 60 * 1000;

export function TodayPageClient() {
  const [operatorName, setOperatorName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOperatorName(readTodayOperatorName());
    setHydrated(true);
  }, []);

  const handleNameSubmit = useCallback((name: string) => {
    writeTodayOperatorName(name);
    setOperatorName(name);
  }, []);

  const handleChangeOperator = useCallback(() => {
    clearTodayOperatorName();
    setOperatorName(null);
  }, []);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      clearTodayOperatorName();
      setOperatorName(null);
      toast.info("Session ended — enter your name to continue", { duration: 6000 });
    }, OPERATOR_IDLE_MS);
  }, []);

  useEffect(() => {
    if (!operatorName) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    resetIdleTimer();

    const onActivity = () => resetIdleTimer();
    const events: Array<keyof WindowEventMap> = [
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "pointerdown",
    ];
    for (const ev of events) {
      window.addEventListener(ev, onActivity, { passive: true });
    }

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const ev of events) {
        window.removeEventListener(ev, onActivity);
      }
    };
  }, [operatorName, resetIdleTimer]);

  if (!hydrated) {
    return <TodayLoadingShell label="Loading deployment board…" />;
  }

  if (!operatorName) {
    return <TodayNameGate onSubmit={handleNameSubmit} />;
  }

  return (
    <TodayBoardShell
      operatorName={operatorName}
      onChangeOperator={handleChangeOperator}
    />
  );
}

function TodayBoardShell({
  operatorName,
  onChangeOperator,
}: {
  operatorName: string;
  onChangeOperator: () => void;
}) {
  const nav = useTodayScheduleNav();
  const { pulseSlotKey, triggerPulse } = useAssignPulse();
  const { zenActive, toggleZen, exitZen } = useTodayZenMode(true);
  const [radialMenu, setRadialMenu] = useState<{
    slotKey: string;
    x: number;
    y: number;
    accent: string;
  } | null>(null);
  const [legendDismissed, setLegendDismissed] = useState(false);

  const board = useTodayBoard({
    selectedDay: nav.selectedDay,
    selectedDayIndex: nav.selectedDayIndex,
    dayDefs: nav.dayDefs,
    operatorName,
    currentView: nav.currentView,
    setCurrentView: nav.setCurrentView,
    publishedStripDates: nav.publishedStripDates,
    onAssignPulse: triggerPulse,
    zenActive,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && zenActive) {
        e.preventDefault();
        exitZen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zenActive, exitZen]);

  useEffect(() => {
    document.body.classList.toggle("sb-today-zen-active", zenActive);
    return () => document.body.classList.remove("sb-today-zen-active");
  }, [zenActive]);

  const handleRadialAction = useCallback(
    (action: RadialMenuAction) => {
      if (!radialMenu) return;
      const { slotKey } = radialMenu;
      if (action === "assign") {
        board.handleSlotToggle(slotKey);
      } else if (action === "task") {
        board.handleSlotToggle(slotKey);
      } else if (action === "lock") {
        void board.handleToggleLock(slotKey);
      } else if (action === "coverage") {
        board.handleSlotToggle(slotKey);
      }
    },
    [radialMenu, board],
  );

  return (
    <div
      className={cn(
        "sb-today-kiosk-root flex h-screen flex-col overflow-hidden text-[#1C1C1E]",
        zenActive && "sb-today-zen",
        board.isScheduleReadOnly && "sb-today-view-only",
      )}
      style={{
        background: "#F4F3F0",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <Toaster position="top-center" richColors closeButton />

      {/* Use the shared refined FloatingNav (stripped for today kiosk) */}
      <FloatingNav
        variant="today"
        top={8}
        days={nav.navStrip.map((d) => ({
          id: d.navId,
          label: String(d.dateNum),
          shortLabel: d.shortLabel,
          weekdayShort: d.weekdayShort,
          dayLetter: d.dayLetter,
          dateNum: d.dateNum,
          isToday: d.isToday,
          date: d.date,
        }))}
        selectedDayId={nav.selectedNavId}
        onDaySelect={(id) => nav.selectNavDay(id)}
        onDayHover={(_, date) => nav.prefetchNight(date)}
        onPrevWeek={nav.goPrevWeek}
        onNextWeek={nav.goNextWeek}
        onToday={nav.goToday}
        currentView={nav.currentView}
        onViewChange={(v) => nav.setCurrentView(v as any)}
        onPrint={board.handlePrint}
        isDark={false}
        operatorName={operatorName}
        onExit={onChangeOperator}
        exitLabel="Exit"
        // No roster, publish, engine etc for stripped today
      />

      <TodayColorLegend
        visible={!zenActive && !legendDismissed}
        onDismiss={() => setLegendDismissed(true)}
      />
      <TodayZenOrb
        visible={zenActive}
        operatorName={operatorName}
        currentView={nav.currentView}
        onViewChange={nav.setCurrentView}
        onRestoreChrome={exitZen}
        showPrint={board.canPrint}
        onPrint={board.handlePrint}
        isPrinting={board.isPrinting}
      />
      <TodayRadialMenu
        open={!!radialMenu}
        x={radialMenu?.x ?? 0}
        y={radialMenu?.y ?? 0}
        accentColor={radialMenu?.accent ?? "#C13A14"}
        slotLabel={radialMenu?.slotKey}
        onSelect={handleRadialAction}
        onClose={() => setRadialMenu(null)}
      />

      {board.scheduleBanner && !zenActive ? (
        <div
          className="mx-auto w-full max-w-4xl shrink-0 px-4 pb-1 pt-1 text-center text-[11px] font-medium text-[#6C6C72]"
          role="status"
        >
          {board.scheduleBanner}
        </div>
      ) : null}

      {board.isScheduleHidden ? (
        <TodayUnpublishedPlaceholder
          selectedDay={nav.selectedDay}
          loading={board.statusLoading}
          error={board.statusError}
          onRetry={board.retryPublishMeta}
        />
      ) : (
        <TodayArtboard
          selectedDay={nav.selectedDay}
          selectedDayIndex={nav.selectedDayIndex}
          currentView={nav.currentView}
          nightId={board.nightId}
          boardColdLoading={board.boardColdLoading}
          scale={board.scale}
          stageHostRef={board.stageHostRef}
          positioningRef={board.positioningRef}
          naturalWidth={board.naturalWidth}
          naturalHeight={board.naturalHeight}
          selectedSlotKey={board.selectedSlotKey}
          breakGroup={board.breakGroup}
          isCurrentNightLocked={false}
          selectedTasks={board.selectedTasks}
          effectiveCardBorders={board.effectiveCardBorders}
          padAssignments={board.padAssignments}
          markerScheduledUnassigned={board.markerScheduledUnassigned}
          markerAllEligibleTms={board.markerAllEligibleTms}
          effectiveRealRoster={board.effectiveRealRoster}
          live={board.live}
          onSlotToggle={board.handleSlotToggle}
          onSlotClose={board.handleSlotClose}
          onAssign={board.handleAssign}
          onClearSlot={board.handleClearSlot}
          onToggleLock={board.handleToggleLock}
          setBreakGroupForSlot={board.setBreakGroupForSlot}
          onBreakGroupChange={board.setBreakGroup}
          onAddTask={board.handleAddTask}
          onRemoveTask={board.handleRemoveTask}
          onAssignSweeper={board.handleAssignSweeper}
          onAddCoverage={board.handleAddCoverage}
          activeDrag={board.activeDrag}
          onDragStart={board.onDragStart}
          onDragEnd={board.onDragEnd}
          kioskAssignPulseKey={pulseSlotKey}
          isViewOnly={board.isScheduleReadOnly}
          onKioskLongPress={(slotKey, anchor, accent) =>
            setRadialMenu({ slotKey, x: anchor.x, y: anchor.y, accent })
          }
          zenActive={zenActive}
        />
      )}
    </div>
  );
}

function TodayUnpublishedPlaceholder({
  selectedDay,
  loading = false,
  error = false,
  onRetry,
}: {
  selectedDay: DayDef;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const label = selectedDay.date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      className="flex flex-1 min-h-0 items-center justify-center px-6 text-center"
      style={{
        paddingTop: TODAY_STAGE_INSETS.top,
        paddingRight: TODAY_STAGE_INSETS.right,
        paddingBottom: TODAY_STAGE_INSETS.bottom,
        paddingLeft: TODAY_STAGE_INSETS.left,
      }}
    >
      <div className="max-w-sm rounded-2xl border border-black/8 bg-white/80 px-6 py-8 shadow-sm backdrop-blur-md">
        <p className="text-sm font-semibold text-[#1C1C1E]">
          {loading ? "Checking schedule…" : error ? "Couldn't verify schedule" : "No published schedule"}
        </p>
        {!loading && error ? (
          <>
            <p className="mt-2 text-xs leading-relaxed text-[#6C6C72]">
              Publish status for {label} could not be loaded. Check your connection and try again.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 rounded-xl bg-[#C13A14] px-4 py-2 text-xs font-semibold text-white hover:brightness-105"
              >
                Retry
              </button>
            ) : null}
          </>
        ) : null}
        {!loading && !error ? (
          <p className="mt-2 text-xs leading-relaxed text-[#6C6C72]">
            {label} has not been published yet. Published nights appear here for quick viewing and edits.
          </p>
        ) : null}
      </div>
    </div>
  );
}