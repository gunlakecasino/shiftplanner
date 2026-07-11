"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isOptionalDeploymentSlot } from "@/lib/shiftbuilder/placement";
import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import { isEligibleForSlot } from "@/lib/shiftbuilder/placement";
import {
  buildPlacementTrailLabels,
  collectDeploymentSlotKeys,
  PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
  shouldShowPlacementFitChip,
  weekEntriesForTm,
} from "@/app/shiftbuilder/components/placementPadHelpers";
import {
  computeSlotPlacementFit,
  memberToPlacementProfile,
  resolveSlotAssignmentRow,
  type DraftAssignmentRow,
  type SlotAssignmentRow,
} from "@/app/shiftbuilder/components/placementFitForSlot";
import type { PrerenderedPlacementFit } from "@/app/shiftbuilder/components/placementFitScore";
import type { TmEntry } from "@/app/shiftbuilder/components/MarkerPad";
import type { PlacementTmProfile } from "@/app/shiftbuilder/components/placementPadHelpers";
import { filterWeeklyHistoryThroughNight } from "@/app/shiftbuilder/components/shiftRotationHealth";
import { applyGranularHealthToFitMap } from "@/lib/shiftbuilder/rotationHealthEngineContext";

export type UsePlacementFitMapArgs = {
  enabled: boolean;
  assignments: Record<string, SlotAssignmentRow>;
  /** Live assignments for card trails (non-deferred). Defaults to `assignments`. */
  trailAssignments?: Record<string, SlotAssignmentRow>;
  /** Keep fetching/computing trails even when fit chips are paused (e.g. night refetch). */
  trailsEnabled?: boolean;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
  members?: Array<Record<string, unknown>>;
  auxDefs: AuxDef[];
  currentIso: string;
  scheduledUnassigned?: TmEntry[];
  allEligibleTms?: TmEntry[];
  /** For this-week repeat penalty in per-slot fit chips (prevents "strong" on 2×+ same place this week). */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  /** Bump to force placement-history refetch (deep refresh day). */
  historyRefreshEpoch?: number;
};

export function usePlacementFitMap({
  enabled,
  assignments,
  trailAssignments,
  trailsEnabled = true,
  isDraftMode = false,
  draftAssignments = {},
  members = [],
  auxDefs,
  currentIso,
  scheduledUnassigned = [],
  allEligibleTms = [],
  weeklyRecentHistory,
  historyRefreshEpoch = 0,
}: UsePlacementFitMapArgs): {
  fitBySlot: Record<string, PrerenderedPlacementFit>;
  historiesLoading: boolean;
  placementTrailsByTmId: Record<string, string[]>;
} {
  const [histories, setHistories] = useState<Record<string, ZoneDetailEntry | null>>({});
  const [historiesLoading, setHistoriesLoading] = useState(false);

  const trailSource = trailAssignments ?? assignments;

  const tmIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const row of Object.values(trailSource)) {
      if (row?.tmId) ids.add(row.tmId);
    }
    if (isDraftMode) {
      for (const d of Object.values(draftAssignments)) {
        if (d.proposedTmId) ids.add(d.proposedTmId);
      }
    }
    return [...ids].sort().join(",");
  }, [trailSource, isDraftMode, draftAssignments]);

  // Ref guard: histories are per-TM (30-night spread) and relatively stable.
  // We only need to (re)fetch when the *set of TMs* on the current board/draft actually changes.
  // Using a ref prevents re-dispatching the same request even if parent re-renders cause the
  // effect to re-evaluate (new assignments refs from zustand, live bumps, fit consumers re-rendering, etc.).
  const lastFetchedKeyRef = useRef<string | null>(null);

  // Additional guard ref for setHistories to avoid setState(identity) churn from
  // effect re-runs or fetch returning equivalent empty/prior data. Complements the
  // stabilization done at useShiftData and useZoom levels.
  const lastHistoriesSigRef = useRef<string>("");

  const shouldFetchHistories = (enabled || trailsEnabled) && !!tmIdsKey;

  useEffect(() => {
    lastFetchedKeyRef.current = null;
    lastHistoriesSigRef.current = "";
  }, [historyRefreshEpoch]);

  useEffect(() => {
    if (!tmIdsKey) {
      if (lastHistoriesSigRef.current !== "{}") {
        setHistories({});
        lastHistoriesSigRef.current = "{}";
      }
      setHistoriesLoading(false);
      lastFetchedKeyRef.current = null;
      return;
    }

    if (!shouldFetchHistories) {
      setHistoriesLoading(false);
      return;
    }

    if (lastFetchedKeyRef.current === tmIdsKey) {
      // Already fetched (or in-flight) for exactly this set of TMs. No need to hit the API again.
      return;
    }
    // Mark in-flight only; clear on failure so the next render can retry.
    lastFetchedKeyRef.current = tmIdsKey;

    const tmIds = tmIdsKey.split(",").filter(Boolean);
    const tmIdSet = new Set(tmIds);
    let cancelled = false;
    setHistoriesLoading(true);
    // Drop TMs no longer on the board so we never score with stale peer histories.
    // Keep entries we already have so trails don't flash empty during refetch.
    setHistories((prev) => {
      const pruned: Record<string, ZoneDetailEntry | null> = {};
      for (const id of tmIds) {
        if (id in prev) pruned[id] = prev[id];
      }
      return pruned;
    });

    (async () => {
      try {
        // Chunk so large boards never exceed the API max (48) and leave TMs trail-less.
        const CHUNK = 48;
        const merged: Record<string, ZoneDetailEntry | null> = {};
        for (let i = 0; i < tmIds.length; i += CHUNK) {
          const chunk = tmIds.slice(i, i + CHUNK);
          const res = await fetch("/api/shiftbuilder/placement-histories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tmIds: chunk,
              days: PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
            }),
          });
          if (!res.ok) throw new Error(`placement-histories ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          const nextH = (data.histories as Record<string, ZoneDetailEntry | null>) ?? {};
          for (const id of chunk) {
            merged[id] = nextH[id] ?? null;
          }
        }
        if (cancelled) return;
        const nextSig = JSON.stringify(merged);
        if (lastHistoriesSigRef.current !== nextSig) {
          setHistories(merged);
          lastHistoriesSigRef.current = nextSig;
        }
      } catch {
        // Allow retry on next effect: do not leave lastFetchedKey stuck on a failed fetch.
        if (!cancelled) {
          lastFetchedKeyRef.current = null;
          setHistories((prev) => {
            const kept: Record<string, ZoneDetailEntry | null> = {};
            for (const [id, h] of Object.entries(prev)) {
              if (tmIdSet.has(id) && h) kept[id] = h;
            }
            return kept;
          });
        }
      } finally {
        if (!cancelled) setHistoriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldFetchHistories, tmIdsKey, historyRefreshEpoch]);

  const otherTmProfiles = useMemo(() => {
    const out: Record<string, PlacementTmProfile | null> = {};
    for (const id of tmIdsKey.split(",").filter(Boolean)) {
      out[id] = memberToPlacementProfile(members, id);
    }
    return out;
  }, [tmIdsKey, members]);

  const preferredCandidateIds = useMemo(
    () => scheduledUnassigned.map((t) => t.tmId).filter(Boolean),
    [scheduledUnassigned],
  );

  const buildCandidates = useMemo(() => {
    return (slotKey: string): PlacementCandidateProfile[] => {
      const seen = new Set<string>();
      const pool = [...scheduledUnassigned, ...(allEligibleTms || [])];
      return pool
        .filter((t) => {
          if (seen.has(t.tmId)) return false;
          seen.add(t.tmId);
          return true;
        })
        .slice(0, 14)
        .map((t) => {
          const profile = memberToPlacementProfile(members, t.tmId);
          const eligible = profile
            ? isEligibleForSlot(
                {
                  gender: profile.gender,
                  gravePool: profile.gravePool,
                  isAMOverlap: profile.isAMOverlap,
                  isPMOverlap: profile.isPMOverlap,
                },
                slotKey,
              )
            : true;
          return {
            tmName: t.tmName,
            tmId: t.tmId,
            eligible,
            gender: profile?.gender ?? null,
            gravePool: profile?.gravePool ?? null,
            isAMOverlap: profile?.isAMOverlap,
            isPMOverlap: profile?.isPMOverlap,
          };
        });
    };
  }, [scheduledUnassigned, allEligibleTms, members]);

  const scopedWeekHistory = useMemo(
    () => filterWeeklyHistoryThroughNight(weeklyRecentHistory, currentIso),
    [weeklyRecentHistory, currentIso],
  );

  const fitBySlot = useMemo(() => {
    if (!enabled) return {};

    const out: Record<string, PrerenderedPlacementFit> = {};
    const slotKeys = collectDeploymentSlotKeys(auxDefs);

    for (const slotKey of slotKeys) {
      if (!shouldShowPlacementFitChip(slotKey)) continue;

      const row = resolveSlotAssignmentRow(
        slotKey,
        assignments,
        isDraftMode,
        draftAssignments,
      );
      const assigned = !!(row?.tmName || row?.tmId);
      if (!assigned && isOptionalDeploymentSlot(slotKey)) continue;

      out[slotKey] = computeSlotPlacementFit({
        slotKey,
        assignments,
        isDraftMode,
        draftAssignments,
        members,
        auxDefs,
        currentIso,
        histories,
        historiesLoading,
        otherTmProfiles,
        weeklyRecentHistory: scopedWeekHistory,
        candidateProfiles: assigned ? undefined : buildCandidates(slotKey),
        preferredCandidateIds: assigned ? undefined : preferredCandidateIds,
      });
    }

    if (Object.keys(histories).length > 0) {
      return applyGranularHealthToFitMap(out, assignments, {
        auxDefs,
        currentIso,
        histories,
        weeklyRecentHistory: scopedWeekHistory,
        members,
        isDraftMode,
        draftAssignments,
      });
    }

    return out;
  }, [
    enabled,
    auxDefs,
    assignments,
    isDraftMode,
    draftAssignments,
    histories,
    historiesLoading,
    currentIso,
    members,
    otherTmProfiles,
    buildCandidates,
    preferredCandidateIds,
    scopedWeekHistory,
  ]);

  const scopedWeekForTrails = useMemo(
    () => filterWeeklyHistoryThroughNight(weeklyRecentHistory, currentIso),
    [weeklyRecentHistory, currentIso],
  );

  const placementTrailsByTmId = useMemo(() => {
    if (!trailsEnabled) return {};

    const out: Record<string, string[]> = {};
    for (const tmId of tmIdsKey.split(",").filter(Boolean)) {
      const history = histories[tmId] ?? null;
      // Exclusive of tonight — same rule as pad prior-N windows.
      const weekEntries = weekEntriesForTm(scopedWeekForTrails, tmId, currentIso);
      const labels = buildPlacementTrailLabels(
        history,
        currentIso,
        undefined,
        weekEntries,
        auxDefs,
      );
      if (labels.length > 0) out[tmId] = labels;
    }
    return out;
  }, [trailsEnabled, histories, currentIso, tmIdsKey, scopedWeekForTrails, auxDefs]);

  return { fitBySlot, historiesLoading, placementTrailsByTmId };
}