"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import TaskRow from "./TaskRow";
import {
  taskLabelColorClass,
  taskLabelSizeClass,
  TASK_LABEL_SIZE_PX,
} from "@/lib/shiftbuilder/taskTextStyle";

// Compact list of selected tasks shown at the bottom of a Zone / AUX card.
// When empty, renders nothing so the card collapses gracefully.
// Deeper card interiors polish: subtle top border when tasks present for visual separation
// from name (improves hierarchy + task integration). Builder-only enhancements.
const ZoneTaskList: React.FC<{
  tasks: NightSlotTask[] | undefined;
  hasTM: boolean;
  slotKey: string;
  onRemoveTask?: (
    slotKey: string,
    taskLabel: string,
    taskId?: string | null,
  ) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  /** Double-click a task row to open the text/font attributes pad. */
  onOpenTaskTextEdit?: (
    slotKey: string,
    task?: NightSlotTask,
    options?: { addMode?: boolean },
  ) => void;
  /** For AUX cards and tight spaces: use smaller text, tighter spacing, and cap visible tasks. */
  dense?: boolean;
  /** Forwarded to TaskRow: when true use static golden sizes (no dynamic measurement). */
  isPrintPreview?: boolean;
  /** Optional override; defaults to 11px global task label size. */
  textSize?: string;
  /** Accepted for call-site compatibility; ZoneTaskList computes its own textColor. */
  textColorClass?: string;
}> = ({
  tasks,
  hasTM,
  slotKey,
  onRemoveTask,
  onSetTaskColor,
  onSetTaskMarker,
  onEditTask,
  onOpenTaskTextEdit,
  dense = false,
  isPrintPreview = false,
  textSize: textSizeProp,
}) => {
  if (!tasks || tasks.length === 0) return null;
  const textColor = taskLabelColorClass(hasTM);

  // Show every task — cards + rows grow (equalize) instead of capping at 2.
  const visibleTasks = tasks;

  const isPrint = isPrintPreview;
  // Prefer explicit textSize from the card; fall back to global 11px default.
  const textSize =
    textSizeProp ||
    taskLabelSizeClass(
      isPrint ? TASK_LABEL_SIZE_PX.print : TASK_LABEL_SIZE_PX.zoneList,
    );
  const containerClass = dense
    ? `mt-auto pt-0 ${textSize} leading-[1.15] ${textColor}`
    : `mt-auto ${isPrint ? "pt-0.5" : "pt-1"} ${textSize} leading-tight ${textColor}`;

  return (
    <div
      className={containerClass}
      style={{ fontFamily: "var(--font-atkinson)" }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleTasks.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={isPrint ? undefined : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isPrint ? undefined : { opacity: 0, x: 12, scale: 0.92 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <TaskRow
              task={t}
              slotKey={slotKey}
              onRemoveTask={onRemoveTask}
              onSetTaskColor={onSetTaskColor}
              onSetTaskMarker={onSetTaskMarker}
              onEditTask={onEditTask}
              onOpenTaskTextEdit={onOpenTaskTextEdit}
              textSize={textSize}
              textColorClass={textColor}
              isPrintPreview={isPrintPreview}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ZoneTaskList;
