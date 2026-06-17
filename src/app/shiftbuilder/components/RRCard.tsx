"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup,
  getRRAccent, RR_ICONS,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import TaskRow from "./TaskRow";
import CoverageBar from "./CoverageBar";
import { PlacementFitChip } from "./PlacementFitChip";
import { penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import {
  CardAccentStripe,
  CardSlotHeader,
  SlotAssignmentBody,
  TaskListDivider,
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
      className={`flex flex-col ${showDigitalAssists ? "" : "flex-1"} rounded-[2px] sb-assignment-card touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${dim ? "sb-card-empty" : ""} ${penHoverClass(isPenHovering)} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""}`}
    >
      <div className={`min-w-0 ${showDigitalAssists ? "" : "pt-1 pb-0.5"}`}>
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

      {tasks && tasks.length > 0 ? (
        <>
          <TaskListDivider hasTm={hasTM} showDigitalAssists={showDigitalAssists} />
          <div className={`mt-auto ${!hasTM && showDigitalAssists ? "bg-white/25 rounded-b-[2px] px-0.5 py-0.5 -mx-0.5" : ""}`}>
            <div
              className={`text-[8.5px] leading-[1.1] overflow-hidden ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF] opacity-75"}`}
              style={{ fontFamily: "var(--font-atkinson)" }}
            >
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  slotKey={slotKey}
                  onRemoveTask={onRemoveTask}
                  onSetTaskColor={onSetTaskColor}
                  onEditTask={onEditTask}
                  onOpenTaskTextEdit={onOpenTaskTextEdit}
                  textSize="text-[8px]"
                  textColorClass={hasTM ? "text-[#1f2937] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]"}
                  isPrintPreview={!showDigitalAssists}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

function RRSideShell({
  sideLabel,
  color,
  icon,
  borderColor,
  showDigitalAssists,
  isEmpty,
  fitChip,
  breakNum,
  onCycleBreak,
  coverageTasks,
  slotKey,
  onRemoveTask,
  body,
}: {
  sideLabel: string;
  color: string;
  icon: string;
  borderColor?: string;
  showDigitalAssists: boolean;
  isEmpty: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  breakNum: BreakGroup;
  onCycleBreak: () => void;
  coverageTasks: NightSlotTask[];
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  body: React.ReactNode;
}) {
  const coveragePb = coverageBodyPadding(coverageTasks.length, showDigitalAssists);

  return (
    <div
      className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col rounded-[3px] flex-1 ${isEmpty ? "empty sb-card-empty" : ""} ${showDigitalAssists ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
        background: showDigitalAssists ? "rgba(255,255,255,0.012)" : undefined,
      }}
    >
      <CardAccentStripe color={color} />
      <CardSlotHeader
        icon={icon}
        label={sideLabel}
        accentColor={color}
        compact
        trailing={(
          <>
            <PlacementFitChip fit={fitChip} />
            <BreakBadge value={breakNum} onCycle={onCycleBreak} size="sm" />
          </>
        )}
      />
      <div
        className="flex flex-col flex-1 px-2 pt-1"
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
}) => {
  const mKey = `MRR${def.num}`;
  const wKey = `WRR${def.num}`;
  const color = getRRAccent(def.num);
  const icon = RR_ICONS[def.num] ?? "●";

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
      onPointerMove={handleSpotlightMove}
      className={`relative overflow-hidden flex flex-col gap-1 ${bothEmpty ? "empty" : ""}`}
      style={{ ["--card-accent" as string]: color }}
    >
      <RRSideShell
        sideLabel={`${def.label} WOMEN'S`}
        color={color}
        icon={icon}
        borderColor={borderColor}
        showDigitalAssists={showDigitalAssists}
        isEmpty={wEmpty && !loading}
        fitChip={fitChipW}
        breakNum={wBreak}
        onCycleBreak={cycleW}
        coverageTasks={wCoverageTasks}
        slotKey={wKey}
        onRemoveTask={onRemoveTask}
        body={(
          <RRSide
            slotKey={wKey}
            assignment={assignments[wKey]}
            tasks={wRegular}
            draftInfo={draftInfoW}
            {...sideProps}
          />
        )}
      />

      <RRSideShell
        sideLabel={`${def.label} MEN'S`}
        color={color}
        icon={icon}
        borderColor={borderColor}
        showDigitalAssists={showDigitalAssists}
        isEmpty={mEmpty && !loading}
        fitChip={fitChipM}
        breakNum={mBreak}
        onCycleBreak={cycleM}
        coverageTasks={mCoverageTasks}
        slotKey={mKey}
        onRemoveTask={onRemoveTask}
        body={(
          <RRSide
            slotKey={mKey}
            assignment={assignments[mKey]}
            tasks={mRegular}
            draftInfo={draftInfoM}
            {...sideProps}
          />
        )}
      />
    </div>
  );
});

export default RRCard;