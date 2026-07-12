"use client";

import React, { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Type,
  X,
  Plus,
  Trash2,
  Highlighter,
  Minus,
  Circle,
  Ban,
} from "lucide-react";
import { premiumSpring, premiumTap } from "@/lib/premiumSpring";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { usePortalPlacementStyle, type PlacementPadAnchor } from "./PlacementPad";
import { TASK_COLOR_SPHERES } from "./TaskRow";
import { TaskMarkerLabel } from "./TaskMarkerLabel";
import { resolveTaskAppearanceColor } from "@/lib/shiftbuilder/taskMarkerStyle";
import { getSlotMeta } from "./MarkerPad";
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

const MARKER_OPTIONS = [
  { id: "highlight" as const, label: "Highlight", icon: Highlighter },
  { id: "underline" as const, label: "Underline", icon: Minus },
  { id: "circle" as const, label: "Ring", icon: Circle },
  { id: "none" as const, label: "None", icon: Ban },
];

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
  const slotMeta = React.useMemo(() => getSlotMeta(slotKey), [slotKey]);
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
  const [saving, setSaving] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const portalStyle = usePortalPlacementStyle(isDock ? undefined : hostId, anchor);
  const usePortal = !isDock && !!hostId && !!portalStyle;

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

  const toolBtn = (active: boolean) =>
    [
      "sb-interactive flex h-9 w-9 items-center justify-center rounded-xl border transition-all active:scale-[0.96]",
      active
        ? "border-[#007AFF]/40 bg-[#007AFF]/[0.12] text-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
        : "border-black/[0.06] bg-white text-neutral-600 hover:bg-neutral-50 hover:border-black/10",
    ].join(" ");

  const sectionLabel = "text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-400";

  const refinedCard = (
    <div
      className={`w-full bg-white flex flex-col min-h-0 flex-1 overflow-hidden ${
        isDock
          ? "rounded-none shadow-none"
          : "rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.05)]"
      }`}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      {!isDock ? (
        <div className="px-4 pt-4 pb-3 shrink-0">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-white text-[15px] font-bold shadow-sm"
                style={{ backgroundColor: slotMeta.accent }}
              >
                {slotMeta.icon}
              </div>
              <div className="min-w-0">
                <p
                  className="text-[9px] font-bold tracking-[0.14em] uppercase mb-px"
                  style={{ color: slotMeta.accent }}
                >
                  {slotMeta.label}
                </p>
                <h2 className="text-[18px] font-bold text-gray-900 leading-tight tracking-tight">
                  {isAddingNew ? "New task" : "Edit task"}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="sb-interactive mt-0.5 w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center hover:bg-neutral-200 transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5 text-neutral-500" strokeWidth={2.5} />
            </button>
          </div>
          {hasChanges ? (
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#007AFF]/[0.08] border border-[#007AFF]/20 px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] animate-pulse" />
              <span className="text-[10px] font-semibold text-[#007AFF]">Unsaved changes</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-4 pt-3 pb-2 shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-gray-900 tracking-tight">
              {isAddingNew ? "New task" : "Edit task"}
            </p>
            {hasChanges ? (
              <p className="text-[10px] font-semibold text-[#007AFF] mt-0.5">Unsaved changes</p>
            ) : (
              <p className="text-[10px] text-neutral-400 mt-0.5">{slotMeta.label}</p>
            )}
          </div>
        </div>
      )}

      <div className="h-px bg-gray-100 shrink-0" />

      {/* ── Task switcher ────────────────────────────────────────────────── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="flex gap-1.5 overflow-x-auto items-center pb-0.5 scrollbar-none">
          {regularTasks.map((t) => {
            const active = !isAddingNew && t.id === activeTask?.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectExistingTask(t.id)}
                className={`sb-interactive shrink-0 max-w-[140px] truncate text-[11px] px-3 py-1.5 rounded-full font-semibold transition-all active:scale-[0.97] ${
                  active
                    ? "bg-[#007AFF] text-white shadow-[0_2px_8px_rgba(0,122,255,0.35)]"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/80 border border-black/[0.04]"
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
              className={`sb-interactive shrink-0 inline-flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-full font-semibold transition-all active:scale-[0.97] ${
                isAddingNew
                  ? "bg-[#007AFF] text-white shadow-[0_2px_8px_rgba(0,122,255,0.35)]"
                  : "border border-dashed border-[#007AFF]/40 text-[#007AFF] bg-[#007AFF]/[0.04] hover:bg-[#007AFF]/[0.08]"
              }`}
            >
              <Plus size={13} strokeWidth={2.5} />
              Add
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {isAddingNew || activeTask ? (
        <div
          className={`flex-1 min-h-0 flex flex-col ${isDock ? "overflow-y-auto overscroll-contain" : "overflow-y-auto"}`}
          style={isDock ? { touchAction: "pan-y" } : undefined}
        >
          <div className="px-4 pb-3 space-y-3.5 flex-1">
            {/* Editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={sectionLabel}>Task text</span>
                <span className="text-[10px] text-neutral-400 font-medium">Enter to save</span>
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onBlur={handleEditorBlur}
                className="w-full min-h-[72px] rounded-2xl border border-black/[0.06] bg-neutral-50/90 px-3.5 py-3 text-[14px] font-semibold text-gray-900 leading-snug focus:outline-none focus:border-[#007AFF]/50 focus:ring-4 focus:ring-[#007AFF]/10 focus:bg-white whitespace-pre-wrap break-words transition-shadow"
                style={{
                  fontSize: textStyleDraft?.fontSizePx ?? TASK_LABEL_SIZE_PX.default,
                  fontWeight: textStyleDraft?.fontWeight === "bold" ? 700 : 600,
                  fontStyle: textStyleDraft?.fontStyle === "italic" ? "italic" : "normal",
                  textDecoration: textStyleDraft?.textDecoration === "none" || !textStyleDraft?.textDecoration
                    ? undefined
                    : textStyleDraft.textDecoration,
                }}
                data-placeholder="Type the task…"
              />
            </div>

            {/* Typography toolbar */}
            <div>
              <div className={`${sectionLabel} mb-1.5`}>Style</div>
              <div className="rounded-2xl border border-black/[0.06] bg-neutral-50/80 p-1.5 flex flex-wrap items-center gap-1">
                <button type="button" className={toolBtn(textStyleDraft?.fontWeight === "bold")} onClick={() => applyFormat({ fontWeight: "bold" })} title="Bold (⌘B)" aria-pressed={textStyleDraft?.fontWeight === "bold"}>
                  <Bold size={15} strokeWidth={2.5} />
                </button>
                <button type="button" className={toolBtn(textStyleDraft?.fontStyle === "italic")} onClick={() => applyFormat({ fontStyle: "italic" })} title="Italic (⌘I)" aria-pressed={textStyleDraft?.fontStyle === "italic"}>
                  <Italic size={15} strokeWidth={2.5} />
                </button>
                <button type="button" className={toolBtn(textStyleDraft?.textDecoration === "underline")} onClick={() => applyFormat({ textDecoration: "underline" })} title="Underline (⌘U)" aria-pressed={textStyleDraft?.textDecoration === "underline"}>
                  <Underline size={15} strokeWidth={2.5} />
                </button>
                <button type="button" className={toolBtn(textStyleDraft?.textDecoration === "line-through")} onClick={() => applyFormat({ textDecoration: "line-through" })} title="Strikethrough" aria-pressed={textStyleDraft?.textDecoration === "line-through"}>
                  <Strikethrough size={15} strokeWidth={2.5} />
                </button>
                <span className="w-px h-6 bg-black/[0.08] mx-0.5" />
                {TASK_FONT_SIZES.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => applyFormat({ fontSizePx: sz })}
                    className={`sb-interactive h-9 min-w-[36px] px-1.5 rounded-xl border text-[11px] font-bold transition-all active:scale-[0.96] ${
                      textStyleDraft?.fontSizePx === sz
                        ? "border-[#007AFF]/40 bg-[#007AFF]/[0.12] text-[#007AFF]"
                        : "border-black/[0.06] bg-white text-neutral-600 hover:bg-neutral-50"
                    }`}
                    aria-pressed={textStyleDraft?.fontSizePx === sz}
                  >
                    {sz}
                  </button>
                ))}
                <button
                  type="button"
                  className={toolBtn(false)}
                  onClick={() => setTextStyleDraft(null)}
                  title="Reset formatting"
                >
                  <Type size={15} strokeWidth={2.2} />
                </button>
              </div>
            </div>

            {/* Live board preview */}
            <div>
              <div className={`${sectionLabel} mb-1.5`}>On card</div>
              <div className="rounded-2xl border border-black/[0.06] bg-gradient-to-b from-neutral-50 to-white px-3.5 py-3 min-h-[44px] flex items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <TaskMarkerLabel
                  label={labelDraft.trim() || "Task preview"}
                  color={colorDraft}
                  markerType={markerType}
                  textStyle={textStyleDraft}
                  className="inline-block font-bold"
                />
              </div>
            </div>

            {/* Color */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={sectionLabel}>Ink color</span>
                {colorDraft ? (
                  <button
                    type="button"
                    onClick={() => setColorDraft(null)}
                    className="text-[11px] font-semibold text-neutral-400 hover:text-[#FF3B30] transition-colors"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {TASK_COLOR_SPHERES.map((c) => {
                  const selected = colorDraft === c.hex;
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setColorDraft(c.hex)}
                      className={`sb-interactive relative w-9 h-9 rounded-full transition-transform active:scale-90 ${
                        selected ? "scale-110" : "hover:scale-105"
                      }`}
                      style={{
                        backgroundColor: c.hex,
                        boxShadow: selected
                          ? `0 0 0 2.5px #fff, 0 0 0 4.5px ${c.hex}, 0 4px 12px ${c.hex}55`
                          : "0 1px 3px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.35)",
                      }}
                      title={c.name}
                      aria-label={c.name}
                      aria-pressed={selected}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => setColorDraft(null)}
                  className={`sb-interactive w-9 h-9 rounded-full bg-neutral-100 border border-black/[0.06] text-[13px] font-semibold text-neutral-400 flex items-center justify-center transition-transform active:scale-90 ${
                    !colorDraft ? "ring-2 ring-[#007AFF] ring-offset-1" : "hover:bg-neutral-200/80"
                  }`}
                  title="No color"
                  aria-pressed={!colorDraft}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Marker style */}
            <div>
              <div className={`${sectionLabel} mb-1.5`}>Felt marker</div>
              <div className="grid grid-cols-4 gap-1.5">
                {MARKER_OPTIONS.map((m) => {
                  const Icon = m.icon;
                  const active = markerType === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMarkerType(m.id)}
                      className={`sb-interactive flex flex-col items-center gap-1 rounded-2xl border px-1.5 py-2.5 transition-all active:scale-[0.97] ${
                        active
                          ? "border-[#007AFF]/35 bg-[#007AFF]/[0.08] text-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                          : "border-black/[0.06] bg-white text-neutral-500 hover:bg-neutral-50"
                      }`}
                      aria-pressed={active}
                    >
                      <Icon size={15} strokeWidth={2.2} />
                      <span className="text-[9px] font-bold tracking-wide">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div
            className={`shrink-0 border-t border-gray-100 bg-white/95 backdrop-blur-sm ${
              isDock ? "px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]" : "px-4 py-3"
            }`}
          >
            <div className="flex items-center gap-2">
              {onRemoveTask && !isAddingNew ? (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={saving}
                  className="sb-interactive flex items-center gap-1.5 rounded-2xl border border-[#FFD5D5] bg-[#FFF0F0] text-[#FF3B30] text-[12px] font-semibold px-3 min-h-11 hover:bg-[#FFE5E5] disabled:opacity-50 active:scale-[0.98] transition-all"
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                  Remove
                </button>
              ) : null}
              <div className="flex-1" />
              <button
                type="button"
                onClick={requestClose}
                className="sb-interactive rounded-2xl border border-gray-200 bg-white text-gray-800 text-[12px] font-semibold px-4 min-h-11 hover:bg-neutral-50 active:scale-[0.98] transition-all"
              >
                Cancel
              </button>
              <motion.button
                type="button"
                onClick={() => void handleSave()}
                disabled={!hasChanges || saving}
                whileTap={hasChanges && !saving ? premiumTap : {}}
                className={`sb-interactive rounded-2xl text-[13px] font-bold px-5 min-h-11 transition-all ${
                  hasChanges && !saving
                    ? "text-white shadow-[0_4px_14px_rgba(0,122,255,0.35)]"
                    : "bg-neutral-200 text-neutral-400 cursor-default"
                }`}
                style={
                  hasChanges && !saving
                    ? { background: "linear-gradient(180deg, #0A84FF 0%, #0070E0 100%)" }
                    : undefined
                }
              >
                {saving ? "Saving…" : isAddingNew ? "Add task" : "Save"}
              </motion.button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-6 py-10 text-center flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-neutral-100 flex items-center justify-center text-neutral-400">
            <Plus size={22} strokeWidth={2} />
          </div>
          <p className="text-[13px] text-neutral-500 leading-relaxed max-w-[220px]">
            No task selected. Tap{" "}
            <span className="font-bold text-[#007AFF]">+ Add</span> to create one for this slot.
          </p>
        </div>
      )}
    </div>
  );

  const content = (
    <motion.div
      key="tasks-pad"
      initial={reducedMotion || isDock ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={reducedMotion || isDock ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: -2 }}
      transition={premiumSpring}
      className={`sb-tasks-pad flex flex-col ${
        isDock
          ? "placement-dock-inner h-full min-h-0 flex-1 overflow-hidden rounded-none border-0 shadow-none bg-transparent"
          : "overflow-hidden"
      }`}
      data-tasks-pad
      data-tasks-pad-dirty={hasChanges ? "true" : undefined}
      data-tasks-pad-presentation={presentation}
      style={{
        ...(isDock
          ? { width: "100%", height: "100%", minHeight: 0, flex: 1 }
          : usePortal && portalStyle
            ? { ...portalStyle, zIndex: 210, width: 360 }
            : { width: 360 }),
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      {refinedCard}
    </motion.div>
  );

  // Tablet dock shell — full-height inspector (same chrome as PlacementDock).
  if (isDock) {
    if (typeof document === "undefined") return null;
    return createPortal(
      <motion.aside
        className="placement-dock no-print"
        role="dialog"
        aria-label={`Tasks dock — ${slotMeta.label}`}
        data-tasks-dock
        initial={reducedMotion ? false : { x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={premiumSpring}
      >
        <div className="placement-dock-header flex shrink-0 items-center gap-3 border-b border-black/[0.06] px-4 py-3 bg-white/95 dark:bg-black/40">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[14px] font-bold shrink-0"
            style={{ backgroundColor: slotMeta.accent }}
          >
            {slotMeta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-[11px] font-bold uppercase tracking-[0.14em]"
              style={{ color: slotMeta.accent }}
            >
              Tasks
            </div>
            <div className="truncate text-[18px] font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {slotMeta.label}
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
        <div className="placement-dock-body min-h-0 flex-1 overflow-hidden flex flex-col bg-white">
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
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
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
      <div
        key="overlay"
        onClick={requestClose}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
        className="fixed inset-0 z-[205] bg-black/15"
        aria-hidden
      />
      {content}
    </AnimatePresence>,
    document.body,
  );
};

export default TasksPad;
