/** Client-only — never import shiftbuilder/actions.ts (avoids Turbopack chunk load errors). */

export type EngineInsightRequest = {
  slotKey: string;
  tmName: string;
  mode?: "deep" | "basics";
  rotationBasicsText?: string;
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
  suggestedCandidates?: string;
};

export type EngineInsightResponse = {
  text: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    reasoningEffort?: string;
  };
  error?: string;
};

export async function postEngineInsight(
  body: EngineInsightRequest,
): Promise<EngineInsightResponse> {
  const res = await fetch("/api/shiftbuilder/engine-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as EngineInsightResponse;
  if (!res.ok) {
    throw new Error(data?.error || `Insight failed (${res.status})`);
  }
  return data;
}