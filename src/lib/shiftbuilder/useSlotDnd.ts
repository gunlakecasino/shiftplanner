import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useDragFitTier } from "./dragFit";

/**
 * useSlotDnd
 *
 * Pure dnd-kit wiring for a slot (droppable + draggable when filled).
 *
 * Phase 1 Live Cache integration note (2026-05-27):
 * - This hook remains the single source of truth for drag/drop gesture state
 *   (isOver, isDragging, listeners, setRef).
 * - **Mutation side** (the actual assign/unassign) should now come from the
 *   optimistic hooks in `useLiveAssignments.ts` (which do dual Query + Zustand
 *   optimistic updates + perfect rollback + conflict toasts via liveCache.ts).
 * - Callers (ZoneCard, RRCard, etc.) will receive `onAssign`, `onUnassign` etc.
 *   from the new live layer (wired in ShiftBuilderClient) instead of doing
 *   direct setState + fire-and-forget persistAssign.
 *
 * See:
 * - liveCache.ts (realtime bridge)
 * - useLiveAssignments.ts (optimistic mutations + onMutate/rollback pattern)
 * - ShiftBuilderClient.tsx (where the live hooks will be instantiated and passed down)
 * - Original persistAssign at ShiftBuilderClient.tsx:3376 (still used under the hood)
 *
 * Non-breaking: existing dnd behavior is 100% unchanged.
 */
export function useSlotDnd(
  slotKey: string,
  slotType: "zone" | "rr" | "aux" | "overlap",
  tm: { tmId?: string | null; tmName?: string | null },
  isLocked: boolean = false,
) {
  const disabled = isLocked;

  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `slot:${slotKey}`,
    data: { type: "slot", slotKey, slotType },
    disabled,
  });
  const hasTM = !!tm.tmName;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `assigned:${slotKey}`,
    data: { type: "assigned", fromSlot: slotKey, tmId: tm.tmId, tmName: tm.tmName },
    disabled: disabled || !hasTM,
  });
  const setRef = (el: HTMLElement | null) => {
    setDropRef(el);
    setDragRef(el);
  };
  // Only count as "valid drop target" when an incoming drag is a TM or an
  // assigned card from a different slot (don't highlight when hovering itself).
  const incomingFromOther =
    isOver && active && active.data.current?.type !== undefined &&
    !(active.data.current?.type === "assigned" && active.data.current?.fromSlot === slotKey);
  // Fit halo verdict for the in-flight TM drag (null outside a drag — see dragFit.ts).
  const dragFitTier = useDragFitTier(slotKey);
  const dragFitClass =
    dragFitTier && !isDragging && !disabled ? `sb-dragfit-${dragFitTier}` : "";
  return { setRef, isOver: !!incomingFromOther, isDragging, listeners, attributes, hasTM, dragFitClass };
}
