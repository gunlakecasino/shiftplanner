# Unified Placement Intelligence System — Project Plan

**Status:** Substantially implemented, not fully cut over — see the 2026-07-04 status note below before trusting any "pending" claim in this document
**Author:** Claude (Fable 5) with Brian Killian
**Date:** 2026-07-02 (see note below — this header date does not match git history)
**Branch:** `shiftbuilder-ultra-20260627`

> **2026-07-04 status note:** an independent code audit found that most of Phases 0–4 below (unified `engine/` core, night pipeline, health model, AI provider abstraction, week engine) already exist in `src/lib/shiftbuilder/engine/` with 72 passing tests — they did not land incrementally after this doc's 2026-07-02 date; `git log` shows the entire module tree and this document were committed together in one commit on 2026-07-04. Treat this plan's phase breakdown as the *design*, not a changelog — check code/tests before repeating a "not done yet" claim from here. Confirmed done as of 2026-07-04: F1 (operator eligibility rules now reach the main interactive path, `sudoBatchPlanner.ts`, *and* the legacy fallback branch — see §16 update), the `validatePlacementOrder` half of F12 (function removed, not just fixed — see §16), the week engine now has a real UI entry point ("Run Week" button + results sheet, previously P3-4/zero callers), and several additional dead knobs beyond F11's original list (`appliesToZones`/`appliesToSlotTypes`/`appliesToSlotKeys` on `SignalOverride`/`EligibilityRule`, and the unused `versionHistory`/`resolvedVersionName` parent-chain walk) were removed from `engineConfig.ts`/`engineOverrides.ts`. Still open: the 3-way legacy-planner/Timefold/unified-engine architecture question (§15-style decision, not yet made), and Timefold ("Deep Optimize") is a fourth live system this doc's Phase 4/mission statement doesn't mention retiring.

---

## 0. Mission

Take the four systems that currently reason about who goes where —

1. **Placement Engine** (deterministic weighted planner — `runWeightedPlanner`)
2. **Rotation Health** (fit chips, orb, tracker, week policy)
3. **AI** (the LLM judgment layer — currently Grok via xAI; referred to as **AI** from here on, provider-swappable)
4. **Optimizer** (Deep Optimize — `timefoldLocalSolver` local search)

— and unify them into **one system with one brain**: one eligibility gate, one health model, one objective function, one context loader, one run pipeline. The pipeline runs for a **single night or a full grave week (Fri→Thu)**, and every component contributes to the same lexicographic objective:

```
coverage  >  rotation  >  preferences  >  skill
```

(ratified 2026-07-01 — see header of `src/lib/shiftbuilder/placement.ts`)

with hard rules (eligibility, locks, one-TM-per-night, Z1/Z2 manual-only, fill order) as **constraints at every tier, never tradeable costs**.

### Why unification, in one paragraph

Today the four components agree on philosophy but not on arithmetic. There are **two health models** (verdict-band points vs. the granular picker model) used on different surfaces, **two hard-avoid semantics** (planner can relax under coverage pressure; Optimizer never places), **three eligibility call patterns** (only one of which reads operator-defined rules — and nothing in production passes them), and **four separate context-assembly paths** (interactive engine, batch planner, Optimizer, AI brief) that can drift out of sync. Fairness cannot be "truly accurate" while the components measure it differently. The unified system makes every number that appears anywhere — chip, orb, tracker, Optimizer proposal, AI rationale, week report — come from the same functions fed by the same context.

---

## 1. Non-negotiable principles

These govern every task below. Any implementation that conflicts with one of these is wrong, regardless of what the task text says.

| # | Principle |
|---|-----------|
| **N1** | The objective hierarchy `coverage > rotation > preferences > skill` is enforced **lexicographically**. A filled required slot beats any rotation gain. A rotation point beats the entire preference band. Etc. |
| **N2** | Hard rules are constraints, never costs: slot eligibility (gender, grave pool, overlap band), operator eligibility rules, locked slots, one TM per night, scheduled-pool-only, Z1/Z2 manual-only, fill-order tiers. |
| **N3** | **One implementation per concept.** One eligibility gate. One rotation-health scoring function. One objective. One context loader. Every surface (UI chip, planner, Optimizer, AI, reports) calls the same code. |
| **N4** | The AI is a **judgment layer, not an authority**. Every AI proposal passes through the same deterministic guard as everything else. The AI can never reduce coverage, violate a hard rule, or leave a fillable required slot open. It may only choose *among* legal placements. |
| **N5** | Provider-agnostic AI. No module outside `engine/ai/provider/` may import `@ai-sdk/xai` or mention a vendor. Swapping Grok → Claude (or any model) is a config change + one adapter file. |
| **N6** | Explainability is a feature, not a debug aid. Every placement in a final draft carries provenance: which stage placed it (`planner` / `optimizer` / `ai` / `manual` / `preserved`), its scorecard, and a human-readable reason. |
| **N7** | Determinism by default. Given the same context + config + seed, planner and Optimizer output is byte-identical. All randomness goes through a seeded RNG recorded in telemetry. |
| **N8** | **Production-data safety.** The dev server (port 3001) hits production Supabase. All verification during this project is **Draft Mode only — never Apply**, never mutating writes from verification sessions. New tables/migrations reviewed before applying. |
| **N9** | Strangler migration, not big-bang. New `engine/` modules are built alongside the existing code, callers are switched one at a time, legacy paths get `@deprecated` + console warnings, and are deleted only in the final phase. The board must remain fully usable at every merge point. |

---

## 2. Current state — component inventory & defect register

### 2.1 Component inventory (what exists today)

| Component | Key files | Role today |
|---|---|---|
| Placement Engine | `src/lib/shiftbuilder/placement.ts` (881), `scoring.ts` (529), `skills/placement-engine/*` (591), `engineConfig.ts`, `engineOverrides.ts`, `engineRules.ts` | Walks `PLACEMENT_ORDER`, scores candidates per slot (skill/pref/pair/matrix signals), rescue + backfill passes, Top-K breakdown for Why? panel |
| Rotation Health | `shiftRotationHealth.ts` (905), `placementFitScore.ts` (432), `placementFitForSlot.ts` (381), `placementPadHelpers.ts` (615), `rotationHealthEngineContext.ts` (1172) | Fit verdicts + health points per slot, nightly %, week repeat policy %, blended headline %, violations list, candidate picker previews, health-optimized greedy draft |
| AI | `grokClient.ts`, `grokEngine.ts` (566), `grokIntelligence.ts` (563), `grokSchemas.ts`, `xaiFillOrderContract.ts` (498), `ai/*` (analysis/prompt utils), `app/shiftbuilder/actions.ts` (tool wiring), `engineRules.ts` (tool defs) | Hybrid reranker over planner Top-K, placement-pad insight, fill-order constitution text, executable tools (`checkEligibility`, `scoreCandidate`, `previewRotationFit`, `getTMScheduleStatus`) |
| Optimizer | `timefold/timefoldLocalSolver.ts` (665), `timefoldMock.ts`, `timefoldTypes.ts`, `hooks/useTimefoldOptimize.ts` | In-process multi-restart hill-climb over fill/replace/swap, near-lexicographic objective, 3 proposal variants (balanced / minimal / max-spread) |
| Batch path | `sudoBatchPlanner.ts` (633), `sudoActions.ts` | Server-ish batch night/week runs, separate context assembly from the interactive path |
| Run surfaces | `ShiftBuilderClient.tsx` (`runCoverageEngine` ~line 4098), `CanvasEngineCluster.tsx`, `RotationHealthFloater.tsx`, `usePlacementFitMap.ts` | Buttons, orb, tracker, draft mode |

### 2.2 Defect register (from the 2026-07-02 deep review)

These are the confirmed defects the unified system must not inherit. Each maps to a task (traceability table in §16).

| ID | Defect | Where |
|----|--------|-------|
| **F1** | Operator `engine_eligibility_rules` + `engine_signal_overrides` never reach any live path — `isEligibleForSlot` is always called without rules; `getFullyResolvedEngineConfig` only used by the Sudo display tab | `placement.ts:431,552`, `timefoldLocalSolver.ts:112`, `placementFitForSlot.ts:291`, `dragFit.ts:74` |
| **F2** | `buildHealthOptimizedDraft` silently drops coverage: when all Top-K are prior-3-blocked it skips the slot; open slots don't reduce health %, so the "better" draft can simply cover less — and the AI brief tells the model to use it as baseline | `rotationHealthEngineContext.ts:449–475, 613` |
| **F3** | Hard-avoid semantics disagree: planner rescue/backfill can place a hard-avoid TM under coverage pressure; Optimizer `canHold` never does | `placement.ts:287–309` vs `timefoldLocalSolver.ts:191–194` |
| **F4** | Two health models: board surfaces use the granular picker model (`applyGranularHealthToFitMap`), but draft projections (`computeDraftFitPercent`), the AI brief numbers, and the Optimizer's `PairEvaluator` use raw verdict-band points | `rotationHealthEngineContext.ts:168–213` vs `:253`; `timefoldLocalSolver.ts:160–179` |
| **F5** | `meetsTarget` computed from unblended daily % while displayed `percent` is the 0.7/0.3 blend | `shiftRotationHealth.ts:488–491` |
| **F6** | `weeklyHistories` branch half-implemented: never computes `weekPolicyPercent`, counts by exact key (not area-merged), dead locals | `shiftRotationHealth.ts:349–365` |
| **F7** | Optimizer constraint panel hardcodes `full_grave_only` / `rr_gender` / `no_double_book` as "satisfied" without checking the actual solution (seed board violations survive) | `timefoldLocalSolver.ts:349–366` |
| **F8** | Picker verdict sentinel `points === 50 → critical_repeat` is fragile (a real critical capped ≤50 can land at 43 → shows "needs_swap"); dead penalty block after the early return | `rotationHealthEngineContext.ts:936–945, 746–749` |
| **F9** | Drag halos count week repeats by exact slot key, not area-merged `placementRepeatKey` — WRR8 history shows "great" halo on MRR8 | `dragFit.ts:66–79` |
| **F10** | Coverage feasibility ignores gender split — 21 full-grave men declared "mathematically possible" though 5 WRRs are unfillable | `placement.ts:335`, `skills/placement-engine/core/target-derivation.ts:191` |
| **F11** | Dead config knobs: `fatigue_index`, `weekly_load_balance`, `skill_stretch_reward`, `sweeper_rotation_penalty` are tunable but implemented by no signal | `engineConfig.ts:102–121` |
| **F12** | `validatePlacementOrder` stub always returns `[]`; base `checkEligibility` tool returns hardcoded `isEligible:false` (actions.ts overrides it, but bare `createEngineRulesTools` lies); duplicated dead `fairnessSignals` fallback expression | `placement.ts:708`, `engineRules.ts:352–406`, `shiftRotationHealth.ts:393–394` |
| **F13** | `computeSlotPlacementFit` occupant-gap filtering is recursive & expensive; `buildHealthOptimizedDraft` invokes it per candidate per slot **without** `skipOccupantGapFilter` | `placementFitForSlot.ts:70–141`, `rotationHealthEngineContext.ts:420–447` |

---

## 3. Target architecture

### 3.1 Module layout (new code)

All new engine code lives under `src/lib/shiftbuilder/engine/`. Existing files become thin delegating shims during migration (N9), then are removed.

```
src/lib/shiftbuilder/engine/
├── index.ts                  # runUnifiedEngine() — the ONLY public entry point
├── types.ts                  # EngineRunRequest, EngineRunResult, Draft, SlotPlacement,
│                             # Scorecard, Provenance, NightContext, WeekContext
├── context.ts                # buildNightContext() / buildWeekContext() — the ONE data loader
├── eligibility.ts            # canPlace() — the ONE hard gate (N2)
├── objective.ts              # scorecard(), compareScorecards(), objectiveValue() (N1)
├── feasibility.ts            # gender-aware tier feasibility (fixes F10)
├── planner.ts                # deterministic seed pass (successor to runWeightedPlanner)
├── optimizer.ts              # night + week local search (successor to timefoldLocalSolver)
├── health/
│   ├── model.ts              # rotationHealthPoints() — the ONE health scorer (fixes F4)
│   ├── verdict.ts            # verdictFromPoints(), band constants (fixes F8)
│   ├── weekPolicy.ts         # week repeat policy score + violations (fixes F5, F6)
│   └── projections.ts        # projectDraftHealth(), projectWeekHealth()
├── ai/
│   ├── provider.ts           # AiProvider interface (N5)
│   ├── providers/xai.ts      # current Grok adapter (moves grokClient internals here)
│   ├── providers/anthropic.ts# Claude adapter (same interface)
│   ├── briefs.ts             # context pack builders (successor to rotation brief + engineInsight)
│   ├── tools.ts              # real executable tools (successor to createEngineRulesTools + actions.ts overrides)
│   └── guard.ts              # validateAiDraft() — deterministic acceptance gate (N4)
├── guard.ts                  # validateDraft() — shared final validation (used by ai/guard too)
├── provenance.ts             # per-slot provenance records + reason text
├── telemetry.ts              # EngineRunTelemetry v2 (per-stage timings, scores, seeds)
└── __tests__/                # vitest — invariant suite + fixtures (see §12)
    ├── fixtures/
    │   ├── roster.ts          # synthetic 26-TM roster builder (gender/pool mix)
    │   └── history.ts         # seeded 30-night history generator
    ├── invariants.test.ts
    ├── planner.test.ts
    ├── optimizer.test.ts
    ├── health.test.ts
    └── weekEngine.test.ts
```

### 3.2 The unified run pipeline

One entry point, two scopes:

```ts
runUnifiedEngine({
  scope: "night" | "week",
  nightIso?: string,          // scope=night
  weekStartIso?: string,      // scope=week (a Friday)
  mode: "full" | "planner-only" | "optimizer-only" | "no-ai",
  preserve: "locked-only" | "all-existing",
  aiEnabled: boolean,         // honors engine_config + kill switch
  seed?: number,              // default: hash(nightIso|weekStartIso)
  budgetMs?: number,          // optimizer budget (default 9s night / 25s week)
})
```

**Stage order (night scope):**

```
┌─ 1. CONTEXT     buildNightContext() — one loader, one shape (§3.3)
├─ 2. FEASIBILITY gender-aware tier math → operator-facing reality check
├─ 3. PLANNER     deterministic fill-order walk → seed Draft + Top-K per slot
├─ 4. OPTIMIZER   local search from planner seed (+ scratch restart variant),
│                 objective = objective.ts, health = health/model.ts
├─ 5. AI          (optional) receives brief + optimizer best + alternates + tools;
│                 proposes slot-level overrides with rationale
├─ 6. GUARD       validateDraft(): hard rules, coverage-no-worse, objective
│                 re-scored deterministically; illegal AI overrides rejected
│                 individually (not whole-draft)
└─ 7. RESULT      Draft + per-slot provenance + Scorecard + stage telemetry
```

**Week scope** wraps the night pipeline in a rolling loop plus a cross-night polish pass (§8). Stages 3–5 run per night in grave-week order (Fri→Thu) with the in-flight week solution merged into each subsequent night's rotation context; then stage 4b (week polish) runs cross-night improvement on the whole week before AI review.

**Key contract:** stages 3, 4, and 5 all *emit and consume the same artifact* — a `Draft` (slot→placement map with provenance) plus a `Scorecard`. Each stage may only replace the incumbent draft with one whose scorecard is **lexicographically ≥** on (coverage, then …). That single rule mechanically enforces N1 across all four components.

### 3.3 The unified context (one loader)

`EngineContext` replaces today's four ad-hoc assemblies (ShiftBuilderClient engine handler, sudoBatchPlanner, Optimizer input, AI brief args). Built once per run, passed by reference everywhere:

```ts
type NightContext = {
  nightIso: string;
  config: FullyResolvedEngineConfig;      // resolved chain + signal overrides + eligibility rules (fixes F1)
  slots: SlotModel[];                      // key, tier, difficulty, isOptional (Z1/Z2), isRotationTracked, lock state
  roster: TmModel[];                       // id, name, gender, gravePool, overlap flags, scheduled flag
  scheduledTmIds: Set<string>;             // graves_default_schedule + night_on_call
  assignments: Record<string, SlotAssignmentRow>;   // live board (with locks + provenance)
  histories: Record<string, ZoneDetailEntry|null>;  // 30-night spread
  weeklyRecentHistory: Map<string, WeekNightRecord[]>; // already scoped ≤ nightIso
  zoneMatrix: Map<string, Map<string, TmZoneMatrixRow>>;
  preferencesByTm / pairAffinitiesByTm / accommodationsByTm / skillScores / slotDifficulty;
  adjacency: Map<string, string[]>;
};
type WeekContext = { weekStartIso; nights: NightContext[]; /* shared refs, per-night rosters */ };
```

Rules:
- **All history scoping happens in the loader** (`filterWeeklyHistoryThroughNight`, `beforeIso` exclusivity). Downstream code never re-filters — that's how tonight/this-week off-by-ones happen.
- Loader is isomorphic: callable client-side (interactive) and server-side (batch), same shape.
- Loader is the only module that touches Supabase for engine data.

### 3.4 Provenance model

Every placement in every draft:

```ts
type Provenance = {
  stage: "preserved" | "manual" | "planner" | "optimizer" | "ai";
  reason: string;              // human sentence, deterministic template
  scorecard: SlotScorecard;    // eligibility, healthPoints, prefScore, skillScore, flags
  aiRationale?: string;        // only when stage === "ai"
  relaxations?: Array<"rotation-prior3" | "rr-side-family" | "hard-avoid">; // rescue ladder flags (D1)
  seed?: number;
};
```

The Why? panel, fit chips, deployment change log, and week report all read from this — no re-derivation.

---

## 4. Terminology & naming migration (Grok → AI)

The system must not care which model powers the judgment layer (N5). This is both a code abstraction and a copy sweep.

| Today | Target |
|---|---|
| `grokClient.ts` | `engine/ai/providers/xai.ts` (behind `AiProvider`) |
| `grokEngine.ts`, `grokIntelligence.ts` | `engine/ai/` (briefs, run logic) — split by function, not vendor |
| `grokSchemas.ts` | `engine/ai/schemas.ts` |
| `xaiFillOrderContract.ts` | `engine/ai/fillOrderContract.ts` (name says what it is, not who reads it) |
| `engine_config.placement_method = "grok-hybrid"` | `"ai-hybrid"` (legacy value accepted on read, migrated on write) |
| `engine_config.grok_reasoning_effort` | `ai_reasoning_effort` (migration + dual-read window) |
| UI copy: "Run xAI Engine", "Grok", "xAI" sphere labels | "AI Engine", "AI" (`XAISphere.tsx` → `AiSphere.tsx`, `CanvasEngineCluster` labels, FloatingNav, PlacementPad) |
| `aiUsageTracker.ts` | keep — already vendor-neutral; add `provider` dimension |

Provider interface (the only vendor seam):

```ts
interface AiProvider {
  id: "xai" | "anthropic";
  completeStructured<T>(args: {
    system: string; prompt: string; schema: ZodSchema<T>;
    tools?: AiToolset; reasoningEffort: "none"|"low"|"medium"|"high";
    maxTokens?: number; abortSignal?: AbortSignal;
  }): Promise<{ output: T; usage: TokenUsage; toolCalls: ToolCallLog[] }>;
}
```

Both adapters implement it via the Vercel AI SDK (`ai` package) — xAI through `@ai-sdk/xai` (already installed), Anthropic through `@ai-sdk/anthropic` (new dep). Selection: `engine_config.ai_provider` with env-var override `SHIFTBUILDER_AI_PROVIDER` for testing.

---

## 5. Phase 0 — Foundation repairs (fix before building on top)

Small, independent, high-certainty fixes. Each is a standalone commit with its own verification. Items that Phase 1 fully rewrites are marked *stopgap*.

> Convention below — **Files:** what's touched · **Work:** exact change · **Accept:** verifiable acceptance criteria · **Size:** S/M/L

**P0-1 · Wire operator eligibility rules into live paths (stopgap for F1)**
**Files:** `ShiftBuilderClient.tsx` (engine handler ~4141), `sudoBatchPlanner.ts:461`, `placement.ts` (`WeightedPlannerInput`), `engineOverrides.ts`
**Work:** Load `getFullyResolvedEngineConfig()` where `getActiveEngineConfig()` is loaded for engine runs; add `eligibilityRules` to `WeightedPlannerInput.scoringCtx`; thread into both `isEligibleForSlot` calls inside `runWeightedPlanner`; replace the `require("./engineOverrides")` dynamic import with a static import (verify no cycle — if cyclic, move `isEligibleUnderRules` into a leaf module).
**Accept:** A test rule in `engine_eligibility_rules` (hard-exclude TM X from Z9) causes the planner to never propose X on Z9, verified in Draft Mode; removing the rule restores X. Superseded by P1-2 but keeps prod honest meanwhile.
**Size:** M

**P0-2 · Stop the health-optimized draft from dropping coverage (F2)**
**Files:** `rotationHealthEngineContext.ts` (`buildHealthOptimizedDraft`)
**Work:** When the health-gated pass and the prior-3-filtered fallback both fail, add a final rescue tier: pick the best remaining candidate by planner total *even if* prior-3-blocked (mirroring the planner's rescue ladder), tag `relaxations: ["rotation-prior3"]`, and set its true computed healthPoints (not 0). Never `continue` while unused eligible candidates exist for a required slot.
**Accept:** Fixture where all Top-K for Z4 are prior-3-blocked → health draft still fills Z4 with the same TM the planner rescue chose; `projectedFitPercent` reflects the real (low) points; slot-count parity between planner draft and health draft on every fixture.
**Size:** S

**P0-3 · Fix `meetsTarget` / headline mismatch (F5)**
**Files:** `shiftRotationHealth.ts:488`
**Work:** Compute `meetsTarget` from `effectivePercentForDisplay` (the same number shown). One-line change + comment stating the blend is authoritative (per D2).
**Accept:** Unit test: daily 82 / week 94 → blend 85.6 → `meetsTarget === true`; daily 86 / week 80 → blend 84.2 → `false`.
**Size:** S

**P0-4 · Repair or remove the `weeklyHistories` branch (F6)**
**Files:** `shiftRotationHealth.ts:349–365`
**Work:** Grep confirms whether any caller passes `weeklyHistories`. If none (expected): delete the branch, narrow the options type, remove dead locals. If callers exist: area-merge via `placementRepeatKey`, compute `weeklyBalance` identically to the recent-map path (extract shared helper).
**Accept:** Either the branch is gone and types no longer advertise it, or both paths return identical `weekPolicyPercent` for equivalent inputs (test with MRR8/WRR8 alternation fixture).
**Size:** S

**P0-5 · Make Optimizer constraint panel honest (F7)**
**Files:** `timefoldLocalSolver.ts` (`constraintSignals`)
**Work:** Actually evaluate the displayed solution: `full_grave_only` / `rr_gender` = any placement failing `isEligibleForSlot`; `no_double_book` = duplicate tmId across slots. Report `violated` with detail (slot + TM name) instead of hardcoded `satisfied`. Locked-slot violations get a distinct detail ("locked — operator review").
**Accept:** Seeding the board with a female TM on MRR6 (fixture) shows `rr_gender: violated (MRR6 — <name>)` in every proposal's panel.
**Size:** S

**P0-6 · Fix picker verdict banding + dead code (F8)**
**Files:** `rotationHealthEngineContext.ts` (`pickerVerdictFromHealthPoints`, `computeCandidatePickerHealthPoints`)
**Work:** Replace the `=== 50` sentinel with an explicit flag: `computeCandidatePickerHealthPoints` returns `{ points, isCritical }` (critical = prior-3 hit or verdict cap critical); verdict mapping uses the flag, not equality. Delete the unreachable `criticalIdx < WINDOW` block. Update the two call sites (`previewCandidateRotationFit`, `applyGranularHealthToFitMap`).
**Accept:** A week-repeat-3× TM scoring 43.7 points shows `critical_repeat` (not `needs_swap`); no behavior change for non-critical scores (snapshot test over fixture grid).
**Size:** S

**P0-7 · Area-merge drag halo repeats (F9)**
**Files:** `dragFit.ts` (`computeDragFitMap`)
**Work:** Key `repeatsBySlot` by `placementRepeatKey(entry.slotKey)`; look up by `placementRepeatKey(slotKey)`. Remove the "custom rules" claim from the header comment until P1-2 lands (then restore).
**Accept:** TM with WRR8 ×2 this week → MRR8 halo shows `poor`, WRR6 shows `great` (side-family is deliberately *not* a halo tier — matches engine soft-penalty semantics).
**Size:** S

**P0-8 · Gender-aware feasibility (F10)**
**Files:** `skills/placement-engine/core/target-derivation.ts` (`calculateCoverageFeasibility`), `placement.ts:334–345`
**Work:** Signature becomes `calculateCoverageFeasibility({ fullGraveMale, fullGraveFemale })`. Tier-1 clearable iff `male ≥ 5 && female ≥ 5`; shortfall reported per gender ("short 2 female TMs for WRRs"). `runWeightedPlanner` computes the split via `normalizeGender`. Keep a deprecated single-arg overload for one release.
**Accept:** 21 full-grave males → "Tier 1 cannot be cleared: 0/5 female"; 11M+10F → feasible.
**Size:** S

**P0-9 · Dead code & lint sweep (F12)**
**Files:** `placement.ts:708` (`validatePlacementOrder`), `engineRules.ts` base tools, `shiftRotationHealth.ts:393`
**Work:** Delete `validatePlacementOrder` (or implement — it's unused; delete). Make base `checkEligibility`/`scoreCandidate` tool `execute` throw `"not wired — use engine/ai/tools"` instead of returning fake data. Fix the duplicated `fairnessSignals` fallback.
**Accept:** `pnpm lint` + `tsc --noEmit` clean; grep shows no callers of removed symbols.
**Size:** S

**P0-10 · Stand up the test harness**
**Files:** `package.json`, `vitest.config.ts`, `engine/__tests__/fixtures/*`
**Work:** Add `vitest` (+ `@vitest/coverage-v8`); `"test": "vitest run"`, `"test:watch": "vitest"`. Build the two fixture generators: `makeRoster({ males, females, amOverlap, pmOverlap })` and `makeHistory(seed, nights)` producing `ZoneDetailEntry` + `weeklyRecentHistory` shapes. Write first tests against P0-2…P0-8 (they double as regression locks).
**Accept:** `pnpm test` green in CI-less local run; fixtures produce deterministic output for a fixed seed.
**Size:** M

*Phase 0 exit criteria:* all ten tasks merged; board behaves identically except for the fixed defects; test suite exists and locks each fix.

---

## 6. Phase 1 — One brain: unified core primitives

Build the four shared primitives every component will call. Pure functions, fully unit-tested, no UI changes yet.

**P1-1 · `engine/context.ts` — the one loader**
**Work:** Implement `buildNightContext()` consolidating the data assembly currently duplicated in: `ShiftBuilderClient.runCoverageEngine` (~4123–4160), `sudoBatchPlanner.ts` (~430–470), `useTimefoldOptimize` input building, and `buildRotationHealthEngineBriefArgs`. Includes: resolved config (P1-2), schedule gate (`graves_default_schedule` + `night_on_call`), roster normalization (single `TmModel` — kills the `id`/`tmId`/`tm_id` + `gravePool`/`grave_pool` duality via `assignmentTmId`/`memberToPlacementProfile` absorbed here), history scoping (N: all `beforeIso`/`throughIso` filtering here and only here), slot models with lock + tier + difficulty + `isRotationTracked` (from `shouldShowPlacementFitChip`) + `isOptional` (Z1/Z2).
**Accept:** Snapshot test: context built from fixtures matches expected shape; interactive and batch loaders produce identical contexts for identical inputs; every downstream module in later phases takes `NightContext` and nothing else.
**Size:** L

**P1-2 · `engine/eligibility.ts` — the one gate (closes F1 properly)**
**Work:** `canPlace(tm: TmModel, slot: SlotModel, ctx): { ok: boolean; reason?: string }`. Composes, in order: (1) skill-layer rules (`skills/placement-engine/core/eligibility.ts`), (2) core liturgy (current `isEligibleForSlot` body), (3) operator rules from `ctx.config.eligibilityRules` (`isEligibleUnderRules`), (4) schedule gate when enabled. Returns the *first failing reason* for explainability. All call sites migrate: planner, optimizer, fit chips (`placementFitForSlot`), drag halos (`dragFit`), swap suggester (`canSuggestSwapBetween`), AI tools. `placement.ts#isEligibleForSlot` becomes a deprecated shim delegating to it.
**Accept:** Grep: zero direct `isEligibleForSlot` calls outside the shim + gate. Operator-rule fixture from P0-1 passes through every surface (planner, optimizer, chip shows `poor_fit`, halo shows `blocked`, AI tool returns `ok:false` with reason).
**Size:** M

**P1-3 · `engine/health/model.ts` — the one health scorer (closes F4)**
**Work:** Extract the **granular picker model** as the canonical scorer:
```ts
rotationHealthPoints(tm, slot, ctx, opts?): { points: number; isCritical: boolean; facts: HealthFacts }
```
Internals = current `computeCandidatePickerHealthPoints` + its input assembly from `previewCandidateRotationFit` (spread counts, last-5 merged trail, week repeat through tonight, days-since, gap counts, week workload), with P0-6's critical flag. `HealthFacts` carries the raw signals so chip text (`scorePlacementFit` summaries) renders from facts without re-computing. Migrate all consumers:
- `applyGranularHealthToFitMap` → thin wrapper
- `computeDraftFitPercent` / `scoreDraftRotationHealth` → both use model (F4 projection split dies)
- `buildHealthOptimizedDraft` → optimizes model points
- Optimizer `PairEvaluator` → static-context variant `rotationHealthPointsStatic()` sharing the same core with board-dependent terms (swap-lane) zeroed; the delta vs full model documented + asserted < ±3pt in tests
- `slotHealthPoints` / `VERDICT_POINTS` retained only as fallback when `healthPoints` missing (legacy rows)
**Accept:** Property test: for any fixture (tm, slot, ctx), chip points == picker points == projection points == optimizer static points ± documented swap-lane delta. Orb/tracker values unchanged for a recorded real-board snapshot (golden test).
**Size:** L

**P1-4 · `engine/objective.ts` — the one objective (N1)**
**Work:** 
```ts
type Scorecard = { coverage: number; healthTotal: number; prefTotal: number; skillTotal: number; hardViolations: string[] };
scorecardFor(draft, ctx): Scorecard
compareScorecards(a, b): -1|0|1        // lexicographic; hardViolations.length first (must be 0)
objectiveValue(sc): number             // tier multipliers for the optimizer's hot loop
```
Tier multipliers derived from the current solver's (1e7/1e3/10/1) but **computed from bounds** (`slots.length`, max health 100, pref band from weights) with a static assert that tiers can't overlap — no magic numbers. Health term uses P1-3; pref/skill terms extracted from `scoring.ts` (`scorePreference`, `scoreSkillMatch`) unchanged in math.
**Accept:** Unit tests: +1 coverage beats +3000 health on a 30-slot board; +1 health point beats max pref swing; hard violation makes a draft incomparable-worse regardless of totals.
**Size:** M

**P1-5 · `engine/guard.ts` — the one validator**
**Work:** `validateDraft(draft, ctx, { baseline?: Draft }): { ok, violations[], perSlot }` checking: every placement passes `canPlace`; no duplicate TM per night; locked slots unchanged; Z1/Z2 untouched unless `manual`; fill-order/tier legality (absorb `assignViolatesFillOrder` from `xaiFillOrderContract`); when `baseline` given, `coverage ≥ baseline.coverage` (N4). This is the same function the AI guard, the Apply pre-check, and the test invariants call.
**Accept:** Every defect fixture from Phase 0 is caught with a specific violation message; a legal draft passes with `ok:true` in <5ms on a 30-slot board.
**Size:** M

**P1-6 · Resolve D1 and align both rescue ladders (closes F3)**
**Work:** Implement the decided hard-avoid semantics (§15 D1 — recommended: single ordered relaxation ladder `rotation-prior3 → rr-side-family → hard-avoid-preference`, hard-avoid only when the alternative is an *empty required slot*, always tagged in provenance and surfaced in UI). Encode the ladder once in `engine/planner.ts` rescue AND `engine/optimizer.ts` fill (`canHold` gains a `relaxLevel` parameter). Both components must produce the same pick on the same starved fixture.
**Accept:** Starved-roster fixture (every candidate blocked by something): planner and optimizer fill the slot with the same TM, provenance shows the same relaxation tag; with strict-D1 chosen instead, both leave it open and report identically.
**Size:** M

*Phase 1 exit criteria:* primitives merged with ≥90% line coverage on `engine/`; legacy surfaces still run through shims; a recorded production board snapshot re-scored through the new primitives matches current UI numbers (or every diff is an explained, intended fix).

---

## 7. Phase 2 — Unified night pipeline

**P2-1 · `engine/planner.ts` — port `runWeightedPlanner`**
**Work:** Same algorithm (fill-order walk, preserve/locked semantics, Top-K breakdown, rescue + backfill) rebuilt on P1 primitives: `canPlace` (P1-2), health via P1-3 available to scoring, rescue ladder from P1-6, notes → structured provenance. Keep `scoring.ts` signal math (skill/pref/pair/matrix, rr-side-family penalty, prior-3 hard gate) — it's sound; only its eligibility and exclusion plumbing changes. `runWeightedPlanner` becomes a deprecated shim.
**Accept:** Differential test: for 50 seeded fixtures, shim output ≡ old implementation except on cases covered by fixed defects (each diff annotated in the test).
**Size:** L

**P2-2 · `engine/optimizer.ts` — port the local solver (night mode)**
**Work:** Port `timefoldLocalSolver` mechanics (multi-restart hill-climb, fill/replace/swap moves, budgeted batches, 3 variants) onto: `objectiveValue` (P1-4), `rotationHealthPointsStatic` (P1-3), `canPlace` + relaxation ladder (P1-2/P1-6), honest constraint signals (P0-5 logic via P1-5). Additions: (a) **seed from planner draft**, not raw board, when run inside the pipeline (board-seed remains for standalone Deep Optimize button); (b) accept `seed` for determinism (N7); (c) `onTick` contract unchanged so `useTimefoldOptimize` UI keeps working; (d) move acceptance uses `compareScorecards`, killing the float-sum tier arithmetic.
**Accept:** Same-seed runs byte-identical; optimizer result scorecard ≥ planner seed scorecard on every fixture (invariant I3); existing Deep Optimize sheet renders proposals unchanged (manual Draft-Mode check, N8).
**Size:** L

**P2-3 · `engine/index.ts` — `runUnifiedEngine` (night scope) + stage telemetry**
**Work:** Orchestrate §3.2 stages 1–7. Each stage records `{ stage, ms, scorecard, notes }` into `EngineRunTelemetry v2` (supersedes `logEngineRunSummary`; keep console group output). `mode` flags gate stages. Guard failures at stage 6 reject *individual* AI overrides and fall back to the optimizer draft for those slots (never whole-run failure).
**Accept:** `runUnifiedEngine({scope:"night", mode:"no-ai"})` on fixtures returns a draft whose scorecard equals optimizer output; telemetry has one entry per executed stage; every slot has provenance.
**Size:** M

**P2-4 · Switch the interactive surface**
**Files:** `ShiftBuilderClient.tsx` (`runCoverageEngine`), `CanvasEngineCluster.tsx`, `useTimefoldOptimize.ts`
**Work:** The engine button calls `runUnifiedEngine` behind a feature flag `engine_config.unified_pipeline` (default off → legacy path). Draft Mode consumes the returned draft + provenance (Why? panel reads `SlotRanking`-compatible breakdown emitted by P2-1). Deep Optimize button → `mode:"optimizer-only"` with board seed.
**Accept:** With flag ON in Draft Mode on prod data (no Apply, N8): draft renders, Why? panel populated, orb/tracker/chips consistent with projected scorecard; flag OFF is bit-identical legacy.
**Size:** M

**P2-5 · Switch the batch surface**
**Files:** `sudoBatchPlanner.ts`, `sudoActions.ts`
**Work:** Batch night runs call `runUnifiedEngine` (server-capable context loader). Batch-week keeps its current per-night loop until Phase 3 replaces it. Delete the duplicated context assembly.
**Accept:** Batch run on a fixture night produces the identical draft as the interactive path given identical context (single test asserting cross-surface equality — the whole point of unification).
**Size:** M

---

## 8. Phase 3 — Week engine (where fairness actually lives)

The max-1-per-area-per-week policy and 30-night spread can only be *optimized* (not just measured) with cross-night reasoning.

**P3-1 · `buildWeekContext()`**
**Work:** For `weekStartIso` (Friday) → 7 `NightContext`s sharing immutable refs (histories, matrix, prefs, config) with per-night: scheduled roster, locks, existing built assignments. Nights already built/locked are `preserve:"all-existing"` by default (operator toggle per night). DB reads batched (one query per table for the whole week).
**Accept:** Context for a real week loads in <2s from prod (read-only); per-night rosters match the Week Overview.
**Size:** M

**P3-2 · Rolling sequential solve**
**Work:** For each night Fri→Thu: run stages 3–4 with `weeklyRecentHistory` = DB weeks **+ solved earlier nights of this run** (reuse the existing `weekEntries` merge machinery — `getMergedPlacementSequence` already supports it). After each night, fold its placements into the rolling week map. This makes prior-3 and week-repeat gates *see the in-flight week*, which the current batch path only partially does.
**Accept:** Fixture: TM placed on Z4 Friday is prior-3-blocked from Z4 Sat/Sun in the same run; week policy violations on the solved week = 0 when roster size permits (invariant I6).
**Size:** M

**P3-3 · Cross-night polish pass (week optimizer)**
**Work:** After the rolling solve, a week-scope local search over the whole solution. **Neighborhood:** within-night replace/swap (as night mode) + *cross-night re-slot*: change which slot a TM holds on night N (never which nights they work — schedule is a constraint). **Objective:** week scorecard = (Σ nightly coverage, week-health, Σ pref, Σ skill) where week-health = mean granular nightly health − week-policy penalty (from `health/weekPolicy.ts`, same math as the tracker).
**Critical implementation detail:** rotation scores are now *solution-dependent* (moving Tuesday changes Wednesday's prior-3 and week counts), so the night-mode static `PairEval` cache is invalid across nights. Implement **incremental scoring**: solution state maintains per-(tm, areaKey) week counts + per-tm ordered week trail; a move produces a bounded dirty set (the moved TM's later-night placements in affected areas) and only those pairs re-score. Target: ≥5k moves/s on a 7×30 board; budget default 25s.
**Accept:** Week scorecard after polish ≥ rolling result on every fixture (I3-week); `repeatViolations` strictly decreases or holds on 20 seeded fixtures; determinism per seed; incremental score equals full recompute (assert every 500 moves in test mode).
**Size:** XL — the largest single task in the plan

**P3-4 · Week draft artifact + apply flow**
**Work:** `WeekDraft = { nights: Record<iso, Draft>, weekScorecard, violations, fairnessLedger }`. Surfaces in Week Overview as per-night draft columns with a week summary strip (policy %, violations before/after, per-TM deltas). Apply is **per-night** (existing draft-apply path re-used) or "apply week" = sequential per-night applies with progress + rollback-on-error. Draft persistence in the existing draft storage keyed by night (no schema change if current draft rows suffice — verify; else migration in §13).
**Accept:** Draft-Mode week run on prod (no Apply, N8) renders 7 columns + summary; per-night apply path unit-tested against fixtures with mocked mutations.
**Size:** L

**P3-5 · Fairness ledger**
**Work:** `health/projections.ts#weekFairnessLedger(weekDraft, ctx)` → per-TM: nights worked, unique areas, repeat count, difficulty-weighted load (Σ slot difficulty), admin share, RR share, spread-gap closures. Feeds the week summary strip, the AI week brief, and (later) the rotation report page.
**Accept:** Ledger totals reconcile with `buildWeekRepeatData` outputs on fixtures; snapshot test.
**Size:** M

---

## 9. Phase 4 — AI layer, provider-agnostic (can start parallel with Phase 3 after Phase 2)

**P4-1 · Provider abstraction**
**Work:** Implement §4: `AiProvider` interface, `providers/xai.ts` (port `grokClient` — model id, headers, usage capture), `providers/anthropic.ts` (Claude via `@ai-sdk/anthropic`; default model `claude-fable-5` configurable), selection from `engine_config.ai_provider` + env override. `aiUsageTracker` gains a provider dimension.
**Accept:** Contract test suite runs against a `MockProvider`; both real adapters compile and satisfy the interface; no `@ai-sdk/xai` import outside `providers/xai.ts` (lint rule via `no-restricted-imports`).
**Size:** M

**P4-2 · Unified AI brief**
**Work:** `ai/briefs.ts` builds the single context pack from `NightContext`/`WeekContext` + optimizer result: rules constitution (fill order, eligibility — from `engineRules` text builders), scoring-band explainer, candidate rotation previews (P1-3 previews), optimizer draft + alternates with scorecards, week violations + fairness ledger (week scope). Replaces the ad-hoc assembly across `grokEngine`, `engineInsightForPlacement` (engine-run portion), and `buildRotationHealthEngineBrief`'s summaryText. Token budget enforced (truncation order: alternates → previews depth → violations list).
**Accept:** Brief snapshot tests (night blank / night partial / week); token count under budget on the largest fixture; numbers in the brief provably from P1-3/P1-4 (same values as the scorecard, F4's split gone).
**Size:** L

**P4-3 · Real tools**
**Work:** `ai/tools.ts` — port the *working* implementations from `actions.ts` (checkEligibility → `canPlace`, scoreCandidate → planner scoring, previewRotationFit → P1-3 preview, getTMScheduleStatus) bound to the live `EngineContext`; add `scoreDraft` (returns full Scorecard for a proposed draft — replaces the "call scoreDraftRotationHealth before final JSON" prompt instruction with an actual tool). Delete the lying placeholder tools (P0-9 made them throw).
**Accept:** Tool-call round-trip test with MockProvider; `scoreDraft(optimizerDraft)` returns the identical scorecard stage 4 recorded.
**Size:** M

**P4-4 · AI stage + guard (N4)**
**Work:** Stage 5 sends the brief, requests structured output: `{ overrides: Array<{slotKey, tmId, rationale}>, notes }` (Zod schema in `ai/schemas.ts`). `ai/guard.ts#validateAiDraft`: apply overrides to optimizer draft → `validateDraft` with `baseline = optimizerDraft` → reject illegal overrides individually with reasons; accepted overrides get `stage:"ai"` provenance + rationale. Policy knobs: `ai_max_overrides` (default 8), `ai_objective_tolerance` (default 0 — AI may not lower the scorecard; D6).
**Accept:** Adversarial tests: AI proposing a gender violation / double-book / coverage drop / Z1 fill → each rejected with a reason, run still succeeds; a health-improving legal override is accepted and provenance-tagged.
**Size:** M

**P4-5 · Naming & copy sweep**
**Work:** Execute the §4 rename table: file moves with re-export shims, DB migration for `ai_provider`/`ai_reasoning_effort`/`"ai-hybrid"` (dual-read: `grok_reasoning_effort` honored if new column null), UI copy sweep ("AI Engine", `AiSphere`), update `GOLDEN_VISUAL_SPEC.md` references.
**Accept:** Grep for `grok|Grok|xAI|XAI` in `src/` returns only: `providers/xai.ts`, legacy shims, and the migration file. UI shows no vendor names. Legacy config rows still load.
**Size:** M

**P4-6 · Retire the parallel AI paths**
**Work:** `grokEngine.runGrokHybrid*` and the engine-run half of `engineInsightForPlacement` route through the unified stage; placement-pad *insight* (single-slot advisory) migrates to the same provider + tools but keeps its own lighter brief. `xaiFillOrderContract` guard logic already absorbed into P1-5 — the text builders move to `ai/fillOrderContract.ts`; the file becomes a shim.
**Accept:** One provider call path (grep `completeStructured` callers = engine stage + pad insight only); pad insight behavior unchanged in Draft-Mode spot check.
**Size:** L

---

## 10. Phase 5 — Fairness expansion (after the unified core is trusted)

**P5-1 · Decide & implement dead signals (F11, D3)**
**Work:** Per D3 decisions: implement `weekly_load_balance` (uses P3-5 ledger: penalize difficulty-weighted load spread across TMs in week objective) and `fatigue_index` (consecutive-night count from week context, mild penalty weight) as real signals in `scoring.ts` + week objective; **remove** `skill_stretch_reward` and `sweeper_rotation_penalty` from `EngineWeights`, `DEFAULT_WEIGHTS`, and the Sudo weights UI unless Brian wants them (no data source exists for sweeper today).
**Accept:** Config UI shows only live knobs; each implemented signal has unit tests demonstrating it changes picks in the intended direction and cannot outweigh a higher tier.
**Size:** M

**P5-2 · Equity report surface**
**Work:** Extend the rotation report (`rotationReport.server.ts` + its page) with the fairness ledger over the selected window: per-TM difficulty-weighted load, area diversity index, repeat counts, admin/RR share — same helpers as P3-5 (no parallel math).
**Accept:** Report values reconcile with week ledger on a fixture week; page renders read-only from prod.
**Size:** M

**P5-3 · Perf pass on fit-map recursion (F13)**
**Work:** With everything on P1-3, kill the recursive occupant-gap scoring in hot paths: `buildHealthOptimizedDraft`-successor and optimizer previews use the model's static variant; interactive chip path memoizes occupant fits per (occupant, slot, boardVersion). Measure before/after with `performance.now` telemetry.
**Accept:** Night pipeline (no AI) < 1.5s on a 26-TM board (from current multi-second); chip map rebuild < 100ms.
**Size:** M

---

## 11. Phase 6 — Verification, shadow mode, cutover

**P6-1 · Shadow mode**
**Work:** With `unified_pipeline` flag off, engine runs execute legacy AND (async, non-blocking) the unified pipeline in `no-ai` mode; both scorecards logged to telemetry + a Sudo "Engine Lab" panel showing side-by-side (coverage, health, violations, diff count). No writes (N8).
**Accept:** One week of real usage collecting comparisons; unified ≥ legacy scorecard on every observed run, or each regression diagnosed to a fixed defect.
**Size:** M

**P6-2 · Cutover & cleanup**
**Work:** Flag default ON → observe → remove flag; delete deprecated shims (`runWeightedPlanner` internals, `runCoveragePlanner` skeleton, `timefoldMock` if unused, legacy grok files, `buildHealthOptimizedDraft` legacy body); final grep + `tsc` + lint; update `docs/SHIFTBUILDER_FLOOR_GUIDE.md` and the placement.ts constitution header to point at `engine/`.
**Accept:** No `@deprecated` engine symbols remain; bundle size not regressed >5%; docs current.
**Size:** M

---

## 12. Invariant suite (the permanent contract)

These run in `engine/__tests__/invariants.test.ts` on every change, over the seeded fixture grid (≥50 generated boards + the starved/edge fixtures). **A PR that breaks one of these is wrong by definition (N1/N2).**

| ID | Invariant |
|----|-----------|
| **I1** | No draft from any stage contains a hard violation: `validateDraft().ok === true` (eligibility, locks, double-book, Z1/Z2, fill order). |
| **I2** | Coverage monotonicity: `optimizer.coverage ≥ planner.coverage` and `final.coverage ≥ optimizer.coverage`. No stage ever un-fills a required slot it received filled. |
| **I3** | Scorecard monotonicity: each stage's scorecard `≥` its input draft's, lexicographically. |
| **I4** | Hierarchy dominance: on constructed trade-off fixtures, the engine always takes +1 coverage over any health gain; +health over any pref gain; +pref over any skill gain. |
| **I5** | Relaxation ladder order (per D1): a rescue never relaxes a higher rung while a lower rung has candidates; every relaxation is provenance-tagged. |
| **I6** | Week policy: on rosters large enough to permit it, a full week run yields `repeatViolations === 0`; when not permitted, violations are minimal among sampled alternatives (checked vs. exhaustive on a small 6-TM fixture). |
| **I7** | One health number: chip, projection, optimizer, and picker points for the same (tm, slot, ctx) agree within the documented static-variant delta. |
| **I8** | Determinism: identical (context, config, seed) → identical drafts, byte-for-byte, planner and optimizer. |
| **I9** | AI cannot regress: with an adversarial MockProvider (proposes every category of illegal/regressive override), final scorecard ≥ optimizer scorecard and I1 holds. |
| **I10** | Gender feasibility honesty: feasibility report never claims a tier clearable that the planner then fails on eligible-supply grounds (cross-check on the fixture grid). |

---

## 13. Database changes (all via reviewed migrations — N8)

| Migration | Contents |
|---|---|
| `2026xxxx_ai_provider_config.sql` | `engine_config`: add `ai_provider text default 'xai'`, `ai_reasoning_effort text` (backfill from `grok_reasoning_effort`), accept `placement_method = 'ai-hybrid'` (keep `'grok-hybrid'` valid for dual-read window) |
| `2026xxxx_engine_run_log.sql` *(optional, P6-1)* | `engine_run_log`: run id, scope, night/week, stage timings, scorecards (jsonb), seed, provider, flag state — powers Engine Lab; insert-only |
| Verify-only | Confirm existing draft storage supports 7 nights of drafts keyed per night for P3-4; add table only if not |

No changes to `zone_assignments`, `tm_*`, or schedule tables — the unified system reads the same sources.

---

## 14. Telemetry (v2)

Per run: `{ runId, scope, seed, flag, stages: [{stage, ms, scorecard, notes[]}], provider?, tokenUsage?, relaxationsUsed[], violationsRejected[] }`. Console group (as today) + Engine Lab panel + optional `engine_run_log`. Every number the operator sees in a proposal must be reconstructible from the telemetry record — that's the audit trail for "why did it place her there."

---

## 15. Decision log — needs Brian's call before the affected task starts

| ID | Decision | Options | Recommendation | Blocks |
|----|----------|---------|----------------|--------|
| **D1** | Hard-avoid preference under coverage pressure | (a) Never place — leave slot open (Optimizer's current behavior) · (b) Place as last rung of the relaxation ladder, loudly tagged (planner's current behavior, formalized) | **(b)** — coverage is tier 1 by ratification; an open zone is a real operational hole, a violated preference is a flagged conversation. Ladder: `prior-3 → rr-side-family → hard-avoid`, provenance + UI badge required. | P1-6, P2-1, P2-2 |
| **D2** | Headline health metric | (a) Keep 0.7 daily / 0.3 week blend (fix `meetsTarget` to match) · (b) Show daily only + separate week chip | **(a)** — operators are used to it; the tracker already exposes both components. | P0-3 |
| **D3** | Dead weight knobs | Per knob: implement vs remove — `fatigue_index`, `weekly_load_balance`, `skill_stretch_reward`, `sweeper_rotation_penalty` | Implement `weekly_load_balance` + `fatigue_index` (week engine makes them real); **remove** the other two until a data source exists | P5-1 |
| **D4** | Default AI provider after abstraction | (a) Stay xAI · (b) Switch to Anthropic (Claude) | No recommendation — config switch either way; suggest xAI default through P6-1 shadow period, then evaluate on Engine Lab data | P4-1 default value only |
| **D5** | Week apply semantics | (a) Per-night apply only · (b) Whole-week apply (sequential, rollback-on-error) · (c) Both | **(c)** — per-night is the safe default; whole-week for clean future weeks | P3-4 |
| **D6** | May AI leave a fillable required slot open? | (a) Never (guard enforces coverage-no-worse) · (b) Allowed with justification tag | **(a)** — hard no. If a slot should stay open, that's an operator decision (locks/Z1-Z2 already express it). | P4-4 |
| **D7** | Prior-3 hard gate in the Optimizer | (a) Keep as cost (current: 50pt critical, health tier makes it near-hard) · (b) Promote to constraint with ladder relaxation like the planner | **(b)** — one semantics everywhere (it *is* the planner's gate); the ladder already provides the coverage escape hatch | P1-6, P2-2 |

---

## 16. Traceability — review findings → tasks

| Finding | Fixed by | Status (2026-07-04) |
|---|---|---|
| F1 eligibility rules dead | P0-1 (stopgap) → P1-2 (real) | **Resolved.** The unified engine's gate (`canPlaceInContext`/`isEligibleUnderRules`) always supported this; what was missing was wiring real rules into it. As of 2026-07-04: `ShiftBuilderClient.tsx`'s main interactive path and `sudoBatchPlanner.ts` both load `getFullyResolvedEngineConfig()` and pass `eligibilityRules` explicitly. Production interactive runs are unified-only (failure → toast + abort; no silent `runWeightedPlanner` fallthrough). Dev-only legacy remains behind `localStorage sb_legacy_engine=1` (non-production) and still checks `isEligibleUnderRules` per candidate. |
| F2 health draft drops coverage | P0-2 → superseded by P2/P3 pipeline (health draft retired; optimizer takes its role) | Not independently re-verified this session |
| F3 hard-avoid disagreement | P1-6 (+D1, D7) | Not independently re-verified this session |
| F4 two health models | P1-3 (+P4-2 for AI-brief numbers) | Not independently re-verified this session |
| F5 meetsTarget blend | P0-3 (+D2) | Not independently re-verified this session |
| F6 weeklyHistories branch | P0-4 | Not independently re-verified this session |
| F7 fake constraint panel | P0-5 → P2-2 (guard-backed) | Not independently re-verified this session |
| F8 verdict sentinel + dead code | P0-6 | Not independently re-verified this session |
| F9 drag halo keys | P0-7 | Not independently re-verified this session |
| F10 gender-blind feasibility | P0-8 → `engine/feasibility.ts` in P2-3 | Confirmed present in `engine/feasibility.ts`, tested (`nightPipeline.test.ts` "gender feasibility (F10)") |
| F11 dead knobs | P5-1 (+D3) | This entry's original 4 knobs (`fatigue_index`, `weekly_load_balance`, `skill_stretch_reward`, `sweeper_rotation_penalty`) — the latter two were removed 2026-07-02 per `engineConfig.ts`, the former two are now implemented (`weekEngine.test.ts` "fairness signals — weekly_load_balance + fatigue_index"). **2026-07-04: a separate, previously-uncatalogued set of dead knobs was found and removed** — `appliesToZones`/`appliesToSlotTypes`/`appliesToSlotKeys` on `SignalOverride`/`EligibilityRule` (populated from DB, never read as filters anywhere, no UI ever set them either) and `versionHistory`/`resolvedVersionName` on `FullyResolvedEngineConfig` (computed via an extra per-call DB round trip, zero consumers) — all removed from `engineConfig.ts`/`engineOverrides.ts`. |
| F12 stubs/lies/dupes | P0-9 | **`validatePlacementOrder` stub: resolved by removal (2026-07-04)**, not by implementing it — the function's own premise (a dynamic AUX slot could be inserted "in the middle" of the fixed order) can't actually happen: `deriveTargetSlotsInOrder` always appends dynamic slots after the fixed set regardless of input order, so the check was validating something structurally impossible. Removed the function and its one caller (`useAuxLayout.ts`). The "fake `checkEligibility` tool" and "duplicated dead `fairnessSignals` fallback" parts of this finding were **not** touched this session. |
| F13 recursive fit cost | P5-3 (partially P1-3) | Not independently re-verified this session |

---

## 17. Sequencing

```
Phase 0 (P0-1 … P0-10)        — all parallel-safe, land first
   └─► Phase 1 (P1-1 → P1-2/P1-3/P1-4 → P1-5 → P1-6)
          └─► Phase 2 (P2-1 → P2-2 → P2-3 → P2-4, P2-5)
                 ├─► Phase 3 (P3-1 → P3-2 → P3-3 → P3-4 → P3-5)
                 └─► Phase 4 (P4-1 → P4-2/P4-3 → P4-4 → P4-5 → P4-6)   [parallel with Phase 3]
                        └─► Phase 5 (P5-1, P5-2, P5-3)
                               └─► Phase 6 (P6-1 → P6-2)
```

Decision gates: D1/D7 before P1-6 · D2 before P0-3 · D3 before P5-1 · D5 before P3-4 · D6 before P4-4 · D4 anytime before P6-2.

---

## 18. Definition of done (the whole project)

1. One command (`runUnifiedEngine`) produces a night or week draft; interactive, batch, and Deep Optimize surfaces all route through it.
2. Every health/fairness number on every surface comes from `engine/health/model.ts` + `engine/objective.ts` — one model, verifiably (I7).
3. The AI layer is provider-agnostic; switching Grok → Claude is one config value; the AI cannot violate a rule, drop coverage, or lower the scorecard (I9).
4. A full grave week solves within budget with zero week-policy violations when the roster permits (I6), and the fairness ledger explains every TM's week.
5. Invariant suite (I1–I10) green; shadow period shows unified ≥ legacy on real boards; legacy paths deleted.
6. Every placement is explainable end-to-end: stage, scorecard, relaxations, rationale — from the chip on the card down to the telemetry record.
