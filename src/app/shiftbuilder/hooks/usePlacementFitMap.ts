"use client";

import { useEffect, useMemo, useState } from "react";
import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import { isEligibleForSlot } from "@/lib/shiftbuilder/placement";
import {
  collectDeploymentSlotKeys,
  PLACEMENT_SPREAD_NIGHTS,
  shouldShowPlacementFitChip,
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

export type UsePlacementFitMapArgs = {
  enabled: boolean;
  assignments: Record<string, SlotAssignmentRow>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
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
        candidateProfiles: assigned ? undefined : buildCandidates(slotKey),
        preferredCandidateIds: assigned ? undefined : preferredCandidateIds,
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