"use client";

import { useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import {
  clearTodayOperatorName,
  readTodayOperatorName,
  writeTodayOperatorName,
} from "../lib/todayChangeLog";
import { TodayNameGate } from "./TodayNameGate";
import { TodayLoadingShell } from "./TodayLoadingShell";

import { useTodayBoard } from "../hooks/useTodayBoard";
import { useTodayScheduleNav } from "../hooks/useTodayScheduleNav";
import { TodayNav } from "./TodayNav";
import { TodayArtboard } from "./TodayArtboard";
import { TODAY_STAGE_INSETS } from "../lib/constants";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

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
  const board = useTodayBoard({
    selectedDay: nav.selectedDay,
    selectedDayIndex: nav.selectedDayIndex,
    operatorName,
    currentView: nav.currentView,
    setCurrentView: nav.setCurrentView,
  });

  return (
    <div
      className="flex h-screen flex-col overflow-hidden text-[#1C1C1E]"
      style={{
        background: "#F4F3F0",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <Toaster position="top-center" richColors closeButton />
      <TodayNav
        navStrip={nav.navStrip}
        selectedNavId={nav.selectedNavId}
        selectedDayDate={nav.selectedDay.date}
        onSelectNavDay={nav.selectNavDay}
        onDayHover={nav.prefetchNight}
        onPrevWeek={nav.goPrevWeek}
        onNextWeek={nav.goNextWeek}
        onToday={nav.goToday}
        onJumpToDate={nav.jumpToDate}
        operatorName={operatorName}
        onChangeOperator={onChangeOperator}
        currentView={nav.currentView}
        onViewChange={nav.setCurrentView}
        showPrint={board.canPrint}
        onPrint={board.handlePrint}
        isPrinting={board.isPrinting}
        todayShiftDate={nav.todayDate}
        publishedStripDates={nav.publishedStripDates}
        publishedStripDatesLoading={nav.publishedStripDatesFetching}
      />

      {board.isScheduleHidden ? (
        <TodayUnpublishedPlaceholder
          selectedDay={nav.selectedDay}
          loading={board.statusLoading}
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
        />
      )}
    </div>
  );
}

function TodayUnpublishedPlaceholder({
  selectedDay,
  loading = false,
}: {
  selectedDay: DayDef;
  loading?: boolean;
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
          {loading ? "Checking schedule…" : "No published schedule"}
        </p>
        {!loading ? (
          <p className="mt-2 text-xs leading-relaxed text-[#6C6C72]">
            {label} has not been published yet. Published nights appear here for quick viewing and edits.
          </p>
        ) : null}
      </div>
    </div>
  );
}