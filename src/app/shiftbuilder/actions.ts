"use server";

// Heavy xai / grokIntelligence symbols dynamically imported inside the functions below.
// This breaks the top-level static edge that was causing Turbopack "module factory is not available"
// errors when the giant ShiftBuilderClient dynamically imports this actions module.
import type {
  GrokMessage,
  GrokBoardSnapshot,
  GrokStructuredResponse,
  ReasoningEffort,
} from "@/lib/xai";

// Vercel AI SDK (Phase 3 migration) — structured output + official xAI provider
import { generateObject, generateText, tool } from "ai";
import {
  createGrokEngineModel,
  createGrokSuggestionModel,
} from "@/lib/shiftbuilder/grokClient";
import {
  GrokEngineResponseSchema,
  GrokStructuredResponseSchema,
} from "@/lib/shiftbuilder/grokSchemas";

import type { GrokReasoningEffort } from "@/lib/shiftbuilder/engineConfig";
import type { TeamMember } from "@/lib/shiftbuilder/data";
import {
  buildGrokEngineSystemPrompt,
  parseGrokEngineResponse,
  guardGrokEnginePicks,
  type GrokEngineSnapshot,
  type GrokEnginePick,
} from "@/lib/shiftbuilder/grokEngine";

import { createEngineRulesTools, EngineRules } from "@/lib/shiftbuilder/engineRules";
import { scoreAssignment, buildDefaultAdjacency } from "@/lib/shiftbuilder/scoring";

export type GrokContext = {
  type: "slot" | "person";
  slotKey?: string;
  personName?: string;
  currentAssignment?: string;
  rosterSummary?: string;
};

/**
 * Legacy text-only flow (still used as fallback / for the simple button).
 */
export async function askGrokForShiftSuggestions(context: GrokContext): Promise<string> {
  const { buildShiftBuilderSystemPrompt, callGrok } = await import("@/lib/xai");
  const systemPrompt = buildShiftBuilderSystemPrompt();

  let userPrompt = "";

  if (context.type === "slot" && context.slotKey) {
    userPrompt = `The operator just tapped slot "${context.slotKey}" in the ShiftBuilder.

Current occupant: ${context.currentAssignment || "empty"}

Give me 3 strong, practical suggestions for who should be assigned here (or why it should stay empty). 
Consider GRAVE eligibility, current coverage, and break fairness.

Be specific and actionable.`;
  } else if (context.type === "person" && context.personName) {
    userPrompt = `The operator is looking at team member "${context.personName}".

${context.currentAssignment ? `They are currently on: ${context.currentAssignment}` : "They are currently unassigned."}

Give me smart suggestions for what we should do with this person right now (best slots, break timing, swaps, etc.).`;
  } else {
    userPrompt = "Give general high-value suggestions for improving tonight's GRAVE coverage.";
  }

  const messages: GrokMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const result = await callGrok(messages, {
      model: "grok-4.3",
      reasoningEffort: "low", // fast interactive suggestions from Command Palette
      temperature: 0.6,
      maxTokens: 600,
    });

    return result;
  } catch (error) {
    console.error("Grok call failed:", error);
    return "Sorry, I couldn't reach Grok right now. Please try again in a moment.";
  }
}

// ========================================================
// NEW STRUCTURED INTELLIGENCE FLOW (the real A+B upgrade)
// ========================================================

export type RichGrokRequest = {
  snapshot: GrokBoardSnapshot;
  /** Optional natural language question or focus from the palette */
  userQuestion?: string;
  /** Roster for server-side guard validation (must be the enriched version) */
  rosterForGuard: TeamMember[];
};

/**
 * The primary new entry point for high-quality Grok assistance.
 *
 * Sends the rich authoritative snapshot (placement order, eligibility rules,
 * full current + draft state, trimmed candidate list) and requests structured
 * actions that the UI can turn into real "Add to Draft" buttons.
 *
 * Includes server-side guard that rejects illegal suggestions before the
 * operator ever sees them.
 */
export async function askGrokForStructuredSuggestions(
  request: RichGrokRequest
): Promise<{
  text: string;
  structured?: GrokStructuredResponse;
  warnings: string[];
  usedStructured: boolean;
}> {
  const { snapshot, userQuestion, rosterForGuard } = request;

  const {
    buildGrokIntelligenceSystemPrompt,
    parseGrokStructuredResponse,
    guardGrokActions,
    callGrok,
  } = await import("@/lib/xai");

  const systemPrompt = buildGrokIntelligenceSystemPrompt(snapshot);

  const focus = userQuestion
    ? `\n\nOperator focus: ${userQuestion}`
    : snapshot.selectedSlotKey
    ? `\n\nThe operator tapped slot "${snapshot.selectedSlotKey}" and wants the best legal suggestions for it.`
    : snapshot.selectedPersonName
    ? `\n\nThe operator is looking at "${snapshot.selectedPersonName}" and wants smart things to do with them right now.`
    : "\n\nGive the operator the highest-value improvements possible for tonight's GRAVE sheet.";

  const userPrompt = `Here is the complete current board snapshot and rules.

${focus}

Remember the output contract: first a single clean JSON block with "explanation" + "actions", then any extra prose.`;

  const messages: GrokMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    const model = createGrokSuggestionModel();

    // Use the official Vercel AI SDK structured output.
    // This gives us a validated, typed object instead of fragile regex parsing.
    const { object: parsed } = await generateObject({
      model,
      schema: GrokStructuredResponseSchema,
      messages,
      temperature: 0.5,
      maxTokens: 900,
      providerOptions: {
        xai: {
          reasoningEffort: "low", // fast & responsive for interactive palette use
        },
      },
    });

    let finalStructured: GrokStructuredResponse | undefined;
    let warnings: string[] = [];

    if (parsed) {
      // Run the authoritative guard (this is what would have prevented the May 21 screenshot disasters)
      const guardResult = guardGrokActions(
        parsed.actions,
        rosterForGuard,
        snapshot.currentAssignments
      );

      finalStructured = {
        explanation: parsed.explanation,
        actions: guardResult.validActions,
      };
      warnings = guardResult.warnings;
    }

    // For the `text` field (shown in the palette), return a clean JSON representation.
    // This is more reliable than the old raw model text.
    const textForUI = JSON.stringify(parsed, null, 2);

    return {
      text: textForUI,
      structured: finalStructured,
      warnings,
      usedStructured: !!finalStructured,
    };
  } catch (error) {
    console.error("Grok structured call failed:", error);
    return {
      text: "Sorry, I couldn't reach Grok right now. Please try again in a moment.",
      warnings: ["Grok call failed"],
      usedStructured: false,
    };
  }
}

// ========================================================
// GROK ENGINE — Phase 1 grok-hybrid placement
// ========================================================

export type GrokEngineRunResult = {
  picks: GrokEnginePick[];
  explanation: string;
  warnings: string[];
  usedGrok: boolean;
  rawText: string;
};

/**
 * Ask Grok to choose final picks given the deterministic Top-K ranking per
 * slot. Returns validated picks + warnings. On any failure (API error,
 * unparseable response, all picks rejected by guard), returns empty picks
 * and the caller will use the deterministic top-scorer.
 *
 * @param tools - Optional AI SDK tools (from createEngineRulesTools).
 *                When provided, Grok can actively query the live Rules Engine
 *                (eligibility, scoring, etc.) during reasoning. This is the
 *                key mechanism for "Grok uses the engine as rules".
 */
export interface GrokEngineToolContext {
  roster?: any[];
  currentDraft?: Record<string, string>;
  scoringData?: {
    skillScores?: Map<string, number>;
    slotDifficulty?: Map<string, number>;
    preferencesByTm?: Map<string, any[]>;
    pairAffinitiesByTm?: Map<string, any[]>;
    accommodationsByTm?: Map<string, any[]>;
    zoneMatrix?: Map<string, Map<string, any>>;
  };
  scheduledTmIds?: Set<string>;   // NEW for schedule tools
}

export async function askGrokEngineDraft(
  snapshot: GrokEngineSnapshot,
  options?: {
    tools?: Record<string, any>;
    /** Additional data needed to make tools actually executable with real scoring */
    toolContext?: GrokEngineToolContext;
  }
): Promise<GrokEngineRunResult> {
  const tools = options?.tools;
  const toolContext = options?.toolContext;
  const systemPrompt = buildGrokEngineSystemPrompt(snapshot);
  const userPrompt = `Here is tonight's snapshot and per-slot ranking.

Choose final picks per slot. Prefer the deterministic top candidate unless
context (notes, call-offs, recent history, pair affinity with already-placed
neighbors) suggests overriding. Output the JSON block exactly as specified
in the system prompt.`;

  const messages: GrokMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    // Effort comes live from the SUDO > Engine Config tab via the DB
    const effort = snapshot.grokReasoningEffort ?? "medium";

    const model = createGrokEngineModel();

    if (tools && Object.keys(tools).length > 0) {
      // === FULL TOOL-CALLING PATH (2026-05-30 implementation) ===
      console.log("[GrokEngine] FULL tool-calling mode enabled.");

      // Build real executable tools if we have context data
      let executableTools = tools;
      if (toolContext?.roster) {
        const safeRoster = toolContext.roster;
        const currentDraftMap = new Map(Object.entries(toolContext.currentDraft ?? {}));

        // Rebuild a real scoring context from the data the client sent
        const scoringCtx = toolContext.scoringData
          ? {
              config: snapshot as any,
              skillScores: toolContext.scoringData.skillScores ?? new Map(),
              slotDifficulty: toolContext.scoringData.slotDifficulty ?? new Map(),
              preferencesByTm: toolContext.scoringData.preferencesByTm ?? new Map(),
              pairAffinitiesByTm: toolContext.scoringData.pairAffinitiesByTm ?? new Map(),
              accommodationsByTm: toolContext.scoringData.accommodationsByTm ?? new Map(),
              currentDraft: currentDraftMap,
              adjacency: buildDefaultAdjacency(),
              zoneMatrix: toolContext.scoringData.zoneMatrix,
            }
          : ({} as any);

        const rulesForTools = new EngineRules({
          config: snapshot as any,
          scoringContext: scoringCtx,
          auxDefs: [],
          currentDraft: currentDraftMap,
          scheduledTmIds: toolContext.scheduledTmIds,
        });

        executableTools = {
          ...tools,
          checkEligibility: {
            ...tools.checkEligibility,
            execute: async ({ tmId, slotKey }: any) => {
              const tm = safeRoster.find((t: any) => t.id === tmId);
              if (!tm) return { tmId, slotKey, isEligible: false, error: "TM not found in roster" };
              return {
                tmId,
                slotKey,
                isEligible: rulesForTools.isEligible(tm, slotKey),
              };
            },
          },
          scoreCandidate: {
            ...tools.scoreCandidate,
            execute: async ({ tmId, slotKey, includeBreakdown = true }: any) => {
              const tm = safeRoster.find((t: any) => t.id === tmId);
              if (!tm) return { tmId, slotKey, error: "TM not found in roster" };

              try {
                const result = await scoreAssignment(tm, slotKey, scoringCtx);
                return {
                  tmId,
                  slotKey,
                  total: result.total,
                  excluded: result.excluded,
                  excludeReason: result.excludeReason,
                  breakdown: includeBreakdown ? result.breakdown : undefined,
                };
              } catch (e: any) {
                return { tmId, slotKey, error: e?.message || "Scoring failed" };
              }
            },
          },
          // New high-value tool: quick view of current board state for global reasoning
          getCurrentBoardState: {
            description: "Returns a compact summary of which TMs are currently assigned to which slots. Use this to understand the global board state before making new placement decisions.",
            parameters: {}, // schema optional for simple tools
            execute: async () => {
              const board: Record<string, string> = {};
              Object.entries(toolContext.currentDraft ?? {}).forEach(([slot, tmId]) => {
                board[slot] = tmId as string;
              });
              return { currentAssignments: board };
            },
          },

          // Schedule status tool (now executable with real data)
          getTMScheduleStatus: {
            ...tools.getTMScheduleStatus,
            execute: async ({ tmId }: any) => {
              return {
                tmId,
                isOnSchedule: rulesForTools.isOnSchedule(tmId),
                status: rulesForTools.getScheduleStatus(tmId),
              };
            },
          },
        };
      }

      const enhancedUserPrompt = `${userPrompt}

You have access to powerful live tools from the authoritative Rules Engine. USE THEM FREQUENTLY to make high-quality decisions:
- checkEligibility(tmId, slotKey)
- scoreCandidate(tmId, slotKey) — your most important tool for understanding trade-offs
- getCurrentBoardState() — see who's already placed where (global view)
- getTMScheduleStatus(tmId) — check if someone is on the ADP schedule tonight (very important when schedule data exists)
- getRulesSummary() — if you need to re-read the full rule system

Explore with tools before committing to picks. When ready, output ONLY the final JSON block.`;

      const result = await generateText({
        model,
        tools: executableTools,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: enhancedUserPrompt },
        ],
        temperature: 0.2,
        maxTokens: 2500,
        providerOptions: {
          xai: {
            reasoningEffort: effort,
          },
        },
      });

      const rawResponse = result.text;

      // Rich capture of tool usage for training/refinement data
      if (result.toolCalls && result.toolCalls.length > 0) {
        console.groupCollapsed(`[GrokToolUsage] ${result.toolCalls.length} tool calls made by Grok`);
        result.toolCalls.forEach((call: any, i: number) => {
          console.log(`Tool call #${i + 1}:`, call.toolName, "args:", call.args);
        });
        if (result.toolResults) {
          result.toolResults.forEach((res: any, i: number) => {
            console.log(`Tool result #${i + 1}:`, res.result);
          });
        }
        console.groupEnd();
      }

      const parsed = parseGrokEngineResponse(rawResponse);
      const guard = guardGrokEnginePicks(parsed.picks, snapshot);

      return {
        picks: guard.validPicks,
        explanation: parsed.explanation,
        warnings: guard.warnings,
        usedGrok: guard.validPicks.length > 0,
        rawText: rawResponse,
      };
    }

    // === Standard non-tool path (original behavior) ===
    const { object: parsed } = await generateObject({
      model,
      schema: GrokEngineResponseSchema,
      messages,
      temperature: 0.2,
      maxTokens: 1500,
      providerOptions: {
        xai: {
          reasoningEffort: effort,
        },
      },
    });

    const guard = guardGrokEnginePicks(parsed.picks, snapshot);
    const rawTextForDebug = JSON.stringify(parsed, null, 2);

    return {
      picks: guard.validPicks,
      explanation: parsed.explanation,
      warnings: guard.warnings,
      usedGrok: guard.validPicks.length > 0,
      rawText: rawTextForDebug,
    };
  } catch (err) {
    console.error("[actions] askGrokEngineDraft failed:", err);
    return {
      picks: [],
      explanation: "",
      warnings: [`Grok engine call failed: ${err instanceof Error ? err.message : String(err)}`],
      usedGrok: false,
      rawText: "",
    };
  }
}

/**
 * Retrospective engine insight for the placement pad ("Deeper insight").
 * Low reasoning effort + compact prompt for interactive use on iPad.
 */
export async function getEngineInsightForPlacement(
  ctx: import("@/lib/shiftbuilder/engineInsightForPlacement").EngineInsightContext,
): Promise<import("@/lib/shiftbuilder/engineInsightForPlacement").EngineInsightResult> {
  const { runEngineInsightForPlacement } = await import(
    "@/lib/shiftbuilder/engineInsightForPlacement"
  );
  return runEngineInsightForPlacement(ctx);
}
