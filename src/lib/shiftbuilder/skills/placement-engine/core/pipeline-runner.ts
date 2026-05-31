/**
 * Basic but working pipeline runner for the skill.
 * Uses the granular eligibility from this skill + falls back to existing deterministic logic.
 * Returns a rich trace so Grok / AI can inspect every decision.
 */

import { evaluateEligibility, DEFAULT_ELIGIBILITY_RULES } from './eligibility';
import type { EligibilityContext } from './eligibility';
import {
  calculateCoverageFeasibility,
  getTiersUpToSlot,
} from './target-derivation';

export interface PipelineStepTrace {
  step: string;
  before?: any;
  after?: any;
  reason?: string;
  passed?: boolean;
}

export interface PipelineRunResult {
  assignments: Record<string, any>;
  trace: PipelineStepTrace[];
  metrics?: any;
  eligibilityRulesUsed: number;
}

export async function runEnginePipeline(input: any): Promise<PipelineRunResult> {
  const trace: PipelineStepTrace[] = [];
  const assignments: Record<string, any> = {};

  const roster = input.roster || [];
  const slots = input.targetSlots || input.slots || [];

  const context: EligibilityContext = {
    config: input.config || {},
    currentAssignments: input.currentAssignments,
    calledOffTmIds: input.calledOffTmIds,
  };

  // World-class feasibility using the tier model
  const feasibility = calculateCoverageFeasibility(roster.length);
  trace.push({
    step: 'feasibility',
    reason: feasibility.explanation,
  });

  let assigned = 0;

  for (const slot of slots) {
    const slotId = slot.key || slot.id || slot;
    const tier = getTiersUpToSlot(slotId).at(-1);

    trace.push({ step: 'slot-start', reason: `Processing ${slotId} (${tier?.name || 'Extra'})` });

    const eligible = roster.filter((tm: any) => {
      const res = evaluateEligibility(tm, slotId, context, DEFAULT_ELIGIBILITY_RULES);
      if (!res.passed) {
        trace.push({ 
          step: 'eligibility-fail', 
          reason: res.reason, 
          passed: false 
        });
      }
      return res.passed;
    });

    if (eligible.length > 0) {
      const pick = eligible.sort((a: any, b: any) => (b.rank || 5) - (a.rank || 5))[0];
      assignments[slotId] = { tmId: pick.key || pick.id, tmName: pick.display_name || pick.name };
      assigned++;
      trace.push({ 
        step: 'assigned', 
        after: assignments[slotId], 
        reason: `Selected best of ${eligible.length} eligible for ${tier?.name}` 
      });
    } else {
      const reason = feasibility.shortfall > 0 && tier?.isHardCoverage
        ? `Unfilled due to insufficient unique TMs for tier (shortfall: ${feasibility.shortfall})`
        : `No eligible TM for ${slotId}`;

      trace.push({ step: 'unfilled', reason });
    }
  }

  trace.push({ step: 'pipeline-complete', reason: `${assigned} assignments made. ${feasibility.explanation}` });

  return {
    assignments,
    trace,
    metrics: { 
      assigned, 
      totalSlots: slots.length,
      feasibility,
    },
    eligibilityRulesUsed: DEFAULT_ELIGIBILITY_RULES.length,
  };
}
