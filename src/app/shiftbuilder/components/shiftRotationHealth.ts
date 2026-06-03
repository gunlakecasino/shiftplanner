import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isOptionalDeploymentSlot } from "@/lib/shiftbuilder/placement";
import {
  collectDeploymentSlotKeys,
  shouldShowPlacementFitChip,
} from "./placementPadHelpers";
import {
  resolveSlotAssignmentRow,
  type DraftAssignmentRow,
  type SlotAssignmentRow,
} from "./placementFitForSlot";
import type { PrerenderedPlacementFit } from "./placementFitScore";

/** Operator target for a healthy grave board before break. */
export const ROTATION_HEALTH_TARGET = 85;

const VERDICT_POINTS: Record<PlacementFitVerdict, number> = {
  strong_fit: 100,
  acceptable: 85,
  questionable: 55,
  needs_swap: 40,
  poor_fit: 0,
  open_gap: 0,
};

export type ShiftRotationHealth = {
  /** Rounded 0–100; null when no assigned swap-eligible slots to score. */
  percent: number | null;
  meetsTarget: boolean;
  scoredCount: number;
  openGaps: number;
  counts: {
    strong_fit: number;
    acceptable: number;
    questionable: number;
    needs_swap: number;
    poor_fit: number;
    open_gap: number;
  };
};

export function computeShiftRotationHealth(
  auxDefs: AuxDef[],
  assignments: Record<string, SlotAssignmentRow>,
  fitBySlot: Record<string, PrerenderedPlacementFit>,
  options?: {
    isDraftMode?: boolean;
    draftAssignments?: Record<string, DraftAssignmentRow>;
  },
): ShiftRotationHealth {
  const isDraftMode = options?.isDraftMode ?? false;
  const draftAssignments = options?.draftAssignments ?? {};

  const counts = {
    strong_fit: 0,
    acceptable: 0,
    questionable: 0,
    needs_swap: 0,
    poor_fit: 0,
    open_gap: 0,
  };

  let openGaps = 0;
  const scores: number[] = [];

  for (const slotKey of collectDeploymentSlotKeys(auxDefs)) {
    if (!shouldShowPlacementFitChip(slotKey)) continue;

    const row = resolveSlotAssignmentRow(
      slotKey,
      assignments,
      isDraftMode,
      draftAssignments,
    );
    const assigned = !!(row?.tmName || row?.tmId);
    if (!assigned) {
      if (!isOptionalDeploymentSlot(slotKey)) openGaps += 1;
      continue;
    }

    const fit = fitBySlot[slotKey];
    if (!fit) continue;

    scores.push(VERDICT_POINTS[fit.fitVerdict] ?? 70);
    counts[fit.fitVerdict] += 1;
  }

  if (scores.length === 0) {
    return {
      percent: null,
      meetsTarget: false,
      scoredCount: 0,
      openGaps,
      counts,
    };
  }

  const percent = Math.round(
    scores.reduce((a, b) => a + b, 0) / scores.length,
  );

  return {
    percent,
    meetsTarget: percent >= ROTATION_HEALTH_TARGET,
    scoredCount: scores.length,
    openGaps,
    counts,
  };
}

export function rotationHealthFloaterColors(
  percent: number | null,
): { bg: string; border: string; text: string } {
  if (percent === null) {
    return {
      bg: "rgba(0,0,0,0.88)",
      border: "#3a3a3c",
      text: "#a1a1aa",
    };
  }
  if (percent >= ROTATION_HEALTH_TARGET) {
    return {
      bg: "rgba(22,163,74,0.92)",
      border: "rgba(34,197,94,0.5)",
      text: "#ecfdf5",
    };
  }
  if (percent >= 70) {
    return {
      bg: "rgba(180,83,9,0.92)",
      border: "rgba(251,191,36,0.45)",
      text: "#fffbeb",
    };
  }
  return {
    bg: "rgba(185,28,28,0.92)",
    border: "rgba(248,113,113,0.45)",
    text: "#fef2f2",
  };
}