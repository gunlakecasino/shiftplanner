"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { ZONE_DEFS } from "@/lib/shiftbuilder/constants";
import type { RotationReport } from "@/lib/shiftbuilder/rotationReportTypes";
import {
  daysSince,
  formatReportDate,
  getSlotColor,
  getSlotIcon,
  getSlotShortLabel,
  recencyColor,
} from "../utils/slotHelpers";
import { ProgressBar } from "./charts/ProgressBar";
import { SemiCircleGauge } from "./charts/SemiCircleGauge";
import { StatCard } from "./charts/StatCard";
import { ReportPanel } from "./ReportPanel";

const ZONE_KEYS = ZONE_DEFS.map((z) => z.key);

function ZoneTmRow({
  tm,
  color,
  maxCount,
}: {
  tm: { tmId: string; tmName: string; count: number; dates: string[] };
  color: string;
  maxCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const ago = tm.dates[0] ? daysSince(tm.dates[0]) : null;

  return (
    <div className="border-b border-[var(--sb-settings-border-paper)] last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-[var(--ios-gray-6)]"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="w-[140px] shrink-0 truncate text-[12px] font-medium text-[var(--ios-label-secondary)]">
          {tm.tmName}
        </span>
        <div className="min-w-0 flex-1">
          <ProgressBar value={tm.count} max={maxCount} color={color} height={8} />
        </div>
        <span className="w-8 shrink-0 text-right text-[12px] font-bold tabular-nums" style={{ color }}>
          {tm.count}×
        </span>
        <span
          className="w-12 shrink-0 text-right text-[10px] font-semibold"
          style={{ color: ago !== null ? recencyColor(ago) : "var(--ios-label-quaternary)" }}
        >
          {ago !== null ? `${ago}d` : "—"}
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-1">
          {tm.dates.map((d) => (
            <span
              key={d}
              className="rounded-full border px-2 py-0.5 font-mono text-[10px]"
              style={{ borderColor: `${color}55`, color: `${color}cc`, background: `${color}12` }}
            >
              {formatReportDate(d)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ZoneDetail({ zoneKey, report }: { zoneKey: string; report: RotationReport }) {
  const color = getSlotColor(zoneKey);
  const fillPct = report.zoneFill.perZoneFillRate[zoneKey] ?? 0;

  const tms = report.entries
    .filter((tm) => (tm.zoneCounts[zoneKey] ?? 0) > 0)
    .map((tm) => ({
      tmId: tm.tmId,
      tmName: tm.tmName,
      count: tm.zoneCounts[zoneKey]!,
      dates: tm.zoneDates[zoneKey] ?? [],
    }))
    .sort((a, b) => b.count - a.count);

  const maxCount = tms[0]?.count ?? 1;
  const freshTms = tms.filter((t) => t.dates[0] && daysSince(t.dates[0]) <= 14).length;
  const freshPct = tms.length > 0 ? Math.round((freshTms / tms.length) * 100) : 0;
  const totalPlacements = tms.reduce((s, t) => s + t.count, 0);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Fill Rate"
          value={`${fillPct}%`}
          sub="nights with a TM assigned"
          accent={color}
        />
        <StatCard
          label="TMs Rotated"
          value={tms.length}
          sub={`of ${report.entries.length} in window`}
          accent="#007AFF"
        />
        <StatCard
          label="Placements"
          value={totalPlacements}
          sub={`avg ${tms.length ? Math.round((totalPlacements / tms.length) * 10) / 10 : 0} per TM`}
          accent="#34C759"
        />
        <StatCard
          label="14d Fresh"
          value={`${freshPct}%`}
          sub={`${freshTms} TMs recent`}
          accent="#4D1A8A"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportPanel title="Zone Identity">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-[30px]"
              style={{
                background: `color-mix(in srgb, ${color} 14%, var(--ios-background-tertiary))`,
                color,
              }}
            >
              {getSlotIcon(zoneKey)}
            </div>
            <div>
              <div className="text-[22px] font-bold tracking-[-0.4px]" style={{ color }}>
                {getSlotShortLabel(zoneKey)}
              </div>
              <div className="mt-1 text-[11px] text-[var(--ios-label-tertiary)]">
                Zone deployment slot
              </div>
            </div>
          </div>
        </ReportPanel>

        <ReportPanel title="Rotation Freshness" subtitle="TMs with recent placement" className="lg:col-span-2">
          <div className="flex items-center gap-6">
            <SemiCircleGauge value={freshPct} label="14d Fresh" color={color} size={100} strokeWidth={8} />
            <div className="min-w-0 flex-1">
              <ProgressBar
                label="Nightly fill rate"
                value={fillPct}
                max={100}
                valueLabel={`${fillPct}%`}
                color={color}
                height={10}
              />
            </div>
          </div>
        </ReportPanel>
      </div>

      <ReportPanel title="TM Frequency" subtitle="Tap a row to expand placement dates">
        {tms.length === 0 ? (
          <div className="py-6 text-[12px] text-[var(--ios-label-tertiary)]">
            No zone assignments in this window.
          </div>
        ) : (
          tms.map((tm) => <ZoneTmRow key={tm.tmId} tm={tm} color={color} maxCount={maxCount} />)
        )}
      </ReportPanel>
    </div>
  );
}

type SlotExplorerPanelProps = {
  report: RotationReport;
};

export function SlotExplorerPanel({ report }: SlotExplorerPanelProps) {
  const [selectedZone, setSelectedZone] = React.useState(ZONE_KEYS[0]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex w-[220px] shrink-0 flex-col border-r border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-tertiary)]/30 p-2">
        <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ios-label-tertiary)]">
          Zones Z1–Z10
        </div>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {ZONE_KEYS.map((k) => {
            const isActive = k === selectedZone;
            const color = getSlotColor(k);
            const fillPct = report.zoneFill.perZoneFillRate[k] ?? 0;
            const tmCount = report.entries.filter((e) => (e.zoneCounts[k] ?? 0) > 0).length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedZone(k)}
                className={cn(
                  "w-full rounded-xl border px-3 py-2.5 text-left transition-all",
                  isActive
                    ? "border-[color-mix(in_srgb,var(--ios-blue)_35%,var(--sb-settings-border-paper))] bg-[color-mix(in_srgb,var(--ios-blue)_8%,var(--ios-background-secondary))]"
                    : "border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] hover:bg-[var(--ios-gray-6)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px]" style={{ color }}>
                      {getSlotIcon(k)}
                    </span>
                    <span className="text-[12px] font-bold" style={{ color }}>
                      {k}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
                    {fillPct}%
                  </span>
                </div>
                <div className="mt-1.5 text-[10px] text-[var(--ios-label-tertiary)]">{tmCount} TMs</div>
                <div className="mt-1.5">
                  <ProgressBar value={fillPct} max={100} color={color} height={4} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ZoneDetail zoneKey={selectedZone} report={report} />
      </div>
    </div>
  );
}