/**
 * Placement pad analyst — high-quality Grok 4.3 structured insights.
 * Server-only; called from /api/shiftbuilder/engine-insight.
 */

import { generateObject, generateText } from "ai";
import { createGrokSuggestionModel } from "@/lib/shiftbuilder/grokClient";
import { getPlacementOrderText, getEligibilityRulesText } from "@/lib/shiftbuilder/placement";
import {
  getXaiFillOrderHardRules,
  getXaiSwapHardRules,
  formatFillOrderBoardContext,
  sanitizePlacementPadInsight,
} from "@/lib/shiftbuilder/xaiFillOrderContract";
import {
  PlacementPadInsightSchema,
  MagicOneLinerSchema,
  formatPlacementPadInsightText,
  type PlacementPadInsight,
  type MagicOneLiner,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  getInsightCache,
  setInsightCache,
  stableInsightKey,
} from "@/lib/shiftbuilder/engineInsightCache";

export type PlacementInsightMode = "auto" | "deep" | "assignee" | "basics" | "legacy" | "light" | "headline";

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
  /** Slot keys with a TM assigned tonight — drives fill-order guard context. */
  filledSlotKeys?: string[];
  /** Slot keys on the board with no TM — swap into these is forbidden. */
  emptySlotKeys?: string[];
  /** Instant prerender from placementFitScore — xAI may override with verdictOverrideReason. */
  prerenderVerdict?: string;
  prerenderSummary?: string;
  prerenderFactLine?: string;

  /** Additional vast context for high-quality light/fast determination (grok-build-0.1 path).
   * These allow the 4-6 bullet synthesis to be meaningfully deeper without requiring the full 4.3 deep call.
   * Carefully selected for signal density and token efficiency.
   */
  /** Raw rotation gaps line (e.g. "Jason — not in 30 nights: Z1, Z2, Z3..."). */
  rotationGapsLine?: string;
  /** Specific bilateral swap opportunities surfaced by rotation computation. */
  rotationSwapLines?: string[];
  /** Granular exposure for the TM on this slot / tier (last7/last14/last30 etc.). */
  tmExposureDetail?: string;
  /** Notes on relevant neighbors' current exposure (to detect affinity or debt). */
  neighborExposureNotes?: string;
  /** Summary of tasks/coverage currently on the slot (affects "fit for continuity"). */
  slotTasksSummary?: string;
  /** Compact snapshot of nearby core slots' staffing status for priority/rotation context. */
  boardCoreSnapshot?: string;
  /** Current break group for the slot (affects continuity and task fit in the determination). */
  currentBreakGroup?: number | string;
  /** Whether the slot currently has coverage tasks (relevant for swap/continuity reasoning). */
  hasCoverageTasks?: string;

  /** Board and week context for richer light/fast determination.
   * Compact but dense view of the entire current artboard placements + this week's rotation health/patterns.
   * Allows the fast model to synthesize bullets that consider global board balance and weekly spread,
   * not just the local slot (as requested for "board and week context").
   */
  boardAndWeekContext?: string;

  /** When true, run the week-level rotation health advisor flow (prescriptive moves to raise weeklyBalance).
   *  The response is a focused analysis + list of recommended (from → to) changes across the week plan,
   *  with reasons tied directly to reducing the repeat violations that are pulling the health % down.
   *  UI surfaces (health pill, WEEK BUILDER toolbar, viol lists in pad/overview) trigger this.
   */
  weekAdvisor?: boolean;
  /** Snapshot of rotation health at advisor request time (for the prompt to know the current score + penalty). */
  rotationHealthSnapshot?: {
    percent?: number | null;
    weeklyBalance?: number;
    maxWeeklyRepeat?: number;
    repeatViolations?: number;
    xaiRepeatPenaltyReduction?: number;
  };
  /** The concrete violations (tm+slot with count>1 this week) that the advisor should target for fixes. */
  violations?: Array<{
    tmId: string;
    slotKey: string;
    count: number;
    nights: string[];
    severity: number;
    hasXaiSignal?: boolean;
    /** Human display name for this TM (e.g. "Sheri O"). When present, the advisor output MUST use this instead of the tmId. */
    tmName?: string;
  }>;
  /** Compact summary of the week plan (e.g. per-day zone loads or the repeat map) for global reasoning. */
  weekPlanSummary?: string;
  /** Optional focus for the advisor (only consider moves involving this TM or this slotKey). */
  focusTmId?: string;
  focusSlotKey?: string;

  /** tmId → display name map. The week advisor is required to use friendly names (Jared, Sheri O, Kaiden, Mike S, etc.)
   *  everywhere in the output. Using raw "tm_xxx" ids violates the naming rules for all operator surfaces.
   */
  tmNames?: Record<string, string>;
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
Swaps: Bilateral only (both slots occupied). Zone↔zone or RR↔RR gender match — never Admin, overlap, empty targets, or restroom↔zone.

EXAMPLE (Z3, assigned — FORBIDDEN pattern):
WRONG: "Move Chris from MRR6 to Z3 for rotation." RIGHT: "Chris stays on MRR6; assign a different grave TM to Z3 if open."

EXAMPLE (Z4 unassigned):
Headline: Staff Z4 after restrooms — best pick is Jamie.
Why: Slot empty; rank Jamie first (0× Z4 in 30, eligible full-grave). swapRecommendations: [].

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
        ? "Focus on full-grave zone continuity, neighbor affinity on the artboard, and rotation vs count_8w tradeoffs. NEVER pull someone off MRR/WRR onto this zone — assign unassigned grave TMs instead."
        : kind === "aux"
          ? "Focus on full-night aux coverage, sweep/load, and who is already committed on zones/RR."
          : "Respect eligibility; do not recommend overlap or admin swaps.";

  const hardRules = getXaiFillOrderHardRules();

  return `You are the GRAVE placement analyst for a single expert operator (Brian). Your job is decisive, floor-ready judgment — not generic advice.

VOICE: 3–5 tight sentences in whyTonight; headline is one crisp line. Name people and slots. Never say "you". Never re-list the full fill order verbatim.

FILL ORDER (CONSTITUTION — overrides rotation, affinity, and convenience):
${hardRules}

${getXaiSwapHardRules()}

AUTHORITY: The DETERMINISTIC FACTS block below is ground truth from the engine and history. Use fairnessSignals and engine rationale when present. If rotationBrief lists swap lanes, refine them — do not invent ineligible swaps (no Admin, no Overlap OL-*, no cross-gender RR, no swap into empty slots, no restroom↔zone moves). NEVER recommend staffing a lower-priority core slot while higher-priority core slots in the JSON order remain empty.

${kindFocus}

OUTPUT: Structured JSON only (schema enforced). REQUIRED: fitSummary (one plain sentence) and fitVerdict (strong_fit | acceptable | questionable | poor_fit | needs_swap).

INSTANT PRERENDER: When PRERENDER block is present, treat it as the default verdict. You MAY change fitVerdict/fitSummary only if deterministic facts clearly support a different judgment — then set verdictOverrideReason (one short sentence). Questionable only when a bilateral swap with an OCCUPIED peer slot improves rotation health net-wide — never cite an empty/unassigned slot as a "better rotation" or move target. Do NOT suggest rotation with a TM who is strong_fit or acceptable on their slot, or where the trade would make them questionable/poor_fit. needs_swap only for bilateral lanes where both slots have a TM tonight. Repeat exposure (2×+ in 30, or in last-5 trail) alone is acceptable if no better swap lane — use strong_fit for 0–1× spread and not in last-5. Unassigned slots: fitSummary may name one best assignee; swapRecommendations MUST be []. Z1/Z2 are manual-only when open.

REFERENCE CONTRACT (do not paste back verbatim):
${orderText}

${eligText}
${priorGood}
${STATIC_FEW_SHOTS}`;
}

/** Ultra-focused system prompt for the *light/fast* magic one-liner determination (grok-build-0.1).
 * Job: produce (1) one crisp magic headline + (2) a tight 4-6 bullet list that synthesizes the key
 * actionable points for the operator right now.
 *
 * The bullets REPLACE the old separate "instant", "quick determination", and raw rotation list.
 * They must feel like a smart, fresh xAI synthesis — not a copy of the prerender text.
 * Use the full facts (especially rotationBrief, spread, history, neighbors, exposure counts) to create
 * specific, named, useful bullets the operator can act on.
 *
 * Designed for grok fast / build-0.1 with effort=none. Very low token budget.
 */
function buildLightHeadlineSystemPrompt(ctx: EngineInsightContext): string {
  const kind = slotKind(ctx.slotKey);
  const orderText = getPlacementOrderText();
  const eligText = getEligibilityRulesText();
  const hardRules = getXaiFillOrderHardRules();

  const kindFocus =
    kind === "rr"
      ? "Restroom chain order, gender rules, paired coverage with adjacent RR."
      : kind === "zone"
        ? "Zone continuity, neighbor affinity on the board, rotation health vs recent exposure."
        : kind === "aux"
          ? "Aux/sweep/load coverage and what else the TM is already committed to tonight."
          : "Eligibility and strict fill-order priority.";

  return `You are the GRAVE placement analyst running in LIGHT/FAST mode (grok-build-0.1). 
Your job is to give the operator an *immediate, high-signal, self-contained determination* for this single placement using the *vast* context provided. This light output (headline + bullets) **is the only insight the operator sees** when they open the pad in builder mode. It must be complete and trustworthy on its own.

OUTPUT (JSON only):
- "headline": one crisp, decisive, floor-ready sentence (the magic one-liner). Name the exact person and slot. Make it specific and opinionated.
- "bullets": **You must output between 4 and 6 bullets** (never fewer than 4). Each 8-110 chars, concrete, named, and useful.
  Synthesize across *every piece* of the vast context: rotationGapsLine, rotationSwapLines, tmExposureDetail, neighborExposureNotes, slotTasksSummary, boardCoreSnapshot, currentBreakGroup, hasCoverageTasks, boardAndWeekContext (the big one for global board state + weekly patterns), spreadPlaced/Gaps, slotSpecificHistory, recentPlacements, fairnessSignals, prerender baseline, fillOrder position, and TM attributes.
  **Bullet diversity is mandatory** — when the data supports it, cover these angles (mix them), and actively use the boardAndWeekContext for global board + weekly perspective:
    1. Freshness/exposure for this exact TM on this exact slot (use the granular counts)
    2. Specific bilateral swap lane with real names + why it is fair/balancing right now (consider weekly gaps)
    3. Impact on the partner person's rotation debt or spread load (board/week view)
    4. Effect on tier spread gaps or overall board continuity this week
    5. How the current actual tasks on the slot interact with the placement
    6. Neighbor or adjacent slot pressure, or how this helps/hurts broader weekly rotation health across the board (from boardAndWeekContext)
  Every bullet must deliver *new, specific, actionable* information. Do not repeat the headline. Never mention "full view", "see more", or hedge.

STRICT RULES (never violate):
${hardRules}
${getXaiSwapHardRules()}

CONTEXT FOCUS: ${kindFocus}
The INSTANT PRERENDER is just one weak baseline. 
**BOARDANDWEEKCONTEXT IS THE PRIMARY SIGNAL YOU MUST USE FOR EVERY BULLET** (it contains the full current artboard placements with week exposure counts + this week's gaps + key swap lanes + under-used slots + board fill this night). 
Your bullets must explicitly show you read and used the boardAndWeekContext — e.g. reference specific other slots' status this week, how the swap or placement helps close global gaps on the tier, or how it balances load across the current board. Do not ignore it or give local-only bullets.

VOICE: Decisive, specific, floor-operator tone. Use real names and exact slot codes (Z4, WRR3, etc.). Short. No hedging. No generic language. Every word must be earned.

REFERENCE CONTRACT (grounding only — never copy phrases):
${orderText}
${eligText}

EXCELLENT LIGHT OUTPUT EXAMPLE (5 bullets, using the vast context heavily, including boardAndWeekContext):
Headline: "Swap Kaylee (Z4) with Sheri O (Z5) for fairer rotation."
Bullets:
- "Kaylee has 0× on Z4 in the last 14 nights — extremely fresh for this slot"
- "Sheri O has 4× on Z5 this spread but 0× on Z4; textbook bilateral reset per the raw gaps and weekly board state"
- "Z5 has carried heavy recent load for Sheri O — this swap directly improves her rotation debt (helps week gaps on Z5 tier)"
- "Current tasks on Z4 (Sweeper + Lobby) align cleanly with Sheri O's recent patterns; low friction"
- "No open gaps on the tier per boardAndWeekContext; the swap improves continuity for both without touching higher-priority core slots this week"

BAD OUTPUT (avoid at all costs):
- Fewer than 4 bullets.
- Any bullet that defers to "full view" or "see more" (use Expand Matrix in the UI for the spread/last-5 details instead).
- Copying the prerender text as a bullet.
- Vague bullets ("helps rotation", "good fit").
- Ignoring the actual current tasks or the specific numbers in neighborExposureNotes / tmExposureDetail.`;


}

function assignmentsFromFilledKeys(
  filledSlotKeys?: string[],
): Record<string, { tmId: string }> {
  const map: Record<string, { tmId: string }> = {};
  for (const key of filledSlotKeys ?? []) {
    if (key) map[key] = { tmId: "assigned" };
  }
  return map;
}

function buildAnalystUserPrompt(ctx: EngineInsightContext): string {
  const mode = ctx.mode ?? "deep";
  const boardAssignments = assignmentsFromFilledKeys(ctx.filledSlotKeys);
  const fillOrderCtx = formatFillOrderBoardContext(ctx.slotKey, boardAssignments);

  const lines: string[] = [
    `MODE: ${mode}`,
    `Slot: ${ctx.slotKey}`,
    fillOrderCtx,
    ctx.isRR ? `RR side: ${ctx.rrSide ?? "n/a"}` : null,
    `Assigned TM: ${ctx.tmName || "(unassigned)"}`,
    ctx.emptySlotKeys?.length
      ? `Empty slots tonight (assign only — never swap into): ${ctx.emptySlotKeys.slice(0, 24).join(", ")}`
      : null,
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
      "Explain why this placement fits tonight OR what to change. swapRecommendations: bilateral swaps only (both slots occupied); never swap into empty slots listed above.",
    );
  }

  return lines.join("\n");
}

/** Slimmer user prompt for the light/fast determination.
 * Still delivers the high-value graves + rotation + spread + neighbor facts,
 * but presents the prerender as "baseline reference" rather than the thing to echo.
 * Keeps token count reasonable for grok-build-0.1.
 */
function buildLightUserPrompt(ctx: EngineInsightContext): string {
  const boardAssignments = assignmentsFromFilledKeys(ctx.filledSlotKeys);
  const fillOrderCtx = formatFillOrderBoardContext(ctx.slotKey, boardAssignments);

  const lines: string[] = [
    `Slot: ${ctx.slotKey}  |  TM: ${ctx.tmName || "(unassigned)"}`,
    ctx.isRR ? `RR side: ${ctx.rrSide ?? "n/a"}` : null,
    fillOrderCtx,
    ctx.emptySlotKeys?.length
      ? `Empty slots tonight (never swap into these): ${ctx.emptySlotKeys.slice(0, 20).join(", ")}`
      : null,
    "",
    "DETERMINISTIC FACTS (vast context — synthesize your own determination from *all* of this):",
    ctx.rotationBrief ? `Rotation brief:\n${ctx.rotationBrief}` : null,
    ctx.rotationGapsLine ? `Rotation gaps: ${ctx.rotationGapsLine}` : null,
    ctx.rotationSwapLines?.length ? `Specific swap lanes: ${ctx.rotationSwapLines.join(" | ")}` : null,
    ctx.spreadPlaced ? `Placed last-30: ${ctx.spreadPlaced}` : null,
    ctx.spreadGaps ? `Gaps last-30: ${ctx.spreadGaps}` : null,
    ctx.slotSpecificHistory ? `Slot history: ${ctx.slotSpecificHistory}` : null,
    ctx.recentPlacements ? `Last-5 trail: ${ctx.recentPlacements}` : null,
    ctx.tmExposureDetail ? `TM exposure on this: ${ctx.tmExposureDetail}` : null,
    ctx.neighborExposureNotes ? `Neighbor exposures: ${ctx.neighborExposureNotes}` : null,
    ctx.currentContext ? `Board neighbors: ${ctx.currentContext}` : null,
    ctx.slotTasksSummary ? `Tasks on slot now: ${ctx.slotTasksSummary}` : null,
    ctx.boardCoreSnapshot ? `Core board snapshot: ${ctx.boardCoreSnapshot}` : null,
    ctx.currentBreakGroup != null ? `Current break group for slot: ${ctx.currentBreakGroup}` : null,
    ctx.hasCoverageTasks ? `Slot currently has coverage tasks: ${ctx.hasCoverageTasks}` : null,
    ctx.boardAndWeekContext ? `BOARD AND WEEK CONTEXT (full artboard + this week's rotation health):\n${ctx.boardAndWeekContext}` : null,
    ctx.tmAttributes
      ? `TM attrs: gender=${ctx.tmAttributes.gender ?? "?"} grave=${ctx.tmAttributes.gravePool ?? "?"} AM=${!!ctx.tmAttributes.isAMOverlap} PM=${!!ctx.tmAttributes.isPMOverlap}`
      : null,
    ctx.rationale ? `Engine rationale: ${ctx.rationale}` : null,
    `Fairness: ${formatSignals(ctx.fairnessSignals)}`,
    "",
    "INSTANT PRERENDER (one baseline data point only — reframe or add emphasis using the vast facts above):",
    ctx.prerenderVerdict ? `verdict: ${ctx.prerenderVerdict}` : null,
    ctx.prerenderSummary ? `summary: ${ctx.prerenderSummary}` : null,
    ctx.prerenderFactLine ? `fact: ${ctx.prerenderFactLine}` : null,
    "",
    "CRITICAL INSTRUCTION FOR THIS LIGHT CALL: Produce exactly 1 headline + between 4 and 6 bullets. You are *required* to deliver at least 4 (expand using the vast facts if needed: granular exposure, neighbor loads, specific swap impact from the raw lines, task synergy on the slot, rotation debt on related slots, **and especially the boardAndWeekContext for how this placement fits the full current board state and this week's overall rotation health and gaps across the artboard**). Never output fewer than 4. Never hedge or defer to 'full view'. Make every bullet concrete, named, and from the data provided.",
  ].filter(Boolean) as string[];

  return lines.join("\n");
}

function formatSignals(signals?: Record<string, number | string>): string {
  if (!signals || Object.keys(signals).length === 0) return "(none)";
  return Object.entries(signals)
    .slice(0, 16)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
}

function reasoningForMode(mode: PlacementInsightMode): "none" | "low" | "medium" | "high" {
  if (mode === "basics" || mode === "light" || mode === "headline") return "none";
  if (mode === "assignee") return "low";
  if (mode === "deep") return "high"; // powerful deliberate per single-user caveat; high effort for deep analysis/insights (Grok 4.3 thinks hard on vast board+week+graves context + fill-order constitution)
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
    guard: "v3-cross-tier",
  });
}

function guardInsightResult(
  insight: PlacementPadInsight,
  ctx: EngineInsightContext,
): PlacementPadInsight {
  const boardAssignments = assignmentsFromFilledKeys(ctx.filledSlotKeys);
  const slotUnassigned =
    !ctx.tmName || ctx.tmName === "Unassigned" || !boardAssignments[ctx.slotKey];
  return sanitizePlacementPadInsight(insight, ctx.slotKey, boardAssignments, {
    emptySlotKeys: ctx.emptySlotKeys,
    slotUnassigned,
  }).insight;
}

/** Primary analyst — structured output (deep/assignee use grok-4.3 high; light/headline use grok-build-0.1 fast for the magic one-liner determination). */
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

  // Week-level rotation health advisor: "what could be moved where and why to make the wk % / overall health higher".
  // Triggered from health pill, WEEK BUILDER xAI scan, viol rows in WeeklyOverview/Pad, etc.
  // Produces prescriptive, named suggestions rather than a single-slot headline+bullets.
  if (ctx.weekAdvisor) {
    return runWeekRotationAdvisor(ctx);
  }

  if (mode === "light" || mode === "headline") {
    return runMagicOneLinerDetermination(ctx);
  }

  const key = cacheKeyFor(ctx, mode);
  const cached = getInsightCache<EngineInsightResult>(key);
  if (cached?.structured) {
    const guarded = guardInsightResult(cached.structured, ctx);
    return {
      ...cached,
      structured: guarded,
      text: formatPlacementPadInsightText(guarded),
      cached: true,
    };
  }
  if (cached) {
    return { ...cached, cached: true };
  }

  const systemPrompt = buildAnalystSystemPrompt(ctx);
  const userPrompt = buildAnalystUserPrompt(ctx);
  const effort = reasoningForMode(mode);

  console.log(`[xai-engine] deep grok-4.3 ${effort} for ${ctx.slotKey} (mode=${mode}) contextSig=${ctx.contextSig?.slice(0,16)}`);

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
      const boardAssignments = assignmentsFromFilledKeys(ctx.filledSlotKeys);
      const slotUnassigned =
        !ctx.tmName || ctx.tmName === "Unassigned" || !boardAssignments[ctx.slotKey];
      const { insight: sanitized, stripped } = sanitizePlacementPadInsight(
        object,
        ctx.slotKey,
        boardAssignments,
        {
          emptySlotKeys: ctx.emptySlotKeys,
          slotUnassigned,
        },
      );
      if (stripped.length > 0) {
        console.warn(
          `[placementPadAnalyst] guard stripped ${stripped.length} illegal swap line(s) for ${ctx.slotKey}`,
        );
      }
      const result: EngineInsightResult = {
        text: formatPlacementPadInsightText(sanitized),
        structured: sanitized,
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
  effort: "none" | "low" | "medium" | "high",
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
    // Utilize grok-build-0.1 for cheap basics (relatively cheap per user), grok-4.3 for powerful deep analyst
    const { createGrokBuildModel } = await import("@/lib/shiftbuilder/grokClient");
    const model = createGrokBuildModel();
    const { text: raw, usage } = await generateText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 140,
      providerOptions: { xai: { reasoningEffort: "none" } },
    });
    const result: EngineInsightResult = {
      text: raw?.trim() || ctx.rotationBasicsText,
      usage: { model: "grok-build-0.1", reasoningEffort: "none", inputTokens: usage?.promptTokens, outputTokens: usage?.completionTokens },
    };
    setInsightCache(key, result);
    return result;
  } catch {
    return { text: ctx.rotationBasicsText };
  }
}

/** Light / fast magic one-liner determination (the "headline").
 * Uses grok-build-0.1 ("grok fast", cheap, none effort) for quick crisp verdict.
 * Goal: surface a high-quality magic one-liner *immediately* in the digital builder
 * (corner ✧ chip + under-name ink annotation) as soon as the unilateral pad is opened,
 * without consuming a full grok-4.3 high deep call (reserved for explicit "More details").
 * Still fully graves-aware, respects xaiFillOrderContract + prerender + hard rules.
 * The resulting headline can be overridden later by a deep 4.3 call.
 * Returns a partial structured (headline + optional verdict/summary) that lifts via onXaiFit.
 */
export async function runMagicOneLinerDetermination(
  ctx: EngineInsightContext,
): Promise<EngineInsightResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    // Graceful: fall back to prerender summary if no key (keeps builder surfaces alive)
    const fallback = ctx.prerenderSummary || "Use rotation + engine rationale.";
    return {
      text: fallback,
      structured: { headline: ctx.prerenderSummary || fallback, fitVerdict: (ctx.prerenderVerdict as any) || "acceptable" } as any,
    };
  }

  const mode: PlacementInsightMode = "headline";
  const key = cacheKeyFor({ ...ctx, mode }, mode); // reuses stable key with mode=headline
  const cached = getInsightCache<EngineInsightResult>(key);
  if (cached) {
    // For light path we return the cached headline directly (guard was applied at write time).
    return { ...cached, cached: true };
  }

  const systemPrompt = buildLightHeadlineSystemPrompt(ctx);
  // Use a focused light user prompt: give the rich facts but do not lead with the prerender sentence as the "answer".
  const userPrompt = buildLightUserPrompt(ctx);

  console.log(`[xai-engine] light grok-build-0.1 (none) for ${ctx.slotKey} (auto magic one-liner) contextSig=${ctx.contextSig?.slice(0,16)}`);

  try {
    // Dynamic import to keep the "grok fast" path lazy (mirrors the basics narrative pattern)
    const { createGrokBuildModel } = await import("@/lib/shiftbuilder/grokClient");
    const model = createGrokBuildModel();

    const { object, usage } = await generateObject({
      model,
      schema: MagicOneLinerSchema,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 256, // more room — the fast model needs headroom to output a good headline + 4-6 varied bullets that actually use the full boardAndWeekContext instead of falling back to 2 weak lines
      providerOptions: {
        xai: { reasoningEffort: "none" },
      },
    });

    if (object?.headline) {
      const boardAssignments = assignmentsFromFilledKeys(ctx.filledSlotKeys);

      // Map light result (now with bullets) into the shape the UI and lift expect.
      const lightStructured: any = {
        headline: object.headline.trim(),
        fitVerdict: (object.fitVerdict as any) || (ctx.prerenderVerdict as any) || "acceptable",
        fitSummary: object.fitSummary || ctx.prerenderSummary || object.headline.trim(),
        bullets: Array.isArray(object.bullets) ? object.bullets.slice(0, 6) : undefined,
        whyTonight: "",
        swapRecommendations: [],
        watchouts: [],
      };

      // Apply the same hard guards.
      const { insight: sanitized } = sanitizePlacementPadInsight(
        lightStructured,
        ctx.slotKey,
        boardAssignments,
        {
          emptySlotKeys: ctx.emptySlotKeys,
          slotUnassigned: !ctx.tmName || ctx.tmName === "Unassigned" || !boardAssignments[ctx.slotKey],
        },
      );

      const result: EngineInsightResult = {
        text: sanitized.headline || object.headline,
        structured: {
          headline: sanitized.headline,
          fitVerdict: sanitized.fitVerdict,
          fitSummary: sanitized.fitSummary,
          bullets: (sanitized as any).bullets || object.bullets,
        } as any,
        usage: {
          inputTokens: usage?.promptTokens,
          outputTokens: usage?.completionTokens,
          model: "grok-build-0.1",
          reasoningEffort: "none",
        },
      };
      setInsightCache(key, result);
      return result;
    }
  } catch (err) {
    console.warn("[magicOneLiner] light determination failed, falling back to prerender:", err);
  }

  // Fallback: synthesize from prerender (instant, free, graves-based) so the builder always has *something* good.
  const fbHeadline = ctx.prerenderSummary || `${ctx.tmName || "TM"} on ${ctx.slotKey} per rotation.`;
  const fbBullets = [
    ctx.prerenderFactLine || ctx.prerenderSummary || "Baseline from rotation engine.",
    "Use Expand Matrix below for last 30 spread + last 5.",
  ].filter(Boolean).slice(0, 4);

  return {
    text: fbHeadline,
    structured: {
      headline: fbHeadline,
      fitVerdict: (ctx.prerenderVerdict as any) || "acceptable",
      fitSummary: ctx.prerenderSummary,
      bullets: fbBullets,
    } as any,
    usage: { model: "fallback-prerender", reasoningEffort: "none" },
  };
}

/** Week rotation health advisor — prescriptive "what to move where + why" to raise the weeklyBalance / blended health %.
 *  Triggered when the operator wants actionable fixes for the repeat violations that are costing points in the "wk" component.
 *  Uses the violations list + health snapshot + (optional) compact week plan summary to produce a short list of
 *  concrete moves the operator can evaluate (and then execute via the normal assign/day-jump/pad flows).
 *  The prompt is deliberately different from per-slot analyst: it thinks globally across the 7-day plan.
 */
export async function runWeekRotationAdvisor(
  ctx: EngineInsightContext,
): Promise<EngineInsightResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    // Graceful local-only response using any pre-computed local suggestions the caller may have injected via weekPlanSummary or text.
    const v = ctx.violations || [];
    const snap = ctx.rotationHealthSnapshot;
    const tmNames = ctx.tmNames || {};
    const base = v.length
      ? `Week has ${v.length} repeat violation${v.length === 1 ? "" : "s"} (max ${snap?.maxWeeklyRepeat ?? "?"}×). ` +
        `Focus on: ${v.slice(0, 3).map((vv) => {
          const d = (vv as any).tmName || tmNames[vv.tmId] || vv.tmId;
          return `${d} on ${vv.slotKey} (${vv.count}×)`;
        }).join("; ")}. ` +
        `Target: reduce max repeat to 1 to lift weekly balance toward 100 (currently ${snap?.weeklyBalance ?? "—"}).`
      : "No week repeat violations detected in the provided data.";
    return { text: base, cached: false };
  }

  const v = ctx.violations || [];
  const snap = ctx.rotationHealthSnapshot || {};
  const focus = ctx.focusTmId || ctx.focusSlotKey ? `Focus area: ${ctx.focusTmId ? `TM ${ctx.focusTmId}` : ""}${ctx.focusSlotKey ? ` slot ${ctx.focusSlotKey}` : ""}. ` : "";

  const tmNames = ctx.tmNames || {};
  const violText = v.length
    ? v.map((vv, i) => {
        const display = (vv as any).tmName || tmNames[vv.tmId] || vv.tmId;
        return `${i + 1}. ${display} ×${vv.count} on ${vv.slotKey} (id: ${vv.tmId}; nights: ${vv.nights?.join(",") || "—"}; severity ${vv.severity}${vv.hasXaiSignal ? " [xAI justified some coverage]" : ""})`;
      }).join("\n")
    : "None reported (weeklyBalance should be high).";

  const planSummary = ctx.weekPlanSummary ? `\nWEEK PLAN / LOAD SNAPSHOT:\n${ctx.weekPlanSummary}\n` : "";

  const healthLine = `Current blended health: ${snap.percent ?? "—"}% (weeklyBalance component: ${snap.weeklyBalance ?? "—"}%; max repeat ${snap.maxWeeklyRepeat ?? 0}; violations ${snap.repeatViolations ?? 0}; xAI penalty reduction ${snap.xaiRepeatPenaltyReduction ?? 0}pt).`;

  const system = `You are a senior GRAVE shift planner and rotation coach for one expert operator.
Your job is to propose the smallest number of high-leverage re-assignments (or bilateral swaps) across the current 7-day grave week plan that will reduce or eliminate repeat violations (same TM in same area/slot >1× per grave week) and therefore raise the weeklyBalance and overall rotation health %.
STRICT NAMING RULE (non-negotiable — this has been escalated multiple times):
- ALWAYS use the person's actual display / human name (e.g. "Sheri O", "Jared", "Kaiden", "Mike S", "Silvia", "Jamie").
- The violations list below includes a friendly name before the (id: ...) for every entry. Use that name.
- NEVER output raw internal identifiers like "tm_missy", "tm_becca", "tm_christina", "tm_sheri_o" etc. in the final text the operator sees. This directly violates the established naming rules for every operator-facing surface in the system (cards, weekly overview, pad, health, matrix, etc.).
- The (id: tm_xxx) is provided only as a disambiguation key if two people have similar names; do not surface it in the suggestions.
- Only ever use or target proper deployment slots for which shouldShowPlacementFitChip(slot) is true: the main Z1-Z9SR zones, the MRR/WRR restroom chain (gender rules apply), and valid board aux. 
- NEVER suggest, reference as source, or target Admin (ADM, ADMIN, AUX_ADMIN or any admin), Overlaps (OL-*, overlap_am, overlap_pm, or any overlap), or physical RR host slots. The input violations have already been filtered to exclude them; do not invent any involving them. This is a hard rule for week rotation fixes.

Other rules:
- Prefer minimal changes: first try to give a repeated TM a fresh slot on one of the nights they are currently repeating (different day or different peer slot in family).
- Respect hard constraints you are given (eligibility is assumed handled by caller data; do not invent cross-gender RR, admin, or overlap moves). Overlaps (OL-*) and Admin slots are never valid targets or sources for these rotation health improvement suggestions.
- For each suggestion give: the exact "from" (TM + slot + one specific night), the "to" (target slot, and if a swap, the partner TM), and a one-sentence why it improves the week numbers (e.g. "creates a gap for TM on Z1; partner gets needed Z4 exposure; coverage on both nights preserved").
- If xAI signals already forgave a placement, note it but still prefer to relieve the repeat if a clean move exists.
- Output 1–4 concrete suggestions max. Lead with a 1-line summary of expected health lift (e.g. "Two moves would bring max repeat to 1 and lift weekly balance ~20–25 pts").
- Be decisive and floor-actionable; no hedging, no generic "consider rotation".`;

  const user = `WEEK ROTATION HEALTH ADVISOR REQUEST
${healthLine}
${focus}
VIOLATIONS DRIVING THE PENALTY (these are the (TM, slot) pairs with count>1 this grave week):
${violText}
${planSummary}
Use the human display names shown above (before the (id: ...)). Do not use tm_ ids in your response.
Produce the prescriptive move list now. Keep it short, specific, and directly tied to reducing the listed violations.`;

  try {
    const { createGrokSuggestionModel } = await import("@/lib/shiftbuilder/grokClient");
    const model = createGrokSuggestionModel();
    const { text: raw, usage } = await generateText({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.25,
      maxTokens: 420,
      providerOptions: { xai: { reasoningEffort: "medium" } },
    });

    const cleaned = (raw || "").trim();
    const result: EngineInsightResult = {
      text: cleaned || "No high-confidence rotation moves surfaced from the current week data.",
      usage: {
        inputTokens: usage?.promptTokens,
        outputTokens: usage?.completionTokens,
        model: "grok-4.3",
        reasoningEffort: "medium",
      },
      cached: false,
    };
    // Cache lightly by a sig of the violation shape + health numbers.
    try {
      const { setInsightCache, stableInsightKey } = await import("@/lib/shiftbuilder/engineInsightCache");
      const key = stableInsightKey({
        mode: "week-advisor",
        v: String(v.length),
        maxR: String(snap.maxWeeklyRepeat ?? ""),
        bal: String(snap.weeklyBalance ?? ""),
      });
      setInsightCache(key, result);
    } catch {}
    return result;
  } catch (err: any) {
    console.warn("[weekRotationAdvisor] xAI call failed, returning deterministic summary:", err?.message || err);
    const tmNames = ctx.tmNames || {};
    const top = v[0];
    const topDisplay = top ? ((top as any).tmName || tmNames[top.tmId] || top.tmId) : "";
    const fallback = v.length
      ? `Week advisor unavailable right now. ${v.length} violation${v.length > 1 ? "s" : ""} (max ${snap.maxWeeklyRepeat ?? "?"}×) are costing points in weeklyBalance (${snap.weeklyBalance ?? "—"}%). Use the local suggestions in the health pill / pad matrix, or the WEEK BUILDER table to inspect repeats and hand-edit. Top viol: ${topDisplay} on ${top?.slotKey} (${top?.count}×).`
      : "Week advisor: no violations in the snapshot.";
    return { text: fallback };
  }
}