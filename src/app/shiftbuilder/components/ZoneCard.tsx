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

  const { isPenHovering, penHoverHandlers } = usePencilHover(
    (el) => { if (!isLocked) onCardClick(def.key, el); },
  );

  const longPress = useCardLongPress(
    isTodayKiosk && !isViewOnly && !!onKioskLongPress,
    (anchor) => onKioskLongPress?.(anchor),
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
      {...penHoverHandlers}
      {...(isTodayKiosk
        ? {
            onPointerDown: longPress.onPointerDown,
            onPointerUp: longPress.onPointerUp,
            onPointerCancel: (e: React.PointerEvent) => {
              penHoverHandlers.onPointerCancel(e);
              longPress.onPointerCancel(e);
            },
          }
        : {})}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={def.key}
      className={`assignment-card sb-assignment-card sb-refined-card relative overflow-hidden flex flex-col h-full min-h-0 rounded-2xl touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${penHoverClass(isPenHovering)} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""} ${showDigitalAssists && !isTodayKiosk ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""} ${isTodayKiosk ? "sb-today-kiosk-card" : ""} ${isPeerDimmed ? "sb-card-peer-dimmed" : ""} ${isCardSelected ? "sb-card-selected" : ""} ${isAssignPulse ? "sb-card-assign-pulse" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <CardAccentStripe color={color} />

      {/* Refined header matching the design: icon + label, status badge, count pill */}
      <div className="px-3.5 pt-2.5 flex items-center gap-1.5">
        <span className="text-[12px] leading-none shrink-0" style={{ color }}>◆</span>
        <span className="text-[10px] font-bold tracking-[0.07em] uppercase" style={{ color }}>
          {def.label}
        </span>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          {/* Status badge - using fit or strong fit. Omit for covered state. */}
          {assignmentState.kind !== "covered" && (
            <span className="inline-flex items-center px-1.5 py-[2px] rounded-full text-[9.5px] font-semibold tracking-wide whitespace-nowrap bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80">
              Strong Fit
            </span>
          )}
          {/* Count pill for break group */}
          <span className="inline-flex items-center justify-center min-w-[19px] h-[19px] px-1 rounded-full bg-gray-900/80 text-white text-[10.5px] font-bold tabular-nums leading-none flex-shrink-0">
            {currentBreak || 1}
          </span>
        </div>
      </div>

      {/* Large name */}
      <div className="px-3.5 pt-1.5 pb-3">
        <h3 className={`text-[25px] font-bold leading-tight tracking-[-0.02em] ${assignmentState.kind === "covered" ? "text-gray-500" : "text-gray-900"}`}>
          {a.tmName || (assignmentState.kind === "covered" ? "Covered" : "Unassigned")}
        </h3>
      </div>

      {/* Refined covered / task list. For covered state: elegant "Covered by" section with zone-colored diamonds for seamlessness.
          Regular tasks use uniform plain list. Coverage bars at bottom. */}
      {(regularTasks.length > 0 || isCovered) && (
        <>
          <div className="mx-3.5 h-px bg-gray-100" />
          {isCovered ? (
            <div className="px-3.5 py-2">
              <div className="text-[9px] font-semibold uppercase tracking-[0.07em] text-gray-400 mb-1">Covered by</div>
              <div className="space-y-[1px]">
                {coveredByNames.map((name, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px] leading-snug text-gray-700 font-medium py-[2px]">
                    <span style={{ color }} className="text-[9px] leading-none shrink-0">◆</span>
                    {name}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-3 py-2.5 space-y-0.5">
              {regularTasks.map((t) => t.taskLabel).map((loc, i) => (
                <div
                  key={i}
                  className="px-2.5 py-[5px] text-[12px] leading-snug text-gray-600"
                >
                  {loc}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Keep coverage banner functionality */}
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