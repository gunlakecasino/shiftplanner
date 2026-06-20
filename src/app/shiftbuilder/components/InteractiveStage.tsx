"use client";

import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  pointerWithin,
  rectIntersection,
  MeasuringStrategy,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { snapTopLeftToCursor } from "@/lib/shiftbuilder/dndModifiers";
import { premiumSpring, premiumSpringReduced } from "@/lib/premiumSpring";

function isDroppableVisible(
  id: UniqueIdentifier,
  args: Parameters<CollisionDetection>[0],
): boolean {
  const rect = args.droppableRects.get(id);
  if (!rect || rect.width <= 4 || rect.height <= 4) return false;

  const container = args.droppableContainers.find((c) => c.id === id);
  const node = container?.node.current;
  if (!node || typeof window === "undefined") return true;

  let el: HTMLElement | null = node;
  while (el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }
    el = el.parentElement;
  }
  return true;
}

/** Prefer pointer-hit droppables; ignore hidden/off-screen/zero-size nodes. */
const shiftBuilderCollisionDetection: CollisionDetection = (args) => {
  const visibleHits = (collisions: ReturnType<typeof pointerWithin>) =>
    collisions.filter((c) => isDroppableVisible(c.id, args));

  const pointerHits = visibleHits(pointerWithin(args));
  if (pointerHits.length > 0) return pointerHits;

  const rectHits = visibleHits(rectIntersection(args));
  if (rectHits.length > 0) return rectHits;

  return visibleHits(closestCenter(args));
};

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
  onDragOver?: (event: any) => void; // for intra-list task reordering preview
  activeDrag: any; // the ghost data
  isDark: boolean;
  scale?: number; // for adjusted positioning/overlay in scaled relaxed builder (Safari/iPad fix)
  // Future: we will pass only the minimal droppable-related props
}

export default function InteractiveStage({
  children,
  onDragStart,
  onDragEnd,
  onDragOver,
  activeDrag,
  isDark,
  scale = 1,
}: InteractiveStageProps) {
  const reducedMotion = useReducedMotion();

  // Sensors tuned for iPad + Pencil + Safari compatibility.
  // Pointer for mouse/pencil, Touch for finger (with hold to distinguish from scroll).
  // MeasuringStrategy.Always below helps with ancestor CSS scale(transform) rect accuracy.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  // Prevent iOS Safari (iPad) and Mac Safari from interpreting drag gestures as pinch-to-zoom or "smart zoom".
  // Setting touch-action:none + user-select:none + overscroll:none on the drag surface during an active gesture
  // stops the browser from "zooming the window out" or glitching the viewport/scale.
  // We also toggle a global .sb-is-dragging class so CSS can reinforce (html/body + descendants).
  // Restored cleanly on drag end. This is the standard high-signal fix for scaled artboard + dnd on touch devices.
  React.useEffect(() => {
    if (!activeDrag) return;

    const root = document.documentElement;
    const body = document.body;

    const prevRootTouch = root.style.touchAction;
    const prevBodyTouch = body.style.touchAction;
    const prevRootSelect = root.style.userSelect;
    const prevBodySelect = body.style.userSelect;
    const prevOverscroll = body.style.overscrollBehavior;

    root.style.touchAction = 'none';
    body.style.touchAction = 'none';
    root.style.userSelect = 'none';
    body.style.userSelect = 'none';
    body.style.overscrollBehavior = 'none';

    root.classList.add('sb-is-dragging');
    body.classList.add('sb-is-dragging');

    // Note: touchmove prevent was removed to avoid interfering with dnd-kit's own touch handling on iPad/Safari.
    // The CSS .sb-is-dragging * { touch-action: none } + styles on root/body handle preventing unwanted zoom/gestures.

    return () => {
      root.style.touchAction = prevRootTouch;
      body.style.touchAction = prevBodyTouch;
      root.style.userSelect = prevRootSelect;
      body.style.userSelect = prevBodySelect;
      body.style.overscrollBehavior = prevOverscroll;
      root.classList.remove('sb-is-dragging');
      body.classList.remove('sb-is-dragging');
    };
  }, [activeDrag]);

  // Root wrapper for the narrowed dnd surface.
  // ALWAYS use display: 'contents' so this wrapper never participates in flex/grid sizing.
  // Switching to a real block element during drag was breaking builder-workspace layout
  // (cards shifted horizontally off-screen). Drag guards live on html/body via useEffect above.
  return (
    <div style={{ display: 'contents' }}>
      <DndContext
        sensors={sensors}
        collisionDetection={shiftBuilderCollisionDetection}
        measuring={{
          // Always re-measure rects. Critical for ancestor CSS scale(transform) + relaxed builder content
          // on Safari/iPad. Cached rects would be from the "natural" layout and not match current visual
          // positions / pointer coordinates after adaptive scaling.
          droppable: { strategy: MeasuringStrategy.Always },
        }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        autoScroll={false}
      >
        {children}

        {/* Drag ghost — rendered in portal so it is never clipped */}
        {typeof window !== "undefined" &&
          createPortal(
            <DragOverlay
              dropAnimation={null}
              modifiers={[snapTopLeftToCursor]}
              style={{ cursor: "default", width: "max-content", height: "max-content" }}
            >
              {activeDrag ? (
                (activeDrag.kind === "task" || activeDrag.kind === "assigned" || activeDrag.kind === "tm") ? (
                  <motion.div
                    className="flex items-center gap-1.5 rounded-lg pointer-events-none whitespace-nowrap"
                    style={{
                      padding: "5px 10px",
                      background: isDark ? "rgba(36,35,40,0.96)" : "rgba(255,255,255,0.96)",
                      color: isDark ? "#E5E5E7" : "#1C1C1E",
                      border: isDark ? "1px solid rgba(255,255,255,0.13)" : "1px solid rgba(0,0,0,0.09)",
                      boxShadow: isDark
                        ? "0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)"
                        : "0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.90)",
                      backdropFilter: "blur(20px)",
                      fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                    }}
                    initial={{ scale: 0.96, y: 2, opacity: 0.85 }}
                    animate={{ scale: reducedMotion ? 1 : 1.04, y: reducedMotion ? 0 : -4, opacity: 1 }}
                    transition={reducedMotion ? premiumSpringReduced : { ...premiumSpring, stiffness: 320 }}
                    // Refined drag ghost: subtle lift (y) + scale for premium "picked up" feel. Reduced motion safe.
                  >
                    <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.2px" }}>{activeDrag.label}</span>
                    {activeDrag.fromSlot && (
                      <span style={{ fontSize: 10, opacity: 0.45, marginLeft: 2 }}>{activeDrag.fromSlot}</span>
                    )}
                    {activeDrag.kind === "assigned" && (
                      <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 6 }}>reassign</span>
                    )}
                  </motion.div>
                ) : null
              ) : null}
            </DragOverlay>,
            document.body
          )}
      </DndContext>
    </div>
  );
}
