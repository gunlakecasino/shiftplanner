"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

// ============================================================================
// TaskRow — shared per-task line with always-visible color sphere + hover picker
// Used by Zone cards, RR sides, and Overlap slots. The sphere prints because
// it is real DOM content (backgroundColor on a div).
// ============================================================================

export const TASK_COLOR_SPHERES = [
  { name: 'Gold',    hex: '#B89708' },
  { name: 'Red',     hex: '#E53935' },
  { name: 'Magenta', hex: '#B7679A' },
  { name: 'Blue',    hex: '#1976D2' },
  { name: 'Brown',   hex: '#6B5346' },
  { name: 'Green',   hex: '#43A047' },
  { name: 'Orange',  hex: '#FB8C00' },
] as const;

export interface TaskRowProps {
  task: NightSlotTask;
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
  // Slight visual tweaks per context (Zone vs tight RR/Overlap)
  textSize?: string;
  textColorClass?: string;
  /** When true (default), render a drag grip and make the row draggable for cross-card reassign.
   *  Can be overridden via localStorage key shiftbuilder:taskUxPrefs { dragEnabled: false }. */
  draggable?: boolean;
}

const TaskRow: React.FC<TaskRowProps> = ({
  task,
  slotKey,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  textSize = "text-[11px]",
  textColorClass = "text-[#374151] dark:text-[#C7C7CC]",
  draggable = true,
}) => {
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

  const hasColor = !!task.color;
  const [isColorExpanded, setIsColorExpanded] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState('');
  // Touch devices have no hover — a tap on the row pins/unpins the toolbar.
  const [toolbarPinned, setToolbarPinned] = React.useState(false);

  // dnd-kit support for dragging this task to a different card (when the
  // Sudo > Tasks tab has the feature enabled).
  const {
    attributes: taskDragAttributes,
    listeners: taskDragListeners,
    setNodeRef: setTaskDragRef,
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

  const startEditing = () => {
    setIsEditing(true);
    setEditValue(task.taskLabel);
    setIsColorExpanded(false);
  };

  const saveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== task.taskLabel) {
      onEditTask?.(slotKey, task.taskLabel, trimmed);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
  };

  return (
    <div
      className={`group/task relative flex items-start gap-1.5 rounded px-0.5 -mx-0.5 py-px transition-colors hover:bg-white/60 dark:hover:bg-white/5 ${textSize} ${textColorClass}`}
      onPointerUp={(e) => {
        // Touch tap on a task row: pin/unpin the toolbar instead of opening
        // the card palette. stopPropagation prevents the card onClick from firing.
        if (e.pointerType === 'touch') {
          e.stopPropagation();
          setToolbarPinned((p) => !p);
        }
      }}
    >
      {effectiveDraggable && (
        <div
          ref={setTaskDragRef}
          {...taskDragListeners}
          {...taskDragAttributes}
          // Stop the pointer event from bubbling to the card wrapper.
          // Without this the card's own useDraggable listeners also fire,
          // causing two simultaneous dnd-kit drags that conflict with each other.
          onPointerDown={(e) => {
            e.stopPropagation();
            (taskDragListeners as any)?.onPointerDown?.(e);
          }}
          className="mt-px mr-1 cursor-grab text-[#9CA3AF] opacity-60 group-hover/task:opacity-100 active:cursor-grabbing select-none touch-none"
          title="Drag this task to another card to reassign it"
        >
          ⠿
        </div>
      )}
      {/* Label area — supports inline editing + hanging indent for wrapping.
          When a highlight color is set, we apply a left border + subtle background
          tint directly to the text block so the highlight extends the full length
          of the task label (including wrapped lines). No separate sphere. */}
      <div className="min-w-0 flex-1 leading-snug">
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            className="w-full bg-white dark:bg-[#2C2C2E] border border-[#007AFF]/40 rounded px-1 py-0.5 text-inherit focus:outline-none"
            autoFocus
          />
        ) : (
          <span
            className={`block rounded-sm transition-colors ${hasColor ? '' : 'pl-[13px] -indent-[13px]'}`}
            style={hasColor ? {
              backgroundColor: `${task.color}15`,
              borderLeft: `3px solid ${task.color}`,
              paddingLeft: '9px',
              marginLeft: '-1px'
            } : undefined}
          >
            {task.taskLabel}
          </span>
        )}
      </div>

      {/* Compact hover toolbar — collapsed by default for maximum density.
          Color control can be clicked to expand the full palette. */}
      {(onRemoveTask || onSetTaskColor || onEditTask) && !isEditing && (
        <div className={`absolute right-0.5 top-0.5 items-center gap-1 bg-white/95 dark:bg-[#3A3A3C] rounded-sm px-1 py-px shadow-sm ring-1 ring-black/10 dark:ring-white/10 z-10 ${toolbarPinned ? 'flex' : 'hidden group-hover/task:flex'}`}>
          {/* Color control — collapsed until clicked */}
          {onSetTaskColor && (
            <>
              {!isColorExpanded ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsColorExpanded(true);
                  }}
                  className="flex items-center justify-center w-4 h-4 rounded-full ring-1 ring-black/20 hover:ring-black/40"
                  style={{ backgroundColor: hasColor ? task.color! : '#E5E5E7' }}
                  title="Change task color"
                >
                  <span className="text-[7px] leading-none text-white/70">●</span>
                </button>
              ) : (
                /* Expanded color palette */
                <div className="flex items-center gap-1">
                  {TASK_COLOR_SPHERES.map((c) => (
                    <button
                      key={c.hex}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetTaskColor(slotKey, task.taskLabel, c.hex);
                        setIsColorExpanded(false);
                      }}
                      className="w-2.5 h-2.5 rounded-full ring-1 ring-black/15 hover:ring-black/40"
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    />
                  ))}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetTaskColor(slotKey, task.taskLabel, null);
                      setIsColorExpanded(false);
                    }}
                    className="w-2.5 h-2.5 rounded-full bg-white ring-1 ring-black/20 text-[7px] text-[#9CA3AF]"
                    title="Remove color"
                  >
                    ×
                  </button>
                  {/* Collapse button */}
                  <button
                    onClick={() => setIsColorExpanded(false)}
                    className="ml-0.5 text-[10px] text-[#9CA3AF] hover:text-[#6B7280]"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              )}
            </>
          )}

          {/* Edit (pencil) */}
          {onEditTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                startEditing();
              }}
              className="text-[#6B7280] hover:text-[#007AFF] text-[11px] leading-none"
              title="Edit task"
            >
              ✎
            </button>
          )}

          {/* Delete */}
          {onRemoveTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setToolbarPinned(false);
                onRemoveTask(slotKey, task.taskLabel);
              }}
              className="text-red-400 hover:text-red-500 text-[12px] leading-none font-bold"
              title="Remove task"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskRow;
