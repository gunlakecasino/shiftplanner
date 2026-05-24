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
}> = ({ tasks, hasTM, slotKey, onRemoveTask, onSetTaskColor, onEditTask }) => {
  if (!tasks || tasks.length === 0) return null;
  const textColor = hasTM ? "text-[#374151] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]";
  return (
    <div
      className={`mt-auto pt-1 text-[11px] leading-tight ${textColor}`}
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
          textSize="text-[11px]"
          textColorClass={textColor}
        />
      ))}
    </div>
  );
};

export default ZoneTaskList;
