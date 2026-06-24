"use client";

import { ZONE_DEFS } from "@/lib/shiftbuilder/constants";
import type { RotationReport } from "@/lib/shiftbuilder/rotationReportTypes";
import {
  daysSince,
  formatReportDate,
  getSlotColor,
  getSlotIcon,
  recencyColor,
  RECENCY_BUCKETS,
} from "../utils/slotHelpers";
import { ReportPanel } from "./ReportPanel";

const ZONE_KEYS = ZONE_DEFS.map((z) => z.key);

type MatrixPanelProps = {
  report: RotationReport;
};

export function MatrixPanel({ report }: MatrixPanelProps) {
  const zoneEntries = report.entries.filter((e) => e.totalZonePlacements > 0);

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <ReportPanel
        title="Zone Rotation Matrix"
        subtitle="Days since last placement — Z1 through Z10 only"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {RECENCY_BUCKETS.map(({ label, color }) => (
              <span
                key={label}
                className="flex items-center gap-1 text-[9px] text-[var(--ios-label-tertiary)]"
              >
                <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        }
        bodyClassName="p-0 sm:p-0"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-[var(--sb-settings-border-paper)] bg-[var(--ios-background-tertiary)]/50">
                <th
                  className="sticky left-0 z-10 bg-[var(--ios-background-secondary)] py-3 pr-4 pl-4 text-left font-semibold text-[var(--ios-label-tertiary)]"
                  style={{ minWidth: 150 }}
                >
                  Team Member
                </th>
                {ZONE_KEYS.map((k) => (
                  <th
                    key={k}
                    className="px-1.5 py-3 text-center font-bold"
                    style={{ color: getSlotColor(k), minWidth: 44 }}
                  >
                    <span className="block text-[10px]">{getSlotIcon(k)}</span>
                    <span className="block text-[9px]">{k}</span>
                  </th>
                ))}
                <th className="py-3 pr-4 pl-3 text-right font-semibold text-[var(--ios-label-tertiary)]">
                  Spread
                </th>
                <th className="py-3 pr-4 pl-2 text-right font-semibold text-[var(--ios-label-tertiary)]">
                  Other
                </th>
              </tr>
            </thead>
            <tbody>
              {zoneEntries.map((tm) => (
                <tr
                  key={tm.tmId}
                  className="border-b border-[var(--sb-settings-border-paper)] transition-colors hover:bg-[var(--ios-gray-6)]/35"
                >
                  <td className="sticky left-0 z-10 max-w-[150px] truncate bg-[var(--ios-background-secondary)] py-2.5 pr-4 pl-4 font-medium text-[var(--ios-label-secondary)]">
                    {tm.tmName}
                  </td>
                  {ZONE_KEYS.map((k) => {
                    const lastDate = tm.zoneDates[k]?.[0];
                    const count = tm.zoneCounts[k] ?? 0;
                    const ago = lastDate ? daysSince(lastDate) : null;
                    const color = ago !== null ? recencyColor(ago) : null;
                    return (
                      <td key={k} className="px-1 py-2.5 text-center">
                        {color ? (
                          <span
                            className="inline-flex min-w-[34px] flex-col items-center rounded-lg px-1 py-0.5 text-[9px] font-bold tabular-nums"
                            style={{ color, background: `${color}14` }}
                            title={`${tm.tmName} / ${k}: last ${formatReportDate(lastDate!)} · ${count}×`}
                          >
                            <span>{ago}d</span>
                            <span className="font-medium opacity-70">{count}×</span>
                          </span>
                        ) : (
                          <span className="inline-block rounded-lg bg-[var(--ios-gray-6)] px-2 py-1 text-[9px] text-[var(--ios-label-quaternary)]">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2.5 pr-4 pl-3 text-right font-bold tabular-nums text-[var(--ios-label)]">
                    {tm.uniqueZones}/10
                  </td>
                  <td className="py-2.5 pr-4 pl-2 text-right text-[10px] tabular-nums text-[var(--ios-label-tertiary)]">
                    {tm.rrCount + tm.auxCount > 0 ? (
                      <span title={`RR ${tm.rrCount} · AUX ${tm.auxCount}`}>
                        {tm.rrCount + tm.auxCount}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportPanel>

      <ReportPanel title="Nightly Zone Fill" subtitle="How many of Z1–Z10 were filled each grave night">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-[var(--sb-settings-border-paper)]">
                <th className="py-2 pr-4 pl-2 text-left font-semibold text-[var(--ios-label-tertiary)]">
                  Night
                </th>
                <th className="py-2 pr-3 text-center font-semibold text-[var(--ios-label-tertiary)]">
                  Filled
                </th>
                {ZONE_KEYS.map((z) => (
                  <th key={z} className="px-1 py-2 text-center text-[9px] font-bold" style={{ color: getSlotColor(z) }}>
                    {z}
                  </th>
                ))}
                <th className="py-2 pr-2 pl-2 text-center font-semibold text-[var(--ios-label-tertiary)]">
                  RR
                </th>
                <th className="py-2 pr-2 text-center font-semibold text-[var(--ios-label-tertiary)]">
                  AUX
                </th>
              </tr>
            </thead>
            <tbody>
              {report.nightFills.slice(-21).map((night) => (
                <tr
                  key={night.nightDate}
                  className="border-b border-[var(--sb-settings-border-paper)] hover:bg-[var(--ios-gray-6)]/30"
                >
                  <td className="py-2 pr-4 pl-2 font-mono text-[10px] text-[var(--ios-label-secondary)]">
                    {formatReportDate(night.nightDate)}
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <span
                      className="inline-block rounded-md px-2 py-0.5 text-[10px] font-bold tabular-nums"
                      style={{
                        color:
                          night.zonesFilled >= 10
                            ? "#34C759"
                            : night.zonesFilled >= 8
                              ? "#FF9500"
                              : "#FF453A",
                        background: `color-mix(in srgb, ${
                          night.zonesFilled >= 10
                            ? "#34C759"
                            : night.zonesFilled >= 8
                              ? "#FF9500"
                              : "#FF453A"
                        } 12%, transparent)`,
                      }}
                    >
                      {night.zonesFilled}/10
                    </span>
                  </td>
                  {ZONE_KEYS.map((z) => (
                    <td key={z} className="px-1 py-2 text-center">
                      {night.zoneAssignments[z] ? (
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: getSlotColor(z) }}
                          title={`${z} filled`}
                        />
                      ) : (
                        <span className="text-[var(--ios-label-quaternary)]">·</span>
                      )}
                    </td>
                  ))}
                  <td className="py-2 pr-2 pl-2 text-center tabular-nums text-[var(--ios-label-tertiary)]">
                    {night.rrAssignments || "—"}
                  </td>
                  <td className="py-2 pr-2 text-center tabular-nums text-[var(--ios-label-tertiary)]">
                    {night.auxAssignments || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReportPanel>
    </div>
  );
}