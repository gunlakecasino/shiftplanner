import { useDraggable, useDroppable } from "@dnd-kit/core";

// Shared hook: turn a slot key into a "card is both droppable AND draggable"
// node. Draggable only activates when the card is filled, so empty cards just
// receive drops; filled cards can be picked up and moved/swapped/unassigned.
export function useSlotDnd(
  slotKey: string,
  slotType: "zone" | "rr" | "aux" | "overlap",
  tm: { tmId?: string | null; tmName?: string | null },
) {
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `slot:${slotKey}`,
    data: { type: "slot", slotKey, slotType },
  });
  const hasTM = !!tm.tmName;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `assigned:${slotKey}`,
    data: { type: "assigned", fromSlot: slotKey, tmId: tm.tmId, tmName: tm.tmName },
    disabled: !hasTM,
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
  return { setRef, isOver: !!incomingFromOther, isDragging, listeners, attributes, hasTM };
}
