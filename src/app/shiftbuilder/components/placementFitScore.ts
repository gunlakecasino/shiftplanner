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
  /** Continuous 0–100 slot contribution for rotation health (varies inside verdict bands). */
  healthPoints?: number;
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

export function signalNumber(
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

/** Light spread load — last-5 trail alone no longer blocks strong_fit. */
export function isStrongFitSpread(times: number, _inLast5: boolean): boolean {
  return times <= 1;
}

/**
 * Granular 0–100 health points inside each verdict band.
 * Spreads the rotation % so boards are not stuck on flat 85/100 buckets.
 */
export function computePlacementHealthPoints(
  input: PlacementFitScoreInput,
  verdict: PlacementFitVerdict,
): number {
  const times = input.timesInSpread ?? 0;
  const week = input.weekRepeatThisSlot ?? 0;
  const inLast5 = !!input.inLast5;
  const partialSwaps = input.rotationBasics?.crossPatterns.length ?? 0;

  switch (verdict) {
    case "open_gap":
    case "poor_fit":
      return 0;
    case "needs_swap":
      return 44;
    case "questionable": {
      let p = 68;
      if (week >= 3) p -= 14;
      else if (week >= 2) p -= 8;
      if (times >= 3) p -= 10;
      else if (times >= 2) p -= 5;
      if (inLast5) p -= 4;
      if (partialSwaps > 0) p -= 3;
      return Math.max(48, Math.min(74, p));
    }
    case "acceptable": {
      let p = 88;
      if (inLast5) p -= 3;
      if (times >= 2) p -= Math.min(8, (times - 1) * 3);
      if (week >= 2) p -= Math.min(8, (week - 1) * 4);
      if (partialSwaps > 0) p -= 2;
      if (input.rationale) p += 1;
      return Math.max(80, Math.min(89, p));
    }
    case "strong_fit": {
      let p = 98;
      if (inLast5) p -= 3;
      if (week === 2) p -= 5;
      if (!input.rationale) p -= 2;
      return Math.max(90, Math.min(100, p));
    }
    default:
      return 70;
  }
}

function finishFit(
  input: PlacementFitScoreInput,
  verdict: PlacementFitVerdict,
  fitSummary: string,
  fitFactLine: string,
): PrerenderedPlacementFit {
  return {
    fitVerdict: verdict,
    fitSummary,
    fitFactLine,
    healthPoints: computePlacementHealthPoints(input, verdict),
  };
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
      return finishFit(
        input,
        "open_gap",
        `${slotLabel} is open — manual assign only (engine does not auto-fill main entry).`,
        buildFactLine(["Optional deployment slot"]),
      );
    }

    return finishFit(
      input,
      "open_gap",
      `${slotLabel} is open — assign from the roster when you are ready.`,
      buildFactLine(["No TM placed here tonight"]),
    );
  }

  const name = input.tmName || "TM";
  const weekRepeat = input.weekRepeatThisSlot ?? 0;

  if (input.padHistoryLoading) {
    return finishFit(
      input,
      "acceptable",
      `Checking ${name}'s rotation for ${slotLabel}…`,
      buildFactLine(["History loading"]),
    );
  }

  if (input.tmEligibleForSlot === false) {
    return finishFit(
      input,
      "poor_fit",
      `${name} should not stay on ${slotLabel} tonight.`,
      buildFactLine(["Not eligible — grave pool or gender rules"]),
    );
  }

  const basics = input.rotationBasics;
  const times = input.timesInSpread ?? 0;
  const inLast5 = !!input.inLast5;
  const count8w =
    signalNumber(input.fairnessSignals, "count_8w") ??
    signalNumber(input.fairnessSignals, "8w");
  const spreadFact =
    times > 0 ? `${times}× ${slotLabel} in last 30` : `0× ${slotLabel} in last 30`;
  const eightFact = count8w !== null ? `8w=${count8w} here` : null;
  const gapFact =
    gaps.length > 0 ? `gaps: ${formatGapList(gaps)}` : "no open spread gaps";

  const bilateral =
    basics?.crossPatterns.filter(
      (c) => c.tmMissingFromTheirSlot && c.otherMissingFromCurrentSlot,
    ) ?? [];

  if (weekRepeat >= 3) {
    return finishFit(
      input,
      "questionable",
      `${name} on ${slotLabel} — real bad this-week repeat (${weekRepeat}× in same place). Rotate out.`,
      buildFactLine([`week repeat ${weekRepeat}× (real bad)`, eightFact]),
    );
  }

  // Strong fit: light spread (0–1× in 30) and no week repeat problem. Last-5 trail is OK.
  // Swap lanes are optional — they must not downgrade a light-spread placement to Consider swap.
  if (times <= 1 && weekRepeat <= 1) {
    const engineOk = !!input.rationale;
    const trailNote = inLast5 ? " — in last-5 trail but spread is light." : "";
    const swapNote =
      bilateral.length > 0
        ? "optional bilateral swap lane"
        : gaps.length > 0
          ? "optional swap lane"
          : null;
    return finishFit(
      input,
      "strong_fit",
      engineOk
        ? `${name} is a strong fit on ${slotLabel} — engine-backed with light spread exposure.${trailNote}`
        : `${name} is a strong fit on ${slotLabel} — first or single exposure in the 30-night spread.${trailNote}`,
      buildFactLine([
        spreadFact,
        eightFact,
        inLast5 ? "in last-5 trail" : null,
        engineOk ? "engine continuity" : gapFact,
        swapNote,
      ]),
    );
  }

  if (bilateral.length > 0) {
    const swap = bilateral[0];
    const their = formatPlacementUiLabel(swap.theirSlotKey);
    return finishFit(
      input,
      "needs_swap",
      `Swap ${name} (${slotLabel}) with ${swap.otherTmName} (${their}) for fairer rotation.`,
      buildFactLine(["Bilateral swap lane", "Both missing each other's slot in spread"]),
    );
  }

  const better = findBetterSuited(gaps, times, count8w, inLast5);

  if (better.better) {
    const gapLabel = better.primaryGap
      ? formatPlacementUiLabel(better.primaryGap)
      : formatGapList(gaps, 1);
    const gapOccupant = better.primaryGap
      ? input.assignments?.[better.primaryGap]?.tmName
      : undefined;
    return finishFit(
      input,
      "questionable",
      gapOccupant
        ? `${name} on ${slotLabel} — consider a zone↔zone swap with ${gapOccupant} (${gapLabel}).`
        : `${name} on ${slotLabel} — rotation pressure on ${gapLabel}; use bilateral swaps only (no moves into open slots).`,
      buildFactLine([spreadFact, eightFact, gapFact]),
    );
  }

  // Acceptable: spread repeat and/or this-grave-week repeat (last-5 alone stays strong above).
  if (times >= 2 || weekRepeat >= 2) {
    const weekNote = weekRepeat >= 2 ? `week repeat ${weekRepeat}×` : null;
    const spreadRepeat = times >= 2;
    const last5Repeat = inLast5;
    const weekOnlyRepeat = weekRepeat >= 2 && !spreadRepeat && !last5Repeat;

    let fitSummary: string;
    if (weekOnlyRepeat) {
      fitSummary = `${name} on ${slotLabel} — ${weekRepeat}× this grave week (${spreadFact}); within policy for tonight.`;
    } else if (spreadRepeat && last5Repeat) {
      fitSummary = `${name} on ${slotLabel} — ${times}× in last 30 and in last-5 trail; within reason for tonight.`;
    } else if (spreadRepeat) {
      fitSummary = `${name} on ${slotLabel} — ${times}× in last 30; within reason for tonight.`;
    } else if (last5Repeat) {
      fitSummary = `${name} on ${slotLabel} — in last-5 trail (${spreadFact}); within reason for tonight.`;
    } else {
      fitSummary = `${name} on ${slotLabel} — repeat exposure is within reason for tonight.`;
    }

    return finishFit(
      input,
      "acceptable",
      fitSummary,
      buildFactLine([
        spreadFact,
        weekNote,
        inLast5 ? "in last-5 trail" : null,
        eightFact,
        gapFact,
      ]),
    );
  }

  const partialSwaps = basics?.crossPatterns.length ?? 0;
  if (partialSwaps > 0) {
    return finishFit(
      input,
      "acceptable",
      `${name} fits ${slotLabel}; optional swap lane to rebalance coverage.`,
      buildFactLine([spreadFact, "partial swap lane"]),
    );
  }

  return finishFit(
    input,
    "acceptable",
    `${name} on ${slotLabel} — acceptable fit for tonight.`,
    buildFactLine([spreadFact, eightFact, gapFact]),
  );
}