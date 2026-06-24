"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { SudoTabLoading } from "../../sudo/SudoGlass";
import { useRotationReport } from "../hooks/useRotationReport";
import { ReportsControlBar, type ReportView } from "./ReportsControlBar";
import { OverviewPanel } from "./OverviewPanel";
import { TmExplorerPanel } from "./TmExplorerPanel";
import { SlotExplorerPanel } from "./SlotExplorerPanel";
import { MatrixPanel } from "./MatrixPanel";

export type ReportsDashboardProps = {
  embedded?: boolean;
  initialView?: ReportView;
  className?: string;
};

export function ReportsDashboard({
  embedded = false,
  initialView = "overview",
  className,
}: ReportsDashboardProps) {
  const { report, reportWindow, setReportWindow, loading, error, refresh } =
    useRotationReport(30);
  const [reportView, setReportView] = React.useState<ReportView>(initialView);

  const body = (() => {
    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--ios-red)]">
          {error}
        </div>
      );
    }
    if (loading && !report) {
      return (
        <div className="flex flex-1 items-center justify-center p-12">
          <SudoTabLoading>Loading zone rotation data</SudoTabLoading>
        </div>
      );
    }
    if (!report || report.entries.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-[var(--ios-label-tertiary)]">
          <span>No zone assignments found in this window.</span>
          <span className="text-[11px] text-[var(--ios-label-quaternary)]">
            Build grave nights on the canvas first, then return here for rotation analytics.
          </span>
        </div>
      );
    }

    switch (reportView) {
      case "overview":
        return <OverviewPanel report={report} />;
      case "tm":
        return <TmExplorerPanel report={report} />;
      case "slot":
        return <SlotExplorerPanel report={report} />;
      case "matrix":
        return <MatrixPanel report={report} />;
      default:
        return null;
    }
  })();

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col",
        embedded ? "h-full" : "min-h-[min(72vh,760px)]",
        className,
      )}
    >
      <ReportsControlBar
        reportView={reportView}
        onViewChange={setReportView}
        reportWindow={reportWindow}
        onWindowChange={setReportWindow}
        report={report}
        loading={loading}
        onRefresh={refresh}
        compact={embedded}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
    </div>
  );
}