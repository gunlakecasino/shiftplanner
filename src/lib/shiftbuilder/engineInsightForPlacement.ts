/**
 * Placement pad "Deeper insight" — retrospective Grok analysis for a single slot.
 * Server-only; called from shiftbuilder/actions.ts.
 */

import { generateText } from "ai";
import { createGrokSuggestionModel } from "@/lib/shiftbuilder/grokClient";
import { getPlacementOrderText, getEligibilityRulesText } from "@/lib/shiftbuilder/placement";

export type EngineInsightContext = {
  slotKey: string;
  tmName: string;
  rationale?: string;
  fairnessSignals?: Record<string, number | string>;
  recentPlacements?: string;
  isRR?: boolean;
  rrSide?: string | null;
  tmAttributes?: {
    gravePool?: string | boolean | null;
    isAMOverlap?: boolean;
    isPMOverlap?: boolean;
  };
  priorGoodExamples?: Array<{ slotKey: string; insightText: string }>;
  slotSpecificHistory?: string;
  currentContext?: string;
  /** Unassigned slot: short list of candidate names the pad computed */
  suggestedCandidates?: string;
};

export type EngineInsightResult = {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    reasoningEffort?: string;
  };
};

const STATIC_FEW_SHOTS = `EXAMPLE 1 (zone Z3, assigned):
Melissa on Z3: After RR/Admin cleared, the engine favored her because prior_run_continuity on Z3 (2 of last 30 nights) plus pair_affinity 0.72 to Jamie on Z2 — rotation 2.1 vs pulling her to Z5 (count_8w elevated there).

EXAMPLE 2 (RR WRR4, assigned):
Alex on WRR4: Chosen once mens RR1–3 were set; womens side fill order step + low recent WRR4 load (0 in last 14) with affinity 0.65 to Maria already on WRR3 for paired coverage.`;

function formatSignals(signals?: Record<string, number | string>): string {
  if (!signals || Object.keys(signals).length === 0) return "(none recorded)";
  return Object.entries(signals)
    .slice(0, 12)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

function buildSystemPrompt(ctx: EngineInsightContext): string {
  const orderText = getPlacementOrderText();
  const eligText = getEligibilityRulesText();

  const priorGood =
    ctx.priorGoodExamples && ctx.priorGoodExamples.length > 0
      ? `\nOPERATOR-RATED GOOD EXAMPLES (match this tone and depth):\n${ctx.priorGoodExamples
          .map(
            (ex, i) =>
              `${i + 1}. Slot ${ex.slotKey}: "${ex.insightText.replace(/"/g, "'")}"`,
          )
          .join("\n")}\n`
      : "";

  return `You are a GRAVE placement analyst explaining why the deterministic engine (or operator) placed someone on a slot.

CORE RULES:
- Write 3–5 tight sentences. Be analytical, not sycophantic. Do not repeat obvious eligibility rules.
- Use placement ORDER only to explain timing ("after RR filled…"), not to re-list the whole order.
- Name concrete fairness/matrix signals when provided (e.g. prior_run_continuity, count_8w, pair_affinity, rotation, load).
- Use slotSpecificHistory and currentContext when provided — cite neighbors by name.
- Never suggest swapping or re-running the engine unless the slot is empty and suggestedCandidates is given.
- No bullet lists, no JSON, no "1. Keep X on Y because eligible" generic advice.

REFERENCE (engine contract — do not paste back verbatim):
${orderText}

${eligText}
${priorGood}
${STATIC_FEW_SHOTS}`;
}

function buildUserPrompt(ctx: EngineInsightContext): string {
  const unassigned = !ctx.tmName || ctx.tmName === "the assigned TM";
  if (unassigned) {
    return `Slot: ${ctx.slotKey} (UNASSIGNED)
${ctx.suggestedCandidates ? `Candidates to consider: ${ctx.suggestedCandidates}` : ""}
${ctx.currentContext ? `Board context: ${ctx.currentContext}` : ""}
Explain who fits best here tonight and why (order position + 1–2 matrix-style reasons). Keep it practical for the floor lead.`;
  }

  const lines = [
    `Slot: ${ctx.slotKey}`,
    `Assigned TM: ${ctx.tmName}`,
    ctx.isRR ? `RR side: ${ctx.rrSide ?? "n/a"}` : null,
    ctx.tmAttributes
      ? `TM attrs: gravePool=${ctx.tmAttributes.gravePool ?? "?"} amOverlap=${!!ctx.tmAttributes.isAMOverlap} pmOverlap=${!!ctx.tmAttributes.isPMOverlap}`
      : null,
    ctx.rationale ? `Engine rationale (from provenance): ${ctx.rationale}` : null,
    `Fairness / matrix signals: ${formatSignals(ctx.fairnessSignals)}`,
    ctx.recentPlacements ? `Recent placement trail: ${ctx.recentPlacements}` : null,
    ctx.slotSpecificHistory ? `Slot-specific history: ${ctx.slotSpecificHistory}` : null,
    ctx.currentContext ? `Current board neighbors / context: ${ctx.currentContext}` : null,
    "",
    "Explain why this placement makes sense for tonight in the engine's terms (rotation, affinity to who is actually nearby, recency in THIS slot).",
  ].filter(Boolean);

  return lines.join("\n");
}

export async function runEngineInsightForPlacement(
  ctx: EngineInsightContext,
): Promise<EngineInsightResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      text: "xAI is not configured (missing XAI_API_KEY). Showing engine rationale only.",
    };
  }

  const systemPrompt = buildSystemPrompt(ctx);
  const userPrompt = buildUserPrompt(ctx);
  const effort = "low" as const;

  try {
    const model = createGrokSuggestionModel();
    const { text, usage } = await generateText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.35,
      maxTokens: 420,
      providerOptions: {
        xai: { reasoningEffort: effort },
      },
    });

    const trimmed = text?.trim();
    return {
      text:
        trimmed ||
        "No additional insight returned. The placement follows tonight's fairness model and coverage order.",
      usage: {
        inputTokens: usage?.promptTokens,
        outputTokens: usage?.completionTokens,
        model: "grok-4.3",
        reasoningEffort: effort,
      },
    };
  } catch (err) {
    console.error("[engineInsight] Grok call failed:", err);
    return {
      text: "Deeper insight unavailable right now. Use the engine rationale and matrix above.",
    };
  }
}