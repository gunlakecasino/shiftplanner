/**
 * Synthetic placement-history builders for the engine test suite.
 *
 * `ZoneDetailEntry.zoneDates` maps a UI slot key → ISO dates newest-first; the
 * rotation model reads only `zoneDates`, so the other fields are derived
 * minimally. `weeklyRecentHistory` maps tmId → this-grave-week records.
 */

import type { ZoneDetailEntry } from "../../../data";
import type { WeekNightRecord } from "../../types";

/** ISO date N days before a base ISO. */
export function daysBefore(baseIso: string, n: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** One TM's history from an ordered list of {slotKey, daysAgo} placements. */
export function historyFor(
  tmId: string,
  tmName: string,
  baseIso: string,
  placements: Array<{ slotKey: string; daysAgo: number }>,
): ZoneDetailEntry {
  const zoneDates: Record<string, string[]> = {};
  for (const p of placements) {
    const iso = daysBefore(baseIso, p.daysAgo);
    (zoneDates[p.slotKey] ||= []).push(iso);
  }
  const zoneCounts: Record<string, number> = {};
  let total = 0;
  let lastDate = "";
  for (const [k, ds] of Object.entries(zoneDates)) {
    ds.sort((a, b) => b.localeCompare(a));
    zoneCounts[k] = ds.length;
    total += ds.length;
    if (ds[0] > lastDate) lastDate = ds[0];
  }
  return {
    tmId,
    tmName,
    zoneDates,
    zoneCounts,
    totalAssignments: total,
    totalNights: new Set(Object.values(zoneDates).flat()).size,
    lastDate,
    zoneDow: {},
  };
}

/** Build a weeklyRecentHistory map from tmId → records. */
export function weekHistory(
  entries: Record<string, WeekNightRecord[]>,
): Map<string, WeekNightRecord[]> {
  return new Map(Object.entries(entries));
}
