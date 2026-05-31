# ZDS / ShiftPlanner Placement Engine Skill

**Location**: `src/lib/shiftbuilder/skills/placement-engine/`
**Version**: 0.2.0 (ported & integrated into active ShiftPlanner)
**Status**: Active — primary AI-native layer for the GRAVE shift placement engine

## Purpose

This skill is the **granular, inspectable, modifiable heart** of the ShiftPlanner placement system.

It exists so that Grok (or any capable AI) can:
- Fully understand every decision the engine makes
- Call individual pure functions at any level of detail
- Inspect traces, eligibility results, score breakdowns, and provenance
- Propose and apply precise changes (via the AI Lab or Sudo)
- Be extended with new rules, scorers, or strategies without touching legacy code

The ultimate goal (user vision): **Grok becomes the sole root backend**. The deterministic parts stay fast and auditable; Grok supplies the judgment layer on top, trained continuously from your real operational corrections.

## Core Philosophy (Non-Negotiable)

- **Granular > Monolithic**: Dozens of small, named, pure(ish) functions over one giant `runEngine()`.
- **Observable by default**: Every important step produces rich trace/provenance.
- **Data-driven rules**: Eligibility is an array of plain rule functions + config. Scorers are composable.
- **AI-First**: Every public export has excellent JSDoc. SKILL.md is the primary contract an LLM reads.
- **Stable public surface**: High-level `runEnginePipeline` + granular core/ imports.
- **Token discipline**: All Grok calls go through the project's grokClient with compaction + logging.

## Current Architecture in This App (2026-06)

The active ShiftPlanner already has a strong foundation:
- DB-backed, versioned `engine_config` (weights, thresholds, placementMethod including `grok-hybrid`)
- `engineRules.ts` + `engineOverrides.ts` — the live "Rules Engine" facade
- `grokEngine.ts` + `grokClient.ts` — deterministic Top-K + Grok judgment layer (the current production path)
- `placement.ts` / `scoring.ts` — core deterministic scoring

This skill layer sits **on top** and **alongside** as the AI-readable extraction and future sole backend.

Long-term the legacy paths will delegate to (or be replaced by) the pure functions in `core/`.

## Public Surface (What Grok / Code Should Import)

```ts
import {
  runEnginePipeline,
  evaluateEligibility,
  DEFAULT_ELIGIBILITY_RULES,
  // ... more granular exports
} from '@/lib/shiftbuilder/skills/placement-engine';
```

### High-Level
- `runEnginePipeline(input)` → `PipelineRunResult` with full `trace[]` (every step, before/after, reasons)

### Granular (for deep inspection & modification by AI)
- `COVERAGE_TIERS` + `calculateCoverageFeasibility(availableTMs)` — the world-class tiered model + hard unique-TM math
- `evaluateEligibility(candidate, slot, context, rules?)`
- `deriveTargetSlotsInOrder(auxDefs)` (derived from tiers)
- Score primitives from `scoring.ts` (re-exported)
- Candidate preparation, target derivation, greedy strategies
- `normalizeSlotId` (sacred — use everywhere)

## Extension Model (How You Modify Behavior)

The skill is designed to be edited by humans *or* Grok via the AI Lab:

1. **Eligibility Rules** (hard constraints)
   - Edit or extend `DEFAULT_ELIGIBILITY_RULES` array in `core/eligibility.ts`
   - Or pass a custom rules array at call time

2. **Scorers / Weights**
   - Weights live in the live `EngineConfig` (DB)
   - Custom scorers can be registered via extension points

3. **Strategies**
   - `greedy` (current fast default)
   - `grok-hybrid` (production judgment layer)
   - Future: more (Hungarian, constraint solver, etc.)

4. **Provenance & Trace**
   - Every pipeline step records what happened and why.

See `core/extension-points.ts` (to be expanded) and the AI Lab "Apply Suggestion" flow.

## Integration with the Rest of ShiftPlanner

- The AI Lab (`/shiftbuilder/ai`) is the primary training + editing surface.
- Human feedback ("I would have done X because Y") is captured per analysis.
- Feedback is injected as few-shot examples into future Grok calls (via `engineAnalysis.ts` + prompt utils).
- "Apply" buttons in the dashboard call the same mutators used by `EngineConfigTab` / `sudoActions` so changes are real and versioned.

## Token Discipline (Mandatory)

All intelligence calls use the centralized `grokClient.ts` + compaction utilities.
Never send full roster/assignments to Grok — always use the compact forms.

## Files in This Skill

- `SKILL.md` (this file — the contract)
- `index.ts` — clean public exports
- `core/`
  - `eligibility.ts` — rule array + `evaluateEligibility`
  - `slot-normalization.ts`
  - `target-derivation.ts` — `COVERAGE_TIERS`, `calculateCoverageFeasibility`, tiered order model (the heart of the system)
  - `scoring.ts` (re-exports + extensions)
  - `candidate-preparation.ts`
  - `greedy-engine.ts`
  - `pipeline-runner.ts` — `runEnginePipeline` with rich feasibility-aware trace
- `types.ts`
- `provenance.ts`

## Long-Term Vision (User Intent — Do Not Lose)

- Legacy engine code is retired or becomes a thin adapter.
- This skill (plus the DB `engine_config` + AI Lab feedback loop) is the single source of truth.
- Grok can read this directory + SKILL.md, understand the current behavior, propose exact diffs to rules/weights/strategies, and the system applies them safely with full audit.
- Simulation + human correction loop continuously improves the model of "how Brian / ops actually wants this to work".

**This is not just code. It is the living, editable intelligence layer for all grave shift deployment decisions.**

When in doubt, make the next change more granular, more observable, and more AI-modifiable than the last.
