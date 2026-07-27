const HIGH_LIMITS_CHILD_TASKS = new Set([
  "red tray carts",
  "vacuum",
  "trash",
]);

const POKER_ROOM_CHILD_TASKS = new Set([
  "black tray carts",
  "trash",
  "vacuum",
]);

function normalizeSlotKey(slotKey: string): string {
  return slotKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeTaskLabel(taskLabel: string): string {
  return taskLabel.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Visual task hierarchy used by both the SheetBuilder cards and print output.
 * Labels and ordering remain unchanged; depth only controls presentation.
 */
export function taskHierarchyDepth(slotKey: string, taskLabel: string): 0 | 1 {
  const normalizedSlot = normalizeSlotKey(slotKey);
  const normalizedLabel = normalizeTaskLabel(taskLabel);
  const isZoneFour = normalizedSlot === "Z4" || normalizedSlot === "ZONE4";
  const isZoneFive = normalizedSlot === "Z5" || normalizedSlot === "ZONE5";

  return (isZoneFour && POKER_ROOM_CHILD_TASKS.has(normalizedLabel)) ||
    (isZoneFive && HIGH_LIMITS_CHILD_TASKS.has(normalizedLabel))
    ? 1
    : 0;
}
