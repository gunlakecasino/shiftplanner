/**
 * Grok-hybrid placement engine.
 *
 * Phase 1 architecture: the deterministic weighted planner produces a per-slot
 * Top-K ranking with score breakdowns. We pack a compact snapshot — top
 * candidates per slot with their numeric scores + tonight's context (call-offs,
 * operator notes, recent history) — and ask Grok to decide the final pick per
 * slot, drawing on judgment the math can't capture.
 *
 * Grok's role is NOT to score from scratch (the deterministic layer does
 * that). It's to override the deterministic top-pick when human-level
 * judgment matters: rotation memory, tonight's specific context, operator
 * intent, accommodations the schema doesn't fully encode, etc.
 *
 * The server-side guard validates Grok's picks against eligibility and the
 * ranked candidate list (Grok can ONLY pick from candidates the deterministic
 * layer surfaced — no hallucinated TMs). On any failure we fall back to the
 * deterministic top-scorer.
 */

import type { CoveragePlannerResult, SlotRanking } from "./placement";
import type { EngineConfig } from "./engineConfig";
import { getPlacementOrderText, getEligibilityRulesText } from "./placement";
import { EngineRules, createEngineRules, type EngineRulesContext } from "./engineRules";

// ---------------------------------------------------------------
// Snapshot types
// ---------------------------------------------------------------

export interface GrokEnginePerSlotCandidate {
  tmId: string;
  tmName: string;
  score: number;
  topSignals: Array<{ name: string; weighted: number; note?: string }>;
}

export interface GrokEngineSnapshot {
  day: string;
  shiftDate: string; // yyyy-mm-dd
  placementOrder: string[];
  /** Compact per-slot Top-K with scores */
  slotRankings: Array<{
    slotKey: string;
    preserved: boolean;
    preservedTmName?: string;
    candidates: GrokEnginePerSlotCandidate[];
  }>;
  /** Operator's notes pad for tonight (raw text) */
  operatorNotes: string;
  /** TMs called off tonight (excluded from candidates already) */
  calledOffTmNames: string[];
  /** Recent placement history for context */
  recentHistory: Array<{ tmName: string; slotKey: string; nightDate: string }>;
  /** Operator-tunable weight bag the deterministic layer used */
  weights: EngineConfig["weights"];
  /** Engine config thresholds (rotation_weeks, fatigue_window_days, ...) */
  thresholds: EngineConfig["thresholds"];
  /** Desired Grok 4.3 reasoning depth for this engine run (only meaningful for grok-hybrid) */
  grokReasoningEffort?: EngineConfig["grokReasoningEffort"];

  /**
   * NEW (2026-05-30 evolution): Rich textual summary of the entire rules engine.
   * This positions the deterministic layer as the authoritative "rules" that Grok must respect.
   */
  rulesSummary?: string;

  /**
   * Optional reference to a live EngineRules instance (for future tool-calling paths).
   * Not serialized into the prompt snapshot.
   */
  _engineRules?: EngineRules;
}

export interface GrokEnginePick {
  slotKey: string;
  tmId: string;
  reason: string;
}

export interface GrokEngineResponse {
  /** Grok's chosen picks per slot — must be from candidate list */
  picks: GrokEnginePick[];
  /** Free-text rationale for the overall draft */
  explanation: string;
}

// ---------------------------------------------------------------
// Snapshot builder
// ---------------------------------------------------------------

/**
 * Convert the deterministic planner's per-slot ranking into the compact
 * shape we send to Grok. Keeps only top-K candidates per slot, plus the top
 * 3 signal contributions to keep tokens small.
 */
export function buildGrokEngineSnapshot(args: {
  dayName: string;
  shiftDate: Date;
  plannerResult: CoveragePlannerResult;
  roster: any[]; // for name resolution
  operatorNotes: string;
  calledOffTmIds: Set<string>;
  recentHistory: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  config: EngineConfig;
  placementOrder: string[];
  topK?: number;

  /**
   * Optional: Pass the full EngineRulesContext so we can build a rich,
   * authoritative rules summary that Grok will treat as its constraint system.
   */
  rulesContext?: EngineRulesContext;
}): GrokEngineSnapshot {
  const {
    dayName,
    shiftDate,
    plannerResult,
    roster,
    operatorNotes,
    calledOffTmIds,
    recentHistory,
    config,
    placementOrder,
    topK = 5,
  } = args;

  const rosterById = new Map<string, any>();
  roster.forEach((tm) => rosterById.set(tm.id, tm));

  const slotRankings: GrokEngineSnapshot["slotRankings"] = placementOrder.map(
    (slotKey) => {
      const ranking: SlotRanking | undefined = plannerResult.breakdown[slotKey];
      if (!ranking) {
        return { slotKey, preserved: false, candidates: [] };
      }
      if (ranking.preserved && ranking.pickedTmId) {
        const tm = rosterById.get(ranking.pickedTmId);
        return {
          slotKey,
          preserved: true,
          preservedTmName: tm?.name || tm?.fullName || ranking.pickedTmId,
          candidates: [],
        };
      }
      const candidates = ranking.topCandidates.slice(0, topK).map((c) => {
        const signalEntries = Object.entries(c.breakdown)
          .filter(([_, s]) => Number.isFinite(s.weighted) && s.weighted !== 0)
          .sort((a, b) => Math.abs(b[1].weighted) - Math.abs(a[1].weighted))
          .slice(0, 3)
          .map(([name, s]) => ({ name, weighted: round2(s.weighted), note: s.note }));
        return {
          tmId: c.tmId,
          tmName: c.tmName,
          score: round2(c.total),
          topSignals: signalEntries,
        };
      });
      return { slotKey, preserved: false, candidates };
    }
  );

  // Compact recent history — only the last 5 entries across all TMs (Grok
  // doesn't need a full week; just enough to spot "same TM, same slot, two
  // nights in a row" patterns).
  const flatHistory: GrokEngineSnapshot["recentHistory"] = [];
  for (const [tmId, entries] of recentHistory) {
    const tm = rosterById.get(tmId);
    const tmName = tm?.name || tm?.fullName || tmId;
    entries.forEach((e) => {
      flatHistory.push({ tmName, slotKey: e.slotKey, nightDate: e.nightDate });
    });
  }
  flatHistory.sort((a, b) => b.nightDate.localeCompare(a.nightDate));

  const calledOffTmNames: string[] = [];
  calledOffTmIds.forEach((id) => {
    const tm = rosterById.get(id);
    if (tm) calledOffTmNames.push(tm.name || tm.fullName || id);
  });

  const snapshot: GrokEngineSnapshot = {
    day: dayName,
    shiftDate: toIso(shiftDate),
    placementOrder,
    slotRankings,
    operatorNotes: (operatorNotes ?? "").trim(),
    calledOffTmNames,
    recentHistory: flatHistory.slice(0, 50),
    weights: config.weights,
    thresholds: config.thresholds,
    grokReasoningEffort: config.grokReasoningEffort,
  };

  // === 2026-05-30 Evolution: Inject rich rules representation ===
  if (args.rulesContext) {
    try {
      const engineRules = createEngineRules(args.rulesContext);
      snapshot.rulesSummary = engineRules.getRulesSummaryForLLM();
      snapshot._engineRules = engineRules; // available for future tool-calling paths
    } catch (e) {
      console.warn("[grokEngine] Failed to build rich EngineRules summary", e);
      // Fall back to the classic static text (still better than nothing)
      snapshot.rulesSummary = `${getPlacementOrderText()}\n\n${getEligibilityRulesText()}`;
    }
  } else {
    // Legacy fallback
    snapshot.rulesSummary = `${getPlacementOrderText()}\n\n${getEligibilityRulesText()}`;
  }

  return snapshot;
}

// ---------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------

export function buildGrokEngineSystemPrompt(snapshot: GrokEngineSnapshot): string {
  // Prefer the rich, live rules summary from the EngineRules abstraction when available.
  // This is the key evolution: Grok now receives the deterministic engine as a
  // comprehensive, authoritative rule system rather than just two static text blocks.
  const rulesText = snapshot.rulesSummary ||
    `${getPlacementOrderText()}\n\n${getEligibilityRulesText()}`;

  return `You are the planning brain for the ZDS grave shift.

The deterministic engine (defined in code + live engine_config + historical matrix) acts as the authoritative **Rules Engine**.

Your job is to produce high-quality placements while deeply respecting that rule system.
You may use the provided per-slot candidate rankings and their scores as strong guidance,
but you have the authority (and responsibility) to make final placement decisions using
higher-order judgment the pure math cannot capture: operator intent from notes, rotation health,
team dynamics, risk posture for tonight, and patterns not fully encoded in the weights.

=== AUTHORITATIVE RULES ENGINE ===

${rulesText}

OUTPUT CONTRACT — STRICT JSON SCHEMA (field names + casing are EXACT):

1. Output exactly one fenced \`\`\`json block with this shape:
\`\`\`json
{
  "explanation": "1-2 sentence overall summary of the draft you produced",
  "picks": [
    {
      "slotKey": "Z2",
      "tmId": "tm_carter",
      "reason": "One short sentence the operator will see"
    }
  ]
}
\`\`\`

CRITICAL CONSTRAINTS:
- Every \`tmId\` MUST be one that appears in the candidates list for that slot
  in the snapshot below (these candidates have already passed the hard eligibility rules).
  NEVER invent a TM.
- Skip slots marked \`preserved: true\` — those have an existing TM the
  operator already placed; do not propose a different pick.
- If you have no opinion for a slot, omit it from \`picks\` and the system
  will use the deterministic top-scorer.
- The \`reason\` field is mandatory for every pick.

GUIDANCE:
- The deterministic engine has already done the hard filtering and weighted scoring.
  Treat its output as a very strong recommendation, not as gospel.
- Override the top candidate when higher-order context justifies it:
    - Tonight's specific conditions (notes, call-offs, weather, events, morale)
    - Rotation health and long-term fairness not fully captured in the matrix
    - Pair dynamics and team chemistry
    - Operator explicit or implicit intent
- When tools are provided to you (checkEligibility, scoreCandidate, getRulesSummary, etc.),
  USE THEM actively during your reasoning. They give you live access to the Rules Engine.
- Be thoughtful but not timid. The operator will review everything in Draft Mode.
- When you override, explain your reasoning clearly — the operator uses these
  reasons to understand and trust (or correct) your decisions.

Current snapshot (JSON):
${JSON.stringify(snapshot, null, 2)}
`;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function toIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse a raw Grok response. Lenient: accepts the strict JSON block or, as
 * a fallback, returns no picks (caller will use deterministic top-scorers).
 */
export function parseGrokEngineResponse(raw: string): GrokEngineResponse {
  const block = raw.match(/```json\s*([\s\S]*?)```/i);
  if (!block) return { picks: [], explanation: raw.trim() };
  try {
    const parsed = JSON.parse(block[1].trim());
    const explanation = typeof parsed.explanation === "string" ? parsed.explanation : "";
    const picksRaw = Array.isArray(parsed.picks) ? parsed.picks : [];
    const picks: GrokEnginePick[] = picksRaw
      .filter((p: any) => p && typeof p === "object")
      .map((p: any) => ({
        slotKey: String(p.slotKey ?? p.slot_key ?? p.slot ?? ""),
        tmId: String(p.tmId ?? p.tm_id ?? p.id ?? ""),
        reason: String(p.reason ?? ""),
      }))
      .filter((p: GrokEnginePick) => p.slotKey && p.tmId);
    return { picks, explanation };
  } catch (err) {
    console.warn("[grokEngine] parse failed:", err);
    return { picks: [], explanation: raw.trim() };
  }
}

/**
 * Server-side guard. For each Grok pick, ensures (a) the slot existed in the
 * snapshot, (b) the proposed tmId was in that slot's candidate list, (c) the
 * slot wasn't preserved. Returns the cleaned picks + warnings.
 */
export function guardGrokEnginePicks(
  picks: GrokEnginePick[],
  snapshot: GrokEngineSnapshot
): { validPicks: GrokEnginePick[]; warnings: string[] } {
  const validPicks: GrokEnginePick[] = [];
  const warnings: string[] = [];
  const rankingsBySlot = new Map(snapshot.slotRankings.map((r) => [r.slotKey, r]));

  for (const p of picks) {
    const r = rankingsBySlot.get(p.slotKey);
    if (!r) {
      warnings.push(`Grok proposed pick for unknown slot ${p.slotKey}`);
      continue;
    }
    if (r.preserved) {
      warnings.push(`Grok tried to override preserved slot ${p.slotKey}`);
      continue;
    }
    const allowed = r.candidates.some((c) => c.tmId === p.tmId);
    if (!allowed) {
      warnings.push(
        `Grok picked ${p.tmId} for ${p.slotKey} but they weren't in the candidate list`
      );
      continue;
    }
    validPicks.push(p);
  }

  return { validPicks, warnings };
}

/**
 * Final merge: take the deterministic planner result and apply Grok's
 * validated overrides on top. Returns a new proposedAssignments map plus
 * a reasoningBySlot map for the Why? mode.
 *
 * Important UX detail: a slot is only marked `source: "grok"` if Grok's
 * pick ACTUALLY differs from the deterministic top-scorer. Grok confirming
 * the engine's pick stays labeled "engine" — Grok's reason is preserved as
 * an annotation but not framed as an "override".
 */
export function mergeGrokOverridesIntoDraft(args: {
  plannerResult: CoveragePlannerResult;
  picks: GrokEnginePick[];
}): {
  proposedAssignments: Record<string, string>;
  reasoningBySlot: Record<string, { source: "engine" | "grok"; reason?: string }>;
} {
  const { plannerResult, picks } = args;
  const proposed: Record<string, string> = { ...plannerResult.proposedAssignments };
  const reasoning: Record<string, { source: "engine" | "grok"; reason?: string }> = {};

  // Default: every slot is engine-driven.
  for (const slot of Object.keys(proposed)) {
    reasoning[slot] = { source: "engine" };
  }

  // Apply Grok overrides — only mark as 'grok' when the pick differs from
  // the engine's deterministic top. Otherwise treat Grok as having confirmed
  // the engine and keep the label clean, but preserve Grok's reason text
  // for the Why? panel.
  picks.forEach((p) => {
    const engineTopId = plannerResult.proposedAssignments[p.slotKey];
    proposed[p.slotKey] = p.tmId;
    if (engineTopId && engineTopId !== p.tmId) {
      reasoning[p.slotKey] = { source: "grok", reason: p.reason };
    } else {
      // Same pick as engine. Keep "engine" label, attach Grok's note (if any)
      // for additional context without falsely flagging an override.
      reasoning[p.slotKey] = { source: "engine", reason: p.reason };
    }
  });

  return { proposedAssignments: proposed, reasoningBySlot: reasoning };
}
