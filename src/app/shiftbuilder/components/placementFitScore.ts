import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  formatPlacementUiLabel,
  isSwapEligibleSlotKey,
  type PlacementRotationBasics,
} from "./placementPadHelpers";
import { areSwapLanePeers, isOptionalDeploymentSlot } from "@/lib/shiftbuilder/placement";

export type PrerenderedPlacementFit = {
  fitVerdict: PlacementFitVerdict;
  fitSummary: string;
  fitFactLine: string;
};

export type PlacementFitScoreInput = {
  slotKey: string;
  /** Tonight's board — used to exclude empty slots from rotation gap targets. */
  assignments?: Record<
    string,
    { tmId?: string | null; tmName?: string } | undefined
  >;
  tmName?: string;
  assigned: boolean;
  tmEligibleForSlot?: boolean;
  timesInSpread?: number;
  inLast5?: boolean;
  padHistoryLoading?: boolean;
  rotationBasics?: PlacementRotationBasics | null;
  rationale?: string;
  fairnessSignals?: Record<string, number | string>;
  candidateProfiles?: PlacementCandidateProfile[];
  /** tmIds in priority order (e.g. scheduled unassigned first). */
  preferredCandidateIds?: string[];
  /**
   * Gap slots that count toward "better rotation elsewhere" (after occupant checks).
   * When omitted, derived from rotationBasics via rotationGapSlots().
   */
  actionableGapSlots?: string[];
  /** This-week (recent 7-night + current) repeat count for *this specific TM* in *this slotKey*. */
  weekRepeatThisSlot?: number;
};

function signalNumber(
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

export function rotationGapSlots(
  basics: PlacementRotationBasics | null | undefined,
  currentSlotKey: string,
  assignments?: Record<
    string,
    { tmId?: string | null; tmName?: string } | undefined
  >,
): string[] {
  return (basics?.notRecentlyPlaced ?? []).filter(
    (k) =>
      k !== currentSlotKey &&
      isSwapEligibleSlotKey(k) &&
      areSwapLanePeers(currentSlotKey, k) &&
      (!assignments || !!assignments[k]?.tmId),
  );
}

function pickRecommendedCandidate(
  eligible: PlacementCandidateProfile[],
  preferredIds: string[] | undefined,
): PlacementCandidateProfile | null {
  if (eligible.length === 0) return null;
  if (preferredIds?.length) {
    for (const id of preferredIds) {
      const hit = eligible.find((c) => c.tmId === id);
      if (hit) return hit;
    }
  }
  return eligible[0];
}

function formatGapList(gaps: string[], max = 3): string {
  const labels = gaps.slice(0, max).map((k) => formatPlacementUiLabel(k));
  if (gaps.length > max) return `${labels.join(", ")} +${gaps.length - max}`;
  return labels.join(", ");
}

/** Light spread load — matches strong_fit spread criteria (eligibility handled separately). */
export function isStrongFitSpread(times: number, inLast5: boolean): boolean {
  return times <= 1 && !inLast5;
}

/** True when rotation gaps or swap lanes imply a clearly better placement than staying put. */
export function findBetterSuited(
  gaps: string[],
  times: number,
  count8w: number | null,
  inLast5: boolean,
): { better: boolean; primaryGap?: string } {
  if (gaps.length === 0) return { better: false };

  if (times >= 2) {
    return { better: true, primaryGap: gaps[0] };
  }

  if (count8w !== null && count8w > 3) {
    return { better: true, primaryGap: gaps[0] };
  }

  if (times >= 1 && inLast5) {
    return { better: true, primaryGap: gaps[0] };
  }

  return { better: false };
}

function buildFactLine(parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => !!p).join(" · ");
}

/** Instant fit verdict on pad open — no xAI. */
export function scorePlacementFit(input: PlacementFitScoreInput): PrerenderedPlacementFit {
  const slotLabel = formatPlacementUiLabel(input.slotKey);
  const gaps =
    input.actionableGapSlots ??
    rotationGapSlots(input.rotationBasics, input.slotKey, input.assignments);

  if (!input.assigned) {
    if (isOptionalDeploymentSlot(input.slotKey)) {
      return {
        fitVerdict: "open_gap",
        fitSummary: `${slotLabel} is open — manual assign only (engine does not auto-fill main entry).`,
        fitFactLine: buildFactLine(["Optional deployment slot"]),
      };
    }

    return {
      fitVerdict: "open_gap",
      fitSummary: `${slotLabel} is open — assign from the roster when you are ready.`,
      fitFactLine: buildFactLine(["No TM placed here tonight"]),
    };
  }

  const name = input.tmName || "TM";
  const weekRepeat = input.weekRepeatThisSlot ?? 0;

  if (input.padHistoryLoading) {
    return {
      fitVerdict: "acceptable",
      fitSummary: `Checking ${name}'s rotation for ${slotLabel}…`,
      fitFactLine: buildFactLine(["History loading"]),
    };
  }

  if (input.tmEligibleForSlot === false) {
    return {
      fitVerdict: "poor_fit",
      fitSummary: `${name} should not stay on ${slotLabel} tonight.`,
      fitFactLine: buildFactLine(["Not eligible — grave pool or gender rules"]),
    };
  }

  const basics = input.rotationBasics;
  const bilateral =
    basics?.crossPatterns.filter(
      (c) => c.tmMissingFromTheirSlot && c.otherMissingFromCurrentSlot,
    ) ?? [];

  if (bilateral.length > 0) {
    const swap = bilateral[0];
    const their = formatPlacementUiLabel(swap.theirSlotKey);
    return {
      fitVerdict: "needs_swap",
      fitSummary: `Swap ${name} (${slotLabel}) with ${swap.otherTmName} (${their}) for fairer rotation.`,
      fitFactLine: buildFactLine(["Bilateral swap lane", "Both missing each other's slot in spread"]),
    };
  }

  const times = input.timesInSpread ?? 0;
  const inLast5 = !!input.inLast5;
  const count8w =
    signalNumber(input.fairnessSignals, "count_8w") ??
    signalNumber(input.fairnessSignals, "8w");

  const better = findBetterSuited(gaps, times, count8w, inLast5);
  const spreadFact =
    times > 0 ? `${times}× ${slotLabel} in last 30` : `0× ${slotLabel} in last 30`;
  const eightFact = count8w !== null ? `8w=${count8w} here` : null;
  const gapFact =
    gaps.length > 0 ? `gaps: ${formatGapList(gaps)}` : "no open spread gaps";

  if (better.better) {
    const gapLabel = better.primaryGap
      ? formatPlacementUiLabel(better.primaryGap)
      : formatGapList(gaps, 1);
    const gapOccupant = better.primaryGap
      ? input.assignments?.[better.primaryGap]?.tmName
      : undefined;
    return {
      fitVerdict: "questionable",
      fitSummary: gapOccupant
        ? `${name} on ${slotLabel} — consider a zone↔zone swap with ${gapOccupant} (${gapLabel}).`
        : `${name} on ${slotLabel} — rotation pressure on ${gapLabel}; use bilateral swaps only (no moves into open slots).`,
      fitFactLine: buildFactLine([spreadFact, eightFact, gapFact]),
    };
  }

  if (weekRepeat >= 3) {
    return {
      fitVerdict: "questionable",
      fitSummary: `${name} on ${slotLabel} — real bad this-week repeat (${weekRepeat}× in same place). Rotate out.`,
      fitFactLine: buildFactLine([`week repeat ${weekRepeat}× (real bad)`, eightFact]),
    };
  }

  // Strong fit: light spread load (0–1× in 30), not in last-5 trail, no better gap elsewhere,
  // *and* no problematic this-week repeat concentration in the same place.
  if (times <= 1 && !inLast5 && weekRepeat <= 1) {
    const engineOk = !!input.rationale;
    return {
      fitVerdict: "strong_fit",
      fitSummary: engineOk
        ? `${name} is a strong fit on ${slotLabel} — engine-backed with light spread exposure.`
        : `${name} is a strong fit on ${slotLabel} — first or single exposure in the 30-night spread.`,
      fitFactLine: buildFactLine([
        spreadFact,
        eightFact,
        engineOk ? "engine continuity" : gapFact,
      ]),
    };
  }

  // Acceptable: repeat exposure (2×+ in 30 or this week) or back-to-back in last-5 — still fine unless a better gap exists.
  if (times >= 2 || inLast5 || weekRepeat >= 2) {
    const weekNote = weekRepeat >= 2 ? `week repeat ${weekRepeat}×` : null;
    return {
      fitVerdict: "acceptable",
      fitSummary: `${name} on ${slotLabel} — repeat exposure is within reason for tonight.`,
      fitFactLine: buildFactLine([
        spreadFact,
        weekNote,
        inLast5 ? "in last-5 trail" : null,
        eightFact,
        gapFact,
      ]),
    };
  }

  const partialSwaps = basics?.crossPatterns.length ?? 0;
  if (partialSwaps > 0) {
    return {
      fitVerdict: "acceptable",
      fitSummary: `${name} fits ${slotLabel}; optional swap lane to rebalance coverage.`,
      fitFactLine: buildFactLine([spreadFact, "partial swap lane"]),
    };
  }

  return {
    fitVerdict: "acceptable",
    fitSummary: `${name} on ${slotLabel} — acceptable fit for tonight.`,
    fitFactLine: buildFactLine([spreadFact, eightFact, gapFact]),
  };
}