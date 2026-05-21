"use server";

import {
  callGrok,
  buildShiftBuilderSystemPrompt,
  buildGrokIntelligenceSystemPrompt,
  parseGrokStructuredResponse,
  guardGrokActions,
  type GrokMessage,
  type GrokBoardSnapshot,
  type GrokStructuredResponse,
} from "@/lib/xai";
import type { TeamMember } from "@/lib/shiftbuilder/data";
import {
  buildGrokEngineSystemPrompt,
  parseGrokEngineResponse,
  guardGrokEnginePicks,
  type GrokEngineSnapshot,
  type GrokEnginePick,
} from "@/lib/shiftbuilder/grokEngine";

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
      model: "grok-3-mini",
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
    const raw = await callGrok(messages, {
      model: "grok-3-mini",
      temperature: 0.5, // slightly lower for more consistent structure
      maxTokens: 900,
    });

    const parseResult = parseGrokStructuredResponse(raw);

    let finalStructured: GrokStructuredResponse | undefined;
    let warnings: string[] = [];

    if (parseResult.structured) {
      // Run the authoritative guard (this is what would have prevented the May 21 screenshot disasters)
      const guardResult = guardGrokActions(
        parseResult.structured.actions,
        rosterForGuard,
        snapshot.currentAssignments
      );

      finalStructured = {
        explanation: parseResult.structured.explanation,
        actions: guardResult.validActions,
      };
      warnings = guardResult.warnings;
    }

    return {
      text: raw,
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
 */
export async function askGrokEngineDraft(
  snapshot: GrokEngineSnapshot
): Promise<GrokEngineRunResult> {
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
    const raw = await callGrok(messages, {
      model: "grok-3-mini",
      // Low temperature so the engine is near-deterministic; same snapshot
      // should produce near-identical picks every time.
      temperature: 0.2,
      maxTokens: 1500,
    });

    const parsed = parseGrokEngineResponse(raw);
    const guard = guardGrokEnginePicks(parsed.picks, snapshot);

    return {
      picks: guard.validPicks,
      explanation: parsed.explanation,
      warnings: guard.warnings,
      usedGrok: guard.validPicks.length > 0,
      rawText: raw,
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
