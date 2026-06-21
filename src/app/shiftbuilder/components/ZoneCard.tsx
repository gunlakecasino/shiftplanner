"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup,
  cardAccentInk,
  getZoneColor, ZONE_ICONS,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import TaskRow from "./TaskRow";
import CoverageBar from "./CoverageBar";
import { PlacementFitChip } from "./PlacementFitChip";
import { UnassignedDropHint } from "./builderPrimitives";
import { UnassignedInvite } from "./assignmentCardChrome";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import {
  CardAccentStripe,
  CardSlotHeader,
  SlotAssignmentBody,
  TaskListDivider,
  CoveredByOverlay,
  cardBodyInteriorClass,
  cardBodyInteriorStyle,
  type SlotAssignmentState,
} from "./assignmentCardChrome";
import { useCardLongPress } from "@/lib/shiftbuilder/useCardLongPress";

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
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
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
  /** TM names covering this slot via coverage tasks on other placements. */
  coveredByNames?: string[];
  /** /today kiosk UX */
  isTodayKiosk?: boolean;
  isPeerDimmed?: boolean;
  isCardSelected?: boolean;
  isAssignPulse?: boolean;
  isViewOnly?: boolean;
  onKioskLongPress?: (anchor: { x: number; y: number }) => void;
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
  onSetTaskMarker,
  onEditTask,
  onOpenTaskTextEdit,
  isLocked = false,
  fitChip,
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  coveredByNames = [],
  isTodayKiosk = false,
  isPeerDimmed = false,
  isCardSelected = false,
  isAssignPulse = false,
  isViewOnly = false,
  onKioskLongPress,
}) => {
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getZoneColor(def.key);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(
    def.key, "zone", { tmId: a.tmId, tmName: a.tmName }, isLocked,
  );

  const isCovered = coveredByNames.length > 0;
  const icon = ZONE_ICONS[def.key] ?? "●";
  const isEmpty = !hasTM && !loading && !isCovered;
  const currentTmId = a?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;
  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm = currentTmId && tmConflictSlots?.[currentTmId]
    ? tmConflictSlots[currentTmId].filter((s) => s !== def.key)
    : [];

  const longPress = useCardLongPress(
    isTodayKiosk && !isViewOnly && !!onKioskLongPress,
    (anchor) => onKioskLongPress?.(anchor),
  );

  const zoneCoverageTasks = (selectedTasks[def.key] || []).filter((t) => t.isCoverage);
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
  } else if (coveredByNames.length > 0) {
    assignmentState = { kind: "covered", coveredByNames };
  } else {
    assignmentState = { kind: "unassigned" };
  }

  return (
    <div
      ref={setRef}
      onClick={(e) => { if (!isLocked) onCardClick(def.key, e.currentTarget, e); }}
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
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={def.key}
      className={`assignment-card sb-assignment-card sb-refined-card relative overflow-hidden flex flex-col h-full min-h-0 rounded-2xl touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""} ${showDigitalAssists && !isTodayKiosk ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""} ${isTodayKiosk ? "sb-today-kiosk-card" : ""} ${isPeerDimmed ? "sb-card-peer-dimmed" : ""} ${isCardSelected ? "sb-card-selected" : ""} ${isAssignPulse ? "sb-card-assign-pulse" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <CardAccentStripe color={color} />

      {/* Refined header matching the design: icon + label, status badge, count pill */}
      <div className="px-3 pt-2 flex items-center gap-1 flex-nowrap shrink-0">
        <span className="text-[12px] leading-none shrink-0" style={{ color: cardAccentInk(color) }}>{icon}</span>
        <span className="text-[10px] font-bold tracking-[0.07em] uppercase min-w-0 truncate" style={{ color: cardAccentInk(color) }}>
          {def.label}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {/* Status badge - dynamic fit or omitted for covered + unassigned (no assignee). */}
          {assignmentState.kind !== "covered" && assignmentState.kind !== "unassigned" && (
            <PlacementFitChip fit={fitChip} compact />
          )}
          <BreakBadge value={currentBreak} onCycle={cycleBreak} size="sm" />
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Large name / covered area */}
        <div className="px-3.5 pt-1.5 pb-2 shrink-0">
          {assignmentState.kind === "covered" ? (
            <CoveredByOverlay
              scale="zone"
              coveredByNames={coveredByNames}
              onClick={(e) => {
                e.stopPropagation();
                onCardClick(def.key, e.currentTarget, e);
              }}
              nameSizeOverride={25}
            />
          ) : (
            <h3 className={`text-[25px] font-bold leading-tight tracking-[-0.02em] ${assignmentState.kind === "unassigned" ? "text-[#9CA3AF] opacity-70" : "text-gray-900"}`} style={assignmentState.kind === "unassigned" ? {color: '#A1A1AA', opacity: 0.75} : {}}>
              {a.tmName || "Unassigned"}
            </h3>
          )}
        </div>

        {assignmentState.kind === "unassigned" ? (
          <>
            <div className="mx-3.5 h-px bg-[var(--ios-gray-6)] shrink-0" />
            <div className="px-3.5 py-2.5 shrink-0">
              <UnassignedInvite
                size="zone"
                onClick={(e) => {
                  e.stopPropagation();
                  onCardClick(def.key, e.currentTarget, e);
                }}
                title="Click or drop to assign team member"
              />
            </div>
          </>
        ) : regularTasks.length > 0 && (
          <>
            <div className="mx-3.5 h-px bg-[var(--ios-gray-6)] shrink-0" />
            <div className="sb-card-task-scroll px-3 py-2 space-y-0.5 flex-1 min-h-0 overflow-y-auto">
              {regularTasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  slotKey={def.key}
                  onRemoveTask={onRemoveTask}
                  onSetTaskColor={onSetTaskColor}
                  onSetTaskMarker={onSetTaskMarker}
                  onEditTask={onEditTask}
                  onOpenTaskTextEdit={onOpenTaskTextEdit}
                  textSize="text-[12px]"
                  textColorClass="text-gray-600"
                />
              ))}
            </div>
          </>
        )}
      </div>

      {zoneCoverageTasks.length > 0 && (
        <div className="sb-coverage-footer shrink-0">
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
      )}
    </div>
  );
});

export default ZoneCard;