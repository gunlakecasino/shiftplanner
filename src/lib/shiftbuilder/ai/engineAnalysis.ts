/**
 * Engine Analysis + Config Improvement Proposals
 * 
 * Ported + adapted from the previous implementation into the active ShiftPlanner (oms_root).
 * 
 * Uses the existing @ai-sdk/xai Grok client + the project's grok-hybrid engine.
 * Produces structured suggestions that the AI Lab dashboard can render with "Apply" buttons.
 * 
 * Critically includes human feedback few-shot injection.
 */

import { createGrokEngineModel } from "@/lib/shiftbuilder/grokClient";
import type { EngineConfig } from "@/lib/shiftbuilder/engineConfig";
import { generateText } from "ai";
import {
  compactRosterForGrokAnalysis as compactRoster,
  compactAssignmentsForGrokAnalysis as compactAssignments,
  buildFewShotCorrectionsBlock as buildFewShotBlock,
  compactWeightsForPrompt,
} from "./promptUtils";

export interface DayAnalysisInput {
  dayName: string;
  unfilledSlots: string[];
  currentAssignments: Record<string, any>;
  roster: any[];
  currentEngineConfig: EngineConfig | null;
  targetType?: "deployment" | "breakSheet";
}

export interface EngineConfigSuggestion {
  type: "add_rule" | "modify_rule" | "adjust_scorer_weight" | "add_constraint" | "change_setting";
  targetId?: string;
  description: string;
  rationale: string;
  proposedChange: any;
  confidence: number; // 0-1
}

export interface DayAnalysisResult {
  dayName: string;
  summary: string;
  keyIssues: string[];
  suggestions: EngineConfigSuggestion[];
  overallRecommendation: string;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  rawResponse: string;
  timestamp: string;
}

/**
 * Main analysis function.
 * recentFeedback is injected as few-shot examples.
 */
export async function analyzeDayAndProposeConfigImprovements(
  input: DayAnalysisInput,
  recentFeedback: any[] = []
): Promise<DayAnalysisResult> {
  const model = createGrokEngineModel();

  const compactRosterData = compactRoster(input.roster);
  const compactAssignmentsData = compactAssignments(input.currentAssignments);
  const unfilled = input.unfilledSlots.join(", ") || "none";

  const fewShotBlock = buildFewShotBlock(recentFeedback);

  const system = `You are an expert ZDS Grave Shift Placement Strategist. You have deep knowledge of the current engine (grok-hybrid: deterministic scoring + Grok judgment layer).

Analyze the day's outcome and propose the smallest number of high-leverage, precise changes to the EngineConfig that would have produced a materially better result.

Return ONLY valid JSON matching this exact shape:
{
  "summary": "one tight paragraph",
  "keyIssues": ["string", "string"],
  "suggestions": [
    {
      "type": "adjust_scorer_weight" | "add_rule" | "modify_rule" | "change_setting",
      "targetId": "optional existing key",
      "description": "short human label",
      "rationale": "why this fixes the observed problem",
      "proposedChange": { /* concrete patch object */ },
      "confidence": 0.0-1.0
    }
  ],
  "overallRecommendation": "one sentence"
}${fewShotBlock}`;

  const user = `DAY: ${input.dayName}
UNFILLED SLOTS: ${unfilled}

CURRENT ENGINE WEIGHTS (only significant deviations from default):
${JSON.stringify(compactWeightsForPrompt({ ...(input.currentEngineConfig?.weights || {}) } as any, {}), null, 0)}

ROSTER (top ${compactRosterData.length}): ${JSON.stringify(compactRosterData)}

ASSIGNMENTS (compact): ${JSON.stringify(compactAssignmentsData)}

Return the JSON only.`;

  const result = await generateText({
    model,
    system,
    prompt: user,
    temperature: 0.2,
    maxTokens: 1200,
  });

  let parsed: any;
  try {
    // Grok sometimes wraps in ```json ... ```
    const text = result.text.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(text);
  } catch (e) {
    parsed = {
      summary: result.text.slice(0, 400),
      keyIssues: ["Parse failure — see rawResponse"],
      suggestions: [],
      overallRecommendation: "Review raw response",
    };
  }

  // Rough token accounting (the SDK gives usage in some versions)
  const usage = (result as any).usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  return {
    dayName: input.dayName,
    summary: parsed.summary || "",
    keyIssues: parsed.keyIssues || [],
    suggestions: parsed.suggestions || [],
    overallRecommendation: parsed.overallRecommendation || "",
    tokenUsage: {
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
    },
    rawResponse: result.text,
    timestamp: new Date().toISOString(),
  };
}
