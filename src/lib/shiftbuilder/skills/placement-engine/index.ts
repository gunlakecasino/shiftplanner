/**
 * ShiftPlanner Placement Engine Skill — Public Surface
 *
 * The primary AI-native, granular, modifiable interface to the placement engine.
 *
 * See SKILL.md for the full contract and philosophy.
 */

export * from './core/slot-normalization';
export * from './core/eligibility';
export * from './core/target-derivation';

export {
  COVERAGE_TIERS,
  getTierForSlot,
  getTiersUpToSlot,
  calculateCoverageFeasibility,
  type CoverageTier,
  type CoverageFeasibility,
} from './core/target-derivation';

// High-level pipeline (the main thing Grok and advanced callers should use)
export { runEnginePipeline, type PipelineRunResult, type PipelineStepTrace } from './core/pipeline-runner';

// Re-export key types
export type {
  EligibilityRule,
  EligibilityResult,
} from './core/eligibility';

// Future: more granular exports from candidate-preparation, greedy-engine, etc. as they are ported.
