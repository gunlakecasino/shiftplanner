"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { TmEntry } from "@/app/shiftbuilder/components/MarkerPad";
import {
  PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
} from "@/app/shiftbuilder/components/placementPadHelpers";
import type { SlotAssignmentRow } from "@/app/shiftbuilder/components/placementFitForSlot";
import {
  compareCandidateRotationPreviews,
  previewCandidateRotationFit,
} from "@/lib/shiftbuilder/rotationHealthEngineContext";
import type { WeekNightRecord } from "@/app/shiftbuilder/components/shiftRotationHealth";

export type PickerTmRotationFit = {
  healthPoints: number;
  fitVerdict: PlacementFitVerdict;
  fitSummary: string;
  fitFactLine?: string;
};

export type UsePickerRotationSortArgs = {
  enabled: boolean;
  slotKey: string | null | undefined;
  candidates: TmEntry[];
  assignments: Record<string, SlotAssignmentRow>;
  auxDefs: AuxDef[];
  currentIso: string;
  members?: Array<Record<string, unknown>>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  /** Bump to force history refetch (day rollover, post-apply). */
  historyRefreshEpoch?: number;
};

export function usePickerRotationSort({
  enabled,
  slotKey,
  candidates,
  assignments,
  auxDefs,
  currentIso,
  members = [],
  weeklyRecentHistory,
  historyRefreshEpoch = 0,
}: UsePickerRotationSortArgs): {
  sortedCandidates: TmEntry[];
  fitByTmId: Record<string, PickerTmRotationFit>;
  historiesLoading: boolean;
} {
  const [histories, setHistories] = useState<Record<string, ZoneDetailEntry | null>>({});
  const [historiesLoading, setHistoriesLoading] = useState(false);

  const tmIdsKey = useMemo(() => {
    if (!enabled || !slotKey || candidates.length === 0) return "";
    return [...new Set(candidates.map((c) => c.tmId).filter(Boolean))].sort().join(",");
  }, [enabled, slotKey, candidates]);

  const lastFetchedKeyRef = useRef<string | null>(null);
  const lastHistoriesSigRef = useRef<string>("");

  useEffect(() => {
    lastFetchedKeyRef.current = null;
    lastHistoriesSigRef.current = "";
  }, [historyRefreshEpoch]);

  useEffect(() => {
    if (!enabled || !slotKey || !tmIdsKey) {
      if (lastHistoriesSigRef.current !== "{}") {
        setHistories({});
        lastHistoriesSigRef.current = "{}";
      }
      setHistoriesLoading(false);
      lastFetchedKeyRef.current = null;
      return;
    }

    if (lastFetchedKeyRef.current === tmIdsKey) return;
    lastFetchedKeyRef.current = tmIdsKey;

    const tmIds = tmIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    setHistoriesLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/shiftbuilder/placement-histories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tmIds,
            days: PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
          }),
        });
        if (!res.ok) throw new Error(`placement-histories ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const nextH = (data.histories as Record<string, ZoneDetailEntry | null>) ?? {};
        const nextSig = JSON.stringify(nextH);
        if (lastHistoriesSigRef.current !== nextSig) {
          setHistories(nextH);
          lastHistoriesSigRef.current = nextSig;
        }
      } catch {
        // Keep prior good histories — empty-on-error looked like "never placed".
      } finally {
        if (!cancelled) setHistoriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, slotKey, tmIdsKey, historyRefreshEpoch]);

  const { sortedCandidates, fitByTmId } = useMemo(() => {
    if (!enabled || !slotKey || candidates.length === 0) {
      return { sortedCandidates: candidates, fitByTmId: {} as Record<string, PickerTmRotationFit> };
    }

    if (historiesLoading && Object.keys(histories).length === 0) {
      return { sortedCandidates: candidates, fitByTmId: {} as Record<string, PickerTmRotationFit> };
    }

    const scored = candidates.map((tm) => {
      const preview = previewCandidateRotationFit({
        tmId: tm.tmId,
        tmName: tm.tmName,
        slotKey,
        tonightIso: currentIso,
        assignments,
        auxDefs,
        histories,
        weeklyRecentHistory,
        members,
      });
      return { tm, preview };
    });

    scored.sort((a, b) => compareCandidateRotationPreviews(a.preview, b.preview));

    const fitMap: Record<string, PickerTmRotationFit> = {};
    for (const { tm, preview } of scored) {
      fitMap[tm.tmId] = {
        healthPoints: preview.healthPoints,
        fitVerdict: preview.fitVerdict as PlacementFitVerdict,
        fitSummary: preview.fitSummary,
        fitFactLine: preview.fitFactLine,
      };
    }

    return {
      sortedCandidates: scored.map((s) => s.tm),
      fitByTmId: fitMap,
    };
  }, [
    enabled,
    slotKey,
    candidates,
    assignments,
    auxDefs,
    currentIso,
    members,
    weeklyRecentHistory,
    histories,
    historiesLoading,
  ]);

  return { sortedCandidates, fitByTmId, historiesLoading };
}