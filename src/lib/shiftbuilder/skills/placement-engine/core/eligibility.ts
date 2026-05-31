/**
 * Eligibility Rules — the heart of the granular, AI-modifiable engine skill.
 *
 * This is the primary thing an AI (Grok) should read and edit.
 *
 * Rules are plain data: an array of small functions + metadata.
 * The engine (and Grok) can inspect, enable/disable, reorder, or add new ones
 * without touching any other code.
 */

import type { EngineConfig } from '../../../engineConfig';

export interface EligibilityContext {
  config: EngineConfig;
  currentAssignments?: Record<string, any>;
  calledOffTmIds?: Set<string>;
  // Add more live context (fatigue, rotation history, etc.) as needed
}

export interface EligibilityResult {
  passed: boolean;
  reason?: string;
  ruleId?: string;
}

export type EligibilityRule = (
  candidate: any,           // TM profile or roster row
  slotId: string,
  context: EligibilityContext
) => EligibilityResult;

/**
 * DEFAULT_ELIGIBILITY_RULES
 *
 * This array is the single source of truth for hard constraints.
 * Grok (via the AI Lab) can propose adding, removing, or modifying entries here.
 * Every rule is tiny, named, and has a clear reason.
 */
export const DEFAULT_ELIGIBILITY_RULES: EligibilityRule[] = [
  // 1. Basic identity
  function ruleNotNull(candidate, slotId) {
    if (!candidate || !slotId) {
      return { passed: false, reason: 'Missing candidate or slot', ruleId: 'not-null' };
    }
    return { passed: true, ruleId: 'not-null' };
  },

  // 2. Called off tonight
  function ruleNotCalledOff(candidate, slotId, ctx) {
    if (ctx.calledOffTmIds?.has(candidate?.key || candidate?.id)) {
      return { passed: false, reason: 'TM called off tonight', ruleId: 'not-called-off' };
    }
    return { passed: true, ruleId: 'not-called-off' };
  },

  // 3. Already assigned this night (basic anti-double-booking)
  function ruleNotAlreadyAssignedThisNight(candidate, slotId, ctx) {
    const tmId = candidate?.key || candidate?.id;
    if (!tmId || !ctx.currentAssignments) return { passed: true, ruleId: 'not-already-assigned' };

    const already = Object.values(ctx.currentAssignments).some(
      (a: any) => (a?.tmId || a?.tmKey) === tmId
    );
    if (already) {
      return { passed: false, reason: 'Already assigned elsewhere tonight', ruleId: 'not-already-assigned' };
    }
    return { passed: true, ruleId: 'not-already-assigned' };
  },

  // 4. Placeholder for rotation / fatigue / pool rules (add real ones from engineRules.ts later)
  // These will be expanded in the full port.
];

/**
 * Evaluate a single candidate against a slot using the provided (or default) rule set.
 * Returns the first failing rule (short-circuit) or success.
 */
export function evaluateEligibility(
  candidate: any,
  slotId: string,
  context: EligibilityContext,
  rules: EligibilityRule[] = DEFAULT_ELIGIBILITY_RULES
): EligibilityResult {
  const normalizedSlot = slotId; // caller should have normalized already via slot-normalization

  for (const rule of rules) {
    const result = rule(candidate, normalizedSlot, context);
    if (!result.passed) {
      return { ...result, ruleId: result.ruleId || (rule as any).name || 'unknown-rule' };
    }
  }

  return { passed: true };
}

/**
 * Convenience: returns a human-readable explanation of why a TM is (or is not) eligible.
 * Perfect for Grok prompts and the AI Lab traces.
 */
export function explainEligibility(
  candidate: any,
  slotId: string,
  context: EligibilityContext,
  rules = DEFAULT_ELIGIBILITY_RULES
): string {
  const result = evaluateEligibility(candidate, slotId, context, rules);
  if (result.passed) return 'Eligible (all rules passed)';
  return `Ineligible: ${result.reason} (rule: ${result.ruleId})`;
}

/**
 * Produces a clean text representation of the current default eligibility rules.
 * Used by Grok prompts and EngineRules.getEligibilityRulesAsText().
 */
export function getDefaultEligibilityRulesText(): string {
  return DEFAULT_ELIGIBILITY_RULES
    .map((rule, idx) => {
      const name = (rule as any).name || `rule-${idx}`;
      return `- ${name}`;
    })
    .join('\n');
}
