/**
 * Placement pad analyst — high-quality Grok 4.3 structured insights.
 * Server-only; called from /api/shiftbuilder/engine-insight.
 */

import { generateObject, generateText } from "ai";
import { createGrokSuggestionModel } from "@/lib/shiftbuilder/grokClient";
import { getPlacementOrderText, getEligibilityRulesText } from "@/lib/shiftbuilder/placement";
import {
  PlacementPadInsightSchema,
  formatPlacementPadInsightText,
  type PlacementPadInsight,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  getInsightCache,
  setInsightCache,
  stableInsightKey,
} from "@/lib/shiftbuilder/engineInsightCache";

export type PlacementInsightMode = "auto" | "deep" | "assignee" | "basics" | "legacy";

export type PlacementCandidateProfile = {
  tmName: string;
  tmId?: string;
  eligible: boolean;
  gender?: string | null;
  gravePool?: string | null;
  isAMOverlap?: boolean;
  isPMOverlap?: boolean;
};

export type EngineInsightContext = {
  slotKey: string;
  tmName: string;
  mode?: PlacementInsightMode;
  rationale?: string;
  fairnessSignals?: Record<string, number | string>;
  recentPlacements?: string;
  isRR?: boolean;
  rrSide?: string | null;
  tmAttributes?: {
    gravePool?: string | boolean | null;
    isAMOverlap?: boolean;
    isPMOverlap?: boolean;
    gender?: string | null;
  };
  priorGoodExamples?: Array<{ slotKey: string; insightText: string }>;
  slotSpecificHistory?: string;
  currentContext?: string;
  suggestedCandidates?: string;
  /** Deterministic rotation copy from the pad (gaps + swap lanes). */
  rotationBrief?: string;
  /** Comma-separated keys placed in last-30 spread. */
  spreadPlaced?: string;
  /** Comma-separated matrix keys not in spread. */
  spreadGaps?: string;
  /** Pre-scored / filtered candidate rows for empty slots. */
  candidateProfiles?: PlacementCandidateProfile[];
  rotationBasicsText?: string;
  /** Client fingerprint — cache invalidation when board/history changes. */
  contextSig?: string;
  /** Instant prerender from placementFitScore — xAI may override with verdictOverrideReason. */
  prerenderVerdict?: string;
  prerenderSummary?: string;
  prerenderFactLine?: string;
};

export type EngineInsightResult = {
  text: string;
  structured?: PlacementPadInsight;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    reasoningEffort?: string;
  };
  cached?: boolean;
};

const STATIC_FEW_SHOTS = `EXAMPLE (zone Z3, assigned):
Headline: Melissa belongs on Z3 tonight after RR/admin cleared.
Why: prior_run_continuity on Z3 (2/30 nights) plus pair_affinity 0.72 with Jamie on Z2; pulling to Z5 would spike count_8w there.
Swaps: Only suggest eligible zone↔zone or RR↔RR gender matches — never Admin or overlap cards.

EXAMPLE (WRR4, assigned):
Headline: Alex fits WRR4 as the womens chain closes.
Why: Fill-order step after MRR1–3; zero WRR4 in last 14 with Maria on WRR3 for paired coverage.`;

function slotKind(slotKey: string): "zone" | "rr" | "aux" | "overlap" | "other" {
  if (slotKey.startsWith("OL-")) return "overlap";
  if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) return "rr";
  if (/^Z\d+$/.test(slotKey) || slotKey === "Z9SR") return "zone";
  return "aux";
}

function buildAnalystSystemPrompt(ctx: EngineInsightContext): string {
  const kind = slotKind(ctx.slotKey);
  const orderText = getPlacementOrderText();
  const eligText = getEligibilityRulesText();

  const priorGood =
    ctx.priorGoodExamples && ctx.priorGoodExamples.length > 0
      ? `\nOPERATOR-RATED GOLD EXAMPLES (match depth and tone exactly):\n${ctx.priorGoodExamples
          .map(
            (ex, i) =>
              `${i + 1}. ${ex.slotKey}: "${ex.insightText.replace(/"/g, "'").slice(0, 600)}"`,
          )
          .join("\n")}\n`
      : "";

  const kindFocus =
    kind === "rr"
      ? "Focus on restroom chain order, gender rules (MRR male-only, WRR female-only), and paired coverage with adjacent RR slots."
      : kind === "zone"
        ? "Focus on full-grave zone continuity, neighbor affinity on the artboard, and rotation vs count_8w tradeoffs."
        : kind === "aux"
          ? "Focus on full-night aux coverage, sweep/load, and who is already committed on zones/RR."
          : "Respect eligibility; do not recommend overlap or admin swaps.";

  return `You are the GRAVE placement analyst for a single expert operator (Brian). Your job is decisive, floor-ready judgment — not generic advice.

VOICE: 3–5 tight sentences in whyTonight; headline is one crisp line. Name people and slots. Never say "you". Never re-list the full fill order verbatim.

AUTHORITY: The DETERMINISTIC FACTS block below is ground truth from the engine and history. Use fairnessSignals and engine rationale when present. If rotationBrief lists swap lanes, refine them — do not invent ineligible swaps (no Admin, no Overlap OL-*, no cross-gender RR).

${kindFocus}

OUTPUT: Structured JSON only (schema enforced). REQUIRED: fitSummary (one plain sentence) and fitVerdict (strong_fit | acceptable | questionable | poor_fit | needs_swap).

INSTANT PRERENDER: When PRERENDER block is present, treat it as the default verdict. You MAY change fitVerdict/fitSummary only if deterministic facts clearly support a different judgment — then set verdictOverrideReason (one short sentence). Questionable only when a better-suited placement or swap exists; repeat exposure (2×–3× in 30) alone is acceptable if no better gap. Unassigned slots: fitSummary must name one best pick.

REFERENCE CONTRACT (do not paste back verbatim):
${orderText}

${eligText}
${priorGood}
${STATIC_FEW_SHOTS}`;
}

function buildAnalystUserPrompt(ctx: EngineInsightContext): string {
  const mode = ctx.mode ?? "deep";
  const lines: string[] = [
    `MODE: ${mode}`,
    `Slot: ${ctx.slotKey}`,
    ctx.isRR ? `RR side: ${ctx.rrSide ?? "n/a"}` : null,
    `Assigned TM: ${ctx.tmName || "(unassigned)"}`,
    "",
    "=== DETERMINISTIC FACTS ===",
    ctx.rotationBrief ? `Rotation / swaps:\n${ctx.rotationBrief}` : null,
    ctx.spreadPlaced ? `Last-30 spread (placed): ${ctx.spreadPlaced}` : null,
    ctx.spreadGaps ? `Last-30 gaps (not placed): ${ctx.spreadGaps}` : null,
    ctx.slotSpecificHistory ? `This slot history: ${ctx.slotSpecificHistory}` : null,
    ctx.recentPlacements ? `Last-5 trail: ${ctx.recentPlacements}` : null,
    ctx.currentContext ? `Board neighbors: ${ctx.currentContext}` : null,
    ctx.tmAttributes
      ? `TM attrs: gender=${ctx.tmAttributes.gender ?? "?"} gravePool=${ctx.tmAttributes.gravePool ?? "?"} amOverlap=${!!ctx.tmAttributes.isAMOverlap} pmOverlap=${!!ctx.tmAttributes.isPMOverlap}`
      : null,
    ctx.rationale ? `Engine rationale: ${ctx.rationale}` : null,
    `Fairness signals: ${formatSignals(ctx.fairnessSignals)}`,
    ctx.prerenderVerdict
      ? [
          "",
          "=== INSTANT PRERENDER (default unless you override) ===",
          `fitVerdict: ${ctx.prerenderVerdict}`,
          ctx.prerenderSummary ? `fitSummary: ${ctx.prerenderSummary}` : null,
          ctx.prerenderFactLine ? `fitFactLine: ${ctx.prerenderFactLine}` : null,
          "=== END PRERENDER ===",
        ]
          .filter(Boolean)
          .join("\n")
      : null,
    "=== END FACTS ===",
  ].filter(Boolean) as string[];

  if (mode === "assignee" && ctx.candidateProfiles?.length) {
    lines.push(
      "",
      "Rank ONLY eligible candidates (eligible=false are forbidden picks). JSON must include rankedAssignees.",
      "Candidates:",
      JSON.stringify(ctx.candidateProfiles, null, 0),
    );
  } else if (mode === "assignee") {
    lines.push("", `Candidates (names only): ${ctx.suggestedCandidates ?? "(none)"}`);
  } else {
    lines.push(
      "",
      "Explain why this placement fits tonight OR what to change. Populate swapRecommendations only for legal, high-value swaps already implied in rotation facts.",
    );
  }

  return lines.join("\n");
}

function formatSignals(signals?: Record<string, number | string>): string {
  if (!signals || Object.keys(signals).length === 0) return "(none)";
  return Object.entries(signals)
    .slice(0, 16)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function reasoningForMode(mode: PlacementInsightMode): "none" | "low" | "medium" {
  if (mode === "basics") return "none";
  if (mode === "assignee") return "low";
  return "medium";
}

function cacheKeyFor(ctx: EngineInsightContext, mode: PlacementInsightMode): string {
  return stableInsightKey({
    mode,
    slot: ctx.slotKey,
    tm: ctx.tmName,
    sig: ctx.contextSig,
    rot: ctx.rotationBrief?.slice(0, 200),
    board: ctx.currentContext?.slice(0, 120),
  });
}

/** Primary analyst — structured output, medium reasoning for quality. */
export async function runPlacementPadAnalyst(
  ctx: EngineInsightContext,
): Promise<EngineInsightResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return {
      text: "xAI is not configured (missing XAI_API_KEY). Use rotation highlights and engine rationale above.",
    };
  }

  const mode: PlacementInsightMode =
    ctx.mode === "legacy" ? "deep" : (ctx.mode ?? "deep");

  if (mode === "basics" && ctx.rotationBasicsText) {
    return runPlacementBasicsNarrative({
      ...ctx,
      rotationBasicsText: ctx.rotationBasicsText,
    });
  }

  const key = cacheKeyFor(ctx, mode);
  const cached = getInsightCache<EngineInsightResult>(key);
  if (cached) {
    return { ...cached, cached: true };
  }

  const systemPrompt = buildAnalystSystemPrompt(ctx);
  const userPrompt = buildAnalystUserPrompt(ctx);
  const effort = reasoningForMode(mode);

  try {
    const model = createGrokSuggestionModel();
    const { object, usage } = await generateObject({
      model,
      schema: PlacementPadInsightSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: mode === "assignee" ? 0.25 : 0.35,
      maxTokens: mode === "assignee" ? 720 : 580,
      providerOptions: {
        xai: { reasoningEffort: effort },
      },
    });

    if (object) {
      const result: EngineInsightResult = {
        text: formatPlacementPadInsightText(object),
        structured: object,
        usage: {
          inputTokens: usage?.promptTokens,
          outputTokens: usage?.completionTokens,
          model: "grok-4.3",
          reasoningEffort: effort,
        },
      };
      setInsightCache(key, result);
      return result;
    }
  } catch (err) {
    console.warn("[placementPadAnalyst] generateObject failed, falling back to text:", err);
  }

  return runEngineInsightLegacy(ctx, effort);
}

/** Legacy prose fallback if structured generation fails. */
async function runEngineInsightLegacy(
  ctx: EngineInsightContext,
  effort: "none" | "low" | "medium",
): Promise<EngineInsightResult> {
  const systemPrompt = buildAnalystSystemPrompt(ctx);
  const userPrompt = buildAnalystUserPrompt(ctx);

  try {
    const model = createGrokSuggestionModel();
    const { text, usage } = await generateText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.35,
      maxTokens: 520,
      providerOptions: { xai: { reasoningEffort: effort } },
    });
    const trimmed = text?.trim();
    if (trimmed) {
      return {
        text: trimmed,
        usage: {
          inputTokens: usage?.promptTokens,
          outputTokens: usage?.completionTokens,
          model: "grok-4.3",
          reasoningEffort: effort,
        },
      };
    }
  } catch (err) {
    console.warn("[engineInsight] generateText failed:", err);
  }

  return {
    text: "Analyst unavailable. Rotation highlights and engine rationale above are authoritative.",
  };
}

/** @deprecated Use runPlacementPadAnalyst — kept for actions.ts import. */
export async function runEngineInsightForPlacement(
  ctx: EngineInsightContext,
): Promise<EngineInsightResult> {
  return runPlacementPadAnalyst({ ...ctx, mode: ctx.mode ?? "deep" });
}

/** Compact polish of deterministic rotation copy. */
export async function runPlacementBasicsNarrative(
  ctx: EngineInsightContext & { rotationBasicsText: string },
): Promise<EngineInsightResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return { text: ctx.rotationBasicsText };
  }

  const key = stableInsightKey({
    mode: "basics",
    slot: ctx.slotKey,
    tm: ctx.tmName,
    rot: ctx.rotationBasicsText.slice(0, 300),
  });
  const cached = getInsightCache<EngineInsightResult>(key);
  if (cached) return { ...cached, cached: true };

  const systemPrompt = `You are a GRAVE floor analyst. Rewrite rotation facts into 2 short sentences. Use ${ctx.tmName}'s name — never "you". No lists.`;
  const userPrompt = `Slot ${ctx.slotKey}, TM ${ctx.tmName}.\nFacts:\n${ctx.rotationBasicsText}`;

  try {
    const { callGrok } = await import("@/lib/xai");
    const raw = await callGrok(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "grok-4.3", reasoningEffort: "none", temperature: 0.2, maxTokens: 140 },
    );
    const result: EngineInsightResult = {
      text: raw?.trim() || ctx.rotationBasicsText,
      usage: { model: "grok-4.3", reasoningEffort: "none" },
    };
    setInsightCache(key, result);
    return result;
  } catch {
    return { text: ctx.rotationBasicsText };
  }
}