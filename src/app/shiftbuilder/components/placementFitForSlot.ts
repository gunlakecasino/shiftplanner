import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isEligibleForSlot } from "@/lib/shiftbuilder/placement";
import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import {
  buildMatrixSlotKeysForTm,
  computePlacementRotationBasics,
  getLastPlacementSequence,
  getSpreadPlacementCounts,
  PLACEMENT_SPREAD_NIGHTS,
  type PlacementTmProfile,
} from "./placementPadHelpers";
import {
  findBetterSuited,
  isStrongFitSpread,
  rotationGapSlots,
  scorePlacementFit,
  type PlacementFitScoreInput,
  type PrerenderedPlacementFit,
} from "./placementFitScore";

const LAST5_COUNT = 5;

function signalNumberFromRow(
  signals: Record<string, number | string> | undefined,
  needle: string,
): number | null {
  if (!signals) return null;
  for (const [k, v] of Object.entries(signals)) {
    if (!k.toLowerCase().includes(needle)) continue;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Drop gap slots where the current occupant is a strong fit or has no rotation
 * pressure elsewhere — don't suggest "better on Z5" when Z5's TM is already well placed.
 */
function filterActionableRotationGaps(args: {
  gaps: string[];
  currentSlotKey: string;
  currentTmId: string | undefined;
  assignments: Record<string, SlotAssignmentRow>;
  histories: Record<string, ZoneDetailEntry | null>;
  members: Array<Record<string, unknown>>;
  auxDefs: AuxDef[];
  currentIso: string;
  otherTmProfiles: Record<string, PlacementTmProfile | null>;
}): string[] {
  const {
    gaps,
    currentSlotKey,
    currentTmId,
    assignments,
    histories,
    members,
    auxDefs,
    currentIso,
    otherTmProfiles,
  } = args;

  return gaps.filter((gapSlotKey) => {
    const occupantRow = assignments[gapSlotKey];
    const occupantId = occupantRow?.tmId;
    if (!occupantId || occupantId === currentTmId) return true;

    const occupantHistory = histories[occupantId] ?? null;
    const occupantSpread = getSpreadPlacementCounts(
      occupantHistory,
      PLACEMENT_SPREAD_NIGHTS,
      currentIso,
    );
    const occupantTimes = occupantSpread.get(gapSlotKey) ?? 0;
    const occupantLast5 = getLastPlacementSequence(
      occupantHistory,
      LAST5_COUNT,
      currentIso,
    );
    const occupantInLast5 = occupantLast5.includes(gapSlotKey);

    if (isStrongFitSpread(occupantTimes, occupantInLast5)) {
      return false;
    }

    const occupant8w =
      signalNumberFromRow(occupantRow?.provenance?.fairnessSignals, "count_8w") ??
      signalNumberFromRow(occupantRow?.provenance?.fairnessSignals, "8w");

    const occupantMatrix = buildMatrixSlotKeysForTm(occupantId, members, auxDefs);
    const occupantTm = otherTmProfiles[occupantId] ?? null;
    const occupantBasics = computePlacementRotationBasics(
      occupantHistory,
      gapSlotKey,
      occupantId,
      occupantMatrix,
      assignments,
      histories,
      currentIso,
      PLACEMENT_SPREAD_NIGHTS,
      occupantTm,
      otherTmProfiles,
    );
    const occupantGaps = rotationGapSlots(occupantBasics, gapSlotKey);
    const occupantPressure = findBetterSuited(
      occupantGaps,
      occupantTimes,
      occupant8w,
      occupantInLast5,
    );

    if (!occupantPressure.better) {
      return false;
    }

    return true;
  });
}

export type SlotAssignmentRow = {
  tmId?: string;
  tmName?: string;
  provenance?: {
    rationale?: string;
    fairnessSignals?: Record<string, number | string>;
  };
};

export type DraftAssignmentRow = {
  proposedTmId?: string;
  proposedTmName?: string;
  proposedClear?: boolean;
};

export function resolveSlotAssignmentRow(
  slotKey: string,
  assignments: Record<string, SlotAssignmentRow>,
  isDraftMode: boolean,
  draftAssignments: Record<string, DraftAssignmentRow>,
): SlotAssignmentRow | null {
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

export function memberToPlacementProfile(
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

export type ComputeSlotPlacementFitArgs = {
  slotKey: string;
  assignments: Record<string, SlotAssignmentRow>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
  members?: Array<Record<string, unknown>>;
  auxDefs: AuxDef[];
  currentIso: string;
  histories: Record<string, ZoneDetailEntry | null>;
  historiesLoading?: boolean;
  otherTmProfiles?: Record<string, PlacementTmProfile | null>;
  candidateProfiles?: PlacementCandidateProfile[];
  preferredCandidateIds?: string[];
};

/** Single source of truth for pad instant fit + card chip. */
export function computeSlotPlacementFit(
  args: ComputeSlotPlacementFitArgs,
): PrerenderedPlacementFit {
  const {
    slotKey,
    assignments,
    isDraftMode = false,
    draftAssignments = {},
    members = [],
    auxDefs,
    currentIso,
    histories,
    historiesLoading = false,
    otherTmProfiles = {},
    candidateProfiles,
    preferredCandidateIds,
  } = args;

  const row = resolveSlotAssignmentRow(
    slotKey,
    assignments,
    isDraftMode,
    draftAssignments,
  );
  const assigned = !!(row?.tmName || row?.tmId);

  if (!assigned) {
    return scorePlacementFit({
      slotKey,
      assigned: false,
      candidateProfiles,
      preferredCandidateIds,
    });
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
  const currentTm = memberToPlacementProfile(members, tmId);
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

  const allGaps = rotationGapSlots(rotationBasics, slotKey);
  const actionableGapSlots = filterActionableRotationGaps({
    gaps: allGaps,
    currentSlotKey: slotKey,
    currentTmId: tmId,
    assignments,
    histories,
    members,
    auxDefs,
    currentIso,
    otherTmProfiles,
  });

  const input: PlacementFitScoreInput = {
    slotKey,
    tmName: row?.tmName,
    assigned: true,
    tmEligibleForSlot,
    timesInSpread,
    inLast5: last5.includes(slotKey),
    padHistoryLoading: historiesLoading && !!tmId && !history,
    rotationBasics,
    actionableGapSlots,
    rationale: row?.provenance?.rationale,
    fairnessSignals: row?.provenance?.fairnessSignals,
  };

  return scorePlacementFit(input);
}