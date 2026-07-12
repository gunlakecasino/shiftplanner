"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import TaskRow from "./TaskRow";
import { taskLabelColorClass, taskLabelSizeClass, TASK_LABEL_SIZE_PX } from "@/lib/shiftbuilder/taskTextStyle";

import { isCriticalRepeatFit, PlacementFitChip } from "./PlacementFitChip";
import { CardTaskZone, assignZoneOpenHandlers, handleAssignZoneDoubleClick } from "./CardTaskZone";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import {
  type BreakGroup,
  cardAccentInk,
  overlapSlotLabel,
} from "@/lib/shiftbuilder/constants";
import {
  CardAccentStripe,
  CardSlotHeader,
  SlotAssignmentBody,
  TaskListDivider,
  type SlotAssignmentState,
} from "./assignmentCardChrome";

export interface OverlapSlotProps {
  slotKey: string;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  onCardClick?: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  isDraftMode?: boolean;
  draftInfo?: {
    proposedTmId?: string;
    proposedTmName: string;
    previousTmName?: string;
    proposedClear?: boolean;
  };
  onRemoveTask?: (
    slotKey: string,
    taskLabel: string,
    taskId?: string | null,
  ) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: "highlight" | "underline" | "circle" | "none" | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onOpenTaskTextEdit?: (
    slotKey: string,
    task?: NightSlotTask,
    options?: { addMode?: boolean },
  ) => void;
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
  setBreakGroupForSlot?: (k: string, g: BreakGroup) => void;
  isLocked?: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  placementTrail?: string[];
  showDigitalAssists?: boolean;
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
}

function getOverlapAccent(slotKey: string): string {
  if (slotKey.includes("-PM-")) return "#B45309";
  if (slotKey.includes("-AM-")) return "#059669";
  return "#B45309";
}

const OverlapSlot: React.FC<OverlapSlotProps> = React.memo(({
  slotKey,
  assignments,
  selectedTasks,
  onCardClick,
  loading = false,
  isDraftMode = false,
  draftInfo,
  onRemoveTask,
  onSetTaskColor,
  onSetTaskMarker,
  onEditTask,
  onOpenTaskTextEdit,
  setBreakGroupForSlot,
  isLocked = false,
  fitChip,
  placementTrail,
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
}) => {
  const a = assignments[slotKey] || {};
  const draftActive =
    isDraftMode && !!draftInfo?.proposedTmName?.trim() && !draftInfo?.proposedClear;
  const slotTm = {
    tmId: draftActive ? (draftInfo?.proposedTmId ?? a.tmId) : a.tmId,
    tmName: draftActive ? draftInfo!.proposedTmName : a.tmName,
  };
  const accent = getOverlapAccent(slotKey);
  const { setRef, isOver, isDragging, listeners, attributes, hasTM, dragFitClass } = useSlotDnd(
    slotKey,
    "overlap",
    slotTm,
    isLocked,
  );

  const tasks = selectedTasks[slotKey] ?? [];
  const regularTasks = tasks.filter((t) => !t.isCoverage);
  const currentTmId = slotTm.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;
  const isEmpty = !hasTM && !loading;
  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm =
    currentTmId && tmConflictSlots?.[currentTmId]
      ? tmConflictSlots[currentTmId].filter((s) => s !== slotKey)
      : [];

  let assignmentState: SlotAssignmentState;
  if (loading && !hasTM) {
    assignmentState = { kind: "loading" };
  } else if (draftActive) {
    assignmentState = {
      kind: "draft",
      proposedName: draftInfo!.proposedTmName,
      previousName: draftInfo?.previousTmName,
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

  const helv = '"Helvetica Neue", Helvetica, Arial, sans-serif';

  return (
    <div
      ref={setRef}
      {...(!isLocked ? listeners : {})}
      {...(!isLocked ? attributes : {})}
      data-slot-key={slotKey}
      className={`assignment-card sb-assignment-card sb-refined-card sb-overlap-zone-card relative h-full min-h-[64px] flex flex-col overflow-hidden rounded-xl ${
        isOver ? "drop-target-active" : ""
      } ${dragFitClass} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${
        isDimmed ? "sb-weekly-dim" : ""
      } ${isFocused ? "sb-weekly-highlight" : ""} ${
        showDigitalAssists ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""
      }`}
      style={{ ["--card-accent" as string]: accent, fontFamily: helv }}
    >
      <CardAccentStripe color={accent} />

      <CardSlotHeader
        icon="◆"
        label={overlapSlotLabel(slotKey)}
        accentColor={accent}
        compact
        titleClassName="!normal-case tracking-[0.01em]"
        trailing={
          fitChip && showDigitalAssists ? <PlacementFitChip fit={fitChip} compact /> : null
        }
      />

      <div
        className="sb-card-assign-zone flex flex-col flex-1 min-h-0 px-2 pb-1.5"
        {...(onCardClick ? assignZoneOpenHandlers(slotKey, onCardClick, isLocked) : {})}
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
          nameSizeOverride={showDigitalAssists ? 16 : 14}
          onUnassignedClick={(e) => {
            if (!isLocked && onCardClick) {
              handleAssignZoneDoubleClick(e, slotKey, onCardClick, isLocked);
            }
          }}
        />
      </div>

      {regularTasks.length > 0 ? (
        <TaskListDivider hasTm={hasTM} showDigitalAssists={showDigitalAssists} />
      ) : null}

      {showDigitalAssists ? (
        <CardTaskZone
          slotKey={slotKey}
          onOpenTasksPad={onOpenTaskTextEdit}
          isLocked={isLocked}
          enabled={showDigitalAssists}
          className={`sb-card-task-scroll mx-2 mb-1.5 flex-1 min-h-[16px] overflow-y-auto ${taskLabelSizeClass(
            TASK_LABEL_SIZE_PX.rrOverlap,
          )} leading-tight ${taskLabelColorClass(hasTM)}`}
          style={{ fontFamily: helv, color: cardAccentInk(accent) }}
        >
          {regularTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              slotKey={slotKey}
              onRemoveTask={onRemoveTask}
              onSetTaskColor={onSetTaskColor}
              onSetTaskMarker={onSetTaskMarker}
              onEditTask={onEditTask}
              onOpenTaskTextEdit={onOpenTaskTextEdit}
              textSize={taskLabelSizeClass(TASK_LABEL_SIZE_PX.rrOverlap)}
              textColorClass={taskLabelColorClass(hasTM)}
              isPrintPreview={false}
            />
          ))}
        </CardTaskZone>
      ) : regularTasks.length > 0 ? (
        <div
          className={`sb-card-task-scroll mx-2 mb-1.5 flex-1 min-h-0 overflow-y-auto ${taskLabelSizeClass(
            TASK_LABEL_SIZE_PX.rrOverlap,
          )} leading-tight ${taskLabelColorClass(hasTM)}`}
          style={{ fontFamily: helv }}
        >
          {regularTasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              slotKey={slotKey}
              onRemoveTask={onRemoveTask}
              onSetTaskColor={onSetTaskColor}
              onSetTaskMarker={onSetTaskMarker}
              onEditTask={onEditTask}
              onOpenTaskTextEdit={onOpenTaskTextEdit}
              textSize={taskLabelSizeClass(TASK_LABEL_SIZE_PX.rrOverlap)}
              textColorClass={taskLabelColorClass(hasTM)}
              isPrintPreview={!showDigitalAssists}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
});

export default OverlapSlot;