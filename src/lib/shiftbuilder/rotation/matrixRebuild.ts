/**
 * Pure zone-matrix aggregation shared by refreshTmZoneMatrixServer and
 * scripts/backfill-tm-zone-matrix.ts.
 *
 * Only Z* and Z9SR count toward area_diversity / cross_week_rotation.
 * count_lifetime is lifetime within the provided history rows (lookback),
 * not all-time DB lifetime.
 */

export type HistoryRowForMatrix = {
  slot_key: string;
  placed_at: string;
};

export type ZoneMatrixAgg = {
  last: string | null;
  c4: number;
  c8: number;
  life: number;
};

/** Normalize history slot_key to a matrix zone key, or null if not a zone. */
export function matrixZoneKeyFromSlotKey(slotKey: string): string | null {
  if (!slotKey) return null;
  if (/^Z\d+$/.test(slotKey) || slotKey === "Z9SR") return slotKey;
  if (/^zone_(\d+)$/.test(slotKey)) return `Z${slotKey.replace("zone_", "")}`;
  if (slotKey === "z9_sr") return "Z9SR";
  return null;
}

/**
 * Aggregate tm_zone_matrix counts from history rows.
 * @param historyRows rows already filtered to the desired lookback window
 * @param now reference "now" for 4w/8w windows (injectable for tests)
 */
export function aggregateZoneMatrixFromHistory(
  historyRows: HistoryRowForMatrix[],
  now: Date = new Date(),
): Map<string, ZoneMatrixAgg> {
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400 * 1000);
  const eightWeeksAgo = new Date(now.getTime() - 56 * 86400 * 1000);
  const zoneCounts = new Map<string, ZoneMatrixAgg>();

  for (const h of historyRows) {
    const z = matrixZoneKeyFromSlotKey(h.slot_key);
    if (!z) continue;

    const placed = new Date(h.placed_at);
    if (Number.isNaN(placed.getTime())) continue;

    if (!zoneCounts.has(z)) {
      zoneCounts.set(z, { last: null, c4: 0, c8: 0, life: 0 });
    }
    const rec = zoneCounts.get(z)!;
    rec.life += 1;
    if (placed >= fourWeeksAgo) rec.c4 += 1;
    if (placed >= eightWeeksAgo) rec.c8 += 1;
    if (!rec.last || placed > new Date(rec.last)) rec.last = h.placed_at;
  }

  return zoneCounts;
}

/** Night date YYYY-MM-DD → placed_at noon UTC (matches server history writes). */
export function placedAtFromNightDate(nightDate: string): string {
  const isoDate = nightDate.slice(0, 10);
  return new Date(`${isoDate}T12:00:00.000Z`).toISOString();
}
