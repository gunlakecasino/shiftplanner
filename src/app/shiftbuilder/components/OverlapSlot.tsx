"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import TaskRow from "./TaskRow";

/** OverlapSlot — Phase 1 Live layer prep (identical pattern). */

export interface OverlapSlotProps {
  slotKey: string;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  onCardClick: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;

  // Phase 1 Live optimistic layer
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
}

// One overlap cell (Break Sheet view) — a small assignable card. Backed by
// zone_assignments rows with slot_type='overlap', so it uses the same
// race-free persist path as zones / RRs / aux.
//
// SlotKey shape is OL-PM-0..5 and OL-AM-0..5. uiToDb / dbToUi know how to
// translate these.
const OverlapSlot: React.FC<OverlapSlotProps> = ({
  slotKey,
  assignments,
  selectedTasks,
  onCardClick,
  loading = false,
  isDraftMode = false,
  draftInfo,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  onLiveAssign,
  onLiveUnassign,
}) => {
  const a = assignments[slotKey] || {};
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(slotKey, "overlap", { tmId: a.tmId, tmName: a.tmName });
  const dim = !hasTM && !loading;

  // Phase 1 Live layer ready.
  const tasks = selectedTasks[slotKey];
  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => onCardClick(slotKey, el),
  );

  return (
    <div
      ref={setRef}
      onClick={(e) => onCardClick(slotKey, e.currentTarget, e)}
      {...penHoverHandlers}
      {...(hasTM ? listeners : {})}
      {...(hasTM ? attributes : {})}
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
        clearLongHoverTimer();
        if (hasTM && (listeners as any)?.onPointerDown) {
          (listeners as any).onPointerDown(e);
        }
      }}
      data-slot-key={slotKey}
      className={`assignment-card relative border border-[#E5E5E7] rounded-[3px] bg-white min-h-[40px] px-2 py-1 cursor-pointer transition-all touch-none ${
        isOver ? "drop-target-active" : ""
      } ${isDragging ? "opacity-30" : ""} ${dim ? "opacity-60" : ""} ${isPenHovering ? "ring-2 ring-[#FFD60A] ring-offset-1 animate-pulse" : ""}`}
    >
      {loading && !hasTM ? (
        <div className="h-[12px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
      ) : hasTM ? (
        <div className="flex items-center gap-1 min-w-0">
          {a.isLocked && (
            <span className="ms shrink-0 text-[#FF9500]" aria-label="Locked" style={{ fontSize: 11, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
          )}
          <span
            className="font-bold tracking-[-0.2px] text-[#111] dark:text-[#F2F2F4] truncate"
            style={{ fontSize: 12, lineHeight: 1.1, fontFamily: "var(--font-atkinson)" }}
          >
            {a.tmName}
          </span>
        </div>
      ) : (
        <div
          className="text-[9.5px] text-[#9CA3AF] font-medium tracking-[0.3px]"
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          — Unassigned —
        </div>
      )}
      {tasks && tasks.length > 0 && (
        <div
          className={`mt-0.5 text-[9px] leading-tight ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
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
              textSize="text-[9px]"
              textColorClass={hasTM ? "text-[#374151] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]"}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default OverlapSlot;
