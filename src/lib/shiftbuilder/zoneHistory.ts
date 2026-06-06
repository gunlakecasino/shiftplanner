export type ZoneHistoryEntry = { nightDate: string; slotKey: string };
/** JSON-serializable zone history (tmId → placements). */
export type ZoneHistoryRecord = Record<string, ZoneHistoryEntry[]>;

export function zoneHistoryMapFromRecord(
  rec: ZoneHistoryRecord | null | undefined,
): Map<string, ZoneHistoryEntry[]> {
  const map = new Map<string, ZoneHistoryEntry[]>();
  if (!rec) return map;
  for (const [tmId, entries] of Object.entries(rec)) {
    if (entries?.length) map.set(tmId, entries);
  }
  return map;
}

export function zoneHistoryRecordFromMap(
  map: Map<string, ZoneHistoryEntry[]>,
): ZoneHistoryRecord {
  const out: ZoneHistoryRecord = {};
  map.forEach((entries, tmId) => {
    out[tmId] = entries;
  });
  return out;
}