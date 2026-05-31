/**
 * Shared prompt utilities for all Grok calls in the AI Engine Lab + training system.
 *
 * Goal: Ultra token discipline.
 * Philosophy: Never send raw data. Always compact, prune, and summarize.
 *
 * These utilities are designed to be reused by:
 * - engineAnalysis.ts (config improvement proposals)
 * - Future: injection into the main grok-hybrid placement path
 *
 * Modelled directly on the battle-tested patterns in grokEngine.ts (buildGrokEngineSnapshot).
 */

export interface CompactRosterEntry {
  id: string;
  name: string;
  rank: number;
  pool?: string;
}

export interface CompactAssignment {
  slot: string;
  tm: string;
  score?: number;
}

/**
 * Production-grade roster compaction for analysis prompts.
 * Limits total TMs and keeps only essential fields.
 */
export function compactRosterForGrokAnalysis(
  roster: any[],
  maxEntries = 30
): CompactRosterEntry[] {
  if (!roster?.length) return [];

  return roster.slice(0, maxEntries).map((tm) => ({
    id: tm.key || tm.id || tm.tm_id || String(tm),
    name: tm.display_name || tm.name || tm.fullName || 'Unknown',
    rank: typeof tm.rank === 'number' ? tm.rank : 3,
    pool: tm.pool || tm.primary_pool,
  }));
}

/**
 * Compact current assignments — only the fields Grok needs for context.
 */
export function compactAssignmentsForGrokAnalysis(
  assignments: Record<string, any>
): CompactAssignment[] {
  if (!assignments) return [];

  return Object.entries(assignments)
    .filter(([_, a]) => a && (a.tmName || a.tmId))
    .map(([slot, a]) => ({
      slot,
      tm: a.tmName || a.tmId || a.display_name,
      score: typeof a.score === 'number' ? Number(a.score.toFixed(1)) : undefined,
    }));
}

/**
 * Build a compact "unfilled + context" summary.
 * Much cheaper than dumping full objects.
 */
export function buildUnfilledSummary(unfilledSlots: string[], currentAssignments: Record<string, any>) {
  const filledCount = Object.keys(currentAssignments || {}).length;
  return {
    unfilledCount: unfilledSlots.length,
    unfilledExamples: unfilledSlots.slice(0, 6),
    totalSlotsConsidered: filledCount + unfilledSlots.length,
  };
}

/**
 * Cap and format human feedback for few-shot injection.
 * Prevents prompt bloat while keeping the most recent/high-value corrections.
 */
export function buildFewShotCorrectionsBlock(
  feedback: any[],
  maxItems = 5,
  maxChars = 1200
): string {
  if (!feedback?.length) return '';

  let block = '\n\n=== HUMAN OPERATOR CORRECTIONS (few-shot guidance — respect these patterns) ===\n';

  let used = 0;
  for (let i = 0; i < Math.min(feedback.length, maxItems); i++) {
    const fb = feedback[i];
    const text = (fb.correction || fb.freeformFeedback || fb.text || '').trim();
    if (!text) continue;

    const line = `${i + 1}. ${text}\n`;
    if ((block + line).length > maxChars) break;

    block += line;
    used++;
  }

  if (used === 0) return '';

  return block + '\n';
}

/**
 * Create a compact weights snapshot (only non-default values).
 * Accepts partial/optional weights (EngineWeights shape).
 */
export function compactWeightsForPrompt(
  weights: Record<string, number | undefined> | undefined,
  defaults: Record<string, number>
) {
  if (!weights) return {};

  const significant: Record<string, number> = {};
  Object.entries(weights).forEach(([k, v]) => {
    if (v == null) return;
    const def = defaults?.[k] ?? 1.0;
    if (Math.abs(v - def) > 0.05) {
      significant[k] = Number(v.toFixed(2));
    }
  });
  return significant;
}
