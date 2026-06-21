"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import TaskRow from "./TaskRow";

// Compact list of selected tasks shown at the bottom of a Zone / AUX card.
// When empty, renders nothing so the card collapses gracefully.
// Deeper card interiors polish: subtle top border when tasks present for visual separation
// from name (improves hierarchy + task integration). Builder-only enhancements.
const ZoneTaskList: React.FC<{
  tasks: NightSlotTask[] | undefined;
  hasTM: boolean;
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  /** Double-click a task row to open the text/font attributes pad. */
  onOpenTaskTextEdit?: (slotKey: string, task: NightSlotTask) => void;
  /** For AUX cards and tight spaces: use smaller text, tighter spacing, and cap visible tasks. */
  dense?: boolean;
  /** Forwarded to TaskRow: when true use static golden sizes (no dynamic measurement). */
  isPrintPreview?: boolean;
  /** Accepted for call-site compatibility (ZoneCard etc); ZoneTaskList computes its own internal textSize. */
  textSize?: string;
  /** Accepted for call-site compatibility; ZoneTaskList computes its own textColor. */
  textColorClass?: string;
}> = ({ tasks, hasTM, slotKey, onRemoveTask, onSetTaskColor, onSetTaskMarker, onEditTask, onOpenTaskTextEdit, dense = false, isPrintPreview = false }) => {
  if (!tasks || tasks.length === 0) return null;
  const textColor = hasTM ? "text-[#1f2937] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]";

  // Dense AUX in print: cap at 2 + "+N more". Live builder scrolls the full list in AuxCard.
  const maxVisible = dense && isPrintPreview ? 2 : tasks.length;
  const visibleTasks = tasks.slice(0, maxVisible);
  const extra = tasks.length - visibleTasks.length;

  const isPrint = isPrintPreview;
  const textSize = dense ? "text-[9px]" : (isPrint ? "text-[9.5px]" : "text-[11.5px]");
  const containerClass = dense
    ? `mt-auto pt-0 text-[9px] leading-[1.0] ${textColor}`
    : `mt-auto ${isPrint ? 'pt-0.5' : 'pt-1'} ${isPrint ? 'text-[9.5px]' : 'text-[11.5px]'} leading-tight ${textColor}`;

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
