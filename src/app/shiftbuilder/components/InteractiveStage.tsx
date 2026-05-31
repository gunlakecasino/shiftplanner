"use client";

import React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";

/**
 * InteractiveStage — Phase 1 Performance + Architecture
 *
 * This component owns the DndContext + DragOverlay for the ShiftBuilder.
 *
 * Goal: The DndContext should *only* wrap the actual droppable surface
 * (the artboard cards + the roster when it is the active drop target).
 * Everything else (top chrome, command palette, floating controls, print modal, etc.)
 * should live outside this context.
 *
 * This dramatically reduces the number of listeners and re-render cost during drags,
 * which is especially painful on iPad with Apple Pencil / touch.
 *
 * Current state (first cut): We have extracted the wrapper so future narrowing
 * is trivial. The inner tree is still the previous large surface — we will prune
 * non-droppable chrome in follow-up slices.
 */

interface InteractiveStageProps {
  children: React.ReactNode;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  activeDrag: any; // the ghost data
  isDark: boolean;
  // Future: we will pass only the minimal droppable-related props
}

export default function InteractiveStage({
  children,
  onDragStart,
  onDragEnd,
  activeDrag,
  isDark,
}: InteractiveStageProps) {
  // Sensors tuned for iPad + Pencil (same logic as before, now co-located)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      autoScroll={false}
    >
      {children}

      {/* Drag ghost — rendered in portal so it is never clipped */}
      {typeof window !== "undefined" &&
        createPortal(
          <DragOverlay dropAnimation={null}>
            {activeDrag ? (
              activeDrag.kind === "task" ? (
                <div
                  className="flex items-center gap-1.5 rounded-lg pointer-events-none whitespace-nowrap"
                  style={{
                    padding: "5px 10px 5px 7px",
                    background: isDark ? "rgba(36,35,40,0.96)" : "rgba(255,255,255,0.96)",
                    color: isDark ? "#E5E5E7" : "#1C1C1E",
                    border: isDark ? "1px solid rgba(255,255,255,0.13)" : "1px solid rgba(0,0,0,0.09)",
                    boxShadow: isDark
                      ? "0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)"
                      : "0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.90)",
                    backdropFilter: "blur(20px)",
                    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                  }}
                >
                  <span className="ms" style={{ fontSize: 16, color: "#9CA3AF", fontVariationSettings: '"FILL" 1, "wght" 300, "opsz" 20' }}>drag_indicator</span>
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.2px" }}>{activeDrag.label}</span>
                  {activeDrag.fromSlot && (
                    <span style={{ fontSize: 10, opacity: 0.45, marginLeft: 2 }}>{activeDrag.fromSlot}</span>
                  )}
                </div>
              ) : null
            ) : null}
          </DragOverlay>,
          document.body
        )}
    </DndContext>
  );
}
