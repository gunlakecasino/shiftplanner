import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  formatPlacementUiLabel,
  isSwapEligibleSlotKey,
  type PlacementRotationBasics,
} from "./placementPadHelpers";

export type PrerenderedPlacementFit = {
  fitVerdict: PlacementFitVerdict;
  fitSummary: string;
  fitFactLine: string;
};

export type PlacementFitScoreInput = {
  slotKey: string;
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

function rotationGapSlots(
  basics: PlacementRotationBasics | null | undefined,
  currentSlotKey: string,
): string[] {
  return (basics?.notRecentlyPlaced ?? []).filter(
    (k) => k !== currentSlotKey && isSwapEligibleSlotKey(k),
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

/** True when rotation gaps or swap lanes imply a clearly better placement than staying put. */
function findBetterSuited(
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
  const gaps = rotationGapSlots(input.rotationBasics, input.slotKey);

  if (!input.assigned) {
    const eligible = (input.candidateProfiles ?? []).filter((c) => c.eligible);
    if (eligible.length === 0) {
      return {
        fitVerdict: "questionable",
        fitSummary: `No eligible TMs for ${slotLabel} tonight.`,
        fitFactLine: buildFactLine(["Grave pool / gender rules block all picks"]),
      };
    }

    const pick = pickRecommendedCandidate(eligible, input.preferredCandidateIds);
    const pickName = pick?.tmName ?? eligible[0].tmName;

    if (eligible.length === 1) {
      return {
        fitVerdict: "strong_fit",
        fitSummary: `Best pick: ${pickName} — only eligible TM for ${slotLabel}.`,
        fitFactLine: buildFactLine(["Single eligible option"]),
      };
    }

    const altCount = eligible.length - 1;
    return {
      fitVerdict: "strong_fit",
      fitSummary: `Best pick: ${pickName} for ${slotLabel} tonight.`,
      fitFactLine: buildFactLine([
        `${altCount} other eligible`,
        input.rationale ? "engine-backed" : "rotation pool",
      ]),
    };
  }

  const name = input.tmName || "TM";

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
    return {
      fitVerdict: "questionable",
      fitSummary: `${name} on ${slotLabel} — better rotation on ${gapLabel} is available.`,
      fitFactLine: buildFactLine([spreadFact, eightFact, gapFact]),
    };
  }

  if (times === 0) {
    const engineOk = !!input.rationale;
    return {
      fitVerdict: engineOk ? "acceptable" : "acceptable",
      fitSummary: engineOk
        ? `${name} on ${slotLabel} — engine placement; first exposure in the 30-night spread.`
        : `${name} on ${slotLabel} — acceptable; no recent spread history here.`,
      fitFactLine: buildFactLine([
        spreadFact,
        engineOk ? "engine continuity" : null,
        gapFact,
      ]),
    };
  }

  if (input.rationale && times <= 1 && !inLast5) {
    return {
      fitVerdict: "strong_fit",
      fitSummary: `${name} is a strong fit on ${slotLabel} tonight.`,
      fitFactLine: buildFactLine([spreadFact, eightFact, "matches engine placement"]),
    };
  }

  if (times === 1 && !inLast5) {
    return {
      fitVerdict: "acceptable",
      fitSummary: `${name} fits ${slotLabel} — light spread exposure, no better gap tonight.`,
      fitFactLine: buildFactLine([spreadFact, eightFact, gapFact]),
    };
  }

  if (times >= 2 || inLast5) {
    return {
      fitVerdict: "acceptable",
      fitSummary: `${name} on ${slotLabel} — repeat exposure is within reason for tonight.`,
      fitFactLine: buildFactLine([
        spreadFact,
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