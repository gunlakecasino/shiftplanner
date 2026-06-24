"use client";

import React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZONE_DEFS } from "@/lib/shiftbuilder/constants";
import type { RotationReport, TmRotationEntry } from "@/lib/shiftbuilder/rotationReportTypes";
import { topZoneForTm } from "../utils/reportAnalytics";
import {
  GRAVE_DOW_IDX,
  GRAVE_DOW_LABELS,
  daysSince,
  formatReportDate,
  getSlotColor,
  getSlotIcon,
  getSlotShortLabel,
  recencyColor,
} from "../utils/slotHelpers";
import { BarChart } from "./charts/BarChart";
import { ProgressBar } from "./charts/ProgressBar";
import { SemiCircleGauge } from "./charts/SemiCircleGauge";
import { StatCard } from "./charts/StatCard";
import { ReportPanel } from "./ReportPanel";

const ZONE_KEYS = ZONE_DEFS.map((z) => z.key);

function ZoneHistoryRow({
  slotKey,
  count,
  maxCount,
  dates,
}: {
  slotKey: string;
  count: number;
  maxCount: number;
  dates: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const color = getSlotColor(slotKey);
  const ago = dates[0] ? daysSince(dates[0]) : null;

  return (
    <div className="border-b border-[var(--sb-settings-border-paper)] last:border-0">
      <button
        type="button"
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-2.5 text-left transition-colors hover:bg-[var(--ios-gray-6)]"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex w-[72px] shrink-0 items-center gap-1.5">
          <span className="text-[12px]" style={{ color }}>
            {getSlotIcon(slotKey)}
          </span>
          <span className="text-[11px] font-bold" style={{ color }}>
            {getSlotShortLabel(slotKey)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <ProgressBar value={count} max={maxCount} color={color} height={8} />
        </div>
        <span className="w-8 shrink-0 text-right text-[12px] font-bold tabular-nums" style={{ color }}>
          {count}×
        </span>
        <span
          className="w-12 shrink-0 text-right text-[10px] font-semibold"
          style={{ color: ago !== null ? recencyColor(ago) : "var(--ios-label-quaternary)" }}
        >
          {ago !== null ? `${ago}d` : "—"}
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap gap-1.5 pb-3 pl-[76px] pr-2 pt-1">
          {dates.map((d) => (
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

function TmDetail({ tm }: { tm: TmRotationEntry }) {
  const [showDow, setShowDow] = React.useState(false);
  const ago = daysSince(tm.lastZoneDate || tm.lastDate);
  const spreadPct = Math.round((tm.uniqueZones / 10) * 100);
  const freshPct =
    ZONE_KEYS.filter((z) => {
      const d = tm.zoneDates[z]?.[0];
      return d && daysSince(d) <= 14;
    }).length;
  const freshGauge = Math.round((freshPct / Math.max(tm.uniqueZones, 1)) * 100);

  const slots = ZONE_KEYS.map((key) => ({
    key,
    count: tm.zoneCounts[key] ?? 0,
    dates: tm.zoneDates[key] ?? [],
    dow: tm.zoneDow[key] ?? [0, 0, 0, 0, 0, 0, 0],
  })).filter((s) => s.count > 0);

  const maxCount = slots[0]?.count ?? 1;
  const gapZones = ZONE_KEYS.filter((z) => !(tm.zoneCounts[z] ?? 0));

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Zone Placements"
          value={tm.totalZonePlacements}
          sub={`${tm.zoneNights} grave nights`}
          accent={getSlotColor(topZoneForTm(tm) ?? "Z1")}
        />
        <StatCard
          label="Zone Spread"
          value={`${tm.uniqueZones}/10`}
          sub={`${tm.zoneGaps} gaps in window`}
          accent="#007AFF"
        />
        <StatCard
          label="Other Areas"
          value={tm.rrCount + tm.auxCount + tm.overlapCount}
          sub={`RR ${tm.rrCount} · AUX ${tm.auxCount}`}
          accent="#4D1A8A"
        />
        <StatCard
          label="Last Zone"
          value={tm.lastZoneDate ? `${ago}d` : "—"}
          sub={tm.lastZoneDate ? formatReportDate(tm.lastZoneDate) : "No zone history"}
          accent="#B89708"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ReportPanel title="Rotation Spread" subtitle="Unique zones worked vs total">
          <SemiCircleGauge
            value={spreadPct}
            label="Zone Coverage"
            sublabel={`${tm.uniqueZones} of 10 zones`}
            color="#34C759"
            size={110}
            strokeWidth={9}
          />
        </ReportPanel>

        <ReportPanel title="14-Day Freshness" subtitle="Zones touched within 14 days" className="lg:col-span-2">
          <div className="flex items-center gap-6">
            <SemiCircleGauge value={freshGauge} label="Fresh Zones" color="#007AFF" size={100} strokeWidth={8} />
            <div className="min-w-0 flex-1 space-y-2">
              {gapZones.length > 0 ? (
                <>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--ios-label-tertiary)]">
                    Never worked in window
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {gapZones.map((z) => (
                      <span
                        key={z}
                        className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          borderColor: `${getSlotColor(z)}44`,
                          color: getSlotColor(z),
                          background: `${getSlotColor(z)}10`,
                        }}
                      >
                        {z}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-[12px] text-[var(--ios-green)]">
                  Full Z1–Z10 spread in this window.
                </div>
              )}
            </div>
          </div>
        </ReportPanel>
      </div>

      <ReportPanel
        title={showDow ? "Day-of-Week Pattern" : "Zone Placement History"}
        subtitle="Fri → Thu grave order · tap row for dates"
        action={
          <button
            type="button"
            onClick={() => setShowDow((v) => !v)}
            className="rounded-lg border border-[var(--sb-settings-border-paper)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ios-label-secondary)] hover:bg-[var(--ios-gray-6)]"
          >
            {showDow ? "History" : "By Day"}
          </button>
        }
        bodyClassName="p-0 sm:p-0"
      >
        <div className="px-4 pb-4 pt-2 sm:px-5">
          {slots.length === 0 ? (
            <div className="py-6 text-[12px] text-[var(--ios-label-tertiary)]">
              No zone assignments — check RR/AUX coverage above.
            </div>
          ) : showDow ? (
            <div className="space-y-4">
              <BarChart
                items={GRAVE_DOW_LABELS.map((label, col) => ({
                  label,
                  value: slots.reduce((s, slot) => s + (slot.dow[GRAVE_DOW_IDX[col]] ?? 0), 0),
                  color: "#4D1A8A",
                }))}
                height={100}
              />
              {slots.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="w-10 shrink-0 text-[11px] font-bold" style={{ color: getSlotColor(s.key) }}>
                    {s.key}
                  </span>
                  <BarChart
                    className="flex-1"
                    items={GRAVE_DOW_LABELS.map((label, col) => ({
                      label: label[0],
                      value: s.dow[GRAVE_DOW_IDX[col]] ?? 0,
                      color: getSlotColor(s.key),
                    }))}
                    height={44}
                    showValues={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            slots.map((s) => (
              <ZoneHistoryRow
                key={s.key}
                slotKey={s.key}
                count={s.count}
                maxCount={maxCount}
                dates={s.dates}
              />
            ))
          )}
        </div>
      </ReportPanel>
    </div>
  );
}

type TmExplorerPanelProps = {
  report: RotationReport;
};

export function TmExplorerPanel({ report }: TmExplorerPanelProps) {
  const zoneEntries = report.entries.filter((e) => e.totalZonePlacements > 0);
  const [selectedTm, setSelectedTm] = React.useState<string | null>(
    zoneEntries[0]?.tmId ?? null,
  );
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? zoneEntries.filter((e) => e.tmName.toLowerCase().includes(q))
      : zoneEntries;
  }, [zoneEntries, search]);

  const activeTm = zoneEntries.find((e) => e.tmId === selectedTm) ?? null;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex w-[250px] shrink-0 flex-col border-r border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-tertiary)]/30">
        <div className="shrink-0 border-b border-[var(--sb-settings-border-paper)] px-3 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--ios-label-tertiary)]">
            Team Members
          </div>
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ios-label-quaternary)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search TM…"
              className="w-full rounded-xl border border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] py-1.5 pl-8 pr-2 text-[11px] text-[var(--ios-label)] placeholder:text-[var(--ios-label-quaternary)] focus:border-[var(--ios-blue)] focus:outline-none"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.map((tm) => {
            const isActive = tm.tmId === selectedTm;
            const topKey = topZoneForTm(tm);
            const color = topKey ? getSlotColor(topKey) : "#8E8E93";
            return (
              <button
                key={tm.tmId}
                type="button"
                onClick={() => setSelectedTm(tm.tmId)}
                className={cn(
                  "mb-1.5 flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-all",
                  isActive
                    ? "border-[color-mix(in_srgb,var(--ios-blue)_35%,var(--sb-settings-border-paper))] bg-[color-mix(in_srgb,var(--ios-blue)_8%,var(--ios-background-secondary))] shadow-sm"
                    : "border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-secondary)] hover:bg-[var(--ios-gray-6)]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-semibold text-[var(--ios-label)]">
                    {tm.tmName}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums" style={{ color }}>
                    {tm.totalZonePlacements}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--ios-label-tertiary)]">
                  <span>{tm.uniqueZones}/10 zones</span>
                  <span>{tm.zoneGaps} gaps</span>
                </div>
                <ProgressBar
                  value={tm.uniqueZones}
                  max={10}
                  color={color}
                  height={4}
                  showTrack
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTm ? (
          <TmDetail tm={activeTm} />
        ) : (
          <div className="flex h-full items-center justify-center text-[12px] text-[var(--ios-label-tertiary)]">
            Select a team member.
          </div>
        )}
      </div>
    </div>
  );
}