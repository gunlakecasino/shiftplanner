"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup,
  getZoneColor, ZONE_ICONS,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import ZoneTaskList from "./ZoneTaskList";
import CoverageBar from "./CoverageBar";
import { PlacementFitChip } from "./PlacementFitChip";
import { penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import {
  CardAccentStripe,
  CardSlotHeader,
  SlotAssignmentBody,
  TaskListDivider,
  cardBodyInteriorClass,
  cardBodyInteriorStyle,
  coverageBodyPadding,
  type SlotAssignmentState,
} from "./assignmentCardChrome";

export interface ZoneCardProps {
  def: any;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onCardClick: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  borderColor?: string;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onOpenTaskTextEdit?: (slotKey: string, task: NightSlotTask) => void;
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
  isLocked?: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  showDigitalAssists?: boolean;
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
}

const ZoneCard: React.FC<ZoneCardProps> = React.memo(({
  def,
  assignments,
  selectedTasks,
  setBreakGroupForSlot,
  onCardClick,
  loading = false,
  borderColor,
  isDraftMode = false,
  draftInfo,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  onOpenTaskTextEdit,
  isLocked = false,
  fitChip,
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
}) => {
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getZoneColor(def.key);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(
    def.key, "zone", { tmId: a.tmId, tmName: a.tmName }, isLocked,
  );

  const icon = ZONE_ICONS[def.key] ?? "●";
  const isEmpty = !hasTM && !loading;
  const currentTmId = a?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;
  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm = currentTmId && tmConflictSlots?.[currentTmId]
    ? tmConflictSlots[currentTmId].filter((s) => s !== def.key)
    : [];

  const { isPenHovering, penHoverHandlers } = usePencilHover(
    (el) => { if (!isLocked) onCardClick(def.key, el); },
  );

  const zoneCoverageTasks = (selectedTasks[def.key] || []).filter((t) => t.isCoverage);
  const coverageBodyPb = coverageBodyPadding(zoneCoverageTasks.length, showDigitalAssists);
  const regularTasks = (selectedTasks[def.key] || []).filter((t) => !t.isCoverage);

  let assignmentState: SlotAssignmentState;
  if (loading && !hasTM) {
    assignmentState = { kind: "loading" };
  } else if (isDraftMode && draftInfo?.proposedTmName) {
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
      onClick={(e) => { if (!isLocked) onCardClick(def.key, e.currentTarget, e); }}
      onPointerMove={handleSpotlightMove}
      {...penHoverHandlers}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={def.key}
      className={`assignment-card sb-assignment-card relative ${showDigitalAssists ? "" : "overflow-hidden"} flex flex-col ${showDigitalAssists ? "" : "h-full"} rounded-[3px] touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${penHoverClass(isPenHovering)} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""} ${showDigitalAssists ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <CardAccentStripe color={color} />

      <CardSlotHeader
        icon={icon}
        label={def.label}
        accentColor={color}
        trailing={(
          <>
            <PlacementFitChip fit={fitChip} />
            <BreakBadge value={currentBreak} onCycle={cycleBreak} />
          </>
        )}
      />

      <div
        className={cardBodyInteriorClass(showDigitalAssists)}
        style={cardBodyInteriorStyle(showDigitalAssists, coverageBodyPb)}
      >
        <SlotAssignmentBody
          state={assignmentState}
          scale="zone"
          showDigitalAssists={showDigitalAssists}
          isDuplicate={isDuplicate}
          otherSlotsForTm={otherSlotsForTm}
          inviteSize="zone"
          onUnassignedClick={(e) => {
            e.stopPropagation();
            onCardClick(def.key, e.currentTarget, e);
          }}
        />

        {regularTasks.length > 0 ? (
          <TaskListDivider hasTm={hasTM} showDigitalAssists={showDigitalAssists} />
        ) : null}

        <div className={`mt-auto overflow-hidden ${!hasTM && showDigitalAssists ? "bg-white/30 rounded-b-[3px] px-0.5 py-0.5 -mx-0.5" : ""}`}>
          <ZoneTaskList
            tasks={regularTasks}
            hasTM={hasTM}
            slotKey={def.key}
            onRemoveTask={onRemoveTask}
            onSetTaskColor={onSetTaskColor}
            onEditTask={onEditTask}
            onOpenTaskTextEdit={onOpenTaskTextEdit}
            textSize={hasTM ? "text-[10px]" : "text-[8.5px]"}
            textColorClass={hasTM ? "text-[#6B7280]" : "text-[#9CA3AF] opacity-70"}
            isPrintPreview={!showDigitalAssists}
          />
        </div>
      </div>

      {zoneCoverageTasks.map((t) => (
        <CoverageBar
          key={t.id}
          task={t}
          slotKey={def.key}
          onRemoveTask={onRemoveTask}
          builderCalm={showDigitalAssists}
        />
      ))}
    </div>
  );
});

export default ZoneCard;