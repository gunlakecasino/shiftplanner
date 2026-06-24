"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReportWindow, ZoneDetailReport } from "@/lib/shiftbuilder/data";

export function useZoneDetailReport(initialWindow: ReportWindow = 30) {
  const [reportWindow, setReportWindow] = useState<ReportWindow>(initialWindow);
  const [report, setReport] = useState<ZoneDetailReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (w: ReportWindow) => {
    setLoading(true);
    setError(null);
    try {
      const { getZoneDetailReport } = await import("@/lib/shiftbuilder/data");
      const r = await getZoneDetailReport(w);
      setReport(r);
      return r;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to load report";
      setError(message);
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