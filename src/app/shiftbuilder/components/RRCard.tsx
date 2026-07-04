"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup,
  cardAccentInk,
  getRRAccent,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import CoverageBar from "./CoverageBar";
import BreakBadge from "./BreakBadge";
import TaskRow from "./TaskRow";
import { taskLabelColorClass, taskLabelSizeClass, TASK_LABEL_SIZE_PX } from "@/lib/shiftbuilder/taskTextStyle";
import { isCriticalRepeatFit, PlacementFitChip } from "./PlacementFitChip";
import { CardTaskBadge } from "./CardTaskBadge";
import { rrDbSlotComposite } from "@/lib/shiftbuilder/slotCatalog";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import { useCardLongPress } from "@/lib/shiftbuilder/useCardLongPress";
import {
  CardAccentStripe,
  SlotAssignmentBody,
  type SlotAssignmentState,
} from "./assignmentCardChrome";
import { CardTaskZone, assignZoneOpenHandlers, handleAssignZoneDoubleClick } from "./CardTaskZone";

export interface RRCardProps {
  def: any;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onGenderClick: (k: string, el: HTMLElement) => void;
  loading?: boolean;
  borderColor?: string;
  isDraftMode?: boolean;
  draftInfoW?: { proposedTmName: string; previousTmName?: string; proposedClear?: boolean };
  draftInfoM?: { proposedTmName: string; previousTmName?: string; proposedClear?: boolean };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onOpenTaskTextEdit?: (
    slotKey: string,
    task?: NightSlotTask,
    options?: { addMode?: boolean },
  ) => void;
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
  isLocked?: boolean;
  fitChipW?: PrerenderedPlacementFit | null;
  fitChipM?: PrerenderedPlacementFit | null;
  placementTrailW?: string[];
  placementTrailM?: string[];
  showDigitalAssists?: boolean;
  /** Live board only (never print): render each side's open-task badge. */
  showTaskBadge?: boolean;
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  coveredByIndex?: Record<string, import("@/lib/shiftbuilder/coverageHelpers").CoveredByEntry[]>;
  onSwapCoverageSides?: (
    targetSlotKey: string,
    entries: import("@/lib/shiftbuilder/coverageHelpers").CoveredByEntry[],
  ) => void;
  isTodayKiosk?: boolean;
  isPeerDimmed?: boolean;
  isCardSelected?: boolean;
  isAssignPulse?: boolean;
  isViewOnly?: boolean;
  onKioskLongPress?: (anchor: { x: number; y: number }) => void;
}

const RRSide: React.FC<{
  slotKey: string;
  assignment: any;
  tasks: NightSlotTask[] | undefined;
  onClick: (k: string, el: HTMLElement, e?: React.MouseEvent) => void;
  loading?: boolean;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onOpenTaskTextEdit?: (
    slotKey: string,
    task?: NightSlotTask,
    options?: { addMode?: boolean },
  ) => void;
  isLocked?: boolean;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string; proposedClear?: boolean };
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  showDigitalAssists?: boolean;
  coveredBy?: import("@/lib/shiftbuilder/coverageHelpers").CoveredByEntry[];
  onSwapCoverageSides?: (
    targetSlotKey: string,
    entries: import("@/lib/shiftbuilder/coverageHelpers").CoveredByEntry[],
  ) => void;
  fitChip?: PrerenderedPlacementFit | null;
  placementTrail?: string[];
}> = ({
  slotKey,
  assignment,
  tasks,
  onClick,
  loading = false,
  onRemoveTask,
  onSetTaskColor,
  onSetTaskMarker,
  onEditTask,
  onOpenTaskTextEdit,
  isLocked = false,
  isDraftMode = false,
  draftInfo,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  showDigitalAssists = false,
  coveredBy = [],
  onSwapCoverageSides,
  fitChip,
  placementTrail,
}) => {
  const a = assignment || {};
  const { setRef, isOver, isDragging, listeners, attributes, hasTM, dragFitClass } = useSlotDnd(
    slotKey, "rr", { tmId: a.tmId, tmName: a.tmName },
  );

  const dim = !hasTM && !loading;
  const currentTmId = assignment?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;
  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm = currentTmId && tmConflictSlots?.[currentTmId]
    ? tmConflictSlots[currentTmId].filter((s) => s !== slotKey)
    : [];

  let assignmentState: SlotAssignmentState;
  if (loading && !hasTM && !(isDraftMode && draftInfo?.proposedTmName)) {
    assignmentState = { kind: "loading" };
  } else if (isDraftMode && draftInfo?.proposedTmName && !draftInfo.proposedClear) {
    assignmentState = {
      kind: "draft",
      proposedName: draftInfo.proposedTmName,
      previousName: draftInfo.previousTmName,
    };
  } else if (hasTM) {
    assignmentState = {
      kind: "assigned",
      tmName: a.tmName,
      tmId: currentTmId,
      isLocked: a.isLocked,
    };
  } else if (coveredBy.length > 0) {
    assignmentState = { kind: "covered", coveredBy };
  } else {
    assignmentState = { kind: "unassigned" };
  }

  return (
    <div
      ref={setRef}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={slotKey}
      className={`flex flex-col flex-1 min-h-0 overflow-hidden touch-none ${isOver ? "drop-target-active" : ""} ${dragFitClass} ${isDragging ? "sb-dragging" : ""} ${dim ? "sb-card-empty" : ""} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""}`}
    >
      <div
        className={`sb-card-assign-zone min-w-0 pb-2 shrink-0 ${showDigitalAssists ? "" : "pt-1"}`}
        {...assignZoneOpenHandlers(slotKey, onClick, isLocked)}
      >
        <SlotAssignmentBody
          state={assignmentState}
          scale="rr"
          showDigitalAssists={showDigitalAssists}
          isDuplicate={isDuplicate}
          otherSlotsForTm={otherSlotsForTm}
          inviteSize="rr"
          criticalRepeat={isCriticalRepeatFit(fitChip)}
          placementTrail={placementTrail}
          placementTrailMatchSlotKey={slotKey}
          onSwapCoverageSides={
            showDigitalAssists && coveredBy.length === 2 && onSwapCoverageSides
              ? () => onSwapCoverageSides(slotKey, coveredBy)
              : undefined
          }
          onUnassignedClick={(e) => handleAssignZoneDoubleClick(e, slotKey, onClick, isLocked)}
        />
      </div>

      {showDigitalAssists ? (
        <>
          <div className="mx-3.5 h-px bg-[var(--ios-gray-6)] shrink-0" />
          <CardTaskZone
            slotKey={slotKey}
            onOpenTasksPad={onOpenTaskTextEdit}
            isLocked={isLocked}
            enabled={showDigitalAssists}
            className="sb-card-task-scroll flex-1 min-h-[32px] overflow-y-auto px-3 py-2 space-y-0.5"
          >
            {(tasks ?? []).map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                slotKey={slotKey}
                onRemoveTask={onRemoveTask}
                onSetTaskColor={onSetTaskColor}
                onSetTaskMarker={onSetTaskMarker}
                onEditTask={onEditTask}
                onOpenTaskTextEdit={onOpenTaskTextEdit}
                textSize={taskLabelSizeClass(TASK_LABEL_SIZE_PX.zoneCard)}
                textColorClass={taskLabelColorClass(true)}
              />
            ))}
          </CardTaskZone>
        </>
      ) : tasks && tasks.length > 0 ? (
        <>
          <div className="mx-3.5 h-px bg-[var(--ios-gray-6)] shrink-0" />
          <div className="sb-card-task-scroll flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-0.5">
            {tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                slotKey={slotKey}
                onRemoveTask={onRemoveTask}
                onSetTaskColor={onSetTaskColor}
                onSetTaskMarker={onSetTaskMarker}
                onEditTask={onEditTask}
                onOpenTaskTextEdit={onOpenTaskTextEdit}
                textSize={taskLabelSizeClass(TASK_LABEL_SIZE_PX.zoneCard)}
                textColorClass={taskLabelColorClass(true)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
};

function RRSideShell({
  sideLabel,
  color,
  borderColor,
  showDigitalAssists,
  isEmpty,
  isCovered = false,
  fitChip,
  breakNum,
  onCycle,
  coverageTasks,
  slotKey,
  onRemoveTask,
  body,
  taskBadge,
}: {
  sideLabel: string;
  color: string;
  borderColor?: string;
  showDigitalAssists: boolean;
  isEmpty: boolean;
  isCovered?: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  breakNum: BreakGroup;
  onCycle?: () => void;
  coverageTasks: NightSlotTask[];
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  body: React.ReactNode;
  taskBadge?: React.ReactNode;
}) {
  return (
    <div
      className={`assignment-card sb-assignment-card sb-refined-card relative overflow-hidden flex flex-col flex-1 rounded-2xl h-full min-h-0 ${isEmpty ? "empty sb-card-empty" : ""} ${showDigitalAssists ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <CardAccentStripe color={color} />

      {/* Refined header to match ZoneCard exactly for visual uniformity */}
      <div className="px-3 pt-2 flex items-center gap-1 flex-nowrap">
        <span className="text-[12px] leading-none shrink-0" style={{ color: cardAccentInk(color) }}>◆</span>
        <span className="text-[10px] font-bold tracking-[0.07em] uppercase min-w-0 truncate" style={{ color: cardAccentInk(color) }}>
          {sideLabel}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {taskBadge}
          {/* Status badge - dynamic (via PlacementFitChip). Omit for covered + unassigned. */}
          {!isCovered && !isEmpty && (
            <PlacementFitChip fit={fitChip} compact />
          )}
          {/* Functional break group pill */}
          <BreakBadge value={breakNum} onCycle={onCycle || (() => {})} size="sm" />
        </div>
      </div>

      <div className={`flex flex-col flex-1 min-h-0 overflow-hidden px-3 pt-1 ${coverageTasks.length > 0 ? 'sb-card-content-with-footer' : ''}`}>
        {body}
      </div>
      {coverageTasks.length > 0 && (
        <div className="sb-coverage-footer shrink-0">
          {coverageTasks.map((t) => (
            <CoverageBar
              key={t.id}
              task={t}
              slotKey={slotKey}
              onRemoveTask={onRemoveTask}
              builderCalm={showDigitalAssists}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const RRCard: React.FC<RRCardProps> = React.memo(({
  def,
  assignments,
  selectedTasks,
  setBreakGroupForSlot,
  onGenderClick,
  loading = false,
  borderColor,
  isDraftMode = false,
  draftInfoW,
  draftInfoM,
  onRemoveTask,
  onSetTaskColor,
  onSetTaskMarker,
  onEditTask,
  onOpenTaskTextEdit,
  isLocked = false,
  fitChipW,
  fitChipM,
  placementTrailW,
  placementTrailM,
  showDigitalAssists = false,
  showTaskBadge = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  coveredByIndex = {},
  onSwapCoverageSides,
  isTodayKiosk = false,
  isPeerDimmed = false,
  isCardSelected = false,
  isAssignPulse = false,
  isViewOnly = false,
  onKioskLongPress,
}) => {
  const mKey = `MRR${def.num}`;
  const wKey = `WRR${def.num}`;
  const color = getRRAccent(def.num);

  const wDraftName =
    isDraftMode && draftInfoW?.proposedTmName && !draftInfoW.proposedClear
      ? draftInfoW.proposedTmName
      : "";
  const mDraftName =
    isDraftMode && draftInfoM?.proposedTmName && !draftInfoM.proposedClear
      ? draftInfoM.proposedTmName
      : "";
  const mEmpty = !assignments[mKey]?.tmName && !mDraftName;
  const wEmpty = !assignments[wKey]?.tmName && !wDraftName;
  const bothEmpty = mEmpty && wEmpty && !loading;

  const mA = assignments[mKey] || {};
  const wA = assignments[wKey] || {};
  const mBreak = (mA.breakGroup ?? 0) as BreakGroup;
  const wBreak = (wA.breakGroup ?? 0) as BreakGroup;
  const cycleW = () => setBreakGroupForSlot(wKey, nextBreakGroup(wBreak));
  const cycleM = () => setBreakGroupForSlot(mKey, nextBreakGroup(mBreak));

  const mTasks = selectedTasks[mKey] || [];
  const wTasks = selectedTasks[wKey] || [];
  const mRegular = mTasks.filter((t) => !t.isCoverage);
  const wRegular = wTasks.filter((t) => !t.isCoverage);
  const wCoverageTasks = wTasks.filter((t) => t.isCoverage);
  const mCoverageTasks = mTasks.filter((t) => t.isCoverage);

  const wCoveredBy = coveredByIndex[wKey] || [];
  const mCoveredBy = coveredByIndex[mKey] || [];
  const wIsCovered = wCoveredBy.length > 0;
  const mIsCovered = mCoveredBy.length > 0;

  const longPress = useCardLongPress(
    isTodayKiosk && !isViewOnly && !!onKioskLongPress,
    (anchor) => onKioskLongPress?.(anchor),
  );

  const sideProps = {
    setBreakGroupForSlot,
    onClick: onGenderClick,
    loading,
    onRemoveTask,
    onSetTaskColor,
    onEditTask,
    onOpenTaskTextEdit,
    isLocked,
    isDraftMode,
    focusedTmId,
    conflictingTms,
    tmConflictSlots,
    showDigitalAssists,
    onSwapCoverageSides,
  };

  return (
    <div
      onPointerMove={(e) => {
        handleSpotlightMove(e);
        if (isTodayKiosk) longPress.onPointerMove(e);
      }}
      {...(isTodayKiosk
        ? {
            onPointerDown: longPress.onPointerDown,
            onPointerUp: longPress.onPointerUp,
            onPointerCancel: longPress.onPointerCancel,
          }
        : {})}
      className={`relative overflow-hidden flex flex-col gap-1 h-full min-h-0 ${bothEmpty ? "empty" : ""} ${isTodayKiosk ? "sb-today-kiosk-card assignment-card" : ""} ${isPeerDimmed ? "sb-card-peer-dimmed" : ""} ${isCardSelected ? "sb-card-selected" : ""} ${isAssignPulse ? "sb-card-assign-pulse" : ""}`}
      style={{ ["--card-accent" as string]: color }}
    >
      <RRSideShell
        sideLabel={`${def.label} WOMEN'S`}
        color={color}
        borderColor={borderColor}
        showDigitalAssists={showDigitalAssists}
        isEmpty={wEmpty && !loading}
        isCovered={wIsCovered}
        fitChip={fitChipW}
        breakNum={wBreak}
        onCycle={cycleW}
        coverageTasks={wCoverageTasks}
        slotKey={wKey}
        onRemoveTask={onRemoveTask}
        taskBadge={
          showTaskBadge ? (
            <CardTaskBadge tmId={wA.tmId} slotKey={rrDbSlotComposite(def.num, "womens")} />
          ) : null
        }
        body={(
          <RRSide
            slotKey={wKey}
            assignment={assignments[wKey]}
            tasks={wRegular}
            draftInfo={draftInfoW}
            coveredBy={wCoveredBy}
            fitChip={fitChipW}
            placementTrail={placementTrailW}
            {...sideProps}
          />
        )}
      />

      <RRSideShell
        sideLabel={`${def.label} MEN'S`}
        color={color}
        borderColor={borderColor}
        showDigitalAssists={showDigitalAssists}
        isEmpty={mEmpty && !loading}
        isCovered={mIsCovered}
        fitChip={fitChipM}
        breakNum={mBreak}
        onCycle={cycleM}
        coverageTasks={mCoverageTasks}
        slotKey={mKey}
        onRemoveTask={onRemoveTask}
        taskBadge={
          showTaskBadge ? (
            <CardTaskBadge tmId={mA.tmId} slotKey={rrDbSlotComposite(def.num, "mens")} />
          ) : null
        }
        body={(
          <RRSide
            slotKey={mKey}
            assignment={assignments[mKey]}
            tasks={mRegular}
            draftInfo={draftInfoM}
            coveredBy={mCoveredBy}
            fitChip={fitChipM}
            placementTrail={placementTrailM}
            {...sideProps}
          />
        )}
      />
    </div>
  );
});

export default RRCard;