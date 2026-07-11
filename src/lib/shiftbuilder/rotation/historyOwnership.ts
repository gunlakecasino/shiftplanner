/** UI slot key ownership for one night — history is singular per (night, slot). */
export type HistorySlotMutation =
  | {
      kind: "assign";
      nightId: string;
      uiSlotKey: string;
      tmId: string;
      slotType: string;
      rrSide: string | null;
    }
  | {
      kind: "clear";
      nightId: string;
      uiSlotKey: string;
      slotType: string;
      rrSide: string | null;
    };

/**
 * Filter for deleting history rows that currently own a night×slot.
 * Intentionally ignores tmId on assign — any prior occupant is replaced.
 */
export function historyDeleteFilter(mut: HistorySlotMutation): {
  nightId: string;
  slotKey: string;
} {
  return { nightId: mut.nightId, slotKey: mut.uiSlotKey };
}

/**
 * Row shape for a committed history insert after slot ownership is cleared.
 */
export function historyInsertRow(
  mut: Extract<HistorySlotMutation, { kind: "assign" }>,
): {
  tm_id: string;
  night_id: string;
  slot_key: string;
  slot_type: string;
  rr_side: string | null;
  is_committed: true;
} {
  return {
    tm_id: mut.tmId,
    night_id: mut.nightId,
    slot_key: mut.uiSlotKey,
    slot_type: mut.slotType,
    rr_side: mut.rrSide,
    is_committed: true,
  };
}

/**
 * TMs whose zone matrix should be rebuilt after a history mutation.
 * Assign: previous occupants + new TM. Clear: previous occupants only.
 */
export function matrixTmsAfterHistoryChange(
  clearedTmIds: readonly string[],
  newTmId?: string | null,
): string[] {
  const ids = new Set<string>();
  for (const id of clearedTmIds) {
    if (id) ids.add(id);
  }
  if (newTmId) ids.add(newTmId);
  return [...ids];
}
