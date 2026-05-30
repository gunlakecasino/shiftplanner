# Engine Fixes — 2026-05-30

**Context**: Follow-up to the deep engine architecture audit performed on 2026-05-30.

**Goal**: Systematically address the highest-impact flaws identified in the Grok-hybrid + weighted placement engine.

---

## Fixes Applied This Session

### 1. Critical: Eliminated N+1 + Correctness Bug in Scoring (Highest Priority)
**Files**: `src/lib/shiftbuilder/scoring.ts`, `ShiftBuilderClient.tsx`, `sudoActions.ts`

- `scoreAssignment` and `scoreMatrixFairnessSignals` were `async` and performed an individual `getTmZoneMatrix(tm.id)` call **inside the hot per-candidate loop** of `runWeightedPlanner`.
- This caused N+1 Supabase round-trips on every engine run (interactive Draft Mode + Batch Planner).
- Worse: the call site treated the returned Promise as a `ScoreResult` object (no `await`/`Promise.all`), making the new matrix fairness signals (area_diversity, cross_week_rotation, prior_run_continuity) effectively broken.
- **Fix**: Preload the full matrix once via the existing session-stable data loaders (client) and batch loaders (sudo). Pass via new `zoneMatrix` field on `ScoringContext`. Scoring is now fully synchronous and correct.
- Added defensive comment + historical note in the code.

**Impact**: Massive performance win + correctness restoration for fairness signals.

---

### 2. Skeleton Cleanup — `runCoveragePlanner`
**File**: `src/lib/shiftbuilder/placement.ts`

- The original naive greedy implementation (with explicit TODOs) was still exported and documented as if it were viable.
- Added strong `@deprecated` JSDoc, runtime `console.warn`, and updated the module-level usage docs.
- Clearly points all future work at `runWeightedPlanner` + Grok-hybrid path.

---

### 3. Rich Engine Telemetry & Diagnostics
**Files**: `src/lib/shiftbuilder/placement.ts` (new `logEngineRunSummary`), `ShiftBuilderClient.tsx`, `sudoActions.ts`

Added a structured `EngineRunTelemetry` logger that fires after every engine execution (interactive and batch).

Captures:
- Mode, day/night, duration
- Roster size, slots processed, preserved/filled/unfilled counts
- Grok usage + number of overrides applied
- Whether the zone matrix was preloaded (post-fix signal)
- Warnings and top unfilled slots

Output uses `console.groupCollapsed` for clean, high-signal logs that are easy to expand when needed.

This directly addresses the previous "observability" weakness (the old "NO CANDIDATES" warns were the only real signal).

---

### 4. Improved Locked Slot Respect in Weighted Planner
**File**: `src/lib/shiftbuilder/placement.ts`

- The planner now explicitly detects `isLocked` / `is_locked` on incoming assignment entries.
- Locked slots are preserved (as before) **and** emit a note for the telemetry/warnings surface.
- Updated JSDoc.
- This strengthens defense-in-depth for the day-locking feature beyond the command-level guard.

---

### 5. Minor Hygiene
- Cleaned up unused `zoneMatrix` variable in week-level batch loader with explanatory comment.
- All changes type-check cleanly (only pre-existing unrelated errors remain).

---

## Remaining High-Priority Items (from original audit)

See the full engine research for the complete list. Current top remaining targets:

- Matrix refresh reliability & coverage (only happens on successful Draft apply today)
- Adjacency model quality (currently a simple hardcoded heuristic)
- Stronger per-slot lock enforcement + locked card visuals
- Better integration of live optimistic state into engine reference data
- Structured (non-console) telemetry for production observability

---

**Date**: 2026-05-30
**Agent**: Grok 4.3 (coding-engineer mode)
**Status**: Strategic, incremental, high-signal progress on the engine core. No regressions introduced.

---

## 2026-05-30 Update: Full Grok Integration with the Engine

**Problem discovered during continuation work**:
- The Sudo > Engine Config tab fully supported choosing `placementMethod` ("weighted" vs "grok-hybrid") + `grokReasoningEffort`.
- However, the actual execution paths completely ignored this setting:
  - `enterDraftMode` in ShiftBuilderClient **always** called `askGrokEngineDraft`, even when the operator had selected pure "weighted".
  - Batch planner never considered the method at all.
  - Command Palette always showed generic "Run Engine" label.
  - Telemetry had no visibility into which method was active.

This meant the Grok-hybrid feature was only *partially* integrated — the UI allowed configuration but the engine did not honor it.

**Fixes applied**:
- Made interactive Draft Mode (`enterDraftMode`) respect `engineConfig.placementMethod`:
  - Only invokes Grok when set to `"grok-hybrid"`.
  - Pure `"weighted"` path now skips the Grok call entirely (faster, cheaper, fully deterministic).
- Updated rich telemetry (`logEngineRunSummary`) to include `placementMethod`.
- Enhanced Command Palette "Run Engine" label to dynamically say:
  - "Run Grok-Hybrid Engine (Draft Mode)"
  - "Run Weighted Engine (Draft Mode)"
- Threaded the method through batch planner telemetry (batch remains deterministic-only for cost/latency reasons — now visible in logs).
- All changes are backward compatible (Grok is still the powerful optional judgment layer on top of the deterministic base when enabled).

**Result**: The engine configuration is now *fully wired* into execution. Operators get exactly the behavior they select in Sudo > Engine Config.

Grok guardrails (server-side candidate validation), fallbacks, and merge logic (`mergeGrokOverridesIntoDraft`) remain robust and unchanged.

---

### 2026-05-30 Major Evolution: EngineRules Abstraction + "Grok Uses the Engine as Rules"

As part of the deep "Grok as primary placer" initiative, we began the architectural shift requested by the user.

**New foundational module**: [src/lib/shiftbuilder/engineRules.ts](/Users/briankillian/oms_root/src/lib/shiftbuilder/engineRules.ts)

- `EngineRules` class — a clean, queryable facade over the deterministic placement logic.
- Exposes hard constraints (`isEligible`, placement order, custom rules)
- Exposes soft scoring (`score`, `evaluateCandidate`)
- Provides rich LLM-friendly representations (`getRulesSummaryForLLM()`)
- Prepares the ground for proper tool-calling (`ENGINE_RULES_TOOL_DEFINITIONS`)

**Integration work completed**:
- `buildGrokEngineSnapshot` now accepts `rulesContext` and injects a high-quality `rulesSummary` into the snapshot sent to Grok.
- The system prompt was rewritten to position the deterministic layer as the **authoritative Rules Engine** that Grok must respect while applying higher-order judgment.
- The live call site in `enterDraftMode` now constructs and passes the full rules context.
- Added structured console capture for every Grok engine interaction (critical seed for future training data flywheel).

This moves us from "Grok gets two static text blocks + Top-K scores" toward "Grok deeply consults a live, explainable rules engine when making placements."

This is the first concrete executable step on the long-term vision.

**Latest continuation ("Keep building this out"):**
- Added `getCurrentBoardState` tool — gives Grok a live global view of the current draft/assignments so it can reason holistically instead of slot-by-slot in isolation.
- Significantly improved tool result capture: when Grok makes tool calls, we now log the exact `toolCalls` + `toolResults` (arguments + return values) in a dedicated console group. This is high-quality training data for future prompt optimization and fine-tuning.
- Better prompting with explicit encouragement to use tools frequently before finalizing picks.
- Richer `toolContext` passing from the interactive engine (scoring data + current draft).

Grok now has:
- Hard eligibility checking
- Real weighted scoring with context
- Global board state awareness (`getCurrentBoardState`)
- **ADP Schedule awareness** (`getTMScheduleStatus`) — Grok can now directly query whether a TM is on the official ADP schedule for the night
- Full rules summary that includes Schedule Policy
- All while being heavily guarded by the deterministic layer

This is meaningful progress toward Grok acting as an intelligent placer that deeply respects and queries the engine's rules while still being safe and explainable.

### TM Schedule Integration (ADP / night_tm_status)

**How it currently works (research summary):**
- **Source**: `night_tm_status` table (ADP XLSX import via SUDO Schedules tab). Status values like "present", "scheduled", "off", "called_off".
- **Rich loader**: `getOnScheduleTmIdsForNight` (tonight's data + next-day AM overlaps + fallback to historical assignments if no ADP import).
- **Current usage**:
  - Roster filtering in interactive Draft Mode (when schedule filter active).
  - Strong UI prioritization (scheduled-unplaced TMs bubble to top in Command Palette and roster).
  - Optional in Batch Planner (`filterBySchedule`, `requireSchedule` to skip nights without data).
- **Previous state for Grok/Rules**: Almost zero visibility. Schedule data affected the *input roster* but was not a first-class rule, scoring signal, or queryable fact for Grok.

**What we just built:**
- Added `scheduledTmIds` to `EngineRulesContext`.
- New `EngineRules` methods: `isOnSchedule(tmId)`, `getScheduleStatus(tmId)`.
- New Grok tool: `getTMScheduleStatus(tmId)`.
- Schedule Policy section now appears in the rich rules summary Grok receives.
- Full context passed from client for both snapshot and live tool execution.
- Tool calls/results captured for training data.

**Training / Refinement / Optimization implications:**
- Schedule respect is now observable and capturable (when Grok queries it vs ignores it).
- Future easy win: Add a `scheduled_preference` weight in `engine_config` (similar to other signals) so the deterministic layer can learn to value scheduled TMs.
- Human feedback loop in Draft Mode will naturally train the system on when schedule should be a hard vs soft factor.
- Long-term: This becomes another rich signal for any learned model or prompt optimization.

---

## Live TM Schedule Editing + Immediate Reflection (New Feature)

**Goal**: Let operators directly change a person's scheduled shift or mark them LOA / PTO / Other / etc. on a specific night, with those changes instantly affecting the live roster, planner filtering, Draft Mode, EngineRules, and Grok tools — no reload required.

### What We Implemented

1. **Realtime subscriptions** (data.ts + ShiftBuilderClient.tsx)
   - `createNightScheduleStatusChannel` — listens to `night_tm_status` changes for the current night.
   - `createCallOffsChannel` — listens to `call_offs` changes.
   - On any change (from any client or future editor), we automatically refetch the schedule sets and update client state.

2. **Immediate propagation**
   - Roster filters (`available* Roster`) update instantly.
   - Command Palette prioritization updates.
   - Any newly created `EngineRules` instance (for Grok calls or future Draft evaluations) sees the fresh `scheduledTmIds`.
   - Tool calls like `getTMScheduleStatus` will reflect the latest data on the next Grok run.

3. **Editing primitive**
   - New `updateNightTmStatus(...)` helper in sudoActions.ts.
   - Can set `status` (scheduled / present / off / LOA / PTO / Other / called_off) + note on any `night_tm_status` row.
   - Call this from any future UI (Command Palette, roster context menu, enhanced SchedulesTab grid, etc.).

### Architecture for "Immediate" Effect

- Source of truth remains the DB tables (`night_tm_status` + `call_offs`).
- Client state (`scheduledTmIdsTonight`, `calledOffIds`) is kept in sync via realtime.
- `EngineRulesContext` and tool contexts are built from that live state on demand.
- No need for the engine itself to hold long-lived state — every new planner/Grok run pulls fresh context.

This gives the responsive, "edit schedule → planner reacts" experience the user asked for.

### Recommended Next UI Work — Progress Made

**Delivered:**
- Command Palette now has a full "Schedule" action group with:
  - Mark as PTO / LOA / Other / Off
  - Restore ADP Schedule Status
- These call through to `updateNightTmStatus` and benefit from the realtime layer for **immediate** effect on the planner, roster, EngineRules, and Grok tools.

**Easy remaining polish:**
- Wire the actions to the currently selected roster item in the palette (or last focused person) for one-keystroke use.
- Enhance SchedulesTab preview grid for direct cell-by-cell status/reason editing.
- Add a compact "Schedule Overrides" panel in the main ShiftBuilder.

The end-to-end loop (edit in palette → DB → realtime → live roster + Grok engine) is now operational. Great foundation for the richer editing surfaces.