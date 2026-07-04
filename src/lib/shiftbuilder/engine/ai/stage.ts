/**
 * engine/ai/stage.ts — the AI refinement stage (P4-4, pipeline stage 5).
 *
 * The deterministic core (`runNightEngine`) stays synchronous and reproducible;
 * the AI is an *optional async post-step* layered on top, so turning it on never
 * compromises determinism of the planner/optimizer. It sends the one brief with
 * the one toolset, receives slot-level overrides, and runs them through the AI
 * guard — which can only ever accept legal, non-regressive changes (N4/I9).
 */

import type { AiProvider, AiReasoningEffort } from "./provider";
import type { Draft, NightContext, NightRunResult, Scorecard, StageTelemetry } from "../types";
import { scorecardFor } from "../objective";
import { buildAiTools } from "./tools";
import { buildNightBrief, AI_SYSTEM_PROMPT } from "./briefs";
import { AiNightOutputSchema } from "./schemas";
import { validateAiDraft } from "./guard";

export interface AiStageOptions {
  reasoningEffort?: AiReasoningEffort;
  /** Cap the number of overrides considered (default 8). */
  maxOverrides?: number;
  abortSignal?: AbortSignal;
}

export interface AiStageResult extends NightRunResult {
  aiAccepted: Array<{ slotKey: string; tmId: string; rationale: string }>;
  aiRejected: Array<{ slotKey: string; tmId: string; reason: string }>;
}

/**
 * Run the AI stage over a completed night result. Returns a new result whose
 * scorecard is guaranteed ≥ the input's (guard enforces it). On any provider
 * error the input result is returned unchanged — the AI is never load-bearing.
 */
export async function applyAiStage(
  ctx: NightContext,
  base: NightRunResult,
  provider: AiProvider,
  opts: AiStageOptions = {},
): Promise<AiStageResult> {
  const maxOverrides = opts.maxOverrides ?? 8;
  const stageStart = now();

  let accepted: AiStageResult["aiAccepted"] = [];
  let rejected: AiStageResult["aiRejected"] = [];
  let draft: Draft = base.draft;
  const notes: string[] = [];

  try {
    const { output } = await provider.completeStructured({
      system: AI_SYSTEM_PROMPT,
      prompt: buildNightBrief(ctx, base),
      schema: AiNightOutputSchema,
      tools: buildAiTools(ctx),
      reasoningEffort: opts.reasoningEffort ?? "high",
      abortSignal: opts.abortSignal,
    });

    const overrides = output.overrides.slice(0, maxOverrides);
    const guarded = validateAiDraft(ctx, base.draft, overrides);
    draft = guarded.draft;
    accepted = guarded.accepted;
    rejected = guarded.rejected;
    if (output.notes) notes.push(`AI: ${output.notes}`);
    notes.push(`AI overrides: ${accepted.length} accepted, ${rejected.length} rejected`);
  } catch (err) {
    notes.push(`AI stage skipped: ${err instanceof Error ? err.message : "provider error"}`);
  }

  const scorecard: Scorecard = scorecardFor(draft, ctx);
  const aiStage: StageTelemetry = {
    stage: "ai",
    ms: now() - stageStart,
    scorecard,
    notes,
  };

  const placedIds = new Set(Object.values(draft).map((p) => p.tmId));
  const unassignedTmIds = ctx.roster.filter((t) => !placedIds.has(t.id)).map((t) => t.id);

  return {
    ...base,
    draft,
    scorecard,
    unassignedTmIds,
    telemetry: {
      ...base.telemetry,
      stages: [...base.telemetry.stages, aiStage],
      totalMs: base.telemetry.totalMs + aiStage.ms,
    },
    aiAccepted: accepted,
    aiRejected: rejected,
  };
}

const now = (): number =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
