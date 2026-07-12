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
  applyTaskLevelFormat,
  formatTaskLabelTitleCase,
  formatTaskLabelTitleCaseOnWordBoundary,
  isTaskTextStyleEqual,
  normalizeTaskTextStyle,
  TASK_FONT_SIZES,
  TASK_LABEL_SIZE_PX,
  type TaskTextStyle,
} from "@/lib/shiftbuilder/taskTextStyle";

export type TasksPadPresentation = "flyout" | "dock";

export interface TasksPadProps {
  slotKey: string;
  task?: NightSlotTask;
  slotTasks?: NightSlotTask[];
  hostId?: string;
  /** Flyout anchor — matches Placement Pad for the same slot. */
  anchor?: PlacementPadAnchor;
  /**
   * `dock` = fill tablet inspector shell (no body-portal flyout).
   * Used on coarse-pointer devices so the editor stays on-screen.
   */
  presentation?: TasksPadPresentation;
  /** When true, start in add-new-task mode (even if the slot already has tasks). */
  addMode?: boolean;
  onClose: () => void;
  onEditTask?: (
    slotKey: string,
    oldLabel: string,
    newLabel: string,
    taskId?: string | null,
  ) => void | Promise<void>;
  onAddTask?: (slotKey: string, label: string) => void | Promise<void>;
  onSetTaskColor?: (
    slotKey: string,
    taskLabel: string,
    color: string | null,
    taskId?: string | null,
  ) => void | Promise<void>;
  onSetTaskMarker?: (
    slotKey: string,
    taskLabel: string,
    markerType: "highlight" | "underline" | "circle" | "none" | null,
    taskId?: string | null,
  ) => void | Promise<void>;
  /** Persists color + marker together (preferred for Tasks Pad save). */
  onSetTaskAppearance?: (
    slotKey: string,
    taskLabel: string,
    appearance: {
      color: string | null;
      markerType: "highlight" | "underline" | "circle" | "none";
    },
    taskId?: string | null,
  ) => void | Promise<void>;
  onSetTaskTextStyle?: (
    slotKey: string,
    taskLabel: string,
    textStyle: TaskTextStyle | null,
    taskId?: string | null,
  ) => void | Promise<void>;
  onRemoveTask?: (
    slotKey: string,
    taskLabel: string,
    taskId?: string | null,
  ) => void | Promise<void>;
  isDark?: boolean;
}

const TasksPad: React.FC<TasksPadProps> = ({
  slotKey,
  task: initialTask,
  slotTasks = [],
  hostId,
  anchor = "right",
  presentation = "flyout",
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
  const isDock = presentation === "dock";
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
  // Selection-scope formatting deferred until contentEditable renders spans.
  // Always whole-task so Enter-to-save and applyFormat stay honest.
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const portalStyle = usePortalPlacementStyle(isDock ? undefined : hostId, anchor);
  const usePortal = !isDock && !!hostId && !!portalStyle;

  /** Content signature so pad resyncs when task rows change, not only list length. */
  const slotTasksSig = React.useMemo(
    () =>
      regularTasks
        .map((t) => `${t.id}:${t.taskLabel}:${t.color ?? ""}:${t.markerType ?? ""}`)
        .join("|"),
    [regularTasks],
  );

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
  }, [slotKey, initialTask?.id, initialAddMode, slotTasksSig, usePortal]);

  const beginAddTask = useCallback(() => {
    setIsAddingNew(true);
    setActiveTaskId(null);
    setLabelDraft("");
    setColorDraft(null);
    setMarkerType("highlight");
    setTextStyleDraft(null);
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
      // Whole-task only (selection scope deferred until rich editor).
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
    [],
  );

  const persistAppearance = async (label: string, taskId?: string | null) => {
    const appearance = {
      color: resolveTaskAppearanceColor(colorDraft, markerType),
      markerType,
    };
    if (onSetTaskAppearance) {
      await onSetTaskAppearance(slotKey, label, appearance, taskId);
      return;
    }
    if (onSetTaskColor) await onSetTaskColor(slotKey, label, appearance.color, taskId);
    if (onSetTaskMarker) await onSetTaskMarker(slotKey, label, markerType, taskId);
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

  const requestClose = useCallback(() => {
    if (hasChanges && !saving) {
      const ok = window.confirm("Discard unsaved task changes?");
      if (!ok) return;
    }
    onClose();
  }, [hasChanges, saving, onClose]);

  const handleSave = async () => {
    const newLabel = formatTaskLabelTitleCase(labelDraft);
    if (!newLabel) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      if (isAddingNew) {
        if (!onAddTask) {
          onClose();
          return;
        }
        await onAddTask(slotKey, newLabel);
        // Appearance after add still keyed by label (row just created); ok.
        await persistAppearance(newLabel);
        if (textStyleDraft && onSetTaskTextStyle) {
          await onSetTaskTextStyle(slotKey, newLabel, textStyleDraft);
        }
        onClose();
        return;
      }

      if (!activeTask) {
        onClose();
        return;
      }

      const taskId = activeTask.id;
      const labelForMeta = newLabel !== originalLabel ? newLabel : originalLabel;

      if (newLabel !== originalLabel && onEditTask) {
        await onEditTask(slotKey, originalLabel, newLabel, taskId);
      }

      await persistAppearance(labelForMeta, taskId);

      if (!isTaskTextStyleEqual(textStyleDraft, originalTextStyle) && onSetTaskTextStyle) {
        await onSetTaskTextStyle(slotKey, labelForMeta, textStyleDraft, taskId);
      }

      onClose();
    } catch {
      // Handlers already toasted; keep pad open so operator can retry.
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!activeTask || !onRemoveTask) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onRemoveTask(slotKey, activeTask.taskLabel, activeTask.id);
      onClose();
    } catch {
      /* toast from handler */
    } finally {
      setSaving(false);
    }
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSave();
    }
    if (e.key === "Escape") {
      requestClose();
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
      initial={reducedMotion || isDock ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion || isDock ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: -2 }}
      transition={premiumSpring}
      className={`sb-tasks-pad flex flex-col ${
        isDock
          ? "placement-dock-inner h-full min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-none border-0 shadow-none bg-transparent"
          : "overflow-hidden rounded-xl border border-[var(--ios-gray-4)]/20 bg-[color-mix(in_srgb,var(--ios-background-secondary)_95%,transparent)] dark:bg-[var(--ios-background-secondary)] shadow-[0_10px_30px_rgba(0,0,0,0.18),_inset_0_1px_0_rgba(255,255,255,0.6)]"
      }`}
      data-tasks-pad
      data-tasks-pad-dirty={hasChanges ? "true" : undefined}
      data-tasks-pad-presentation={presentation}
      style={{
        ...(isDock
          ? { width: "100%", height: "100%", minHeight: 0, flex: 1, touchAction: "pan-y" }
          : usePortal && portalStyle
            ? { ...portalStyle, zIndex: 210 }
            : { width: 320 }),
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        backdropFilter: isDock ? undefined : "blur(12px) saturate(140%)",
        borderColor: isDark && !isDock ? "color-mix(in srgb, var(--ios-gray-4) 8%, transparent)" : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {/* Dock chrome already shows title/close — skip duplicate flyout header. */}
      {!isDock ? (
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--ios-gray-4)]/15 bg-[color-mix(in_srgb,var(--ios-background-tertiary)_70%,transparent)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-neutral-500 shrink-0">
            Tasks Pad
          </span>
          <span className="text-[10px] font-mono text-neutral-400 truncate">· {slotKey}</span>
        </div>
        <button
          type="button"
          onClick={requestClose}
          className="text-neutral-400 hover:text-neutral-600 text-sm leading-none px-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      ) : null}

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
          {/* Selection scope deferred — contentEditable does not render spans. */}
          <div className="px-3 pt-2 flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-[0.4px] text-neutral-400 mr-1">Apply to</span>
            <span className="text-[10px] text-neutral-400 px-2 py-0.5">Whole task</span>
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

          <div className={`mt-auto border-t border-[var(--ios-gray-4)]/15 flex items-center gap-2 shrink-0 ${isDock ? "px-3 py-3" : "px-3 py-2"}`}>
            {onRemoveTask ? (
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={saving}
                className={`rounded text-red-500/90 hover:text-red-500 hover:bg-red-500/5 disabled:opacity-50 ${isDock ? "text-[13px] min-h-11 px-3" : "text-[11px] px-2 py-1"}`}
              >
                Remove task
              </button>
            ) : null}
            <div className="flex-1" />
            <button
              type="button"
              onClick={requestClose}
              className={`rounded border border-[var(--ios-gray-4)]/20 ${isDock ? "text-[13px] min-h-11 px-4" : "text-[11px] px-3 py-1"}`}
            >
              Cancel
            </button>
            <motion.button
              type="button"
              onClick={() => void handleSave()}
              disabled={!hasChanges || saving}
              whileTap={hasChanges && !saving ? premiumTap : {}}
              className={`rounded font-semibold ${isDock ? "text-[13px] min-h-11 px-4" : "text-[11px] px-3 py-1"} ${hasChanges && !saving ? "bg-[var(--ios-blue)] text-white" : "bg-neutral-200 text-neutral-400 cursor-default"}`}
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

  // Tablet dock shell — full-height inspector (same chrome as PlacementDock).
  if (isDock) {
    if (typeof document === "undefined") return null;
    return createPortal(
      <motion.aside
        className="placement-dock no-print"
        role="dialog"
        aria-label={`Tasks dock — ${slotKey}`}
        data-tasks-dock
        initial={reducedMotion ? false : { x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={premiumSpring}
      >
        <div className="placement-dock-header flex shrink-0 items-center gap-3 border-b border-black/[0.06] px-4 py-3 bg-white/95 dark:bg-black/40">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-neutral-500">
              Tasks
            </div>
            <div className="truncate text-[18px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {slotKey}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="sb-interactive sb-tablet-touch-target flex h-11 w-11 items-center justify-center rounded-full border border-black/[0.06] bg-neutral-100 text-lg text-neutral-500"
            aria-label="Close tasks"
          >
            ×
          </button>
        </div>
        <div className="placement-dock-body min-h-0 flex-1 overflow-hidden flex flex-col">
          {content}
        </div>
      </motion.aside>,
      document.body,
    );
  }

  if (!usePortal) {
    return (
      <AnimatePresence>
        <div
          key="overlay"
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20"
          onClick={requestClose}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) requestClose();
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
        onClick={requestClose}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
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