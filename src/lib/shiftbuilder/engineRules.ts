/**
 * engineRules.ts
 *
 * The authoritative "Rules Engine" facade for the GRAVE/ZDS placement system.
 *
 * This module is the single source of truth that both the deterministic
 * placement logic AND Grok (or any future intelligent agent) should consult.
 *
 * Goal (per 2026-05-30 vision):
 *   Make the entire deterministic engine feel like a live, queryable,
 *   explainable rule system that Grok can deeply respect and reason against
 *   when making placements — instead of just receiving a static snapshot.
 *
 * Responsibilities:
 * - Hard constraints (eligibility, placement order, locked slots)
 * - Soft scoring interface
 * - Rich textual + structured representations for LLMs
 * - Future: Tool definitions for AI SDK tool-calling
 *
 * This is the foundation for evolving from "Grok as narrow reranker"
 * to "Grok as primary intelligent placer that treats the engine as its rules".
 */

import {
  PLACEMENT_ORDER,
  getSlotsInPlacementOrder,
  isEligibleForSlot,
  getPlacementOrderText,
  getEligibilityRulesText,
  type AuxDef,
  type CoveragePlannerResult,
} from "./placement";

import {
  scoreAssignment,
  buildDefaultAdjacency,
  type ScoringContext,
  type ScoreResult,
  type SignalBreakdown,
} from "./scoring";

import type { EngineConfig } from "./engineConfig";
import type { TmZoneMatrixRow } from "./data";

// ============================================================
// Core Types
// ============================================================

export interface EngineRulesContext {
  /** Live engine configuration (weights, thresholds, placement method) */
  config: EngineConfig;

  /** Pre-loaded reference data for fast scoring */
  scoringContext: Omit<ScoringContext, "currentDraft" | "adjacency"> & {
    adjacency?: Map<string, string[]>;
    zoneMatrix?: Map<string, Map<string, TmZoneMatrixRow>>;
  };

  /** Currently active auxiliary slots (for placement order) */
  auxDefs?: AuxDef[];

  /** Current draft state (for within_repeat + pair_affinity) */
  currentDraft?: Map<string, string>;

  /** TMs that are on schedule for this night (from night_tm_status / ADP import) */
  scheduledTmIds?: Set<string>;
}

export interface PlacementRuleViolation {
  rule: string;
  severity: "hard" | "soft";
  message: string;
}

export interface PlacementCandidateEvaluation {
  tmId: string;
  tmName: string;
  isEligible: boolean;
  violations: PlacementRuleViolation[];
  score?: number;
  breakdown?: SignalBreakdown;
  rank?: number;
}

// ============================================================
// EngineRules — The Main Abstraction
// ============================================================

export class EngineRules {
  private ctx: EngineRulesContext;

  constructor(context: EngineRulesContext) {
    this.ctx = context;
  }

  // ------------------------------------------------------------
  // Hard Constraints (Non-negotiable rules)
  // ------------------------------------------------------------

  /** Returns the strict, authoritative order in which slots must be considered. */
  getPlacementOrder(): string[] {
    return getSlotsInPlacementOrder(this.ctx.auxDefs ?? []);
  }

  /** Returns the canonical text version of placement order (for LLM prompts). */
  getPlacementOrderAsText(): string {
    return getPlacementOrderText();
  }

  /** Returns the full eligibility rule text (for LLM prompts). */
  getEligibilityRulesAsText(): string {
    return getEligibilityRulesText();
  }

  /**
   * Checks hard eligibility for a TM on a slot.
   * This is the primary "does this violate the rules?" gate.
   */
  isEligible(tm: any, slotKey: string): boolean {
    const eligibilityRules = (this.ctx.config as any).eligibilityRules ?? [];
    return isEligibleForSlot(tm, slotKey, eligibilityRules);
  }

  /**
   * Returns detailed violations if a placement would break rules.
   * Useful for Grok to understand *why* something is invalid.
   */
  getEligibilityViolations(tm: any, slotKey: string): PlacementRuleViolation[] {
    const violations: PlacementRuleViolation[] = [];

    if (!this.isEligible(tm, slotKey)) {
      violations.push({
        rule: "eligibility",
        severity: "hard",
        message: `TM ${tm.id} is not eligible for ${slotKey} under current rules (grave pool, overlap, gender, or custom eligibility rules).`,
      });
    }

    // Future: add locked slot checks, break coverage rules, etc. here
    return violations;
  }

  // ------------------------------------------------------------
  // Soft Scoring Layer
  // ------------------------------------------------------------

  /**
   * Scores a single (TM, slot) assignment using the current engine weights
   * and all active signals (including matrix fairness).
   *
   * This is the "consult the scoring engine" capability.
   */
  async score(tm: any, slotKey: string, draftState?: Map<string, string>): Promise<ScoreResult> {
    const fullCtx: ScoringContext = {
      ...this.ctx.scoringContext,
      currentDraft: draftState ?? this.ctx.currentDraft ?? new Map(),
      adjacency: this.ctx.scoringContext.adjacency ?? buildDefaultAdjacency(),
    };

    return scoreAssignment(tm, slotKey, fullCtx);
  }

  /**
   * Evaluates a TM against a slot with both hard eligibility and soft scoring.
   * This is the richest single "ask the rules engine" call.
   */
  async evaluateCandidate(
    tm: any,
    slotKey: string,
    draftState?: Map<string, string>
  ): Promise<PlacementCandidateEvaluation> {
    const violations = this.getEligibilityViolations(tm, slotKey);
    const isEligible = violations.length === 0;

    let scoreResult: ScoreResult | undefined;

    if (isEligible) {
      scoreResult = await this.score(tm, slotKey, draftState);
    }

    return {
      tmId: tm.id,
      tmName: tm.name || tm.fullName || tm.id,
      isEligible,
      violations,
      score: scoreResult?.total,
      breakdown: scoreResult?.breakdown,
    };
  }

  /**
   * Returns whether a TM is on the official ADP schedule for tonight.
   */
  isOnSchedule(tmId: string): boolean {
    if (!this.ctx.scheduledTmIds || this.ctx.scheduledTmIds.size === 0) {
      return false; // No schedule data loaded — treat as unknown / no preference
    }
    return this.ctx.scheduledTmIds.has(tmId);
  }

  /**
   * Returns a human-friendly schedule status for a TM (for Grok and UI).
   */
  getScheduleStatus(tmId: string): string {
    if (!this.ctx.scheduledTmIds || this.ctx.scheduledTmIds.size === 0) {
      return "No ADP schedule data loaded for this night (fallback mode)";
    }
    return this.isOnSchedule(tmId) 
      ? "On ADP schedule for tonight" 
      : "NOT on ADP schedule for tonight";
  }

  // ------------------------------------------------------------
  // LLM / Agent Friendly Representations
  // ------------------------------------------------------------

  /**
   * Returns a compact but rich textual summary of the current rule system.
   * Ideal for injecting into Grok system prompts.
   */
  getRulesSummaryForLLM(): string {
    const schedulePolicy = this.ctx.scheduledTmIds && this.ctx.scheduledTmIds.size > 0
      ? "Schedule policy: Prefer TMs who are on the official ADP schedule for tonight when all other factors are equal. Scheduled-but-unassigned TMs are high-priority to place."
      : "No ADP schedule loaded for this night — engine uses full active roster.";

    return `
# GRAVE Shift Placement Rules Engine

## 1. Placement Sequence (Strict Order)
${this.getPlacementOrderAsText()}

## 2. Hard Eligibility Rules
${this.getEligibilityRulesAsText()}

## 3. Schedule Policy (ADP / night_tm_status)
${schedulePolicy}

## 4. Active Scoring Signals & Weights
Current weights (from engine_config):
${JSON.stringify(this.ctx.config.weights, null, 2)}

Key signals include:
- skill_match (closeness of TM skill to slot difficulty)
- preference_fit (hard preferences/avoidances)
- pair_affinity (with already-placed neighbors)
- area_diversity, cross_week_rotation, prior_run_continuity (from historical matrix)
- within_repeat (hard constraint)

## 4. Guidance for Intelligent Agents
You must respect all hard eligibility rules. 
You may use the scoring signals as strong guidance, but you have authority to override the pure mathematical top pick when higher-order context (operator notes, rotation health, team dynamics, tonight-specific conditions) justifies it.

The deterministic engine provides the constraint system and candidate generation.
Your job as the intelligent layer is to make final placement decisions that optimize for real-world outcomes the math cannot fully see.
`.trim();
  }

  /**
   * Returns the live engine configuration in a form useful for agents.
   */
  getConfigSnapshot() {
    return {
      placementMethod: this.ctx.config.placementMethod,
      weights: this.ctx.config.weights,
      thresholds: this.ctx.config.thresholds,
      grokReasoningEffort: this.ctx.config.grokReasoningEffort,
    };
  }
}

// ============================================================
// Factory Helper
// ============================================================

/**
 * Creates an EngineRules instance from the typical data available during
 * an engine run (the same data passed to runWeightedPlanner).
 */
export function createEngineRules(context: EngineRulesContext): EngineRules {
  return new EngineRules(context);
}

// ============================================================
// Tool Definitions for Grok / Agent Tool Use (AI SDK compatible)
// ============================================================

/**
 * These are the live tools Grok can call during reasoning when using the
 * "Grok as primary placer" mode. They give Grok direct access to the
 * deterministic Rules Engine instead of just a static snapshot.
 *
 * Designed to work with Vercel AI SDK `tools` parameter.
 */

import { z } from "zod";

// Schemas for tool parameters
export const CheckEligibilitySchema = z.object({
  tmId: z.string().describe("The ID of the team member (e.g. 'tm_carter')"),
  slotKey: z.string().describe("The slot key (e.g. 'Z2', 'MRR1', 'ADM')"),
});

export const ScoreCandidateSchema = z.object({
  tmId: z.string().describe("The ID of the team member"),
  slotKey: z.string().describe("The slot key to score against"),
  includeBreakdown: z.boolean().optional().default(true).describe("Whether to return the full signal breakdown"),
});

export const GetRulesSummarySchema = z.object({});

export type CheckEligibilityInput = z.infer<typeof CheckEligibilitySchema>;
export type ScoreCandidateInput = z.infer<typeof ScoreCandidateSchema>;

/**
 * Creates actual executable tool functions bound to a specific EngineRules instance.
 * Call this on the server when preparing the Grok call.
 */
export function createEngineRulesTools(rules: EngineRules) {
  return {
    checkEligibility: {
      description: "Check whether a specific team member is hard-eligible for a slot according to the full authoritative rules (grave pool, overlap, gender for restrooms, custom eligibility rules, etc.). Returns true/false plus any violations.",
      parameters: CheckEligibilitySchema,
      execute: async ({ tmId, slotKey }: CheckEligibilityInput) => {
        // Note: In real use, the caller must provide the TM object.
        // For now we return a structured response; the actual TM lookup happens in the caller context.
        return {
          tmId,
          slotKey,
          isEligible: false, // Placeholder - real implementation would need roster access
          note: "Tool requires full TM object. Use with roster context on caller side.",
        };
      },
    },

    scoreCandidate: {
      description: "Score a team member on a specific slot using the current live weights and all scoring signals (skill match, preferences, pair affinity, area diversity, rotation fairness, etc.). Returns total score and detailed breakdown. This is the 'consult the scoring engine' tool.",
      parameters: ScoreCandidateSchema,
      execute: async ({ tmId, slotKey, includeBreakdown }: ScoreCandidateInput) => {
        return {
          tmId,
          slotKey,
          note: "Requires full TM object and current draft state. Call from context that has EngineRules + roster.",
        };
      },
    },

    getRulesSummary: {
      description: "Get the complete current rules summary (placement order, hard eligibility, active scoring signals and weights, schedule policy). Use this if you need to re-read the authoritative rule system mid-reasoning.",
      parameters: GetRulesSummarySchema,
      execute: async () => {
        return {
          summary: rules.getRulesSummaryForLLM(),
        };
      },
    },

    getTMScheduleStatus: {
      description: "Check the ADP schedule status for a specific team member tonight. Returns whether they are on schedule and any relevant note. Critical for respecting operator-loaded ADP schedules.",
      parameters: z.object({
        tmId: z.string().describe("The tm_id of the team member"),
      }),
      execute: async ({ tmId }: { tmId: string }) => {
        return {
          tmId,
          isOnSchedule: rules.isOnSchedule(tmId),
          status: rules.getScheduleStatus(tmId),
        };
      },
    },
  };
}