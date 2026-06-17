"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { useOpsAuth, type OpsUser } from "@/lib/auth/opsAuth";
import { clearTodayOperatorName, writeTodayOperatorName } from "../lib/todayChangeLog";
import { TodayPinGate } from "./TodayPinGate";
import { TodayLoadingShell } from "./TodayLoadingShell";

import { useTodayBoard } from "../hooks/useTodayBoard";
import { useTodayScheduleNav } from "../hooks/useTodayScheduleNav";
import { TodayNav } from "./TodayNav";
import { TodayArtboard } from "./TodayArtboard";
import { TODAY_STAGE_INSETS } from "../lib/constants";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

function resolveOperatorName(user: {
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const name = user.full_name?.trim() || user.username?.trim() || user.email?.trim();
  return name || "Operator";
}

export function TodayPageClient() {
  const { isAuthenticated, isLoading, user, logout } = useOpsAuth();

  if (isLoading) {
    return <TodayLoadingShell label="Loading ops session…" />;
  }

  if (!isAuthenticated || !user) {
    return <TodayPinGate />;
  }

  return (
    <AuthedTodayBoard
      user={user}
      onLogout={() => {
        clearTodayOperatorName();
        logout();
      }}
    />
  );
}

function AuthedTodayBoard({
  user,
  onLogout,
}: {
  user: OpsUser;
  onLogout: () => void;
}) {
  const operatorName = resolveOperatorName(user);

  useEffect(() => {
    writeTodayOperatorName(operatorName);
  }, [operatorName]);

  return (
    <TodayBoardShell
      operatorName={operatorName}
      opsUserId={user.id}
      onChangeOperator={onLogout}
    />
  );
}

function TodayBoardShell({
  operatorName,
  opsUserId,
  onChangeOperator,
}: {
  operatorName: string;
  opsUserId: string;
  onChangeOperator: () => void;
}) {
  const nav = useTodayScheduleNav();
  const board = useTodayBoard({
    selectedDay: nav.selectedDay,
    selectedDayIndex: nav.selectedDayIndex,
    operatorName,
    opsUserId,
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
      {board.isScheduleReadOnly ? (
        <div
          className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-200/80 bg-amber-50/95 px-3 py-1 text-[11px] font-medium text-amber-900 shadow-sm backdrop-blur-sm"
          style={{ top: TODAY_STAGE_INSETS.top - 28 }}
          role="status"
        >
          View only — assignment edits are disabled for your role
        </div>
      ) : null}
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