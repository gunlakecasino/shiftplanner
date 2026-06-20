"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { premiumSpring, premiumButton, premiumTap } from "@/lib/premiumSpring";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { usePortalPlacementStyle } from "./PlacementPad";
import { TASK_COLOR_SPHERES } from "./TaskRow";

export interface TaskTextEditPadProps {
  slotKey: string;
  task: NightSlotTask;
  /** data-task-host id on the TaskRow element for positioning the portal relative to the exact row. */
  hostId?: string;
  onClose: () => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  isDark?: boolean;
}



const TaskTextEditPad: React.FC<TaskTextEditPadProps> = ({
  slotKey,
  task,
  hostId,
  onClose,
  onEditTask,
  onSetTaskColor,
  onSetTaskMarker,
  onRemoveTask,
  isDark = false,
}) => {
  const originalLabel = task.taskLabel;
  const originalColor = task.color ?? null;
  const originalMarker = task.markerType || 'highlight';

  const [labelDraft, setLabelDraft] = useState(originalLabel);
  const [colorDraft, setColorDraft] = useState<string | null>(originalColor);
  const [markerType, setMarkerType] = useState<'highlight' | 'underline' | 'circle' | 'none'>(originalMarker);

  const reducedMotion = useReducedMotion();
  const portalStyle = usePortalPlacementStyle(hostId, "right");
  const usePortal = !!hostId && !!portalStyle;

  const hasChanges =
    labelDraft.trim() !== originalLabel || colorDraft !== originalColor || markerType !== originalMarker;

  const getMarkerStyle = () => {
    if (!colorDraft) return { color: isDark ? "#E5E5E7" : "#1f2937" };
    const base = { color: isDark ? "#E5E5E7" : "#1f2937" };
    if (markerType === 'highlight') {
      return {
        ...base,
        backgroundColor: `${colorDraft}14`,
        borderLeft: `4px solid ${colorDraft}`,
      };
    } else if (markerType === 'underline') {
      return {
        ...base,
        borderBottom: `3px solid ${colorDraft}`,
        paddingBottom: '2px',
      };
    } else if (markerType === 'circle') {
      return {
        ...base,
        border: `2px solid ${colorDraft}`,
        borderRadius: '9999px',
        padding: '2px 8px',
        display: 'inline-block',
      };
    }
    return base;
  };

  const handleSave = () => {
    const newLabel = labelDraft.trim();
    if (!newLabel) {
      onClose();
      return;
    }

    // Apply label change first if needed (identify by old label)
    if (newLabel !== originalLabel && onEditTask) {
      onEditTask(slotKey, originalLabel, newLabel);
    }

    // Apply color change (use the final label for lookup if we just renamed)
    const labelForColor = newLabel !== originalLabel ? newLabel : originalLabel;
    if (colorDraft !== originalColor && onSetTaskColor) {
      onSetTaskColor(slotKey, labelForColor, colorDraft);
    }

    // Apply marker style if changed
    if (markerType !== originalMarker && onSetTaskMarker) {
      onSetTaskMarker(slotKey, labelForColor, markerType);
    }

    onClose();
  };

  const handleRemove = () => {
    if (onRemoveTask) {
      onRemoveTask(slotKey, originalLabel);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  const content = (
    <motion.div
      key="task-edit-pad"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: -2 }}
      transition={premiumSpring}
      className="sb-task-text-pad rounded-xl border border-black/[0.08] bg-white/95 dark:bg-[#2C2C2E] shadow-[0_10px_30px_rgba(0,0,0,0.18),_inset_0_1px_0_rgba(255,255,255,0.6)] overflow-hidden flex flex-col"
      style={{
        ...(usePortal && portalStyle ? portalStyle : {}),
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        backdropFilter: "blur(12px) saturate(140%)",
        borderColor: isDark ? "rgba(255,255,255,0.08)" : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/[0.06] bg-neutral-50/70 dark:bg-white/[0.03]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-neutral-500">TEXT ATTRIBUTES</span>
          <span className="text-[10px] font-mono text-neutral-400">· {slotKey}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 hover:text-neutral-600 text-sm leading-none px-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Live preview with current draft color + chosen marker style */}
      <div className="px-3 pt-2.5 pb-1.5">
        <div className="text-[9px] uppercase tracking-[0.4px] text-neutral-400 mb-1">Preview</div>
        <div
          className="rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-tight border border-black/[0.06]"
          style={getMarkerStyle()}
        >
          {labelDraft.trim() || "—"}
        </div>
      </div>

      {/* Label editor */}
      <div className="px-3 pt-1 pb-2">
        <div className="text-[9px] uppercase tracking-[0.4px] text-neutral-400 mb-1">Task text</div>
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-black/[0.1] bg-white dark:bg-[#1C1C1E] px-2.5 py-1.5 text-[13px] font-medium focus:outline-none focus:border-[#007AFF]/60"
          placeholder="Task description"
          autoFocus
        />
      </div>

      {/* Color palette (font/text highlight) */}
      <div className="px-3 pt-1 pb-2.5 border-t border-black/[0.05]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-[0.4px] text-neutral-400">Color &amp; marker</span>
          {colorDraft && (
            <button
              type="button"
              onClick={() => setColorDraft(null)}
              className="text-[10px] text-neutral-400 hover:text-red-400"
            >
              clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {TASK_COLOR_SPHERES.map((c) => {
            const active = colorDraft === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColorDraft(c.hex)}
                className={`w-7 h-7 rounded-full ring-1 transition-all ${active ? "ring-[#007AFF] scale-110" : "ring-black/15 hover:ring-black/30"}`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            );
          })}

          {/* No color */}
          <button
            type="button"
            onClick={() => setColorDraft(null)}
            className={`w-7 h-7 rounded-full bg-white ring-1 text-[10px] flex items-center justify-center ${!colorDraft ? "ring-[#007AFF] scale-110" : "ring-black/15 hover:ring-black/30 text-neutral-400"}`}
            title="No color"
          >
            ×
          </button>
        </div>

        {/* Marker style options: colored marker underline, circle text, etc. */}
        <div className="mt-2">
          <div className="text-[9px] uppercase tracking-[0.4px] text-neutral-400 mb-1">Marker style</div>
          <div className="flex flex-wrap gap-1">
            {(['highlight', 'underline', 'circle', 'none'] as const).map((m) => {
              const active = markerType === m;
              const label = m === 'highlight' ? 'Highlight' : m === 'underline' ? 'Underline' : m === 'circle' ? 'Circle' : 'None';
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMarkerType(m)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-all ${active ? 'bg-[#007AFF]/10 border-[#007AFF] text-[#007AFF]' : 'border-black/15 hover:bg-neutral-100 dark:hover:bg-white/5'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto border-t border-black/[0.06] bg-neutral-50/60 dark:bg-white/[0.02] px-3 py-2 flex items-center gap-2">
        {onRemoveTask && (
          <button
            type="button"
            onClick={handleRemove}
            className="text-[11px] px-2 py-1 rounded text-red-500/90 hover:text-red-500 hover:bg-red-500/5"
          >
            Remove task
          </button>
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={onClose}
          className="text-[11px] px-3 py-1 rounded border border-black/[0.08] hover:bg-white dark:hover:bg-white/5"
        >
          Cancel
        </button>

        <motion.button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges}
          whileHover={hasChanges ? { scale: 1.01 } : {}}
          whileTap={hasChanges ? premiumTap : {}}
          className={`text-[11px] px-3 py-1 rounded font-semibold ${hasChanges ? "bg-[#007AFF] text-white" : "bg-neutral-200 text-neutral-400 cursor-default"}`}
        >
          Save
        </motion.button>
      </div>
    </motion.div>
  );

  if (!usePortal) {
    // Fallback (should not happen in normal builder flow)
    return (
      <AnimatePresence>
        <div key="overlay" className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20" onClick={onClose}>
          {content}
        </div>
      </AnimatePresence>
    );
  }

  return createPortal(
    <AnimatePresence>
      <div key="overlay" onClick={onClose} className="fixed inset-0 z-[205]" />
      {content}
    </AnimatePresence>,
    document.body
  );
};

export default TaskTextEditPad;
