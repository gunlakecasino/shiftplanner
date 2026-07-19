"use client";

import { CalendarDays, Layers, MapPin, Users } from "lucide-react";
import type { RotationReport } from "@/lib/shiftbuilder/rotationReportTypes";
import { ZONE_DEFS } from "@/lib/shiftbuilder/constants";
import {
  computeRotationKpis,
  computeTmRanks,
  computeZoneRecencyDistribution,
} from "../utils/reportAnalytics";
import { getSlotColor, getSlotIcon, getSlotShortLabel } from "../utils/slotHelpers";
import { StatCard } from "./charts/StatCard";
import { SemiCircleGauge } from "./charts/SemiCircleGauge";
import { BarChart } from "./charts/BarChart";
import { ProgressBar } from "./charts/ProgressBar";
import { ReportPanel } from "./ReportPanel";

type OverviewPanelProps = {
  report: RotationReport;
};

export function OverviewPanel({ report }: OverviewPanelProps) {
  const kpis = computeRotationKpis(report);
  const recency = computeZoneRecencyDistribution(report);
  const topTms = computeTmRanks(report, 6);
  const maxTmZones = topTms[0]?.totalZonePlacements ?? 1;

  const zoneFillBars = ZONE_DEFS.map((z) => ({
    label: z.key,
    value: report.zoneFill.perZoneFillRate[z.key] ?? 0,
    color: getSlotColor(z.key),
    meta: `${report.zoneFill.perZoneFillRate[z.key] ?? 0}% nights covered`,
  }));

  const nightTrend = report.nightFills.slice(-14).map((n) => ({
    label: n.nightDate.slice(5),
    value: n.zonesCovered,
    color: n.zonesCovered >= 10 ? "#34C759" : n.zonesCovered >= 8 ? "#FF9500" : "#FF453A",
    meta: `${n.zonesCovered}/10 zones`,
  }));

  return (
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Grave Nights"
          value={kpis.totalNights}
          sub={`${report.zoneFill.fullFillNights} full 10/10 fills`}
          icon={CalendarDays}
          accent="#B89708"
        />
        <StatCard
          label="Zone Rotation"
          value={`${kpis.avgUniqueZonesPerTm}`}
          sub={`avg unique zones per TM · ${kpis.activeTms} active`}
          icon={Users}
          accent="#007AFF"
        />
        <StatCard
          label="Avg Zones Covered"
          value={kpis.avgZonesFilled}
          sub={`${kpis.fullFillPct}% nights at 10/10`}
          icon={Layers}
          accent="#34C759"
        />
        <StatCard
          label="Other Areas"
          value={`${kpis.otherAreaSharePct}%`}
          sub={`RR ${report.areaCoverage.rrPlacements} · AUX ${report.areaCoverage.auxPlacements}`}
          icon={MapPin}
          accent="#4D1A8A"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportPanel title="Zone Fill Health" subtitle="Rotation fairness across Z1–Z10">
          <div className="grid grid-cols-3 gap-2">
            <SemiCircleGauge
              value={kpis.fullFillPct}
              label="10/10 Nights"
              color="#34C759"
              size={100}
              strokeWidth={8}
            />
            <SemiCircleGauge
              value={kpis.avgUniqueZonesPerTm * 10}
              max={100}
              label="Zone Spread"
              sublabel="avg unique / 10"
              color="#007AFF"
              size={100}
              strokeWidth={8}
            />
            <SemiCircleGauge
              value={kpis.zoneSharePct}
              label="Zone Share"
              sublabel="vs RR/AUX/OVL"
              color="#4D1A8A"
              size={100}
              strokeWidth={8}
            />
          </div>
        </ReportPanel>

        <ReportPanel
          title="Zone Recency"
          subtitle="TM × zone pairs — days since last placement"
          className="lg:col-span-2"
        >
          <div className="space-y-3">
            {recency.map((bucket) => (
              <ProgressBar
                key={bucket.label}
                label={bucket.label}
                value={bucket.count}
                max={recency.reduce((s, b) => s + b.count, 0) || 1}
                valueLabel={`${bucket.pct}% · ${bucket.count}`}
                color={bucket.color}
                height={10}
              />
            ))}
          </div>
        </ReportPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportPanel title="Zone Coverage Rate" subtitle="% of nights each zone was directly staffed or covered">
          <BarChart orientation="horizontal" items={zoneFillBars} maxValue={100} />
        </ReportPanel>

        <ReportPanel title="Nightly Zone Coverage" subtitle="Last 14 grave nights in window">
          <BarChart items={nightTrend} height={120} maxValue={10} />
        </ReportPanel>
      </div>

      <ReportPanel title="TM Zone Rotation" subtitle="Who is spreading across zones vs stuck in gaps">
        <div className="grid gap-3 sm:grid-cols-2">
          {topTms.map((tm, idx) => {
            const topKey = report.entries.find((e) => e.tmId === tm.tmId);
            const slotKey = topKey
              ? Object.entries(topKey.zoneCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
              : null;
            const color = slotKey ? getSlotColor(slotKey) : "#8E8E93";
            return (
              <div
                key={tm.tmId}
                className="flex items-center gap-3 rounded-xl border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-tertiary)]/40 px-3 py-2.5"
              >
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold tabular-nums"
                  style={{
                    background: `color-mix(in srgb, ${color} 16%, transparent)`,
                    color,
                  }}
                >
                  {idx + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-[var(--ios-label)]">
                    {tm.tmName}
                  </div>
                  <div className="text-[10px] text-[var(--ios-label-tertiary)]">
                    {tm.uniqueZones}/10 zones · {tm.zoneGaps} gaps
                    {tm.rrCount + tm.auxCount > 0 &&
                      ` · RR/AUX ${tm.rrCount + tm.auxCount}`}
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <ProgressBar
                    value={tm.totalZonePlacements}
                    max={maxTmZones}
                    color={color}
                    height={6}
                  />
                </div>
                <span
                  className="w-8 shrink-0 text-right text-[12px] font-bold tabular-nums"
                  style={{ color }}
                >
                  {tm.totalZonePlacements}
                </span>
              </div>
            );
          })}
        </div>
      </ReportPanel>

      <ReportPanel
        title="Zone Coverage Grid"
        subtitle="Operational coverage frequency and rotation depth per zone"
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {ZONE_DEFS.map((z) => {
            const color = getSlotColor(z.key);
            const fillPct = report.zoneFill.perZoneFillRate[z.key] ?? 0;
            const tmCount = report.entries.filter((e) => (e.zoneCounts[z.key] ?? 0) > 0).length;
            const totalPlacements = report.entries.reduce(
              (s, e) => s + (e.zoneCounts[z.key] ?? 0),
              0,
            );
            return (
              <div
                key={z.key}
                className="rounded-xl border border-[var(--sb-settings-border-paper)] px-3 py-2.5"
                style={{
                  background: `linear-gradient(160deg, color-mix(in srgb, ${color} 8%, var(--ios-background-secondary)) 0%, var(--ios-background-secondary) 70%)`,
                }}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px]" style={{ color }}>
                    {getSlotIcon(z.key)}
                  </span>
                  <span className="text-[11px] font-bold" style={{ color }}>
                    {getSlotShortLabel(z.key)}
                  </span>
                </div>
                <div className="mt-2 text-[18px] font-bold tabular-nums text-[var(--ios-label)]">
                  {fillPct}%
                </div>
                <div className="mt-1 text-[9px] text-[var(--ios-label-tertiary)]">
                  {tmCount} TMs · {totalPlacements} placements
                </div>
                <div className="mt-2">
                  <ProgressBar value={fillPct} max={100} color={color} height={5} />
                </div>
              </div>
            );
          })}
        </div>
      </ReportPanel>

      <ReportPanel
        title="Other Area Coverage"
        subtitle="When TMs are placed in RR, AUX, or overlap instead of zones"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Zone", value: report.areaCoverage.zonePlacements, color: "#34C759" },
            { label: "RR", value: report.areaCoverage.rrPlacements, color: "#007AFF" },
            { label: "AUX", value: report.areaCoverage.auxPlacements, color: "#FF9500" },
            { label: "Overlap", value: report.areaCoverage.overlapPlacements, color: "#4D1A8A" },
          ].map((item) => {
            const total =
              report.areaCoverage.zonePlacements +
              report.areaCoverage.rrPlacements +
              report.areaCoverage.auxPlacements +
              report.areaCoverage.overlapPlacements;
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div
                key={item.label}
                className="rounded-xl border border-[var(--sb-settings-border-paper)] p-3"
              >
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ios-label-tertiary)]">
                  {item.label}
                </div>
                <div className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: item.color }}>
                  {item.value}
                </div>
                <div className="mt-1 text-[10px] text-[var(--ios-label-quaternary)]">{pct}% of rows</div>
                <div className="mt-2">
                  <ProgressBar value={item.value} max={total || 1} color={item.color} height={6} />
                </div>
              </div>
            );
          })}
        </div>
      </ReportPanel>
    </div>
  );
}
