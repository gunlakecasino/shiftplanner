/** Client-only — never import shiftbuilder/actions.ts (avoids Turbopack chunk load errors). */

import type { PlacementCandidateProfile, PlacementInsightMode } from "@/lib/shiftbuilder/engineInsightForPlacement";
import type { PlacementPadInsight } from "@/lib/shiftbuilder/placementPadInsightSchema";

export type EngineInsightRequest = {
  slotKey: string;
  tmName: string;
  /** "deep" | "assignee" use full grok-4.3 high (whyTonight + swaps + rich).
   *  "light" | "headline" use grok-build-0.1 fast for quick magic one-liner determination only (cheap, populates builder chip/line fast).
   *  "basics" is the rotation narrative rewrite.
   */
  mode?: PlacementInsightMode;
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
    gender?: string | null;
  };
  priorGoodExamples?: Array<{ slotKey: string; insightText: string }>;
  slotSpecificHistory?: string;
  currentContext?: string;
  suggestedCandidates?: string;
  rotationBrief?: string;
  spreadPlaced?: string;
  spreadGaps?: string;
  candidateProfiles?: PlacementCandidateProfile[];
  contextSig?: string;

  /** Week-level rotation health advisor request (from health pill / week overview / viol list).
   *  When true, the server runs a prescriptive "what moves would raise the weeklyBalance" analysis
   *  instead of (or in addition to) a single-slot determination. The response text focuses on
   *  concrete (tm/slot/day) → (slot/day) suggestions + why they improve max-repeat / health %.
   */
  weekAdvisor?: boolean;
  /** Snapshot of the current rotation health (blended + weekly component) at the time of request. */
  rotationHealthSnapshot?: {
    percent?: number | null;
    weeklyBalance?: number;
    maxWeeklyRepeat?: number;
    repeatViolations?: number;
    xaiRepeatPenaltyReduction?: number;
  };
  /** The list of specific repeat violations driving the penalty (from compute / getWeekRepeatViolations). */
  violations?: Array<{
    tmId: string;
    slotKey: string;
    count: number;
    nights: string[];
    severity: number;
    hasXaiSignal?: boolean;
  }>;
  /** Compact textual summary of the full week plan or key load/repeat patterns for the advisor prompt. */
  weekPlanSummary?: string;
  /** Optional focus: only analyze fixes involving this TM or this slot. */
  focusTmId?: string;
  focusSlotKey?: string;

  /** Map tmId → human display name (e.g. "Sheri O", "Jared", "Kaiden"). 
   *  The week advisor must use these instead of raw tm_ ids. This is required to follow the naming rules for all operator-facing surfaces.
   */
  tmNames?: Record<string, string>;
};

export type EngineInsightResponse = {
  text: string;
  structured?: PlacementPadInsight;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    reasoningEffort?: string;
  };
  cached?: boolean;
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