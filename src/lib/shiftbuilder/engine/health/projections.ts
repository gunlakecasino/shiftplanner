/**
 * engine/health/projections.ts — draft & week health projections (P1-3, fixes F4).
 *
 * "If we applied this draft, what would rotation health be?" Every projection —
 * planner-vs-optimizer lift, the AI brief's baseline numbers, the week summary —
 * runs through `projectDraftHealth`, which scores each filled rotation-tracked
 * slot with the ONE model (engine/health/model). Before unification the
 * projection path used coarse verdict-band points while board surfaces used the
 * granular model, so the numbers the AI was told to beat were on a different
 * scale than the numbers the operator saw.
 *
 * Open slots never reduce the percentage (they are a coverage concern, measured
 * by the objective's coverage term — not a rotation-health penalty). This
 * matches the long-standing "open gaps are informational only" rule.
 */

import { rotationHealthPoints } from "./model";
import type { Draft, NightContext } from "../types";
import { roundRotationHealthValue } from "@/app/shiftbuilder/components/shiftRotationHealth";

export interface DraftHealthProjection {
  /** Mean granular health across filled rotation-tracked slots, or null if none. */
  percent: number | null;
  scoredSlots: number;
  criticalSlots: number;
  bySlot: Record<string, { tmId: string; points: number; isCritical: boolean }>;
}

/**
 * Project the rotation health % of a draft against a night context.
 * `board` overrides the draft as the assignment map used for gap/swap-lane
 * context (defaults to the draft itself, so gaps reflect the proposed board).
 */
export function projectDraftHealth(
  draft: Draft,
  ctx: NightContext,
): DraftHealthProjection {
  const boardAssignments: Record<string, { tmId?: string; tmName?: string }> = {};
  for (const [slotKey, p] of Object.entries(draft)) {
    boardAssignments[slotKey] = { tmId: p.tmId, tmName: p.tmName };
  }

  const bySlot: DraftHealthProjection["bySlot"] = {};
  const points: number[] = [];
  let criticalSlots = 0;

  for (const [slotKey, placement] of Object.entries(draft)) {
    const slot = ctx.slotByKey.get(slotKey);
    if (!slot || !slot.isRotationTracked) continue;

    const score = rotationHealthPoints({
      tmId: placement.tmId,
      tmName: placement.tmName,
      slotKey,
      nightIso: ctx.nightIso,
      histories: ctx.histories,
      weeklyRecentHistory: ctx.weeklyRecentHistory,
      members: ctx.members,
      auxDefs: ctx.auxDefs,
      assignments: boardAssignments,
    });
    points.push(score.points);
    if (score.isCritical) criticalSlots += 1;
    bySlot[slotKey] = {
      tmId: placement.tmId,
      points: score.points,
      isCritical: score.isCritical,
    };
  }

  return {
    percent:
      points.length > 0
        ? roundRotationHealthValue(points.reduce((a, b) => a + b, 0) / points.length)
        : null,
    scoredSlots: points.length,
    criticalSlots,
    bySlot,
  };
}
