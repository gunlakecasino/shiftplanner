const HIGH_LIMITS_CHILD_TASKS = new Set([
  "red tray carts",
  "vacuum",
  "trash",
]);

const TEAM_MEMBER_HALLWAY_CHILD_TASKS = new Set([
  "locker rooms",
  "restroom",
  "smoking room",
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

export const TASK_SUBTASK_FONT_REDUCTION_PX = 1;

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
    (isZoneFive &&
      (TEAM_MEMBER_HALLWAY_CHILD_TASKS.has(normalizedLabel) ||
        HIGH_LIMITS_CHILD_TASKS.has(normalizedLabel)))
    ? 1
    : 0;
}

export function taskHierarchyFontSizePx(
  baseSizePx: number,
  hierarchyDepth: 0 | 1,
): number {
  return hierarchyDepth
    ? Math.max(1, baseSizePx - TASK_SUBTASK_FONT_REDUCTION_PX)
    : baseSizePx;
}
