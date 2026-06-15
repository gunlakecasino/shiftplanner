"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import TaskRow from "./TaskRow";

// Compact list of selected tasks shown at the bottom of a Zone / AUX card.
// Replaces the static `def.locations` strings we used to render. When empty,
// renders nothing so the card collapses gracefully.
const ZoneTaskList: React.FC<{
  tasks: NightSlotTask[] | undefined;
  hasTM: boolean;
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  /** For AUX cards and tight spaces: use smaller text, tighter spacing, and cap visible tasks. */
  dense?: boolean;
}> = ({ tasks, hasTM, slotKey, onRemoveTask, onSetTaskColor, onEditTask, dense = false }) => {
  if (!tasks || tasks.length === 0) return null;
  const textColor = hasTM ? "text-[#1f2937] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]";

  // For AUX (dense): show up to 2 tasks fully visible using very compact metrics.
  // This is the balance: 2 tasks (your reported case) are now completely visible and "match the day",
  // while the card stays inside the fixed 1056×816 Golden artboard and the equalized AUX band.
  // For 3+ tasks: show first 2 + "+N more" (full list is still in the model for Sudo/Print/Drag/Pad).
  // The container has max-h in the caller (AuxCard) to guarantee no overflow.
  const maxVisible = dense ? 2 : 99;
  const visibleTasks = tasks.slice(0, maxVisible);
  const extra = tasks.length - visibleTasks.length;

  const textSize = dense ? "text-[9px]" : "text-[11.5px]";
  const containerClass = dense
    ? `mt-auto pt-0 text-[9px] leading-[1.0] ${textColor}`
    : `mt-auto pt-1 text-[11.5px] leading-tight ${textColor}`;

  return (
    <div
      className={containerClass}
      style={{ fontFamily: "var(--font-atkinson)" }}
    >
      {visibleTasks.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          slotKey={slotKey}
          onRemoveTask={onRemoveTask}
          onSetTaskColor={onSetTaskColor}
          onEditTask={onEditTask}
          textSize={textSize}
          textColorClass={textColor}
        />
      ))}
      {extra > 0 && dense && (
        <div 
          className="text-[7.5px] opacity-75 pl-0.5 tabular-nums tracking-[0.2px]" 
          style={{ fontFamily: "var(--font-atkinson)" }}
          title={`+${extra} more task${extra > 1 ? 's' : ''} — full list available via Placement Pad, Sudo Tasks tab, or drag`}
        >
          +{extra} more
        </div>
      )}
    </div>
  );
};

export default ZoneTaskList;
