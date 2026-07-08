/**
 * engine/ai/tools.ts — real executable tools bound to a live context (P4-3).
 *
 * Successor to the actions.ts tool overrides + the lying placeholder base tools
 * (which P0-9 made throw). Every tool here answers from the same primitives the
 * rest of the engine uses — one eligibility gate, one scorer, one health model —
 * so the AI reasons against ground truth, not a stale snapshot. `scoreDraft`
 * replaces the old "call scoreDraftRotationHealth before final JSON" prompt
 * instruction with an actual callable that returns the real scorecard.
 */

import { z } from "zod";
import type { AiToolset } from "./provider";
import type { Draft, NightContext, SlotPlacement } from "../types";
import { canPlace } from "../eligibility";
import { rotationHealthPoints } from "../health/model";
import { prefScoreFor, skillScoreFor, scorecardFor } from "../objective";

export function buildAiTools(ctx: NightContext): AiToolset {
  const boardFromDraft = (draft: Record<string, string>): Draft => {
    const out: Draft = {};
    for (const [slotKey, tmId] of Object.entries(draft)) {
      const tm = ctx.rosterById.get(tmId);
      if (!tm) continue;
      out[slotKey] = {
        tmId,
        tmName: tm.name,
        provenance: {
          stage: "ai",
          reason: "proposed",
          scorecard: { eligible: true, healthPoints: 0, isCritical: false, prefScore: 0, skillScore: 0 },
        } as SlotPlacement["provenance"],
      };
    }
    return out;
  };

  return {
    checkEligibility: {
      description:
        "Check whether a team member is hard-eligible for a slot (gender for restrooms, grave pool, overlap band, operator rules, schedule). Returns { ok, reason }.",
      parameters: z.object({ tmId: z.string(), slotKey: z.string() }),
      execute: ({ tmId, slotKey }) => {
        const tm = ctx.rosterById.get(tmId);
        if (!tm) return { ok: false, reason: "TM not in tonight's roster" };
        return canPlace(tm, slotKey, {
          eligibilityRules: ctx.eligibilityRules,
          scheduledTmIds: ctx.scheduledTmIds,
        });
      },
    },

    previewRotationFit: {
      description:
        "Simulate rotation health if a TM were placed on a slot tonight. Returns points (90+ strong, 76-89 acceptable), verdict, and whether it is a critical repeat.",
      parameters: z.object({ tmId: z.string(), slotKey: z.string() }),
      execute: ({ tmId, slotKey }) => {
        const tm = ctx.rosterById.get(tmId);
        if (!tm) return { error: "TM not in roster" };
        const h = rotationHealthPoints({
          tmId, tmName: tm.name, slotKey, nightIso: ctx.nightIso,
          histories: ctx.histories, weeklyRecentHistory: ctx.weeklyRecentHistory,
          members: ctx.members, auxDefs: ctx.auxDefs,
        });
        return { points: h.points, verdict: h.verdict, isCritical: h.isCritical };
      },
    },

    scoreCandidate: {
      description:
        "Return the preference and skill contribution of placing a TM on a slot (the tie-breakers below rotation).",
      parameters: z.object({ tmId: z.string(), slotKey: z.string() }),
      execute: ({ tmId, slotKey }) => {
        const tm = ctx.rosterById.get(tmId);
        if (!tm) return { error: "TM not in roster" };
        return { prefScore: prefScoreFor(tm, slotKey, ctx), skillScore: skillScoreFor(tm, slotKey, ctx) };
      },
    },

    scoreDraft: {
      description:
        "Score a full proposed draft (map of slotKey -> tmId). Returns the scorecard { coverage, healthTotal, prefTotal, skillTotal }. Call this to verify an idea beats the current board before proposing it.",
      parameters: z.object({
        draft: z.record(z.string(), z.string()).describe("slotKey -> tmId"),
      }),
      execute: ({ draft }) => {
        const sc = scorecardFor(boardFromDraft(draft), ctx);
        return sc;
      },
    },

    getScheduleStatus: {
      description: "Whether a TM is on tonight's grave schedule (when a schedule is loaded).",
      parameters: z.object({ tmId: z.string() }),
      execute: ({ tmId }) => {
        if (ctx.scheduledTmIds.size === 0) return { scheduled: true, note: "No schedule loaded — full roster eligible" };
        return { scheduled: ctx.scheduledTmIds.has(tmId) };
      },
    },
  };
}
