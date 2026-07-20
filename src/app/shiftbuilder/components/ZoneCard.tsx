"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  cardAccentInk,
  getZoneColor, ZONE_ICONS,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import TaskRow from "./TaskRow";
import { taskLabelColorClass, taskLabelSizeClass, TASK_LABEL_SIZE_PX } from "@/lib/shiftbuilder/taskTextStyle";
import CoverageBar from "./CoverageBar";
import { isCriticalRepeatFit, PlacementFitChip } from "./PlacementFitChip";
import { TmNameBlock } from "./assignmentCardChrome";
import { UnassignedDropHint } from "./builderPrimitives";
import { UnassignedInvite } from "./assignmentCardChrome";
import type { CoveredByEntry } from "@/lib/shiftbuilder/coverageHelpers";
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
import { CardTaskZone, assignZoneOpenHandlers, handleAssignZoneDoubleClick, padUsesSingleTap } from "./CardTaskZone";
import { CardTaskBadge } from "./CardTaskBadge";
import { ShiftCard as PackageShiftCard } from "../redesign/components/ShiftCard";

export interface ZoneCardProps {
  def: any;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  onCardClick: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  borderColor?: string;
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
  fitChip?: PrerenderedPlacementFit | null;
  placementTrail?: string[];
  showDigitalAssists?: boolean;
  /** Live board only (never print): render the occupant's open-task badge. */
  showTaskBadge?: boolean;
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  /** TMs covering this slot via coverage tasks on other placements. */
  coveredBy?: CoveredByEntry[];
  /** Swap A/B labels when exactly two coverers. */
  onSwapCoverageSides?: (targetSlotKey: string, entries: CoveredByEntry[]) => void;
  /** /today kiosk UX */
  isTodayKiosk?: boolean;
  isPeerDimmed?: boolean;
  isCardSelected?: boolean;
  isAssignPulse?: boolean;
  isViewOnly?: boolean;
  onKioskLongPress?: (anchor: { x: number; y: number }) => void;
}

// ShiftBuilderBoard passes several props (assignments, selectedTasks, conflictingTms,
// tmConflictSlots, coveredBy, placementTrail, fitChip) as whole-board maps/sets or
// freshly-rebuilt-per-render values (buildCoveredByIndex/trailForTm construct brand new
// objects on every call). Under plain React.memo's default shallow reference compare, any
// single-slot change anywhere on the board makes every ZoneCard's props "different" by
// reference, so every card re-renders. This comparator narrows the check to each card's own
// slice, by content rather than reference, so unrelated cards can skip re-rendering.
// Conservative on purpose: any prop not explicitly narrowed below falls through to a plain
// Object.is check (identical to default React.memo behavior) rather than being assumed equal.
function shallowObjectEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const aRec = a as Record<string, unknown>;
  const bRec = b as Record<string, unknown>;
  const aKeys = Object.keys(aRec);
  const bKeys = Object.keys(bRec);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.is(aRec[key], bRec[key])) return false;
  }
  return true;
}

function shallowArrayEqual<T>(a: T[] | undefined, b: T[] | undefined, itemEqual: (x: T, y: T) => boolean): boolean {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!itemEqual(a[i], b[i])) return false;
  }
  return true;
}

function zoneCardPropsAreEqual(prev: Readonly<ZoneCardProps>, next: Readonly<ZoneCardProps>): boolean {
  if (prev.def !== next.def) return false;

  const slotKey = next.def.key;
  if (!shallowObjectEqual(prev.assignments?.[slotKey], next.assignments?.[slotKey])) return false;
  if (!shallowArrayEqual(prev.selectedTasks[slotKey], next.selectedTasks[slotKey], Object.is)) return false;
  if (!shallowObjectEqual(prev.draftInfo, next.draftInfo)) return false;
  if (!shallowObjectEqual(prev.fitChip, next.fitChip)) return false;
  if (!shallowArrayEqual(prev.placementTrail, next.placementTrail, Object.is)) return false;
  if (!shallowArrayEqual(prev.coveredBy, next.coveredBy, shallowObjectEqual)) return false;

  const nextTmId = (next.assignments?.[slotKey] as { tmId?: string } | undefined)?.tmId;
  const prevHasConflict = nextTmId ? (prev.conflictingTms?.has(nextTmId) ?? false) : false;
  const nextHasConflict = nextTmId ? (next.conflictingTms?.has(nextTmId) ?? false) : false;
  if (prevHasConflict !== nextHasConflict) return false;
  if (!shallowArrayEqual(
    nextTmId ? prev.tmConflictSlots?.[nextTmId] : undefined,
    nextTmId ? next.tmConflictSlots?.[nextTmId] : undefined,
    Object.is,
  )) return false;

  // Everything else (callbacks, primitive flags, etc.) — same check React.memo does by default.
  const narrowedKeys = new Set([
    "def", "assignments", "selectedTasks", "draftInfo", "fitChip",
    "placementTrail", "coveredBy", "conflictingTms", "tmConflictSlots",
  ]);
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of allKeys) {
    if (narrowedKeys.has(key)) continue;
    if (!Object.is((prev as any)[key], (next as any)[key])) return false;
  }

  return true;
}

const ZoneCard: React.FC<ZoneCardProps> = React.memo(({
  def,
  assignments,
  selectedTasks,
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
  placementTrail,
  showDigitalAssists = false,
  showTaskBadge = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  coveredBy = [],
  onSwapCoverageSides,
  isTodayKiosk = false,
  isPeerDimmed = false,
  isCardSelected = false,
  isAssignPulse = false,
  isViewOnly = false,
  onKioskLongPress,
}) => {
  const a = assignments[def.key] || {};
  const draftActive =
    isDraftMode && !!draftInfo?.proposedTmName?.trim() && !draftInfo?.proposedClear;
  const slotTm = {
    tmId: draftActive ? (draftInfo?.proposedTmId ?? a.tmId) : a.tmId,
    tmName: draftActive ? draftInfo!.proposedTmName : a.tmName,
  };
  const color = getZoneColor(def.key);
  const { setRef, isOver, isDragging, listeners, attributes, hasTM, dragFitClass } = useSlotDnd(
    def.key, "zone", slotTm, isLocked,
  );

  const isCovered = coveredBy.length > 0;
  const icon = ZONE_ICONS[def.key] ?? "●";
  const isEmpty = !hasTM && !loading && !isCovered;
  const currentTmId = slotTm.tmId;
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
  } else if (coveredBy.length > 0) {
    assignmentState = { kind: "covered", coveredBy };
  } else {
    assignmentState = { kind: "unassigned" };
  }

  const displayName =
    assignmentState.kind === "draft"
      ? assignmentState.proposedName
      : assignmentState.kind === "assigned"
        ? assignmentState.tmName
        : assignmentState.kind === "unassigned"
          ? "Unassigned"
        : "";
  const zoneNumber = Number(String(def.key).replace(/\D/g, "")) || 1;
  const packageNotes = regularTasks.map((task) => task.taskLabel).filter(Boolean);
  const packageTaskInteractionsEnabled = !isLocked && !isViewOnly;
  const packageTaskContent = regularTasks.length > 0 ? (
    <CardTaskZone
      slotKey={def.key}
      onOpenTasksPad={packageTaskInteractionsEnabled ? onOpenTaskTextEdit : undefined}
      isLocked={!packageTaskInteractionsEnabled}
      enabled={packageTaskInteractionsEnabled}
      className="sb-package-card-task-list min-w-0 max-h-[78px] overflow-y-auto"
      style={{ color: cardAccentInk(color) }}
    >
      {regularTasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          slotKey={def.key}
          onRemoveTask={packageTaskInteractionsEnabled ? onRemoveTask : undefined}
          onSetTaskColor={packageTaskInteractionsEnabled ? onSetTaskColor : undefined}
          onSetTaskMarker={packageTaskInteractionsEnabled ? onSetTaskMarker : undefined}
          onEditTask={packageTaskInteractionsEnabled ? onEditTask : undefined}
          onOpenTaskTextEdit={packageTaskInteractionsEnabled ? onOpenTaskTextEdit : undefined}
          textSize={taskLabelSizeClass(10)}
          textColorClass={taskLabelColorClass(hasTM)}
          draggable={packageTaskInteractionsEnabled}
          isPrintPreview={false}
        />
      ))}
    </CardTaskZone>
  ) : undefined;
  const packageCoverage = coveredBy.map((entry, index) => ({
    label: entry.side ? `${String(def.key).replace(/^Z/, "")}${entry.side}` : String(index + 1),
    name: entry.tmName,
  }));
  const packageCoverageFooter = zoneCoverageTasks.length > 0 ? (
    <div className="sb-coverage-footer shrink-0">
      {zoneCoverageTasks.map((task) => (
        <CoverageBar
          key={task.id}
          task={task}
          slotKey={def.key}
          onRemoveTask={packageTaskInteractionsEnabled ? onRemoveTask : undefined}
          builderCalm={showDigitalAssists}
        />
      ))}
    </div>
  ) : undefined;

  return (
    <div
      ref={setRef}
      onPointerMove={(e) => {
        handleSpotlightMove(e);
        if (isTodayKiosk) longPress.onPointerMove(e);
      }}
      {...(isTodayKiosk
        ? {
            onPointerDown: longPress.onPointerDown,
            onPointerUp: longPress.onPointerUp,
            onPointerCancel: longPress.onPointerCancel,
            onContextMenu: longPress.onContextMenu,
          }
        : {})}
      {...(!isLocked ? listeners : {})}
      {...(!isLocked ? attributes : {})}
      data-slot-key={def.key}
      data-has-draft={draftActive ? "true" : undefined}
      className={`assignment-card sb-package-card-wrapper relative h-full min-h-[172px] rounded-xl ${isOver ? "drop-target-active" : ""} ${dragFitClass} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""} ${isTodayKiosk ? "sb-today-kiosk-card" : ""} ${isPeerDimmed ? "sb-card-peer-dimmed" : ""} ${isCardSelected ? "sb-card-selected" : ""} ${isAssignPulse ? "sb-card-assign-pulse" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <PackageShiftCard
        zone={zoneNumber}
        name={assignmentState.kind === "covered" ? "" : displayName || "Unassigned"}
        notes={packageNotes}
        taskContent={packageTaskContent}
        footer={packageCoverageFooter}
        unassigned={assignmentState.kind === "unassigned" || assignmentState.kind === "covered"}
        coverage={assignmentState.kind === "covered" ? packageCoverage : undefined}
        onClick={() => {
          if (isLocked) return;
          const el = document.querySelector(`[data-slot-key="${def.key}"]`) as HTMLElement | null;
          if (el) onCardClick(def.key, el);
        }}
      />
    </div>
  );
}, zoneCardPropsAreEqual);

export default ZoneCard;
