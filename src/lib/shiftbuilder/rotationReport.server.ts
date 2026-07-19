import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ZONE_DEFS } from "./constants";
import type { ReportWindow } from "./data";
import { dbToUi } from "./slot-keys";
import { currentShiftDate, formatLocalDateISO } from "./dateUtils";
import type {
  AreaCoverageSummary,
  NightZoneFill,
  RotationReport,
  TmRotationEntry,
  ZoneFillSummary,
} from "./rotationReportTypes";

const ZONE_KEYS = ZONE_DEFS.map((z) => z.key);

function getServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function graveWeekRange(which: "this-week" | "last-4-weeks"): { from: string; to: string } {
  const today = currentShiftDate();
  const daysSinceFri = (today.getDay() + 2) % 7;
  const thisFri = new Date(today);
  thisFri.setDate(today.getDate() - daysSinceFri);

  if (which === "this-week") {
    const thu = new Date(thisFri);
    thu.setDate(thisFri.getDate() + 6);
    return { from: formatLocalDateISO(thisFri), to: formatLocalDateISO(thu) };
  }
  const to = new Date(thisFri);
  to.setDate(thisFri.getDate() - 1);
  const from = new Date(to);
  from.setDate(to.getDate() - 27);
  return { from: formatLocalDateISO(from), to: formatLocalDateISO(to) };
}

function resolveWindow(reportWindow: ReportWindow): { from: string; to: string } {
  if (typeof reportWindow === "number") {
    const today = currentShiftDate();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - reportWindow);
    return {
      from: formatLocalDateISO(cutoff),
      to: formatLocalDateISO(today),
    };
  }
  return graveWeekRange(reportWindow);
}

function isZoneUiKey(key: string): boolean {
  return /^Z\d+$/.test(key);
}

function buildZoneFillSummary(nightFills: NightZoneFill[], totalNights: number): ZoneFillSummary {
  const perZoneFilled = new Map<string, number>();
  for (const z of ZONE_KEYS) perZoneFilled.set(z, 0);

  let sumFilled = 0;
  let fullFillNights = 0;
  let underfillNights = 0;

  for (const night of nightFills) {
    const covered = night.zonesCovered ?? night.zonesFilled;
    sumFilled += covered;
    if (covered >= 10) fullFillNights++;
    else underfillNights++;
    for (const z of ZONE_KEYS) {
      if (night.zoneAssignments[z] || night.zoneCoverageAssignments[z]?.length) {
        perZoneFilled.set(z, (perZoneFilled.get(z) ?? 0) + 1);
      }
    }
  }

  const nightCount = nightFills.length || totalNights || 1;
  const perZoneFillRate: Record<string, number> = {};
  for (const z of ZONE_KEYS) {
    perZoneFillRate[z] = Math.round(((perZoneFilled.get(z) ?? 0) / nightCount) * 100);
  }

  return {
    avgZonesFilled: nightFills.length
      ? Math.round((sumFilled / nightFills.length) * 10) / 10
      : 0,
    fullFillNights,
    fullFillPct: nightFills.length
      ? Math.round((fullFillNights / nightFills.length) * 100)
      : 0,
    perZoneFillRate,
    underfillNights,
  };
}

function buildAreaCoverage(
  zonePlacements: number,
  rrPlacements: number,
  auxPlacements: number,
  overlapPlacements: number,
): AreaCoverageSummary {
  const total = zonePlacements + rrPlacements + auxPlacements + overlapPlacements;
  const zoneSharePct = total > 0 ? Math.round((zonePlacements / total) * 100) : 0;
  return {
    zonePlacements,
    rrPlacements,
    auxPlacements,
    overlapPlacements,
    zoneSharePct,
    otherAreaSharePct: total > 0 ? 100 - zoneSharePct : 0,
  };
}

/**
 * Grave rotation report — zone fill per night, TM zone rotation (Z1–Z10),
 * and RR/AUX/overlap coverage in the same window.
 */
export async function getRotationReport(reportWindow: ReportWindow): Promise<RotationReport> {
  const client = getServerSupabase();
  const { from, to } = resolveWindow(reportWindow);

  const empty: RotationReport = {
    entries: [],
    nightFills: [],
    dateRange: { from, to },
    totalNights: 0,
    zoneFill: {
      avgZonesFilled: 0,
      fullFillNights: 0,
      fullFillPct: 0,
      perZoneFillRate: Object.fromEntries(ZONE_KEYS.map((z) => [z, 0])),
      underfillNights: 0,
    },
    areaCoverage: buildAreaCoverage(0, 0, 0, 0),
  };

  const { data: nightRows, error: nightErr } = await client
    .from("nights")
    .select("id, night_date")
    .gte("night_date", from)
    .lte("night_date", to)
    .order("night_date", { ascending: true });

  if (nightErr || !nightRows?.length) return empty;

  const nightIdToDate = new Map<string, string>();
  for (const n of nightRows as { id: string; night_date: string }[]) {
    nightIdToDate.set(n.id, n.night_date);
  }

  const { data: assignmentRows, error: assignErr } = await client
    .from("zone_assignments")
    .select("night_id, slot_key, slot_type, rr_side, tm_id, additional_coverage_slots")
    .in("night_id", Array.from(nightIdToDate.keys()))
    .not("tm_id", "is", null);

  if (assignErr) {
    return { ...empty, totalNights: nightRows.length };
  }

  const rows = (assignmentRows ?? []) as Array<{
    night_id: string;
    slot_key: string;
    slot_type: string;
    rr_side: string | null;
    tm_id: string;
    additional_coverage_slots?: string[] | null;
  }>;

  const nightFillMap = new Map<string, NightZoneFill>();
  for (const [, date] of nightIdToDate) {
    nightFillMap.set(date, {
      nightDate: date,
      zonesFilled: 0,
      zoneAssignments: {},
      zoneCoverageAssignments: {},
      zonesCovered: 0,
      rrAssignments: 0,
      auxAssignments: 0,
      overlapAssignments: 0,
    });
  }

  const tmMap = new Map<
    string,
    {
      zoneDates: Record<string, string[]>;
      zoneNightDates: Set<string>;
      allNightDates: Set<string>;
      rrCount: number;
      auxCount: number;
      overlapCount: number;
      lastZoneDate: string;
      lastDate: string;
    }
  >();

  let zonePlacements = 0;
  let rrPlacements = 0;
  let auxPlacements = 0;
  let overlapPlacements = 0;

  for (const row of rows) {
    const nightDate = nightIdToDate.get(row.night_id) ?? "";
    if (!nightDate) continue;

    const uiKey = dbToUi(row.slot_key, row.slot_type ?? "zone", row.rr_side ?? null);
    if (uiKey.startsWith("UNK:")) continue;

    const slotType = row.slot_type ?? "zone";
    const night = nightFillMap.get(nightDate);
    if (night) {
      if (slotType === "zone" && isZoneUiKey(uiKey)) {
        if (!night.zoneAssignments[uiKey]) {
          night.zoneAssignments[uiKey] = row.tm_id;
        }
      } else if (slotType === "rr") night.rrAssignments++;
      else if (slotType === "aux") night.auxAssignments++;
      else if (slotType === "overlap") night.overlapAssignments++;

      for (const coveredKey of row.additional_coverage_slots ?? []) {
        if (!isZoneUiKey(coveredKey)) continue;
        const sources = night.zoneCoverageAssignments[coveredKey] ?? [];
        if (!sources.includes(row.tm_id)) {
          night.zoneCoverageAssignments[coveredKey] = [...sources, row.tm_id];
        }
      }
    }

    if (slotType === "zone" && isZoneUiKey(uiKey)) zonePlacements++;
    else if (slotType === "rr") rrPlacements++;
    else if (slotType === "aux") auxPlacements++;
    else if (slotType === "overlap") overlapPlacements++;

    if (!tmMap.has(row.tm_id)) {
      tmMap.set(row.tm_id, {
        zoneDates: {},
        zoneNightDates: new Set(),
        allNightDates: new Set(),
        rrCount: 0,
        auxCount: 0,
        overlapCount: 0,
        lastZoneDate: "",
        lastDate: "",
      });
    }
    const tm = tmMap.get(row.tm_id)!;
    tm.allNightDates.add(nightDate);
    if (nightDate > tm.lastDate) tm.lastDate = nightDate;

    if (slotType === "zone" && isZoneUiKey(uiKey)) {
      if (!tm.zoneDates[uiKey]) tm.zoneDates[uiKey] = [];
      tm.zoneDates[uiKey].push(nightDate);
      tm.zoneNightDates.add(nightDate);
      if (nightDate > tm.lastZoneDate) tm.lastZoneDate = nightDate;
    } else if (slotType === "rr") tm.rrCount++;
    else if (slotType === "aux") tm.auxCount++;
    else if (slotType === "overlap") tm.overlapCount++;

    for (const coveredKey of row.additional_coverage_slots ?? []) {
      if (!isZoneUiKey(coveredKey)) continue;
      if (!tm.zoneDates[coveredKey]) tm.zoneDates[coveredKey] = [];
      tm.zoneDates[coveredKey].push(nightDate);
      tm.zoneNightDates.add(nightDate);
      if (nightDate > tm.lastZoneDate) tm.lastZoneDate = nightDate;
    }
  }

  const nightFills = Array.from(nightFillMap.values()).map((n) => ({
    ...n,
    zonesFilled: Object.keys(n.zoneAssignments).length,
    zonesCovered: new Set([
      ...Object.keys(n.zoneAssignments),
      ...Object.keys(n.zoneCoverageAssignments),
    ]).size,
  }));

  const tmIds = Array.from(tmMap.keys());
  const { data: profiles } = await client
    .from("tm_profiles")
    .select("tm_id, display_name, full_name")
    .in("tm_id", tmIds);

  const nameMap = new Map<string, string>();
  for (const p of profiles ?? []) {
    const row = p as { tm_id: string; display_name: string | null; full_name: string | null };
    nameMap.set(row.tm_id, row.display_name || row.full_name || row.tm_id);
  }

  const entries: TmRotationEntry[] = Array.from(tmMap.entries())
    .map(([tmId, data]) => {
      const zoneCounts: Record<string, number> = {};
      const zoneDow: Record<string, number[]> = {};
      let totalZonePlacements = 0;

      for (const [zKey, dates] of Object.entries(data.zoneDates)) {
        const sorted = [...dates].sort((a, b) => b.localeCompare(a));
        zoneCounts[zKey] = sorted.length;
        totalZonePlacements += sorted.length;
        const dow = [0, 0, 0, 0, 0, 0, 0];
        for (const d of sorted) dow[new Date(d + "T12:00:00").getDay()]++;
        zoneDow[zKey] = dow;
        data.zoneDates[zKey] = sorted;
      }

      const uniqueZones = Object.keys(zoneCounts).length;

      return {
        tmId,
        tmName: nameMap.get(tmId) ?? tmId,
        zoneCounts,
        zoneDates: data.zoneDates,
        zoneDow,
        rrCount: data.rrCount,
        auxCount: data.auxCount,
        overlapCount: data.overlapCount,
        zoneNights: data.zoneNightDates.size,
        totalNights: data.allNightDates.size,
        uniqueZones,
        zoneGaps: ZONE_KEYS.length - uniqueZones,
        lastZoneDate: data.lastZoneDate,
        lastDate: data.lastDate,
        totalZonePlacements,
        totalOtherPlacements: data.rrCount + data.auxCount + data.overlapCount,
      };
    })
    .filter((e) => e.totalZonePlacements > 0 || e.totalOtherPlacements > 0)
    .sort((a, b) => b.totalZonePlacements - a.totalZonePlacements);

  return {
    entries,
    nightFills,
    dateRange: { from, to },
    totalNights: nightRows.length,
    zoneFill: buildZoneFillSummary(nightFills, nightRows.length),
    areaCoverage: buildAreaCoverage(
      zonePlacements,
      rrPlacements,
      auxPlacements,
      overlapPlacements,
    ),
  };
}
