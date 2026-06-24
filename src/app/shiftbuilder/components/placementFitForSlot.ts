import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isEligibleForSlot } from "@/lib/shiftbuilder/placement";
import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import {
  buildMatrixSlotKeysForTm,
  computePlacementRotationBasics,
  getMergedPlacementSequence,
  getSpreadPlacementCounts,
  isInLast5SameAreaTrail,
  isInPriorPlacementSameAreaWindow,
  spreadCountForRepeatKey,
  weekEntriesForTm,
  PLACEMENT_SPREAD_NIGHTS,
  type PlacementCrossPattern,
  type PlacementRotationBasics,
  type PlacementTmProfile,
} from "./placementPadHelpers";
import { getTmWeekRepeatForSlotThroughNight } from "./shiftRotationHealth";
import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  rotationGapSlots,
  scorePlacementFit,
  type PlacementFitScoreInput,
  type PrerenderedPlacementFit,
} from "./placementFitScore";

/** Post-swap verdicts that mean the trade hurts rotation health for the other TM. */
const SWAP_HARM_VERDICTS: PlacementFitVerdict[] = [
  "questionable",
  "poor_fit",
  "needs_swap",
];

type RotationTradeContext = {
  gapSlotKey: string;
  currentSlotKey: string;
  currentTmId: string | undefined;
  assignments: Record<string, SlotAssignmentRow>;
  histories: Record<string, ZoneDetailEntry | null>;
  historiesLoading: boolean;
  members: Array<Record<string, unknown>>;
  auxDefs: AuxDef[];
  currentIso: string;
  otherTmProfiles: Record<string, PlacementTmProfile | null>;
  isDraftMode: boolean;
  draftAssignments: Record<string, DraftAssignmentRow>;
};

function swapAssignmentsForTrade(
  assignments: Record<string, SlotAssignmentRow>,
  slotA: string,
  slotB: string,
): Record<string, SlotAssignmentRow> {
  const rowA = assignments[slotA];
  const rowB = assignments[slotB];
  if (!rowA?.tmId || !rowB?.tmId) return assignments;
  return {
    ...assignments,
    [slotA]: { ...rowB },
    [slotB]: { ...rowA },
  };
}

/**
 * A gap or bilateral swap only counts when it improves rotation health net —
 * not when the occupant is strong/acceptable on their slot, or the trade would
 * make them questionable (or worse) on the other slot.
 */
function isRotationTradeWithOccupantWorthwhile(ctx: RotationTradeContext): boolean {
  const occupantRow = ctx.assignments[ctx.gapSlotKey];
  const occupantId = occupantRow?.tmId;
  /** Swap lanes require two occupants tonight — never treat an empty slot as a gap target. */
  if (!occupantId) return false;
  if (occupantId === ctx.currentTmId) return false;

  const fitArgs = {
    assignments: ctx.assignments,
    isDraftMode: ctx.isDraftMode,
    draftAssignments: ctx.draftAssignments,
    members: ctx.members,
    auxDefs: ctx.auxDefs,
    currentIso: ctx.currentIso,
    histories: ctx.histories,
    historiesLoading: ctx.historiesLoading,
    otherTmProfiles: ctx.otherTmProfiles,
    skipOccupantGapFilter: true as const,
  };

  const occupantOnGap = computeSlotPlacementFit({
    ...fitArgs,
    slotKey: ctx.gapSlotKey,
  });

  if (
    occupantOnGap.fitVerdict === "strong_fit" ||
    occupantOnGap.fitVerdict === "acceptable"
  ) {
    return false;
  }

  const afterSwap = computeSlotPlacementFit({
    ...fitArgs,
    slotKey: ctx.currentSlotKey,
    assignments: swapAssignmentsForTrade(
      ctx.assignments,
      ctx.currentSlotKey,
      ctx.gapSlotKey,
    ),
  });

  if (SWAP_HARM_VERDICTS.includes(afterSwap.fitVerdict)) {
    return false;
  }

  return true;
}

function filterActionableRotationGaps(
  ctx: RotationTradeContext & { gaps: string[] },
): string[] {
  return ctx.gaps.filter((gapSlotKey) =>
    isRotationTradeWithOccupantWorthwhile({ ...ctx, gapSlotKey }),
  );
}

function filterActionableCrossPatterns(
  ctx: RotationTradeContext & {
    crossPatterns: PlacementCrossPattern[];
  },
): PlacementCrossPattern[] {
  return ctx.crossPatterns.filter((c) => {
    const bilateral =
      c.tmMissingFromTheirSlot && c.otherMissingFromCurrentSlot;
    if (!bilateral) return true;
    return isRotationTradeWithOccupantWorthwhile({
      ...ctx,
      gapSlotKey: c.theirSlotKey,
    });
  });
}

function rotationBasicsWithFilteredSwaps(
  rotationBasics: PlacementRotationBasics,
  ctx: RotationTradeContext & { currentSlotKey: string; actionableGaps: string[] },
): PlacementRotationBasics {
  const crossPatterns = filterActionableCrossPatterns({
    ...ctx,
    crossPatterns: rotationBasics.crossPatterns,
  });

  return {
    ...rotationBasics,
    crossPatterns,
    highlightGapKeys: new Set([
      ...ctx.actionableGaps,
      ...crossPatterns
        .filter((c) => c.tmMissingFromTheirSlot)
        .map((c) => c.theirSlotKey),
    ]),
    highlightCrossKeys: new Set(
      crossPatterns
        .filter((c) => c.tmMissingFromTheirSlot)
        .map((c) => c.theirSlotKey),
    ),
  };
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
  /** Internal: avoid recursive occupant filtering when scoring trade partners. */
  skipOccupantGapFilter?: boolean;
  /** Weekly recent history for this-week same-slot repeat penalty in fit scoring. */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
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
    skipOccupantGapFilter = false,
    weeklyRecentHistory,
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
      assignments,
      assigned: false,
      candidateProfiles,
      preferredCandidateIds,
    });
  }

  const tmId = row?.tmId;
  const history = tmId ? histories[tmId] ?? null : null;
  const weekEntries = tmId
    ? weekEntriesForTm(weeklyRecentHistory, tmId, currentIso)
    : undefined;
  const spreadCounts = getSpreadPlacementCounts(
    history,
    PLACEMENT_SPREAD_NIGHTS,
    currentIso,
  );
  const timesInSpread = spreadCountForRepeatKey(spreadCounts, slotKey);
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

  const tradeCtx: RotationTradeContext = {
    gapSlotKey: slotKey,
    currentSlotKey: slotKey,
    currentTmId: tmId,
    assignments,
    histories,
    historiesLoading,
    members,
    auxDefs,
    currentIso,
    otherTmProfiles,
    isDraftMode,
    draftAssignments,
  };

  const allGaps = rotationGapSlots(rotationBasics, slotKey);
  const actionableGapSlots = skipOccupantGapFilter
    ? allGaps
    : filterActionableRotationGaps({ ...tradeCtx, gaps: allGaps });

  const basicsForScore =
    rotationBasics && !skipOccupantGapFilter
      ? rotationBasicsWithFilteredSwaps(rotationBasics, {
          ...tradeCtx,
          currentSlotKey: slotKey,
          actionableGaps: actionableGapSlots,
        })
      : rotationBasics;

  const weekRepeatThisSlot = tmId
    ? getTmWeekRepeatForSlotThroughNight(
        weeklyRecentHistory,
        tmId,
        slotKey,
        currentIso,
        true,
      )
    : 0;

  const input: PlacementFitScoreInput = {
    slotKey,
    assignments,
    tmName: row?.tmName,
    assigned: true,
    tmEligibleForSlot,
    timesInSpread,
    inLast5: isInLast5SameAreaTrail(history, slotKey, currentIso, weekEntries),
    inPriorPlacementWindow: isInPriorPlacementSameAreaWindow(
      history,
      slotKey,
      currentIso,
      undefined,
      weekEntries,
    ),
    padHistoryLoading: historiesLoading && !!tmId && !history,
    rotationBasics: basicsForScore,
    weekRepeatThisSlot,
    actionableGapSlots,
    rationale: row?.provenance?.rationale,
    fairnessSignals: row?.provenance?.fairnessSignals,
  };

  return scorePlacementFit(input);
}