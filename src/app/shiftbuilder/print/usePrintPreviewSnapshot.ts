"use client";

import { useEffect, useState } from "react";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import type { DraftAssignmentRow } from "../components/placementFitForSlot";
import { buildPrintDaySnapshot } from "./buildPrintDaySnapshot";
import {
  applyDraftToPrintSnapshot,
  applyLiveBoardToPrintSnapshot,
  type LiveBoardOverlay,
} from "./mergePrintSnapshot";
import type { PrintDaySnapshot } from "./printPreviewTypes";

export type UsePrintPreviewSnapshotArgs = {
  day: DayDef;
  dayIndex: number;
  enabled: boolean;
  isDraftMode: boolean;
  draftAssignments: Record<string, DraftAssignmentRow>;
  /** When set, overlays live board aux/assignments/tasks for the active night. */
  liveBoard?: LiveBoardOverlay | null;
};

export type UsePrintPreviewSnapshotResult = {
  snapshot: PrintDaySnapshot | null;
  loading: boolean;
  error: string | null;
};

/**
 * Load the same Supabase-backed snapshot print/export uses, optionally merged
 * with engine draft proposals for the active night.
 */
export function usePrintPreviewSnapshot(
  args: UsePrintPreviewSnapshotArgs,
): UsePrintPreviewSnapshotResult {
  const { day, dayIndex, enabled, isDraftMode, draftAssignments, liveBoard } = args;
  const dayDateKey = formatLocalDateISO(day.date);
  const liveBoardKey = liveBoard ? JSON.stringify(liveBoard) : "";
  const draftKey =
    isDraftMode && Object.keys(draftAssignments).length > 0
      ? JSON.stringify(draftAssignments)
      : "";
  const [snapshot, setSnapshot] = useState<PrintDaySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    buildPrintDaySnapshot(day, dayIndex)
      .then((base) => {
        if (cancelled) return;
        let merged = liveBoard
          ? applyLiveBoardToPrintSnapshot(base, liveBoard)
          : base;
        if (isDraftMode && Object.keys(draftAssignments).length > 0) {
          merged = applyDraftToPrintSnapshot(merged, draftAssignments);
        }
        setSnapshot(merged);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setSnapshot(null);
        setLoading(false);
        setError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [dayDateKey, dayIndex, enabled, isDraftMode, draftKey, liveBoardKey]);

  return { snapshot, loading, error };
}