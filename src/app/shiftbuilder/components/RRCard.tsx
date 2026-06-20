"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup,
  getRRAccent,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import CoverageBar from "./CoverageBar";
import { PlacementFitChip } from "./PlacementFitChip";
import { penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import { useCardLongPress } from "@/lib/shiftbuilder/useCardLongPress";
import {
  CardAccentStripe,
  SlotAssignmentBody,
  coverageBodyPadding,
  type SlotAssignmentState,
} from "./assignmentCardChrome";

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
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onOpenTaskTextEdit?: (slotKey: string, task: NightSlotTask) => void;
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
  isLocked?: boolean;
  fitChipW?: PrerenderedPlacementFit | null;
  fitChipM?: PrerenderedPlacementFit | null;
  showDigitalAssists?: boolean;
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  coveredByIndex?: Record<string, string[]>;
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
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onOpenTaskTextEdit?: (slotKey: string, task: NightSlotTask) => void;
  isLocked?: boolean;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string; proposedClear?: boolean };
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  showDigitalAssists?: boolean;
  coveredByNames?: string[];
}> = ({
  slotKey,
  assignment,
  tasks,
  onClick,
  loading = false,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  onOpenTaskTextEdit,
  isLocked = false,
  isDraftMode = false,
  draftInfo,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  showDigitalAssists = false,
  coveredByNames = [],
}) => {
  const a = assignment || {};
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(
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

  const { isPenHovering, penHoverHandlers } = usePencilHover(
    (el) => onClick(slotKey, el),
  );

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
  } else if (coveredByNames.length > 0) {
    assignmentState = { kind: "covered", coveredByNames };
  } else {
    assignmentState = { kind: "unassigned" };
  }

  return (
    <div
      ref={setRef}
      onClick={(e) => { if (!isLocked) onClick(slotKey, e.currentTarget, e); }}
      {...penHoverHandlers}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={slotKey}
      className={`flex flex-col flex-1 min-h-0 touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${dim ? "sb-card-empty" : ""} ${penHoverClass(isPenHovering)} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""}`}
    >
      <div className={`min-w-0 pb-2 ${showDigitalAssists ? "" : "pt-1"}`}>
        <SlotAssignmentBody
          state={assignmentState}
          scale="rr"
          showDigitalAssists={showDigitalAssists}
          isDuplicate={isDuplicate}
          otherSlotsForTm={otherSlotsForTm}
          inviteSize="rr"
          onUnassignedClick={(e) => {
            e.stopPropagation();
            onClick(slotKey, e.currentTarget, e);
          }}
        />
      </div>

      {/* Uniform task list to match ZoneCard (plain text, no colored indents/tints, consistent 12px gray).
          Note: for covered sides, the covered names are rendered via SlotAssignmentBody above (as "Covered by"). */}
      {tasks && tasks.length > 0 && (
        <>
          <div className="mx-3.5 h-px bg-gray-100" />
          <div className="px-3 py-2 space-y-0.5">
            {tasks.map((t) => t.taskLabel).map((loc, i) => (
              <div
                key={i}
                className="px-2.5 py-[5px] text-[12px] leading-snug text-gray-600"
              >
                {loc}
              </div>
            ))}
          </div>
        </>
      )}
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
  coverageTasks,
  slotKey,
  onRemoveTask,
  body,
}: {
  sideLabel: string;
  color: string;
  borderColor?: string;
  showDigitalAssists: boolean;
  isEmpty: boolean;
  isCovered?: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  breakNum: BreakGroup;
  coverageTasks: NightSlotTask[];
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  body: React.ReactNode;
}) {
  const coveragePb = coverageBodyPadding(coverageTasks.length, showDigitalAssists);

  return (
    <div
      className={`assignment-card sb-assignment-card sb-refined-card relative overflow-hidden flex flex-col rounded-2xl flex-1 min-h-0 ${isEmpty ? "empty sb-card-empty" : ""} ${showDigitalAssists ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
        background: showDigitalAssists ? "rgba(255,255,255,0.012)" : undefined,
      }}
    >
      <CardAccentStripe color={color} />

      {/* Refined header to match ZoneCard exactly for visual uniformity */}
      <div className="px-3 pt-2 flex items-center gap-1 flex-nowrap">
        <span className="text-[12px] leading-none shrink-0" style={{ color }}>◆</span>
        <span className="text-[10px] font-bold tracking-[0.07em] uppercase min-w-0 truncate" style={{ color }}>
          {sideLabel}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {/* Status badge - dynamic (via PlacementFitChip). Omit for covered state. */}
          {!isCovered && (
            <PlacementFitChip fit={fitChip} compact />
          )}
          {/* Count pill for break group */}
          <span className="inline-flex items-center justify-center min-w-[19px] h-[19px] px-1 rounded-full bg-gray-900/80 text-white text-[10.5px] font-bold tabular-nums leading-none flex-shrink-0">
            {breakNum || 1}
          </span>
        </div>
      </div>

      <div
        className="flex flex-col flex-1 min-h-0 px-3 pt-1"
        style={{ paddingBottom: coveragePb }}
      >
        {body}
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
  onEditTask,
  onOpenTaskTextEdit,
  isLocked = false,
  fitChipW,
  fitChipM,
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  coveredByIndex = {},
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
        coverageTasks={wCoverageTasks}
        slotKey={wKey}
        onRemoveTask={onRemoveTask}
        body={(
          <RRSide
            slotKey={wKey}
            assignment={assignments[wKey]}
            tasks={wRegular}
            draftInfo={draftInfoW}
            coveredByNames={wCoveredBy}
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
        coverageTasks={mCoverageTasks}
        slotKey={mKey}
        onRemoveTask={onRemoveTask}
        body={(
          <RRSide
            slotKey={mKey}
            assignment={assignments[mKey]}
            tasks={mRegular}
            draftInfo={draftInfoM}
            coveredByNames={mCoveredBy}
            {...sideProps}
          />
        )}
      />
    </div>
  );
});

export default RRCard;