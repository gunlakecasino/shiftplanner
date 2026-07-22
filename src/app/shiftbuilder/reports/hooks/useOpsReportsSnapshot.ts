"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  OpsReportsSnapshot,
  ReportWindow,
  ReportsStatusFilter,
} from "@/lib/shiftbuilder/opsReportsTypes";

export function useOpsReportsSnapshot(
  initialWindow: ReportWindow = 30,
  initialStatusFilter: ReportsStatusFilter = "history",
) {
  const [reportWindow, setReportWindow] = useState<ReportWindow>(initialWindow);
  const [statusFilter, setStatusFilter] =
    useState<ReportsStatusFilter>(initialStatusFilter);
  const [snapshot, setSnapshot] = useState<OpsReportsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (windowValue: ReportWindow, statusValue: ReportsStatusFilter) => {
      const seq = requestSeq.current + 1;
      requestSeq.current = seq;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/shiftbuilder/rotation-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({
            window: windowValue,
            statusFilter: statusValue,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error ?? `Request failed (${res.status})`);
        }
        if (seq === requestSeq.current) {
          setSnapshot(json.snapshot as OpsReportsSnapshot);
        }
        return json.snapshot as OpsReportsSnapshot;
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "Failed to load reports snapshot";
        if (seq === requestSeq.current) {
          setError(message);
          setSnapshot(null);
        }
        return null;
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(reportWindow, statusFilter);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load, reportWindow, statusFilter]);

  const refresh = useCallback(
    () => load(reportWindow, statusFilter),
    [load, reportWindow, statusFilter],
  );

  return {
    snapshot,
    reportWindow,
    setReportWindow,
    statusFilter,
    setStatusFilter,
    loading,
    error,
    refresh,
  };
}
