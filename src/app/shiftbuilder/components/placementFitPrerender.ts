import type { PlacementCandidateProfile } from "@/lib/shiftbuilder/engineInsightForPlacement";
import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  formatPlacementUiLabel,
  type PlacementRotationBasics,
} from "./placementPadHelpers";

export type PrerenderedPlacementFit = {
  fitVerdict: PlacementFitVerdict;
  fitSummary: string;
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

export type PrerenderPlacementFitInput = {
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
};

/** Instant fit verdict on pad open — no xAI. */
export function computePrerenderedPlacementFit(
  input: PrerenderPlacementFitInput,
): PrerenderedPlacementFit {
  const slotLabel = formatPlacementUiLabel(input.slotKey);

  if (!input.assigned) {
    const eligible = (input.candidateProfiles ?? []).filter((c) => c.eligible);
    if (eligible.length === 0) {
      return {
        fitVerdict: "questionable",
        fitSummary: `No eligible TMs for ${slotLabel} tonight (grave pool / gender rules).`,
      };
    }
    if (eligible.length === 1) {
      return {
        fitVerdict: "strong_fit",
        fitSummary: `${eligible[0].tmName} is the only eligible pick for ${slotLabel}.`,
      };
    }
    const top = eligible
      .slice(0, 3)
      .map((c) => c.tmName)
      .join(", ");
    return {
      fitVerdict: "acceptable",
      fitSummary: `${eligible.length} eligible TMs for ${slotLabel}; top options: ${top}.`,
    };
  }

  const name = input.tmName || "TM";

  if (input.padHistoryLoading) {
    return {
      fitVerdict: "acceptable",
      fitSummary: `Checking ${name}'s rotation history for ${slotLabel}…`,
    };
  }

  if (input.tmEligibleForSlot === false) {
    return {
      fitVerdict: "poor_fit",
      fitSummary: `${name} is not eligible for ${slotLabel} (grave pool or gender rules).`,
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
      fitSummary: `Consider swapping ${name} (${slotLabel}) with ${swap.otherTmName} (${their}) for fairer rotation.`,
    };
  }

  const times = input.timesInSpread ?? 0;
  const inLast5 = !!input.inLast5;

  const count8w =
    signalNumber(input.fairnessSignals, "count_8w") ??
    signalNumber(input.fairnessSignals, "8w");

  if (count8w !== null && count8w > 4) {
    return {
      fitVerdict: "questionable",
      fitSummary: `${name} on ${slotLabel} — high 8-week load here (${count8w}); rotation may be due on another slot.`,
    };
  }

  if (times === 0) {
    if (input.rationale) {
      return {
        fitVerdict: "questionable",
        fitSummary: `${name} on ${slotLabel} — engine placed them, but they have not worked ${slotLabel} in the last 30 nights.`,
      };
    }
    return {
      fitVerdict: "questionable",
      fitSummary: `${name} has not been on ${slotLabel} in the last 30 nights.`,
    };
  }

  if (times >= 2 || (times >= 1 && inLast5)) {
    const trail =
      times >= 2 ? `${times}× in last 30 nights` : "in last-5 trail";
    if (input.rationale) {
      return {
        fitVerdict: "strong_fit",
        fitSummary: `${name} is a strong fit on ${slotLabel} (${trail}); matches engine placement.`,
      };
    }
    return {
      fitVerdict: "strong_fit",
      fitSummary: `${name} is a strong fit on ${slotLabel} — ${trail}.`,
    };
  }

  const partialSwaps = basics?.crossPatterns.length ?? 0;
  if (partialSwaps > 0) {
    return {
      fitVerdict: "acceptable",
      fitSummary: `${name} fits ${slotLabel} tonight; optional swap lanes exist to rebalance coverage.`,
    };
  }

  if (input.rationale) {
    return {
      fitVerdict: "acceptable",
      fitSummary: `${name} on ${slotLabel} — engine supports tonight; spread coverage is moderate.`,
    };
  }

  return {
    fitVerdict: "acceptable",
    fitSummary: `${name} on ${slotLabel} — acceptable fit with prior exposure in the 30-night spread.`,
  };
}