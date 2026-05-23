# SCHEDULING_MASTERLIST.md

**World-Class Scheduling & Assignment System for GRAVE / ZDS Operations**

> The single authoritative reference for building the scheduling and assignment platform that operators revere — trusted implicitly, produces near-optimal fair sheets with minimal intervention, feels Apple-grade in power and calm, and scales from per-night GRAVE sheets to long-term roster planning.

**Status**: Living document (v1.0 — May 2026)  
**Owner**: Grok + Operator + Engineering  
**Location**: Project root (this file)  
**Related**: `plan.md` (session), `Agentic/Plans/active/COMMAND_PALETTE_UPGRADE_PLAN.md` (active Command Palette work), `Agentic/` (AI Agentic Command Post — always read first in new sessions), `src/lib/shiftbuilder/placement.ts`, `scoring.ts`, `engineConfig.ts`, `grokEngine.ts`, `grokIntelligence.ts`

---

## 1. Executive Vision — "The Scheduling System Operators Revere"

**Goal**: Create the internal tool that GRAVE operators (and eventually the broader ZDS scheduling community) actively brag about and defend.

**What "Reveled By All" Means (Measurable Outcomes)**

- **Trust**: Operators run "Engine" → review Draft for 60–90 seconds → Apply. They almost never need to manually override or fix the output. The system never violates placement order, eligibility, or hard constraints.
- **Fairness Perception**: Every TM feels the assignments are equitable over time (load, rotation, desirable/undesirable slots, pair preferences). "Why?" answers are instant and satisfying.
- **Speed & Power**: From blank night to locked, task-rich, break-assigned sheet in under 3 minutes for an experienced operator (palette + hotkeys + one Engine run + light Draft polish).
- **Explainability**: Any assignment can be explained in one tap/click with the exact signals, scores, and context that produced it.
- **Calm & Beautiful**: The 1056×816 Golden PDF artboard remains the undisputed focal point. Liquid Glass / Cupertino aesthetics. Atkinson typography. Zero visual noise.
- **Resilience**: Handles call-offs, last-minute AUX additions, operator notes, and Grok contextual judgment without drama. Draft + history gives perfect undo/audit.
- **Long-term**: Moves beyond single-night sheets to weekly/monthly roster optimization, self-service preference capture, and global fairness dashboards — while preserving the sacred GRAVE domain rules.

**Guiding Philosophy**
- Hard constraints (PLACEMENT_ORDER, grave eligibility, overlaps, within-repeat, hard prefs/accommodations) are **non-negotiable** and enforced at every layer (planner, Grok guard, Draft apply).
- Soft signals (skill, affinity, fatigue, fairness) are tunable via `engine_config` weights and explained.
- The human (operator) is always in the loop via **Draft Mode** as the only mutation path. Grok and solvers propose; the operator decides.
- The Command Palette (Cmd+K) is the single control surface. Canvas interactions (drag, tap) remain primary for speed. Hotkeys make power users fly.

This is not a generic scheduling app. It is a **GRAVE-native, domain-obsessed, hybrid-deterministic + judgment** system that respects the unique placement liturgy, overlap semantics, break waves, and task-per-slot reality of ZDS operations.

---

## 2. Current State of the Art (May 2026) — Extraordinary Foundation

We are not starting from zero. The existing system is already more sophisticated than most commercial tools in its handling of strict domain order + hybrid AI + safety.

### Core Engine & Placement (Single Source of Truth)
- **PLACEMENT_ORDER** (strict, non-negotiable): [src/lib/shiftbuilder/placement.ts:36-72](/Users/briankillian/oms_root/src/lib/shiftbuilder/placement.ts)
  - Restrooms (MRR/WRR blocks) → ADM → Z9→Z1→Z4→Z5→Z2→Z3→Z8→Z10→Z7→Z6 → **Z9SR (FIXED)** → TR1/TR2 → dynamic Support/Overflow last.
- **isEligibleForSlot** (glcr rules): [placement.ts:306-349](/Users/briankillian/oms_root/src/lib/shiftbuilder/placement.ts)
  - Full-grave only for all Z* (including Z9SR). Overlap TMs routed exclusively to OL-AM/OL-PM tabs. RR/ADM/TR/Support = any active TM (prefer grave).
  - Breaks explicitly ignored for placement.
- **getPlacementOrderText / getEligibilityRulesText**: Injected verbatim into every Grok prompt + available for solver modeling. [placement.ts:386-425](/Users/briankillian/oms_root/src/lib/shiftbuilder/placement.ts)
- **runWeightedPlanner + runCoveragePlanner**: [placement.ts:195-290](/Users/briankillian/oms_root/src/lib/shiftbuilder/placement.ts)
  - Walks exact order, preserves locks, respects currentDraft for pair/within_repeat.
- **SlotRanking + Top-K breakdown**: Per-slot candidate scores + "Why?" data ready for UI.

### Weighted Multi-Signal Scoring (Phase 1 Complete)
- [src/lib/shiftbuilder/scoring.ts](/Users/briankillian/oms_root/src/lib/shiftbuilder/scoring.ts)
  - Signals: `skill_match`, `preference_fit` (hard), `soft_prefer_set`, `pair_affinity`, `within_repeat` (hard gate).
  - Hard excludes for avoid prefs and pair avoids.
  - `buildDefaultAdjacency` for zone/RR neighbor awareness.
- Deferred (declared but not fully wired): `fatigue_index`, `area_diversity`, `cross_week_rotation`, `weekly_load_balance`, `prior_run_continuity`, `skill_stretch_reward`, `sweeper_rotation_penalty`.

### Configurable Engine (DB-Driven, No Hard-Coded Weights)
- [src/lib/shiftbuilder/engineConfig.ts](/Users/briankillian/oms_root/src/lib/shiftbuilder/engineConfig.ts)
  - `EngineConfig` with `weights`, `thresholds`, `slotPriority`, `placementMethod` ("greedy" | "weighted" | **"grok-hybrid"**).
  - `getActiveEngineConfig()` with robust fallback.
  - `resolvedWeights()`.

### Grok-Hybrid Intelligence (The Secret Sauce — Guarded)
- **grokIntelligence.ts** (palette contextual): Rich `GrokBoardSnapshot`, `buildRichGrokContextSnapshot`, `GrokAction` schema (assign/swap/remove/note), server guard using `isEligibleForSlot`. [src/lib/shiftbuilder/grokIntelligence.ts](/Users/briankillian/oms_root/src/lib/shiftbuilder/grokIntelligence.ts)
- **grokEngine.ts** (Run Engine path): `GrokEngineSnapshot` with per-slot Top-K + scores + operator notes + recent history. `mergeGrokOverridesIntoDraft`. Server guard + fallback. [src/lib/shiftbuilder/grokEngine.ts](/Users/briankillian/oms_root/src/lib/shiftbuilder/grokEngine.ts)
- Flow (ShiftBuilderClient "Run Engine" handler ~1540+): Weighted planner → snapshot → Grok judgment → merge → Draft proposal (with provenance).

### Rich Domain Data Layer
- [src/lib/shiftbuilder/data.ts](/Users/briankillian/oms_root/src/lib/shiftbuilder/data.ts)
  - TM profiles + grave_pool (AM/PM/Full).
  - `tm_preferences`, `tm_pair_affinities`, `tm_accommodations`.
  - `break_assignments` (group 0 = delete row = "–" = off the break sheet; 1/2/3 waves).
  - `slot_task_catalog` + `night_slot_tasks` (per-slot, per-night tasks).
  - Overlap assignments, ADP/Kronos schedule import (`adpSchedule.ts`), `night_tm_status`.
  - On-schedule roster computation for the week.

### Safety, UX & Control Surface
- **Draft Mode** (mandatory gate): `isDraftMode`, `draftAssignments`, `enter/apply/discard`, atomic `useShiftHistory`, "proposed + was:" strikethrough visuals, double-confirm on final save.
- **Command Palette** (Cmd+K): Single surface for roster, actions, contextual Grok, (designed) tasks, hotkeys. Global "Grok: Analyze Full Board".
- Break cycling, task assignment on cards, Quick Action Fan (legacy but still useful), Golden 1056×816 print-artboard fidelity.
- Real-time Supabase writes (race-free captured-nightId pattern).

**Verdict on Current State**: This is already a **top-tier domain-specific hybrid assignment system**. Most commercial tools lack the strict liturgy enforcement + guarded LLM judgment + mandatory safe preview. The leap to "world class / reveled" is primarily one of **breadth** (multi-night, fairness, self-service, solver depth, explainability surface) and **polish** (Why? panel, hotkeys, scenario branching), not a rewrite of the core.

---

## 3. Research Foundation — Tools, Algorithms & Patterns

### Constraint Solvers (Production-Ready, Open Source)
- **Google OR-Tools CP-SAT** (Apache 2.0): Gold standard for nurse/employee rostering. Fast, expressive, excellent Python. Real full-stack examples (j3soon/nurse-scheduling).
- **Timefold Solver** (Apache 2.0, active fork of OptaPlanner): Purpose-built for rostering. Best-in-class soft constraint handling, score explanation ("why penalized?"), load balancing collectors, real-time planning. Java + Python quickstarts exist specifically for employee scheduling with availability, skills, fairness, and shift types.
- Recommendation for this project: Keep the current pure-TS weighted + Grok hybrid as the **fast default path**. Offer an optional "Deep Optimize" (solver-backed) path for weekly/global runs. Timefold Python or OR-Tools are the strongest candidates for a sidecar or edge function.

### Algorithms & Techniques
- Weighted scoring / local search (what we have) — fast, explainable, perfect for interactive Draft.
- Constraint Programming (exact) for hard global feasibility.
- Metaheuristics (local search, tabu, simulated annealing) for scale.
- Min-cost flow / assignment problem for pure matching subproblems.
- Hybrid LLM + Solver (our current bet) — LLM for unencoded context/judgment; solver for provable optimality on the model.

### Commercial & Industry Best Practices
- Multi-objective optimization (coverage + cost + fairness + wellbeing).
- Hard vs soft constraints with clear violation penalties.
- Employee self-service (availability, preferences, bids, swaps) + manager override with audit.
- What-if / scenario simulation (the "revere" feature — "what if we give Abby the week off?").
- Heavy explainability and audit trails.
- Continuous / intraday re-optimization for no-shows.
- Predictive scheduling compliance (Fair Workweek laws, minimum rest, etc.).

**Domain Lesson for GRAVE**: The placement order liturgy + grave/overlap pool distinction + per-slot tasks + break waves + pair affinities are **unusual and valuable**. A generic solver must be modeled with extreme care so it never proposes a Z2 before Restrooms are covered or puts a PM-overlap TM on a full zone. Our current `isEligibleForSlot` + `PLACEMENT_ORDER` text exports are the perfect contract for any future solver.

---

## 4. Non-Negotiable Pillars (The Soul of the System)

Any evolution **must** preserve or strengthen these:

1. **PLACEMENT_ORDER + isEligibleForSlot** as the single source of truth (placement.ts). Every planner, Grok call, solver model, and UI action imports from here.
2. **Draft Mode** is the only way the board ever changes. No direct writes. History is sacred.
3. **Server-side guards** on every Grok/solver proposal (eligibility + within_repeat + locks).
4. **Golden PDF visual contract** — 1056×816 artboard, exact print fidelity, Atkinson + Liquid Glass.
5. **Command Palette (Cmd+K)** as the primary discovery and power surface. Canvas drag/tap remains the direct manipulation path.
6. **Break semantics** (0 = delete row = truly "–" / off the sheet; overlaps default to 0).
7. **Task model** (catalog + per-night selected) and its attachment to slots.
8. **Operator notes + call-off + recent history** context fed to Grok/solver.
9. **Tunability via engine_config** (weights, thresholds, method) — no hard-coded magic in TS.
10. **Performance & calm on iPad Pro 13" + Pencil + Mac keyboard**.

Violating any of these is a design smell.

---

## 5. Comprehensive Feature & Capability Catalog

### 5.1 Engine / Optimization (Core Intelligence)

| Feature | Priority | Complexity | Dependencies | Notes / First Spike |
|---------|----------|------------|--------------|---------------------|
| Close all deferred scoring signals (fatigue, rotation, load balance, etc.) | Must | Medium | History queries, `night_tm_status` or weekly aggregates | Add `getRecentPlacementHistory`, wire into `ScoringContext`. |
| Per-slot "Why this pick?" rich inspector panel | Must | Medium | Existing `SlotRanking` + breakdown | Surface in palette or on long-press of card in Draft. |
| Rebalance / "Improve Current Draft" command (palette + hotkey) | Must | Medium | Current weighted planner | Run planner on current draft state and propose swaps. |
| Scenario / What-If branching (multiple named Drafts) | Should | High | Draft machinery, history | Fork the current draft, compare side-by-side. |
| Full constraint solver pilot (Timefold or OR-Tools) for weekly/global | Should | High | Python sidecar or WASM, modeling of PLACEMENT_ORDER | Optional "Deep Optimize" button. Falls back to hybrid. |
| Intraday call-off re-planner | Should | Medium-High | Real-time triggers, Grok snapshot with deltas | "Someone called off — re-run affected tail of the order." |
| Grok as first-class "judgment layer" with provenance badges | Must (in progress) | Low | Current grokEngine + palette cards | Finish visual "Grok proposed" treatment. |

### 5.2 Safety, Trust & Audit

- Mandatory Draft + double-confirm Apply (already excellent).
- Full provenance (manual / planner / grok / solver) on every assignment history row.
- Compliance rule engine (max consecutive nights, min rest between shifts, predictive scheduling windows).
- "Lock everything + audit diff" export for leadership / union review.

### 5.3 Fairness & Employee Wellbeing

- Weekly / monthly load & rotation dashboards (per-TM equity scores).
- Automatic "sweeper" and "undesirable shift" rotation enforcement.
- Employee self-service portal (availability calendar, hard/soft prefs, bid on open slots).
- Pair affinity learning (simple feedback: "these two worked great / clashed").

### 5.4 UX & Control Surface (Palette-First)

- Complete `tasks {TM|Slot} {assign|remove|list}` context + grammar (already designed).
- Full hotkey system (Cmd+D = unassign pre-seed, 0/1/2/3 = breaks, R = Run Engine, G = Grok, etc.).
- Global "Rebalance Week", "Show Fairness Heatmap", "Open What-If".
- Rich roster search in palette with GRAVE/overlap/pair badges + current load stats.
- Floating minimal top bar (after palette is proven) + canvas as focal point.

### 5.5 Data Model & History

- `schedule_versions` or `draft_scenarios` table.
- `tm_fatigue_snapshots` or weekly aggregate views.
- `tm_availability` + `preference_versions` (history of changes).
- `assignment_provenance` (richer than current draft history).
- Employee self-service tables (availability, bids, feedback).

### 5.6 Integration & Operations

- Deeper ADP/Kronos + time & attendance round-trip.
- Real-time call-off webhook → auto-replan suggestion.
- Export to print (already Golden PDF) + digital board view for supervisors.
- Mobile (iPad-first) excellence for the entire flow (palette + canvas).

### 5.7 Scale, Performance, Explainability

- Virtualized palette + canvas for 200+ TMs.
- Solver timeout + graceful degradation.
- "Score explanation" collector from Timefold (or custom) surfaced beautifully.
- Audit log queryable by TM, slot, night, week, operator, source.

**Won't (for the foreseeable horizon)**: Fully autonomous no-human-in-loop scheduling; voice-only operation; multi-property cross-site optimization without explicit request.

---

## 6. Architecture Evolution Options (Trade-off Matrix)

**Option A — "Evolve the Current Hybrid" (Recommended starting point)**
- Keep pure-TS `runWeightedPlanner` + Grok judgment as the interactive fast path.
- Add the deferred fairness signals + history.
- Add scenario branching on Draft.
- Later: optional Timefold/OR-Tools sidecar for "Deep Weekly Optimize".
- Pros: Zero deployment change, instant explainability, perfect Draft integration, GRAVE soul preserved.
- Cons: Global optimality not guaranteed.

**Option B — "Solver-Native Core"**
- Model the entire problem (PLACEMENT_ORDER as sequencing constraints, eligibility as hard filters, all soft signals as score terms) in Timefold or OR-Tools.
- TS layer becomes thin presenter + Draft applier.
- Pros: Provably better global solutions, rich built-in explainability.
- Cons: Latency, modeling complexity, deployment (Python), risk of losing the "GRAVE liturgy feel" if not modeled perfectly.

**Option C — "Grok-Heavy"**
- Push more judgment to the LLM with ever-richer snapshots.
- Risk: Hallucination (mitigated by guards today, but higher volume increases surface area).

**Strategic Bet**: **A as the default interactive experience**, with **B as the power tool** for weekly planning and "prove the fairness" audits. Grok remains the judgment glue for tonight-specific context that no static model will ever fully capture.

---

## 7. Data Model Extensions (Proposed)

(High-level — detailed migrations to be written per phase)

- `tm_weekly_load` (materialized or view): tm_id, week_id, total_slots, night_count, rr_count, zone_count, avg_difficulty, last_updated.
- `schedule_scenarios`: id, night_id or week_id, name, created_by, parent_draft_id, status, notes.
- `scenario_assignments`: scenario_id, slot_key, tm_id, source, score_at_proposal, reason.
- `tm_availability_windows`: tm_id, date_range, availability_type, note.
- `preference_versions`: full audit of tm_preferences changes.
- `assignment_audit`: immutable log (night, slot, old_tm, new_tm, source, operator, timestamp, engine_weights_snapshot).
- `fatigue_events`: derived or explicit (consecutive nights, short rest, etc.).

All new tables must have RLS and be queryable from the engine snapshot builders.

---

## 8. Phased 12-Month Roadmap (Aligned with coding-engineer Discipline)

**Phase 0 — Foundation Polish (Now → 4 weeks)**
- Finish Command Palette tasks context + full hotkey system (Cmd+D unassign, etc.).
- Surface existing `SlotRanking` breakdown as a beautiful "Why?" panel / palette command.
- Wire all deferred simple signals that don't require new history.
- Live browser gate on palette + current Run Engine + Grok flows.
- Deliver v1.0 of this masterlist (done).

**Phase 1 — Fairness & History (6–8 weeks)**
- History queries + weekly aggregates.
- Close all scoring.ts deferred signals.
- "Rebalance Current Draft" + "Suggest Fairness Improvements" palette commands.
- Per-TM load/rotation badges in roster search.
- First "Why?" inspector that cites real history.

**Phase 2 — Scenario Power (8–10 weeks)**
- Named Draft / scenario branching + compare view.
- What-If simulator ("remove Abby for Friday, re-optimize tail").
- Snapshot + restore for leadership review.

**Phase 3 — Solver Pilot + Deep Optimization (10–16 weeks)**
- Choose Timefold or OR-Tools.
- Model PLACEMENT_ORDER + eligibility + core soft signals.
- "Deep Optimize (Weekly)" button that proposes a full scenario.
- Guard + Draft import path (identical safety contract).
- A/B comparison (hybrid vs solver) on real historical nights.

**Phase 4 — Multi-Night & Global Views (16–24 weeks)**
- Weekly roster canvas / list views.
- Cross-night optimization (respect weekly fairness hard/soft constraints).
- Global fairness dashboard (heatmaps, violation lists, "most overworked" TM).

**Phase 5 — Self-Service, Compliance & Polish (24+ weeks)**
- Employee preference / availability portal (read-only initially for ops team).
- Full compliance rule engine + audit exports.
- Rich "Revered by All" polish: onboarding, cheat sheets, celebration of low-intervention nights, bias audit tooling.

Every phase ends with:
- coding-engineer 7-phase gates
- Mandatory live Chrome DevTools + Playwright browser validation
- Update to this masterlist with "achieved" markers

---

## 9. Risks, Anti-Patterns & Success Metrics

**Risks**
- Over-modeling the solver and losing the fast, explainable, GRAVE-specific feel.
- Scope creep ("let's solve the entire universe") — fight with ruthless "Won't" list.
- Operator distrust of any new layer (mitigate with perfect Draft preview + provenance).
- Performance cliff when adding history or solver calls.

**Anti-Patterns to Avoid**
- Letting Grok or solver bypass `isEligibleForSlot` or PLACEMENT_ORDER even "just this once".
- Writing directly to assignments outside Draft.
- Adding features that make the canvas or palette feel slower or more cluttered.
- Treating fairness as a pure math problem without operator judgment and TM feedback loops.

**Success Metrics (Track Publicly)**
- Average time from "new night" to "Applied & Locked" (target: < 4 min for 80th percentile nights).
- % of assignments that survive from first Engine run to final Apply (target: > 85%).
- Operator NPS / "would recommend to another property" (internal survey).
- Number of manual overrides per sheet (target trending to near-zero on typical nights).
- TM fairness complaint rate (via supervisors).
- "I barely touched it" stories collected.

---

## 10. References & Inspirations

**Solvers & Code**
- Google OR-Tools CP-SAT nurse rostering examples
- Timefold Quickstarts — Employee Scheduling & Nurse Rostering
- j3soon/nurse-scheduling (excellent real-world OR-Tools + Next.js reference)

**Industry**
- Deputy, UKG Dimensions, When I Work, 7Shifts, Shiftboard feature sets
- Academic literature on the Nurse Rostering Problem (INRC, INRC-II benchmarks)
- "Fair Workweek" / predictive scheduling legislation impact on system design

**Internal**
- All files under `src/lib/shiftbuilder/`
- `GOLDEN_VISUAL_SPEC.md`
- This masterlist + the session `plan.md`

---

**End of SCHEDULING_MASTERLIST.md v1.0**

This document is the map. The code in `src/lib/shiftbuilder/` is the extraordinary head start. The operators are the judges.

Next concrete step after review: pick the highest-leverage item from Phase 0/1 and launch a coding-engineer track (or spawn a subagent) with explicit reference back to the relevant section(s) above.

*Revered by all starts here.*