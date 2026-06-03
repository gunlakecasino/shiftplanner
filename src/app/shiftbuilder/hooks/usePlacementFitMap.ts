"use client";

import { useEffect, useMemo, useState } from "react";
import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isEligibleForSlot } from "@/lib/shiftbuilder/placement";
import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import {
  buildMatrixSlotKeysForTm,
  collectDeploymentSlotKeys,
  computePlacementRotationBasics,
  getLastPlacementSequence,
  getSpreadPlacementCounts,
  PLACEMENT_SPREAD_NIGHTS,
  shouldShowPlacementFitChip,
  type PlacementTmProfile,
} from "@/app/shiftbuilder/components/placementPadHelpers";
import {
  scorePlacementFit,
  type PrerenderedPlacementFit,
} from "@/app/shiftbuilder/components/placementFitScore";
import type { TmEntry } from "@/app/shiftbuilder/components/MarkerPad";

const LAST5_COUNT = 5;

function memberProfile(
  members: Array<Record<string, unknown>>,
  tmId: string | undefined,
): PlacementTmProfile | null {
  if (!tmId) return null;
  const m = members.find(
    (mem) => mem.id === tmId || mem.tmId === tmId || mem.tm_id === tmId,
  );
  if (!m) return null;
  return {
    gender: m.gender as string | null | undefined,
    gravePool: (m.gravePool ?? m.grave_pool) as string | null | undefined,
    isAMOverlap: !!(m.isAMOverlap ?? m.is_am_overlap),
    isPMOverlap: !!(m.isPMOverlap ?? m.is_pm_overlap),
  };
}

function assignmentRowForSlot(
  slotKey: string,
  assignments: Record<string, { tmId?: string; tmName?: string; provenance?: { rationale?: string; fairnessSignals?: Record<string, number | string> } }>,
  isDraftMode: boolean,
  draftAssignments: Record<
    string,
    {
      proposedTmId?: string;
      proposedTmName?: string;
      proposedClear?: boolean;
    }
  >,
): { tmId?: string; tmName?: string; provenance?: { rationale?: string; fairnessSignals?: Record<string, number | string> } } | null {
  const draft = draftAssignments[slotKey];
  if (isDraftMode && draft && !draft.proposedClear && draft.proposedTmName) {
    return {
      tmId: draft.proposedTmId,
      tmName: draft.proposedTmName,
      provenance: assignments[slotKey]?.provenance,
    };
  }
  const live = assignments[slotKey];
  if (!live?.tmName && !live?.tmId) return null;
  return live;
}

export type UsePlacementFitMapArgs = {
  enabled: boolean;
  assignments: Record<string, { tmId?: string; tmName?: string; provenance?: { rationale?: string; fairnessSignals?: Record<string, number | string> } }>;
  isDraftMode?: boolean;
  draftAssignments?: Record<
    string,
    {
      proposedTmId?: string;
      proposedTmName?: string;
      proposedClear?: boolean;
    }
  >;
  members?: Array<Record<string, unknown>>;
  auxDefs: AuxDef[];
  currentIso: string;
  scheduledUnassigned?: TmEntry[];
  allEligibleTms?: TmEntry[];
};

export function usePlacementFitMap({
  enabled,
  assignments,
  isDraftMode = false,
  draftAssignments = {},
  members = [],
  auxDefs,
  currentIso,
  scheduledUnassigned = [],
  allEligibleTms = [],
}: UsePlacementFitMapArgs): {
  fitBySlot: Record<string, PrerenderedPlacementFit>;
  historiesLoading: boolean;
} {
  const [histories, setHistories] = useState<Record<string, ZoneDetailEntry | null>>({});
  const [historiesLoading, setHistoriesLoading] = useState(false);

  const boardSig = useMemo(
    () =>
      Object.entries(assignments)
        .filter(([, row]) => row?.tmId)
        .map(([k, row]) => `${k}:${row!.tmId}`)
        .sort()
        .join("|"),
    [assignments],
  );

  const draftSig = useMemo(
    () =>
      isDraftMode
        ? Object.entries(draftAssignments)
            .map(([k, d]) => `${k}:${d.proposedTmId ?? ""}:${d.proposedTmName ?? ""}`)
            .sort()
            .join("|")
        : "",
    [isDraftMode, draftAssignments],
  );

  const tmIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const row of Object.values(assignments)) {
      if (row?.tmId) ids.add(row.tmId);
    }
    if (isDraftMode) {
      for (const d of Object.values(draftAssignments)) {
        if (d.proposedTmId) ids.add(d.proposedTmId);
      }
    }
    return [...ids].sort().join(",");
  }, [assignments, isDraftMode, draftAssignments]);

  useEffect(() => {
    if (!enabled || !tmIdsKey) {
      setHistories({});
      setHistoriesLoading(false);
      return;
    }

    const tmIds = tmIdsKey.split(",").filter(Boolean);
    let cancelled = false;
    setHistoriesLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/shiftbuilder/placement-histories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tmIds, days: PLACEMENT_SPREAD_NIGHTS }),
        });
        const data = await res.json();
        if (cancelled) return;
        setHistories((data.histories as Record<string, ZoneDetailEntry | null>) ?? {});
      } catch {
        if (!cancelled) setHistories({});
      } finally {
        if (!cancelled) setHistoriesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, tmIdsKey, boardSig, draftSig]);

  const otherTmProfiles = useMemo(() => {
    const out: Record<string, PlacementTmProfile | null> = {};
    for (const id of tmIdsKey.split(",").filter(Boolean)) {
      out[id] = memberProfile(members, id);
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
          const profile = memberProfile(members, t.tmId);
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

  const fitBySlot = useMemo(() => {
    if (!enabled) return {};

    const out: Record<string, PrerenderedPlacementFit> = {};
    const slotKeys = collectDeploymentSlotKeys(auxDefs);

    for (const slotKey of slotKeys) {
      if (!shouldShowPlacementFitChip(slotKey)) continue;

      const row = assignmentRowForSlot(
        slotKey,
        assignments,
        isDraftMode,
        draftAssignments,
      );
      const assigned = !!(row?.tmName || row?.tmId);

      if (!assigned) {
        out[slotKey] = scorePlacementFit({
          slotKey,
          assigned: false,
          candidateProfiles: buildCandidates(slotKey),
          preferredCandidateIds,
        });
        continue;
      }

      const tmId = row?.tmId;
      const history = tmId ? histories[tmId] ?? null : null;
      const spreadCounts = getSpreadPlacementCounts(
        history,
        PLACEMENT_SPREAD_NIGHTS,
        currentIso,
      );
      const timesInSpread = spreadCounts.get(slotKey) ?? 0;
      const last5 = getLastPlacementSequence(history, LAST5_COUNT, currentIso);
      const currentTm = memberProfile(members, tmId);
      const tmEligibleForSlot = currentTm
        ? isEligibleForSlot(
            {
              gender: currentTm.gender,
              gravePool: currentTm.gravePool,
              isAMOverlap: currentTm.isAMOverlap,
              isPMOverlap: currentTm.isPMOverlap,
            },
            slotKey,
          )
        : true;

      const matrixSlotKeys = buildMatrixSlotKeysForTm(tmId, members, auxDefs);
      const rotationBasics =
        tmId && history
          ? computePlacementRotationBasics(
              history,
              slotKey,
              tmId,
              matrixSlotKeys,
              assignments,
              histories,
              currentIso,
              PLACEMENT_SPREAD_NIGHTS,
              currentTm,
              otherTmProfiles,
            )
          : null;

      out[slotKey] = scorePlacementFit({
        slotKey,
        tmName: row?.tmName,
        assigned: true,
        tmEligibleForSlot,
        timesInSpread,
        inLast5: last5.includes(slotKey),
        padHistoryLoading: historiesLoading && !!tmId && !history,
        rotationBasics,
        rationale: row?.provenance?.rationale,
        fairnessSignals: row?.provenance?.fairnessSignals,
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
  ]);

  return { fitBySlot, historiesLoading };
}