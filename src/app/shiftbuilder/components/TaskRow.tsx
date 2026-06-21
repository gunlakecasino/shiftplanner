"use client";

import React from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { premiumSpring } from "@/lib/premiumSpring";
import { TaskMarkerLabel } from "./TaskMarkerLabel";
import { normalizeTaskMarkerType, shouldRenderTaskMarker } from "@/lib/shiftbuilder/taskMarkerStyle";


// Shared color palette for tasks (used by TaskRow accent + TaskTextEditPad)
// Using iOS 26 system colors for accents/highlights
export const TASK_COLOR_SPHERES = [
  { name: 'Yellow',  hex: '#ffcc00' },
  { name: 'Red',     hex: '#ff3b30' },
  { name: 'Pink',    hex: '#ff2d55' },
  { name: 'Blue',    hex: '#007aff' },
  { name: 'Brown',   hex: '#a2845e' },
  { name: 'Green',   hex: '#34c759' },
  { name: 'Orange',  hex: '#ff9500' },
  { name: 'Teal',    hex: '#30b0c7' },
] as const;

// ============================================================================
// TaskRow — static per-task line (color accent border for text attr).
// Double-click anywhere on the row to open the dedicated TaskTextEditPad (pops like PlacementPad).
// No more hover quick-edit toolbar (color / pencil / delete). Used by Zone/RR/Aux/Overlap cards.
// ============================================================================

export interface TaskRowProps {
  task: NightSlotTask;
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onSetTaskMarker?: (slotKey: string, taskLabel: string, markerType: 'highlight' | 'underline' | 'circle' | 'none' | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  /** Double-click opens Tasks Pad (task optional when opening from card). Builder only. */
  onOpenTaskTextEdit?: (
    slotKey: string,
    task?: NightSlotTask,
    options?: { addMode?: boolean },
  ) => void;
  // Slight visual tweaks per context (Zone vs tight RR/Overlap)
  textSize?: string;
  textColorClass?: string;
  /** When true (default), the task label is draggable for cross-card reassign.
   *  Can be overridden via localStorage key shiftbuilder:taskUxPrefs { dragEnabled: false }. */
  draggable?: boolean;
  /** When true, use static compact sizing for the sacred Golden (print-preview capture). No measurement, no ResizeObserver, no dynamic 13/10 shrink/hang. */
  isPrintPreview?: boolean;
}

const TaskRow: React.FC<TaskRowProps> = React.memo(({
  task,
  slotKey,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  onOpenTaskTextEdit,
  textSize = "text-[13px]",
  textColorClass = "text-[#1f2937] dark:text-[#C7C7CC]",
  draggable = true,
  isPrintPreview = false,
}) => {
  const markerType = normalizeTaskMarkerType(task.markerType);
  const hasColor = !!task.color;
  const showMarker = shouldRenderTaskMarker(markerType, task.color);
  const labelRef = React.useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = React.useState(isPrintPreview ? '9.5px' : '13px');
  const [hanging, setHanging] = React.useState<{ textIndent: string; paddingLeft: string }>({
    textIndent: '0',
    paddingLeft: '0',
  });

  // Responsive task label: base 13px consistent across all cards.
  // If overflows single line at 13px -> shrink to 10px.
  // If still overflows -> wrap with hanging indent.
  // ONLY in builder (!isPrintPreview). In print-preview / PDF capture we use the static
  // compact textSize passed from the card lists (matches Golden spec exactly, no
  // measurement side-effects or ResizeObserver during the settle frames before capture).
  React.useLayoutEffect(() => {
    if (isPrintPreview) {
      // Static compact for sacred print capture. Pick a safe small size from the
      // prop or default. No hanging indent (prevents extra layout height). No RO.
      // Additionally force nowrap + truncate so long custom labels (e.g. "Lobby")
      // or measurement differences never add a second line in any browser's print engine.
      const staticSize = textSize?.match(/\[([\d.]+)px\]/)?.[1] ? textSize.match(/\[([\d.]+)px\]/)![1] + 'px' : '9.5px';
      setFontSize(staticSize);
      setHanging({ textIndent: '0', paddingLeft: '0' });
      return;
    }

    const el = labelRef.current;
    if (!el) return;
    const container = el.parentElement;
    if (!container) return;

    const compute = () => {
      // measure at base
      el.style.fontSize = '13px';
      el.style.textIndent = '0';
      el.style.paddingLeft = '0';
      el.style.whiteSpace = 'nowrap';

      const needed = el.scrollWidth;
      const avail = Math.max(20, container.clientWidth - 4); // tolerance for borders/padding

      let fs = '13px';
      let ti = '0';
      let pl = '0';

      if (needed > avail) {
        el.style.fontSize = '10px';
        const needed10 = el.scrollWidth;
        if (needed10 > avail) {
          fs = '10px';
          ti = '-1.15em';
          pl = '1.15em';
        } else {
          fs = '10px';
        }
      }

      el.style.whiteSpace = 'normal';
      setFontSize(fs);
      setHanging({ textIndent: ti, paddingLeft: pl });
    };

    compute();

    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [task.taskLabel, hasColor, markerType, isPrintPreview, textSize]);
  // Self-contained read of the drag pref so TaskRow doesn't require prop threading from every parent.
  // The Sudo Tasks tab writes to the same localStorage key.
  const effectiveDraggable = React.useMemo(() => {
    if (typeof window === 'undefined') return draggable;
    try {
      const raw = localStorage.getItem('shiftbuilder:taskUxPrefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (typeof p.dragEnabled === 'boolean') return p.dragEnabled;
      }
    } catch {}
    return draggable;
  }, [draggable]);

  // hasColor declared early (before states/effect) for the responsive text sizing logic below.

  // dnd-kit: drag from the task label (not a separate grip).
  const {
    attributes: taskDragAttributes,
    listeners: taskDragListeners,
    setNodeRef: setTaskDragRef,
    isDragging,
  } = useDraggable({
    id: `task:${slotKey}:${task.taskLabel}`,
    data: {
      type: "task",
      fromSlot: slotKey,
      taskLabel: task.taskLabel,
      catalogTaskId: task.catalogTaskId ?? null,
      color: task.color ?? null,
    },
    disabled: !effectiveDraggable,
  });

  // Droppable target for intra-slot reordering (drag a task over another task in the same list to reorder).
  // Combined with the draggable for cross-slot moves/duplicates. The parent DndContext + onDragOver handles preview.
  const {
    setNodeRef: setTaskDropRef,
    isOver: isOverTaskItem,
  } = useDroppable({
    id: `task-item:${slotKey}:${task.taskLabel}`,
    data: {
      type: "task-item",
      slotKey,
      taskLabel: task.taskLabel,
    },
  });

  const canDrag = effectiveDraggable;

  const setRowRef = (node: HTMLElement | null) => {
    setTaskDragRef(node);
    setTaskDropRef(node);
  };

  const dragListeners = React.useMemo(() => {
    if (!canDrag) return {};
    const base = taskDragListeners as {
      onPointerDown?: (ev: React.PointerEvent) => void;
    };
    return {
      ...taskDragListeners,
      onPointerDown: (e: React.PointerEvent) => {
        // Keep task drags from bubbling to the parent assignment card (TM drag).
        e.stopPropagation();
        base.onPointerDown?.(e);
      },
    };
  }, [canDrag, taskDragListeners]);

  const taskHostId = `task-${slotKey}-${task.id}`;

  return (
    <div
      ref={setRowRef}
      data-task-host={taskHostId}
      className={`sb-list-row group/task relative flex items-start gap-1.5 rounded px-1 -mx-0.5 ${isPrintPreview ? 'py-0' : 'py-[2px]'} hover:bg-white/60 dark:hover:bg-white/5 ${textSize} ${textColorClass} ${isOverTaskItem ? 'ring-1 ring-[var(--sb-gold-border)]' : ''} ${isDragging ? 'sb-dragging' : ''} ${canDrag ? 'touch-none select-none cursor-default' : ''}`}
      {...(canDrag ? dragListeners : {})}
      {...(canDrag ? taskDragAttributes : {})}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenTaskTextEdit?.(slotKey, task);
      }}
    >
      {/* Label — static; color accent (left border + subtle tint) is the persistent visual for the text attribute.
          Double-click the row anywhere to open the full text/font edit pad (label + color). Hover toolbar removed per spec. */}
      <div data-task-label className={`min-w-0 flex-1 ${isPrintPreview ? 'leading-[1.05]' : 'leading-snug'}`}>
        <span ref={labelRef} className="block min-w-0 max-w-full">
          <TaskMarkerLabel
            label={task.taskLabel}
            color={showMarker ? task.color : null}
            markerType={showMarker ? markerType : "none"}
            textStyle={task.textStyle}
            isPrintPreview={isPrintPreview}
            fontSize={fontSize}
            hanging={hanging}
            className="block rounded-sm transition-colors font-medium py-px"
          />
        </span>
      </div>
      {onRemoveTask && !isPrintPreview ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTask(slotKey, task.taskLabel);
          }}
          className="hidden group-hover/task:flex shrink-0 items-center justify-center text-[#9CA3AF] hover:text-red-500 text-[13px] leading-none font-bold px-0.5 -mr-0.5"
          aria-label={`Remove ${task.taskLabel}`}
          title="Remove task"
        >
          ×
        </button>
      ) : null}
    </div>
  );
});

export default TaskRow;
