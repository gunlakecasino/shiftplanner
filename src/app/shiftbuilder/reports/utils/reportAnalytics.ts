import { ZONE_DEFS } from "@/lib/shiftbuilder/constants";
import type { RotationReport, TmRotationEntry } from "@/lib/shiftbuilder/rotationReportTypes";
import { daysSince, formatReportDate, sortedSlotKeys } from "./slotHelpers";

const ZONE_KEYS = ZONE_DEFS.map((z) => z.key);

export type RotationKpis = {
  totalNights: number;
  activeTms: number;
  avgZonesFilled: number;
  fullFillPct: number;
  avgUniqueZonesPerTm: number;
  avgZoneGapsPerTm: number;
  zoneSharePct: number;
  otherAreaSharePct: number;
};

export type TmRotationRank = {
  tmId: string;
  tmName: string;
  totalZonePlacements: number;
  uniqueZones: number;
  zoneGaps: number;
  zoneNights: number;
  rrCount: number;
  auxCount: number;
  lastZoneDate: string;
  daysSinceLastZone: number;
};

export type RecencyBucketStat = {
  label: string;
  count: number;
  pct: number;
  color: string;
};

export function computeRotationKpis(report: RotationReport): RotationKpis {
  const zoneTms = report.entries.filter((e) => e.totalZonePlacements > 0);
  const avgUnique =
    zoneTms.length > 0
      ? Math.round(
          (zoneTms.reduce((s, e) => s + e.uniqueZones, 0) / zoneTms.length) * 10,
        ) / 10
      : 0;
  const avgGaps =
    zoneTms.length > 0
      ? Math.round((zoneTms.reduce((s, e) => s + e.zoneGaps, 0) / zoneTms.length) * 10) / 10
      : 0;

  return {
    totalNights: report.totalNights,
    activeTms: report.entries.length,
    avgZonesFilled: report.zoneFill.avgZonesFilled,
    fullFillPct: report.zoneFill.fullFillPct,
    avgUniqueZonesPerTm: avgUnique,
    avgZoneGapsPerTm: avgGaps,
    zoneSharePct: report.areaCoverage.zoneSharePct,
    otherAreaSharePct: report.areaCoverage.otherAreaSharePct,
  };
}

export function computeTmRanks(report: RotationReport, limit = 8): TmRotationRank[] {
  return report.entries
    .filter((e) => e.totalZonePlacements > 0)
    .map((tm) => ({
      tmId: tm.tmId,
      tmName: tm.tmName,
      totalZonePlacements: tm.totalZonePlacements,
      uniqueZones: tm.uniqueZones,
      zoneGaps: tm.zoneGaps,
      zoneNights: tm.zoneNights,
      rrCount: tm.rrCount,
      auxCount: tm.auxCount,
      lastZoneDate: tm.lastZoneDate,
      daysSinceLastZone: daysSince(tm.lastZoneDate),
    }))
    .sort((a, b) => b.totalZonePlacements - a.totalZonePlacements)
    .slice(0, limit);
}

export function computeZoneRecencyDistribution(report: RotationReport): RecencyBucketStat[] {
  let fresh = 0;
  let week2 = 0;
  let month = 0;
  let stale = 0;
  let total = 0;

  for (const tm of report.entries) {
    for (const dates of Object.values(tm.zoneDates)) {
      if (!dates.length) continue;
      total++;
      const ago = daysSince(dates[0]);
      if (ago <= 7) fresh++;
      else if (ago <= 14) week2++;
      else if (ago <= 30) month++;
      else stale++;
    }
  }

  const buckets = [
    { label: "≤7 days", count: fresh, color: "#34C759" },
    { label: "8–14 days", count: week2, color: "#FFD60A" },
    { label: "15–30 days", count: month, color: "#FF9500" },
    { label: ">30 days", count: stale, color: "#FF453A" },
  ];

  return buckets.map((b) => ({
    ...b,
    pct: total > 0 ? Math.round((b.count / total) * 100) : 0,
  }));
}

export function topZoneForTm(tm: TmRotationEntry): string | null {
  const top = Object.entries(tm.zoneCounts).sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? null;
}

export function tmToZoneDetailShape(tm: TmRotationEntry) {
  return {
    tmId: tm.tmId,
    tmName: tm.tmName,
    zoneCounts: tm.zoneCounts,
    zoneDates: tm.zoneDates,
    zoneDow: tm.zoneDow,
    totalAssignments: tm.totalZonePlacements,
    totalNights: tm.zoneNights,
    lastDate: tm.lastZoneDate || tm.lastDate,
  };
}

export function csvExport(
  entries: TmRotationEntry[],
  dr: { from: string; to: string },
  formatDate: (iso: string) => string,
) {
  const keys = sortedSlotKeys(
    Array.from(new Set(entries.flatMap((e) => Object.keys(e.zoneCounts)))),
  ).filter((k) => ZONE_KEYS.includes(k));

  const header = [
    "TM",
    "Zone Placements",
    "Zone Nights",
    "Unique Zones",
    "Zone Gaps",
    "RR",
    "AUX",
    "Overlap",
    "Last Zone Date",
    ...keys.map((k) => `${k} Count`),
    ...keys.map((k) => `${k} Last Date`),
  ];

  const rows = entries.map((tm) => [
    tm.tmName,
    tm.totalZonePlacements,
    tm.zoneNights,
    tm.uniqueZones,
    tm.zoneGaps,
    tm.rrCount,
    tm.auxCount,
    tm.overlapCount,
    formatDate(tm.lastZoneDate),
    ...keys.map((k) => tm.zoneCounts[k] ?? 0),
    ...keys.map((k) => {
      const d = tm.zoneDates[k]?.[0];
      return d ? formatDate(d) : "—";
    }),
  ]);

  const csv = [header, ...rows].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `zone-rotation-report-${dr.from}-to-${dr.to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}