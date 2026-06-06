import type { SupabaseClient } from "@supabase/supabase-js";
import { formatLocalDateISO } from "./dateUtils";
import type { ZoneHistoryRecord } from "./zoneHistory";

export type { ZoneHistoryEntry, ZoneHistoryRecord } from "./zoneHistory";
export { zoneHistoryMapFromRecord, zoneHistoryRecordFromMap } from "./zoneHistory";

/**
 * Last N nights of zone_assignments before `beforeDate` (excludes current night).
 * Server-only — powers rotation / area_diversity in the builder engine path.
 */
export async function fetchRecentZoneHistoryServer(
  beforeDate: Date,
  nights: number,
  supabase: SupabaseClient,
): Promise<ZoneHistoryRecord> {
  const beforeIso = formatLocalDateISO(beforeDate);
  const cutoff = new Date(beforeDate);
  cutoff.setDate(cutoff.getDate() - nights);
  const cutoffIso = formatLocalDateISO(cutoff);

  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date")
    .gte("night_date", cutoffIso)
    .lt("night_date", beforeIso);

  if (nightErr || !nightRows?.length) {
    if (nightErr) {
      console.warn("[zoneHistory.server] nights query failed:", nightErr.message);
    }
    return {};
  }

  const nightIdToDate = new Map<string, string>();
  nightRows.forEach((n: { id: string; night_date: string }) => {
    nightIdToDate.set(n.id, n.night_date);
  });

  const { data: assignmentRows, error: assignErr } = await supabase
    .from("zone_assignments")
    .select("night_id, slot_key, tm_id")
    .in("night_id", Array.from(nightIdToDate.keys()))
    .not("tm_id", "is", null);

  if (assignErr) {
    console.warn("[zoneHistory.server] assignments query failed:", assignErr.message);
    return {};
  }

  const out: ZoneHistoryRecord = {};
  (assignmentRows ?? []).forEach((r: { night_id: string; slot_key: string; tm_id: string }) => {
    const nightDate = nightIdToDate.get(r.night_id) ?? "";
    if (!out[r.tm_id]) out[r.tm_id] = [];
    out[r.tm_id].push({ nightDate, slotKey: r.slot_key });
  });

  return out;
}