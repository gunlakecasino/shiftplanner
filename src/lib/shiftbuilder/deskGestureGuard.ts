/** Suppress the click that fires after an assigned-TM drag so a missed swap
 * cannot open the inspector and jump the viewport. */
let lastAssignedDragEndedAt = 0;

export function markAssignedDragEnded(): void {
  lastAssignedDragEndedAt = Date.now();
}

export function wasRecentAssignedDrag(withinMs = 450): boolean {
  return Date.now() - lastAssignedDragEndedAt < withinMs;
}
