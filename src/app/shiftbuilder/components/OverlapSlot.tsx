"use client";

import React from "react";
import { motion } from "framer-motion";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import TaskRow from "./TaskRow";
import BreakBadge from "./BreakBadge";
import { PlacementFitChip } from "./PlacementFitChip";
import { AssignmentSkeleton, UnassignedDropHint } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import { premiumSpring } from "@/lib/premiumSpring";
import {
  nextBreakGroup,
  type BreakGroup,
} from "@/lib/shiftbuilder/constants";

/** OverlapSlot — Phase 1 Live layer prep (identical pattern). */

export interface OverlapSlotProps {
  slotKey: string;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  onCardClick?: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  /** Opens the dedicated pop-up text/font attributes pad for a task (double-click path). */
  onOpenTaskTextEdit?: (slotKey: string, task: NightSlotTask) => void;

  // Phase 1 Live optimistic layer
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
  setBreakGroupForSlot?: (k: string, g: BreakGroup) => void;

  // Locked state for the night (disables interactions)
  isLocked?: boolean;

  /** Digital builder only (suppressed in print-preview mode for exact Golden fidelity). */
  fitChip?: PrerenderedPlacementFit | null;
  /** Builder mode flag for subtle digital-only UI sugar. */
  showDigitalAssists?: boolean;

  /** Weekly Overview focus for this small overlap cell. */
  focusedTmId?: string | null;

  /** Duplicate TM flagging (same TM in >1 position this night) — high-class digital assist only. */
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
}

// One overlap cell (Break Sheet view) — a small assignable card. Backed by
// zone_assignments rows with slot_type='overlap', so it uses the same
// race-free persist path as zones / RRs / aux.
//
// SlotKey shape is OL-PM-0..5 and OL-AM-0..5. uiToDb / dbToUi know how to
// translate these.
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
  onLiveAssign,
  onLiveUnassign,
  setBreakGroupForSlot,
  isLocked = false,
  fitChip,
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
}) => {
  const a = assignments[slotKey] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(slotKey, "overlap", { tmId: a.tmId, tmName: a.tmName }, isLocked);
  const dim = !hasTM && !loading;
  const cycleBreak = () => {
    if (setBreakGroupForSlot) {
      setBreakGroupForSlot(slotKey, nextBreakGroup(currentBreak));
    }
  };

  // Phase 1 Live layer ready.
  const tasks = selectedTasks[slotKey];
  const currentTmId = a?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;

  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm = currentTmId && tmConflictSlots?.[currentTmId]
    ? tmConflictSlots[currentTmId].filter(s => s !== slotKey)
    : [];

  return (
    <div
      ref={setRef}
      onClick={(e) => {
        if (!isLocked && onCardClick) onCardClick(slotKey, e.currentTarget, e);
      }}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={slotKey}
      className={`assignment-card sb-assignment-card relative h-full min-h-[48px] flex flex-col border border-[#E5E5E7] rounded-[3px] bg-white px-2.5 py-1.5 touch-none ${
        isOver ? "drop-target-active" : ""
      } ${isDragging ? "sb-dragging" : ""} ${dim ? "sb-card-empty" : ""} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""} ${showDigitalAssists ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""}`}
    >
      <div className="flex items-center justify-between gap-1 min-h-[16px]">
        {showDigitalAssists && setBreakGroupForSlot ? (
          <BreakBadge value={currentBreak} onCycle={cycleBreak} size="sm" />
        ) : (
          <span className="w-0" />
        )}
        {fitChip && showDigitalAssists ? <PlacementFitChip fit={fitChip} compact /> : null}
      </div>
      {loading && !hasTM ? (
        <AssignmentSkeleton size="md" />
      ) : hasTM ? (
        <div className="flex items-center gap-1 min-w-0">
          {a.isLocked && (
            <span className="ms shrink-0 text-[#FF9500]" aria-label="Locked" style={{ fontSize: 11, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
          )}
          <motion.span
            className="font-bold tracking-[-0.2px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block"
            style={{ fontSize: 13, lineHeight: 1.1, fontFamily: "var(--font-atkinson)" }}
            whileHover={showDigitalAssists ? { scale: 1.01 } : {}}
            transition={premiumSpring}
          >
            {a.tmName}
          </motion.span>
          {isDuplicate && showDigitalAssists && (
            <span
              className="ml-1 inline-flex items-center rounded px-0.5 py-px text-[8px] font-mono tracking-[0.5px] bg-[var(--ios-yellow, #ffcc00)]/12 text-[#8B6910] dark:bg-[var(--ios-yellow, #ffcc00)]/15 dark:text-[#E9B948] border border-[var(--ios-yellow, #ffcc00)]/30"
              title={`Duplicate — also in: ${otherSlotsForTm.join(', ')}`}
            >
              2×
            </span>
          )}
        </div>
      ) : (
        <div
          className="unassigned-label flex flex-1 flex-col items-center justify-center text-[9.5px] tracking-[0.3px]"
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          <span className="sb-unassigned-primary px-1 py-[1px] inline-block">— Unassigned —</span>
          <UnassignedDropHint className="mt-px" />
        </div>
      )}
      {tasks && tasks.length > 0 && (
        <div
          className={`mt-0.5 text-[9.5px] leading-tight overflow-hidden ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
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
              textSize="text-[9.5px]"
              textColorClass={hasTM ? "text-[#1f2937] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]"}
              isPrintPreview={!showDigitalAssists}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default OverlapSlot;
