/**
 * xAI Grok helper for the Command Palette
 * 
 * Uses native fetch against the xAI OpenAI-compatible endpoint.
 * All calls should go through Server Actions to keep the API key server-only.
 */

export type GrokMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GrokSuggestion = {
  id: string;
  label: string;
  description?: string;
  action?: {
    type: "assign" | "remove" | "lock" | "break" | "note";
    slotKey?: string;
    tmId?: string;
    value?: any;
  };
};

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";

export async function callGrok(
  messages: GrokMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;

  if (!apiKey) {
    throw new Error("XAI_API_KEY is not set in environment variables");
  }

  const response = await fetch(XAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options?.model ?? "grok-3-mini", // Fast model - adjust as needed
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`xAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/**
 * Helper to build a good system prompt for ShiftBuilder context.
 * (Legacy — used by the original minimal "Ask Grok" flow)
 */
export function buildShiftBuilderSystemPrompt(): string {
  return `You are an expert GRAVE shift planner for ZDS operations.

You help operators make fast, high-quality decisions about:
- Who to assign to which zone / AUX / RR slot
- Break scheduling and fairness
- Coverage gaps and risk
- Eligibility rules (GRAVE pool, overlaps, porters)

Rules you must respect:
- GRAVE-eligible people (grave_pool = true) are preferred for core night coverage
- Respect current assignments and break groups
- Prefer minimal disruption when suggesting swaps
- Be concise and actionable

When the user gives you context about a specific slot or person, give 2-4 concrete, ranked suggestions.
For each suggestion, briefly explain *why* it is good (1 sentence max).

Output format (strict):
- Return a short numbered list.
- Each item should be one clear recommendation.
- At the end, add a very short overall note if needed.

Never output JSON unless explicitly asked.`;
}

/**
 * Re-exports from the new Grok Intelligence module for convenience.
 * The real power (rich snapshots + structured actions + guards) lives in
 * src/lib/shiftbuilder/grokIntelligence.ts
 */
export {
  buildGrokIntelligenceSystemPrompt,
  parseGrokStructuredResponse,
  guardGrokActions,
  type GrokAction,
  type GrokStructuredResponse,
  type GrokBoardSnapshot,
} from "./shiftbuilder/grokIntelligence";
