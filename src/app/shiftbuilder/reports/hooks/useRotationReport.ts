"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReportWindow } from "@/lib/shiftbuilder/data";
import type { RotationReport } from "@/lib/shiftbuilder/rotationReportTypes";

export function useRotationReport(initialWindow: ReportWindow = 30) {
  const [reportWindow, setReportWindow] = useState<ReportWindow>(initialWindow);
  const [report, setReport] = useState<RotationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (w: ReportWindow) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shiftbuilder/rotation-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ window: w }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? `Request failed (${res.status})`);
      }
      setReport(json.report as RotationReport);
      return json.report as RotationReport;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load rotation report";
      setError(message);
      setReport(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(reportWindow);
  }, [reportWindow, load]);

  const refresh = useCallback(() => load(reportWindow), [load, reportWindow]);

  return {
    report,
    reportWindow,
    setReportWindow,
    loading,
    error,
    refresh,
  };
}