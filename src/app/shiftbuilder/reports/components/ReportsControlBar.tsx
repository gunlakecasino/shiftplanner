"use client";

import { Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReportWindow } from "@/lib/shiftbuilder/data";
import type { RotationReport } from "@/lib/shiftbuilder/rotationReportTypes";
import { formatReportDate } from "../utils/slotHelpers";
import { csvExport as exportCsv } from "../utils/reportAnalytics";

export type ReportView = "overview" | "tm" | "slot" | "matrix";

const VIEW_OPTS: { label: string; value: ReportView }[] = [
  { label: "Overview", value: "overview" },
  { label: "By TM", value: "tm" },
  { label: "By Zone", value: "slot" },
  { label: "Matrix", value: "matrix" },
];

const WINDOW_OPTS: { label: string; value: ReportWindow }[] = [
  { label: "14d", value: 14 },
  { label: "30d", value: 30 },
  { label: "60d", value: 60 },
  { label: "This Wk", value: "this-week" },
  { label: "Last 4 Wks", value: "last-4-weeks" },
];

type ReportsControlBarProps = {
  reportView: ReportView;
  onViewChange: (v: ReportView) => void;
  reportWindow: ReportWindow;
  onWindowChange: (w: ReportWindow) => void;
  report: RotationReport | null;
  loading: boolean;
  onRefresh: () => void;
  compact?: boolean;
};

export function ReportsControlBar({
  reportView,
  onViewChange,
  reportWindow,
  onWindowChange,
  report,
  loading,
  onRefresh,
  compact = false,
}: ReportsControlBarProps) {
  const zoneTms = report?.entries.filter((e) => e.totalZonePlacements > 0).length ?? 0;

  return (
    <div
      className={cn(
        "flex flex-shrink-0 flex-wrap items-center gap-2.5 border-b border-[var(--sb-settings-border-paper)] px-4 py-3",
        compact && "px-0",
      )}
    >
      <div className="sb-reports-segment flex overflow-hidden rounded-xl border border-[var(--sb-settings-border-paper)] text-[11px] font-semibold">
        {VIEW_OPTS.map((v) => (
          <button
            key={v.value}
            type="button"
            onClick={() => onViewChange(v.value)}
            className={cn(
              "px-3 py-1.5 transition-colors",
              reportView === v.value
                ? "bg-[var(--ios-background-tertiary)] text-[var(--ios-label)]"
                : "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)] hover:text-[var(--ios-label-secondary)]",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="sb-reports-segment flex overflow-hidden rounded-xl border border-[var(--sb-settings-border-paper)] text-[11px] font-semibold">
        {WINDOW_OPTS.map((w) => (
          <button
            key={String(w.value)}
            type="button"
            onClick={() => onWindowChange(w.value)}
            className={cn(
              "px-3 py-1.5 transition-colors",
              reportWindow === w.value
                ? "bg-[var(--ios-background-tertiary)] text-[var(--ios-label)]"
                : "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)] hover:text-[var(--ios-label-secondary)]",
            )}
          >
            {w.label}
          </button>
        ))}
      </div>

      {report && !loading && (
        <span className="hidden text-[10px] text-[var(--ios-label-tertiary)] sm:inline">
          {report.totalNights} nights · {zoneTms} zone TMs · avg{" "}
          {report.zoneFill.avgZonesFilled}/10 filled ·{" "}
          {formatReportDate(report.dateRange.from)} – {formatReportDate(report.dateRange.to)}
        </span>
      )}

      <div className="flex-1" />

      {report && report.entries.length > 0 && (
        <button
          type="button"
          onClick={() => exportCsv(report.entries, report.dateRange, formatReportDate)}
          className="sb-reports-icon-btn"
          title="Export CSV"
        >
          <Download size={15} />
        </button>
      )}

      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="sb-reports-icon-btn"
        title="Refresh"
        aria-busy={loading}
      >
        <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
      </button>
    </div>
  );
}