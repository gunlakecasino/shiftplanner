"use client";

import ShiftBuilderBoard from "@/app/shiftbuilder/components/ShiftBuilderBoard";
import InteractiveStage from "@/app/shiftbuilder/components/InteractiveStage";
import { BuilderLoadingShell } from "@/app/shiftbuilder/components/builderPrimitives";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import type { TodayActiveDrag } from "../hooks/useTodayDragDrop";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { TmEntry } from "@/app/shiftbuilder/components/MarkerPad";
import { TODAY_STAGE_INSETS } from "../lib/constants";
import type { TodayBoardView } from "../hooks/useTodayScheduleNav";

type TodayArtboardProps = {
  selectedDay: DayDef;
  selectedDayIndex: number;
  currentView: TodayBoardView;
  nightId: string | null;
  boardColdLoading: boolean;
  scale: number;
  stageHostRef: React.RefObject<HTMLDivElement | null>;
  positioningRef: React.RefObject<HTMLDivElement | null>;
  naturalWidth: number;
  naturalHeight: number;
  selectedSlotKey: string | null;
  breakGroup: 1 | 2 | 3;
  isCurrentNightLocked: boolean;
  selectedTasks: Record<string, NightSlotTask[]>;
  effectiveCardBorders: Record<string, string>;
  padAssignments: Record<string, unknown>;
  markerScheduledUnassigned: TmEntry[];
  markerAllEligibleTms: TmEntry[];
  effectiveRealRoster: unknown[];
  live: ReturnType<typeof import("@/lib/shiftbuilder/useLiveAssignments").useLiveAssignments>;
  onSlotToggle: (slotKey: string) => void;
  onSlotClose: () => void;
  onAssign: (slotKey: string, tmId: string, tmName: string) => void;
  onClearSlot: (slotKey: string) => void;
  onToggleLock: (slotKey: string) => void;
  setBreakGroupForSlot: (slotKey: string, group: 0 | 1 | 2 | 3) => void;
  onBreakGroupChange: (g: 1 | 2 | 3) => void;
  onAddTask: (slotKey: string, label: string) => void | Promise<void>;
  onRemoveTask: (slotKey: string, taskLabel: string) => void;
  onAssignSweeper: (slotKey: string, sweeperLabel: string) => void | Promise<void>;
  onAddCoverage: (sourceSlotKey: string, targetSlotKey: string) => void | Promise<void>;
  activeDrag: TodayActiveDrag | null;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function TodayArtboard(props: TodayArtboardProps) {
  const {
    selectedDay,
    selectedDayIndex,
    currentView,
    nightId,
    boardColdLoading,
    scale,
    stageHostRef,
    positioningRef,
    naturalWidth,
    naturalHeight,
    selectedSlotKey,
    breakGroup,
    isCurrentNightLocked,
    selectedTasks,
    effectiveCardBorders,
    padAssignments,
    markerScheduledUnassigned,
    markerAllEligibleTms,
    effectiveRealRoster,
    live,
    onSlotToggle,
    onSlotClose,
    onAssign,
    onClearSlot,
    onToggleLock,
    setBreakGroupForSlot,
    onBreakGroupChange,
    onAddTask,
    onRemoveTask,
    onAssignSweeper,
    onAddCoverage,
    activeDrag,
    onDragStart,
    onDragEnd,
  } = props;

  return (
    <div
      ref={stageHostRef}
      className="flex-1 min-h-0 flex items-center justify-center overflow-hidden"
      style={{
        paddingTop: TODAY_STAGE_INSETS.top,
        paddingRight: TODAY_STAGE_INSETS.right,
        paddingBottom: TODAY_STAGE_INSETS.bottom,
        paddingLeft: TODAY_STAGE_INSETS.left,
      }}
    >
      {boardColdLoading ? (
        <BuilderLoadingShell label="Loading schedule…" />
      ) : (
        <div
          className="relative flex-shrink-0"
          style={{
            width: naturalWidth * scale,
            height: naturalHeight * scale,
            overflow: "hidden",
          }}
        >
          <InteractiveStage
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            activeDrag={activeDrag}
            isDark={false}
          >
            <div
              ref={positioningRef}
              className="print-stage-inner relative overflow-hidden"
              style={{
                width: naturalWidth,
                height: naturalHeight,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <ShiftBuilderBoard
              nightId={nightId}
              selectedDay={selectedDay}
              selectedDayIndex={selectedDayIndex}
              currentView={currentView}
              breakGroup={breakGroup}
              isDark={false}
              isDraftMode={false}
              isCurrentNightLocked={isCurrentNightLocked}
              loadingAssignments={boardColdLoading}
              selectedTasks={selectedTasks}
              cardBorders={effectiveCardBorders}
              selectedSlotKey={selectedSlotKey}
              onSlotToggle={onSlotToggle}
              onSlotClose={onSlotClose}
              padAssignments={padAssignments}
              scheduledUnassigned={markerScheduledUnassigned}
              allEligibleTms={markerAllEligibleTms}
              onAssign={onAssign}
              onClearSlot={onClearSlot}
              onToggleLock={onToggleLock}
              setBreakGroupForSlot={setBreakGroupForSlot}
              onBreakGroupChange={onBreakGroupChange}
              onAddTask={onAddTask}
              onRemoveTask={onRemoveTask}
              onAssignSweeper={onAssignSweeper}
              onAddCoverage={onAddCoverage}
              members={effectiveRealRoster}
              isPrintPreview
              placementPadInsightsEnabled={false}
              enableTmDragAssign
              artboardScale={scale}
              live={live}
            />
            </div>
          </InteractiveStage>
        </div>
      )}
    </div>
  );
}