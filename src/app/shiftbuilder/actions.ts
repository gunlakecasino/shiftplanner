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

import type { EngineConfig, GrokReasoningEffort } from "@/lib/shiftbuilder/engineConfig";
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
    console.log(`[xai] grok-4.3 medium (shift suggestions legacy path)`);
    const grokRes = await callGrok(messages, {
      model: "grok-4.3",
      reasoningEffort: "medium", // decently hard thinking even for interactive suggestions
      temperature: 0.6,
      maxTokens: 600,
    });

    // Legacy path returns string only (archive caller). Real usage tracking is on active structured + engine + pad paths.
    return grokRes.content;
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
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    reasoningEffort?: string;
  };
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
    // Bump to medium for decently hard thinking (still interactive); high reserved for explicit deep pad analyst.
    console.log(`[xai] grok-4.3 medium (structured suggestions) for command/board grok`);
    const { object: parsed, usage } = await generateObject({
      model,
      schema: GrokStructuredResponseSchema,
      messages,
      temperature: 0.5,
      maxTokens: 900,
      providerOptions: {
        xai: {
          reasoningEffort: "medium",
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
      usage: usage
        ? {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            model: "grok-4.3",
            reasoningEffort: "medium",
          }
        : undefined,
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
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    reasoningEffort?: string;
  };
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
  auxDefs?: import("@/lib/shiftbuilder/placement").AuxDef[];
  currentDraft?: Record<string, string>;
  scoringData?: {
    skillScores?: Map<string, number>;
    slotDifficulty?: Map<string, number>;
    preferencesByTm?: Map<string, any[]>;
    pairAffinitiesByTm?: Map<string, any[]>;
    accommodationsByTm?: Map<string, any[]>;
    zoneMatrix?: Map<string, Map<string, any>>;
  };
  scheduledTmIds?: Set<string>;
  engineConfig?: EngineConfig;
}

export async function askGrokEngineDraft(
  snapshot: GrokEngineSnapshot,
  options?: {
    tools?: Record<string, any>;
    /** Additional data needed to make tools actually executable with real scoring */
    toolContext?: GrokEngineToolContext;
    /** When true (default if toolContext.roster present), use live Rules Engine tools */
    useTools?: boolean;
  }
): Promise<GrokEngineRunResult> {
  const toolContext = options?.toolContext;
  const useTools = options?.useTools !== false && !!toolContext?.roster;
  const systemPrompt = buildGrokEngineSystemPrompt(snapshot);
  const userPrompt = `Here is tonight's snapshot and per-slot ranking.

Produce a COMPLETE draft for every non-preserved slot: select one from its candidates (top or justified override). 

HARD RULE (graves_default_schedule sole root): ONLY pick TMs where getTMScheduleStatus confirms "On Graves Default Schedule for tonight". Never pick NOT on schedule.

PRIMARY GOAL: Maximize rotation health % (use snapshot's rotationHealthPercent, gaps, fit verdicts). For the complete draft, for each slot pick the on-schedule candidate that best improves overall weekly health and closes gaps (verify with tools). Override when it lifts health net; for best top, confirm with reason citing data.

Actively use tools (scoreCandidate, getTMScheduleStatus, getCurrentBoardState) to compare. Always include "reason". Output ONLY the final JSON block.`;

  const messages: GrokMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    // Effort comes live from the SUDO > Engine Config tab via the DB
    const effort = snapshot.grokReasoningEffort ?? "high"; // decently hard 4.3 thinking for the core grok-hybrid placement engine

    const model = createGrokEngineModel();

    if (useTools) {
      // === FULL TOOL-CALLING PATH — live Rules Engine + scoring tools ===
      console.log("[GrokEngine] FULL tool-calling mode enabled.");

      const safeRoster = toolContext!.roster!;
      const currentDraftMap = new Map(Object.entries(toolContext!.currentDraft ?? {}));

      const engineConfig =
        toolContext!.engineConfig ??
        ({
          weights: snapshot.weights,
          thresholds: snapshot.thresholds,
          placementMethod: "grok-hybrid",
          grokReasoningEffort: snapshot.grokReasoningEffort,
        } as EngineConfig);

      const scoringCtx = toolContext!.scoringData
        ? {
            config: engineConfig,
            skillScores: toolContext!.scoringData!.skillScores ?? new Map(),
            slotDifficulty: toolContext!.scoringData!.slotDifficulty ?? new Map(),
            preferencesByTm: toolContext!.scoringData!.preferencesByTm ?? new Map(),
            pairAffinitiesByTm: toolContext!.scoringData!.pairAffinitiesByTm ?? new Map(),
            accommodationsByTm: toolContext!.scoringData!.accommodationsByTm ?? new Map(),
            currentDraft: currentDraftMap,
            adjacency: buildDefaultAdjacency(),
            zoneMatrix: toolContext!.scoringData!.zoneMatrix,
          }
        : ({} as Parameters<typeof scoreAssignment>[2]);

      const rulesForTools = new EngineRules({
        config: engineConfig,
        scoringContext: scoringCtx,
        auxDefs: toolContext!.auxDefs ?? [],
        currentDraft: currentDraftMap,
        scheduledTmIds: toolContext!.scheduledTmIds,
      });

      const baseTools = createEngineRulesTools(rulesForTools);

      const executableTools = {
        ...baseTools,
          checkEligibility: {
            ...baseTools.checkEligibility,
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
            ...baseTools.scoreCandidate,
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
            ...baseTools.getTMScheduleStatus,
            execute: async ({ tmId }: any) => {
              return {
                tmId,
                isOnSchedule: rulesForTools.isOnSchedule(tmId),
                status: rulesForTools.getScheduleStatus(tmId),
              };
            },
          },
      };

      const enhancedUserPrompt = `${userPrompt}

You have access to powerful live tools from the authoritative Rules Engine. USE THEM FREQUENTLY to make high-quality decisions:
- checkEligibility(tmId, slotKey)
- scoreCandidate(tmId, slotKey) — your most important tool for understanding trade-offs
- getCurrentBoardState() — see who's already placed where (global view)
- getTMScheduleStatus(tmId) — check Graves Default Schedule for tonight (HARD GATE: only on-schedule TMs per graves_default_schedule may be placed; very important)
- getRulesSummary() — if you need to re-read the full rule system

Explore with tools (score several, check schedule + board state + current health impact) before deciding. ALWAYS produce a pick for every relevant slot (complete draft). PRIMARY GOAL: choose to maximize final rotation health % and minimize gaps (use snapshot rotationHealth + gaps data). HARD RULE: never pick NOT on graves schedule. For top, still pick with health-based reason. When ready, output ONLY the final JSON block.`;

      console.log(`[xai-placement-engine] grok-4.3 ${effort} (tools) for board draft picks`);
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
      const toolUsage = result.usage
        ? {
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            model: "grok-4.3",
            reasoningEffort: effort,
          }
        : undefined;

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
        usage: toolUsage,
      };
    }

    // === Standard non-tool path (original behavior) ===
    console.log(`[xai-placement-engine] grok-4.3 ${effort} (structured) for board draft picks`);
    const { object: parsed, usage } = await generateObject({
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
      usage: usage
        ? {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            model: "grok-4.3",
            reasoningEffort: effort,
          }
        : undefined,
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

// ========================================================
// SLICE 4: Server-Side Eligibility Guard (Production Stabilization)
// ========================================================

export type ProposedAssignment = {
  slotKey: string;
  tmId: string | null;
};

export type ValidationError = {
  slotKey: string;
  tmId: string | null;
  reason: string;
};

export type ValidationResult = {
  valid: boolean;
  invalid: ValidationError[];
};

/**
 * Server-side re-validation of draft proposals before commit.
 * This is the hard guard (W3-4) so that even Grok / engine suggestions
 * cannot bypass graves_default_schedule + isEligibleForSlot.
 *
 * Called from the Client before optimistic update + DB write in applyDraft.
 */
export async function validateProposedAssignments(
  params: {
    date: string; // YYYY-MM-DD
    nightId?: string | null;
    proposals: ProposedAssignment[];
  }
): Promise<ValidationResult> {
  if (!params.proposals?.length) {
    return { valid: true, invalid: [] };
  }

  // Dynamic imports to keep this actions module's static graph clean for Turbopack.
  const { getScheduledIdsForNight } = await import(
    "@/lib/shiftbuilder/gravesDefaultSchedule"
  );
  const { isEligibleForSlot, normalizeGender } = await import(
    "@/lib/shiftbuilder/placement"
  );
  const { createAdminClientSafe } = await import(
    "@/app/api/admin/_lib/createAdminClient"
  );

  const nightDate = new Date(params.date);
  const scheduledIds = await getScheduledIdsForNight(nightDate, params.nightId ?? null);

  // Combined "on schedule tonight" set (grave + overlaps + onCall exceptions)
  const onScheduleTonight = new Set<string>([
    ...scheduledIds.grave,
    ...scheduledIds.amOverlap,
    ...scheduledIds.pmOverlap,
    ...scheduledIds.onCall,
  ]);

  const supabase = createAdminClientSafe();
  const invalid: ValidationError[] = [];

  // Collect unique tmIds we need profiles for
  const neededTmIds = new Set<string>();
  for (const p of params.proposals) {
    if (p.tmId) neededTmIds.add(p.tmId);
  }

  // Load minimal profiles for the proposed TMs (id, tm_id, grave_pool, gender)
  let profileByIdOrTmId = new Map<string, any>();
  if (supabase && neededTmIds.size > 0) {
    const { data: profiles } = await supabase
      .from("tm_profiles")
      .select("id, tm_id, grave_pool, gender, display_name, full_name")
      .in("tm_id", Array.from(neededTmIds)); // tm_id is the common key from graves schedule

    for (const p of profiles || []) {
      profileByIdOrTmId.set(p.id, p);
      if (p.tm_id) profileByIdOrTmId.set(p.tm_id, p);
    }
  }

  for (const proposal of params.proposals) {
    const { slotKey, tmId } = proposal;

    if (!tmId) {
      // Clearing a slot is generally allowed (subject to locks, handled client-side mostly)
      continue;
    }

    // 1. Must be on the Graves Default Schedule (or night_on_call exception) for this night
    if (!onScheduleTonight.has(tmId)) {
      invalid.push({
        slotKey,
        tmId,
        reason: "Not scheduled on Graves Default Schedule for tonight",
      });
      continue;
    }

    // 2. Run the full client eligibility rules (gender for RR, grave vs overlap, custom rules, etc.)
    const profile = profileByIdOrTmId.get(tmId);
    if (!profile) {
      invalid.push({
        slotKey,
        tmId,
        reason: "TM profile not found",
      });
      continue;
    }

    const tmForEligibility = {
      id: profile.id,
      tmId: profile.tm_id || tmId,
      gravePool: profile.grave_pool,
      gender: profile.gender,
      // The client often enriches with isAMOverlap / isPMOverlap from roster data.
      // For server guard we conservatively rely on gravePool + the scheduled band check above.
      isAMOverlap: scheduledIds.amOverlap.has(tmId),
      isPMOverlap: scheduledIds.pmOverlap.has(tmId),
    };

    try {
      if (!isEligibleForSlot(tmForEligibility, slotKey)) {
        invalid.push({
          slotKey,
          tmId,
          reason: `Not eligible for ${slotKey} per placement rules (grave pool / gender / overlap)`,
        });
      }
    } catch (e) {
      invalid.push({
        slotKey,
        tmId,
        reason: "Eligibility check failed",
      });
    }
  }

  return {
    valid: invalid.length === 0,
    invalid,
  };
}
