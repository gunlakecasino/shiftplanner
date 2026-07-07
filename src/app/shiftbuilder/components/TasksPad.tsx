"use client";

import React, { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Bold, Italic, Underline, Strikethrough, Type } from "lucide-react";
import { premiumSpring, premiumTap } from "@/lib/premiumSpring";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { usePortalPlacementStyle, type PlacementPadAnchor } from "./PlacementPad";
import { TASK_COLOR_SPHERES } from "./TaskRow";
import { TaskMarkerLabel } from "./TaskMarkerLabel";
import { resolveTaskAppearanceColor } from "@/lib/shiftbuilder/taskMarkerStyle";
import {
  applySpanFormat,
  applyTaskLevelFormat,
  formatTaskLabelTitleCase,
  formatTaskLabelTitleCaseOnWordBoundary,
  getSelectionOffsets,
  isTaskTextStyleEqual,
  normalizeTaskTextStyle,
  TASK_FONT_SIZES,
  TASK_LABEL_SIZE_PX,
  type TaskFormatScope,
  type TaskTextStyle,
} from "@/lib/shiftbuilder/taskTextStyle";

export interface TasksPadProps {
  slotKey: string;
  task?: NightSlotTask;
  slotTasks?: NightSlotTask[];
  hostId?: string;
  /** Flyout anchor — matches Placement Pad for the same slot. */
  anchor?: PlacementPadAnchor;
  /** When true, start in add-new-task mode (even if the slot already has tasks). */
  addMode?: boolean;
  onClose: () => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  onAddTask?: (slotKey: string, label: string) => void | Promise<void>;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (
    slotKey: string,
    taskLabel: string,
    markerType: "highlight" | "underline" | "circle" | "none" | null,
  ) => void;
  /** Persists color + marker together (preferred for Tasks Pad save). */
  onSetTaskAppearance?: (
    slotKey: string,
    taskLabel: string,
    appearance: {
      color: string | null;
      markerType: "highlight" | "underline" | "circle" | "none";
    },
  ) => void | Promise<void>;
  onSetTaskTextStyle?: (slotKey: string, taskLabel: string, textStyle: TaskTextStyle | null) => void;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  isDark?: boolean;
}

const TasksPad: React.FC<TasksPadProps> = ({
  slotKey,
  task: initialTask,
  slotTasks = [],
  hostId,
  anchor = "right",
  addMode: initialAddMode = false,
  onClose,
  onEditTask,
  onAddTask,
  onSetTaskColor,
  onSetTaskMarker,
  onSetTaskAppearance,
  onSetTaskTextStyle,
  onRemoveTask,
  isDark = false,
}) => {
  const regularTasks = slotTasks.filter((t) => !t.isCoverage);
  const [isAddingNew, setIsAddingNew] = useState(
    initialAddMode || (!initialTask && regularTasks.length === 0),
  );
  const [activeTaskId, setActiveTaskId] = useState<string | null>(
    isAddingNew ? null : (initialTask?.id ?? regularTasks[0]?.id ?? null),
  );
  const activeTask = isAddingNew
    ? undefined
    : (regularTasks.find((t) => t.id === activeTaskId) ?? initialTask ?? regularTasks[0]);

  const originalLabel = activeTask?.taskLabel ?? "";
  const originalColor = activeTask?.color ?? null;
  const originalMarker = activeTask?.markerType || "highlight";
  const originalTextStyle = normalizeTaskTextStyle(activeTask?.textStyle ?? null);

  const [labelDraft, setLabelDraft] = useState(isAddingNew ? "" : originalLabel);
  const [colorDraft, setColorDraft] = useState<string | null>(isAddingNew ? null : originalColor);
  const [markerType, setMarkerType] = useState<"highlight" | "underline" | "circle" | "none">(
    isAddingNew ? "highlight" : originalMarker,
  );
  const [textStyleDraft, setTextStyleDraft] = useState<TaskTextStyle | null>(
    isAddingNew ? null : originalTextStyle,
  );
  const [formatScope, setFormatScope] = useState<TaskFormatScope>("task");
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const portalStyle = usePortalPlacementStyle(hostId, anchor);
  const usePortal = !!hostId && !!portalStyle;

  React.useEffect(() => {
    const adding = initialAddMode || (!initialTask && regularTasks.length === 0);
    setIsAddingNew(adding);
    if (adding) {
      setActiveTaskId(null);
      setLabelDraft("");
      setColorDraft(null);
      setMarkerType("highlight");
      setTextStyleDraft(null);
      if (editorRef.current) editorRef.current.innerText = "";
      return;
    }
    const nextId = initialTask?.id ?? regularTasks[0]?.id ?? null;
    const nextTask = regularTasks.find((t) => t.id === nextId) ?? initialTask ?? regularTasks[0];
    setActiveTaskId(nextId);
    if (!nextTask) return;
    setLabelDraft(nextTask.taskLabel);
    setColorDraft(nextTask.color ?? null);
    setMarkerType(nextTask.markerType || "highlight");
    setTextStyleDraft(normalizeTaskTextStyle(nextTask.textStyle ?? null));
    if (editorRef.current) editorRef.current.innerText = nextTask.taskLabel;
    // usePortal: the pad renders inline first, then remounts into a portal once the
    // placement style is measured (rAF). That remount creates a fresh contentEditable
    // node, so re-run to re-seed its text — otherwise the editor opens blank.
  }, [slotKey, initialTask, initialAddMode, regularTasks.length, usePortal]);

  const beginAddTask = useCallback(() => {
    setIsAddingNew(true);
    setActiveTaskId(null);
    setLabelDraft("");
    setColorDraft(null);
    setMarkerType("highlight");
    setTextStyleDraft(null);
    setFormatScope("task");
    if (editorRef.current) editorRef.current.innerText = "";
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const selectExistingTask = useCallback((taskId: string) => {
    const t = regularTasks.find((task) => task.id === taskId);
    if (!t) return;
    setIsAddingNew(false);
    setActiveTaskId(taskId);
    setLabelDraft(t.taskLabel);
    setColorDraft(t.color ?? null);
    setMarkerType(t.markerType || "highlight");
    setTextStyleDraft(normalizeTaskTextStyle(t.textStyle ?? null));
    if (editorRef.current) editorRef.current.innerText = t.taskLabel;
  }, [regularTasks]);

  React.useEffect(() => {
    if (isAddingNew) return;
    if (!activeTask) return;
    setLabelDraft(activeTask.taskLabel);
    setColorDraft(activeTask.color ?? null);
    setMarkerType(activeTask.markerType || "highlight");
    setTextStyleDraft(normalizeTaskTextStyle(activeTask.textStyle ?? null));
    if (editorRef.current) {
      editorRef.current.innerText = activeTask.taskLabel;
    }
  }, [isAddingNew, activeTask?.id, activeTask?.taskLabel, activeTask?.color, activeTask?.markerType, activeTask?.textStyle, usePortal]);

  const hasChanges = isAddingNew
    ? labelDraft.trim().length > 0
    : labelDraft.trim() !== originalLabel ||
      colorDraft !== originalColor ||
      markerType !== originalMarker ||
      !isTaskTextStyleEqual(textStyleDraft, originalTextStyle);

  const applyFormat = useCallback(
    (patch: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strike?: boolean;
      fontSizePx?: 11 | 13 | 15;
      fontWeight?: "normal" | "bold";
      fontStyle?: "normal" | "italic";
      textDecoration?: "none" | "underline" | "line-through";
    }) => {
      if (formatScope === "selection" && editorRef.current) {
        const sel = getSelectionOffsets(editorRef.current);
        if (!sel) return;
        if (patch.bold !== undefined) {
          setTextStyleDraft((prev) =>
            applySpanFormat(prev, labelDraft.length, sel.start, sel.end, { bold: true }),
          );
        }
        if (patch.italic !== undefined) {
          setTextStyleDraft((prev) =>
            applySpanFormat(prev, labelDraft.length, sel.start, sel.end, { italic: true }),
          );
        }
        if (patch.underline !== undefined) {
          setTextStyleDraft((prev) =>
            applySpanFormat(prev, labelDraft.length, sel.start, sel.end, { underline: true }),
          );
        }
        if (patch.strike !== undefined) {
          setTextStyleDraft((prev) =>
            applySpanFormat(prev, labelDraft.length, sel.start, sel.end, { strike: true }),
          );
        }
        return;
      }

      if (patch.fontSizePx !== undefined) {
        setTextStyleDraft((prev) => applyTaskLevelFormat(prev, { fontSizePx: patch.fontSizePx }));
      }
      if (patch.fontWeight !== undefined) {
        setTextStyleDraft((prev) =>
          applyTaskLevelFormat(prev, {
            fontWeight: prev?.fontWeight === "bold" ? "normal" : "bold",
          }),
        );
      }
      if (patch.fontStyle !== undefined) {
        setTextStyleDraft((prev) =>
          applyTaskLevelFormat(prev, {
            fontStyle: prev?.fontStyle === "italic" ? "normal" : "italic",
          }),
        );
      }
      if (patch.textDecoration !== undefined) {
        setTextStyleDraft((prev) => {
          const cur = prev?.textDecoration ?? "none";
          let next: "none" | "underline" | "line-through" = "none";
          if (patch.textDecoration === "underline") {
            next = cur === "underline" ? "none" : "underline";
          } else if (patch.textDecoration === "line-through") {
            next = cur === "line-through" ? "none" : "line-through";
          }
          return applyTaskLevelFormat(prev, { textDecoration: next });
        });
      }
    },
    [formatScope, labelDraft.length],
  );

  const persistAppearance = async (label: string) => {
    const appearance = {
      color: resolveTaskAppearanceColor(colorDraft, markerType),
      markerType,
    };
    if (onSetTaskAppearance) {
      await onSetTaskAppearance(slotKey, label, appearance);
      return;
    }
    if (onSetTaskColor) onSetTaskColor(slotKey, label, appearance.color);
    if (onSetTaskMarker) onSetTaskMarker(slotKey, label, markerType);
  };

  const syncEditorText = useCallback((text: string, focusEnd = false) => {
    setLabelDraft(text);
    if (!editorRef.current) return;
    editorRef.current.innerText = text;
    if (!focusEnd) return;
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editorRef.current);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  const handleEditorInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      const raw = e.currentTarget.innerText;
      const formatted = formatTaskLabelTitleCaseOnWordBoundary(raw);
      if (formatted !== raw) {
        syncEditorText(formatted, true);
        return;
      }
      setLabelDraft(raw);
    },
    [syncEditorText],
  );

  const handleEditorBlur = useCallback(() => {
    const raw = editorRef.current?.innerText ?? labelDraft;
    const formatted = formatTaskLabelTitleCase(raw);
    if (formatted !== raw) {
      syncEditorText(formatted);
    }
  }, [labelDraft, syncEditorText]);

  const handleSave = async () => {
    const newLabel = formatTaskLabelTitleCase(labelDraft);
    if (!newLabel) {
      onClose();
      return;
    }

    if (isAddingNew) {
      if (!onAddTask) {
        onClose();
        return;
      }
      setSaving(true);
      try {
        await onAddTask(slotKey, newLabel);
        await persistAppearance(newLabel);
        if (textStyleDraft && onSetTaskTextStyle) onSetTaskTextStyle(slotKey, newLabel, textStyleDraft);
      } finally {
        setSaving(false);
      }
      onClose();
      return;
    }

    if (!activeTask) {
      onClose();
      return;
    }

    if (newLabel !== originalLabel && onEditTask) {
      onEditTask(slotKey, originalLabel, newLabel);
    }

    const labelForMeta = newLabel !== originalLabel ? newLabel : originalLabel;

    setSaving(true);
    try {
      await persistAppearance(labelForMeta);
      if (!isTaskTextStyleEqual(textStyleDraft, originalTextStyle) && onSetTaskTextStyle) {
        onSetTaskTextStyle(slotKey, labelForMeta, textStyleDraft);
      }
    } finally {
      setSaving(false);
    }

    onClose();
  };

  const handleRemove = () => {
    if (activeTask && onRemoveTask) {
      onRemoveTask(slotKey, activeTask.taskLabel);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "b") {
      e.preventDefault();
      applyFormat({ bold: true });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "i") {
      e.preventDefault();
      applyFormat({ italic: true });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "u") {
      e.preventDefault();
      applyFormat({ underline: true });
    }
    if (e.key === "Enter" && !e.shiftKey && formatScope === "task") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  const fmtBtn = (active: boolean) =>
    `w-7 h-7 rounded-md border flex items-center justify-center transition-all ${
      active
        ? "bg-[var(--ios-blue)]/12 border-[var(--ios-blue)] text-[var(--ios-blue)]"
        : "border-black/10 hover:bg-[var(--ios-gray-6)] text-neutral-600"
    }`;

  const content = (
    <motion.div
      key="tasks-pad"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: -2 }}
      transition={premiumSpring}
      className="sb-tasks-pad rounded-xl border border-[var(--ios-gray-4)]/20 bg-[color-mix(in_srgb,var(--ios-background-secondary)_95%,transparent)] dark:bg-[var(--ios-background-secondary)] shadow-[0_10px_30px_rgba(0,0,0,0.18),_inset_0_1px_0_rgba(255,255,255,0.6)] overflow-hidden flex flex-col"
      data-tasks-pad
      style={{
        ...(usePortal && portalStyle
          ? { ...portalStyle, zIndex: 210 }
          : { width: 320 }),
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        backdropFilter: "blur(12px) saturate(140%)",
        borderColor: isDark ? "color-mix(in srgb, var(--ios-gray-4) 8%, transparent)" : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ios-gray-4)]/15 bg-[color-mix(in_srgb,var(--ios-background-tertiary)_70%,transparent)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-neutral-500 shrink-0">
            Tasks Pad
          </span>
          <span className="text-[10px] font-mono text-neutral-400 truncate">· {slotKey}</span>
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

      <div className="px-2 pt-2 pb-1 flex gap-1 overflow-x-auto items-center">
        {regularTasks.map((t) => {
          const active = !isAddingNew && t.id === activeTask?.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectExistingTask(t.id)}
              className={`shrink-0 max-w-[120px] truncate text-[10px] px-2 py-1 rounded-md border ${
                active
                  ? "bg-[var(--ios-blue)]/10 border-[var(--ios-blue)] text-[var(--ios-blue)] font-semibold"
                  : "border-black/10 text-neutral-600"
              }`}
              title={t.taskLabel}
            >
              {t.taskLabel}
            </button>
          );
        })}
        {onAddTask ? (
          <button
            type="button"
            onClick={beginAddTask}
            className={`shrink-0 text-[10px] px-2 py-1 rounded-md border font-semibold ${
              isAddingNew
                ? "bg-[var(--ios-blue)]/10 border-[var(--ios-blue)] text-[var(--ios-blue)]"
                : "border-dashed border-[var(--ios-blue)]/40 text-[var(--ios-blue)]"
            }`}
          >
            + Add
          </button>
        ) : null}
      </div>

      {isAddingNew || activeTask ? (
        <>
          <div className="px-3 pt-2 flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-[0.4px] text-neutral-400 mr-1">Apply to</span>
            {(["task", "selection"] as const).map((scope) => (
              <button
                key={scope}
                type="button"
                onClick={() => setFormatScope(scope)}
                className={`text-[10px] px-2 py-0.5 rounded border ${
                  formatScope === scope
                    ? "bg-[var(--ios-blue)]/10 border-[var(--ios-blue)] text-[var(--ios-blue)]"
                    : "border-black/15 text-neutral-600"
                }`}
              >
                {scope === "task" ? "Whole task" : "Selection"}
              </button>
            ))}
          </div>

          {isAddingNew ? (
            <div className="px-3 pt-1 text-[11px] text-neutral-500">
              New task for <span className="font-mono text-neutral-600">{slotKey}</span>
            </div>
          ) : null}

          <div className="px-3 pt-2 pb-1 flex items-center gap-1 flex-wrap">
            <button type="button" className={fmtBtn(textStyleDraft?.fontWeight === "bold")} onClick={() => applyFormat({ fontWeight: "bold" })} title="Bold">
              <Bold size={13} strokeWidth={2.5} />
            </button>
            <button type="button" className={fmtBtn(textStyleDraft?.fontStyle === "italic")} onClick={() => applyFormat({ fontStyle: "italic" })} title="Italic">
              <Italic size={13} strokeWidth={2.5} />
            </button>
            <button type="button" className={fmtBtn(textStyleDraft?.textDecoration === "underline")} onClick={() => applyFormat({ textDecoration: "underline" })} title="Underline">
              <Underline size={13} strokeWidth={2.5} />
            </button>
            <button type="button" className={fmtBtn(textStyleDraft?.textDecoration === "line-through")} onClick={() => applyFormat({ textDecoration: "line-through" })} title="Strikethrough">
              <Strikethrough size={13} strokeWidth={2.5} />
            </button>
            <span className="w-px h-5 bg-black/10 mx-0.5" />
            {TASK_FONT_SIZES.map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => applyFormat({ fontSizePx: sz })}
                className={`h-7 min-w-[28px] px-1 rounded-md border text-[10px] font-semibold ${
                  textStyleDraft?.fontSizePx === sz
                    ? "bg-[var(--ios-blue)]/10 border-[var(--ios-blue)] text-[var(--ios-blue)]"
                    : "border-black/10 text-neutral-600"
                }`}
              >
                {sz}
              </button>
            ))}
            <button
              type="button"
              className={fmtBtn(false)}
              onClick={() => setTextStyleDraft(null)}
              title="Reset formatting"
            >
              <Type size={13} strokeWidth={2.2} />
            </button>
          </div>

          <div className="px-3 pt-1 pb-2">
            <div className="text-[9px] uppercase tracking-[0.4px] text-neutral-400 mb-1">Task text</div>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onBlur={handleEditorBlur}
              className="w-full min-h-[52px] rounded-md border border-[var(--ios-gray-4)]/20 bg-[var(--ios-background-secondary)] px-2.5 py-2 font-medium focus:outline-none focus:border-[var(--ios-blue)]/60 whitespace-pre-wrap break-words"
              style={{ fontSize: TASK_LABEL_SIZE_PX.default }}
            />
          </div>

          <div className="px-3 pb-2">
            <div className="text-[9px] uppercase tracking-[0.4px] text-neutral-400 mb-1">Preview</div>
            <div
              className="rounded-md px-2.5 py-1.5 font-medium leading-tight border border-[var(--ios-gray-4)]/15"
              style={{ fontSize: TASK_LABEL_SIZE_PX.default }}
            >
              <TaskMarkerLabel
                label={labelDraft.trim() || "—"}
                color={colorDraft}
                markerType={markerType}
                textStyle={textStyleDraft}
                className="inline-block"
              />
            </div>
          </div>

          <div className="px-3 pt-1 pb-2.5 border-t border-[var(--ios-gray-4)]/15">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] uppercase tracking-[0.4px] text-neutral-400">Color &amp; marker</span>
              {colorDraft ? (
                <button type="button" onClick={() => setColorDraft(null)} className="text-[10px] text-neutral-400 hover:text-red-400">
                  clear
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TASK_COLOR_SPHERES.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColorDraft(c.hex)}
                  className={`w-7 h-7 rounded-full ring-1 transition-all ${colorDraft === c.hex ? "ring-[var(--ios-blue)] scale-110" : "ring-black/15 hover:ring-black/30"}`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
              <button
                type="button"
                onClick={() => setColorDraft(null)}
                className={`w-7 h-7 rounded-full bg-[var(--ios-background-secondary)] ring-1 text-[10px] flex items-center justify-center ${!colorDraft ? "ring-[var(--ios-blue)] scale-110" : "ring-[var(--ios-gray-4)]/30"}`}
                title="No color"
              >
                ×
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {(["highlight", "underline", "circle", "none"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMarkerType(m)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                    markerType === m
                      ? "bg-[var(--ios-blue)]/10 border-[var(--ios-blue)] text-[var(--ios-blue)]"
                      : "border-black/15 hover:bg-[var(--ios-gray-6)]"
                  }`}
                >
                  {m === "highlight" ? "Felt highlight" : m === "underline" ? "Felt line" : m === "circle" ? "Felt ring" : "None"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto border-t border-[var(--ios-gray-4)]/15 px-3 py-2 flex items-center gap-2">
            {onRemoveTask ? (
              <button type="button" onClick={handleRemove} className="text-[11px] px-2 py-1 rounded text-red-500/90 hover:text-red-500 hover:bg-red-500/5">
                Remove task
              </button>
            ) : null}
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="text-[11px] px-3 py-1 rounded border border-[var(--ios-gray-4)]/20">
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={() => void handleSave()}
              disabled={!hasChanges || saving}
              whileTap={hasChanges && !saving ? premiumTap : {}}
              className={`text-[11px] px-3 py-1 rounded font-semibold ${hasChanges && !saving ? "bg-[var(--ios-blue)] text-white" : "bg-neutral-200 text-neutral-400 cursor-default"}`}
            >
              {isAddingNew ? "Add task" : "Save"}
            </motion.button>
          </div>
        </>
      ) : (
        <div className="px-3 py-6 text-center text-[12px] text-neutral-500">
          Select a task tab or tap <span className="font-semibold text-[var(--ios-blue)]">+ Add</span> to create one.
        </div>
      )}
    </motion.div>
  );

  if (!usePortal) {
    return (
      <AnimatePresence>
        <div
          key="overlay"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20"
          onClick={onClose}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          {content}
        </div>
      </AnimatePresence>
    );
  }

  return createPortal(
    <AnimatePresence>
      {/* Backdrop sits below the pad (z 205) so taps on the pad hit the pad, not onClose. */}
      <div
        key="overlay"
        onClick={onClose}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className="fixed inset-0 z-[205] bg-black/10"
        aria-hidden
      />
      {content}
    </AnimatePresence>,
    document.body,
  );
};

export default TasksPad;