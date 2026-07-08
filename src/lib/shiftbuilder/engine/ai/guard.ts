/**
 * engine/ai/guard.ts — the AI acceptance gate (P4-4, principle N4/D6).
 *
 * The AI can only *choose among legal placements* — it can never break a hard
 * rule, double-book, drop coverage, or lower the scorecard. Overrides are
 * applied onto the optimizer draft and validated with the shared `validateDraft`
 * using the optimizer draft as the coverage baseline. A coherent set is accepted
 * wholesale; otherwise each override is tried incrementally and only kept if the
 * board stays valid. Anything illegal is rejected *individually*, with a reason —
 * the run always succeeds (invariant I9).
 */

import type { Draft, NightContext, SlotPlacement } from "../types";
import { validateDraft } from "../guard";
import { compareScorecards, scorecardFor, prefScoreFor, skillScoreFor } from "../objective";
import { rotationHealthPoints } from "../health/model";
import type { AiOverride } from "./schemas";

export interface AiGuardResult {
  draft: Draft;
  accepted: Array<{ slotKey: string; tmId: string; rationale: string }>;
  rejected: Array<{ slotKey: string; tmId: string; reason: string }>;
}

function boardOf(draft: Draft): Record<string, { tmId?: string; tmName?: string }> {
  const b: Record<string, { tmId?: string; tmName?: string }> = {};
  for (const [k, p] of Object.entries(draft)) b[k] = { tmId: p.tmId, tmName: p.tmName };
  return b;
}

function placementFor(
  ctx: NightContext,
  slotKey: string,
  tmId: string,
  rationale: string,
  board: Record<string, { tmId?: string; tmName?: string }>,
): SlotPlacement | null {
  const tm = ctx.rosterById.get(tmId);
  if (!tm) return null;
  const slot = ctx.slotByKey.get(slotKey);
  const h = slot?.isRotationTracked
    ? rotationHealthPoints({
        tmId, tmName: tm.name, slotKey, nightIso: ctx.nightIso,
        histories: ctx.histories, weeklyRecentHistory: ctx.weeklyRecentHistory,
        members: ctx.members, auxDefs: ctx.auxDefs, assignments: board,
      })
    : { points: 0, isCritical: false };
  return {
    tmId,
    tmName: tm.name,
    provenance: {
      stage: "ai",
      reason: "AI override (guard-accepted)",
      aiRationale: rationale,
      scorecard: {
        eligible: true,
        healthPoints: h.points,
        isCritical: h.isCritical,
        prefScore: prefScoreFor(tm, slotKey, ctx),
        skillScore: skillScoreFor(tm, slotKey, ctx),
      },
    },
  };
}

export function validateAiDraft(
  ctx: NightContext,
  optimizerDraft: Draft,
  overrides: AiOverride[],
): AiGuardResult {
  const accepted: AiGuardResult["accepted"] = [];
  const rejected: AiGuardResult["rejected"] = [];

  // Attempt 1 — coherent batch: apply everything, accept only if the whole
  // board is valid AND at least as good as the optimizer draft.
  const batch: Draft = { ...optimizerDraft };
  let batchOk = true;
  for (const o of overrides) {
    const p = placementFor(ctx, o.slotKey, o.tmId, o.rationale, boardOf(batch));
    if (!p) { batchOk = false; break; }
    batch[o.slotKey] = p;
  }
  if (batchOk && overrides.length > 0) {
    const v = validateDraft(batch, ctx, { baseline: optimizerDraft });
    const better = compareScorecards(scorecardFor(batch, ctx), scorecardFor(optimizerDraft, ctx)) >= 0;
    if (v.ok && better) {
      return {
        draft: batch,
        accepted: overrides.map((o) => ({ slotKey: o.slotKey, tmId: o.tmId, rationale: o.rationale })),
        rejected: [],
      };
    }
  }

  // Attempt 2 — incremental: keep each override only if the board stays valid
  // and no worse than the running draft.
  let running: Draft = { ...optimizerDraft };
  for (const o of overrides) {
    const p = placementFor(ctx, o.slotKey, o.tmId, o.rationale, boardOf(running));
    if (!p) {
      rejected.push({ slotKey: o.slotKey, tmId: o.tmId, reason: "TM not in roster" });
      continue;
    }
    const candidate: Draft = { ...running, [o.slotKey]: p };
    const v = validateDraft(candidate, ctx, { baseline: running });
    if (!v.ok) {
      rejected.push({
        slotKey: o.slotKey,
        tmId: o.tmId,
        reason: v.hardViolations[0] ?? "would break a hard rule",
      });
      continue;
    }
    if (compareScorecards(scorecardFor(candidate, ctx), scorecardFor(running, ctx)) < 0) {
      rejected.push({ slotKey: o.slotKey, tmId: o.tmId, reason: "would lower the scorecard" });
      continue;
    }
    running = candidate;
    accepted.push({ slotKey: o.slotKey, tmId: o.tmId, rationale: o.rationale });
  }

  return { draft: running, accepted, rejected };
}
