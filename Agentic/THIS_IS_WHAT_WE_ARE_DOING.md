# THIS IS WHAT WE ARE DOING — OMS / ZDS ShiftPlanner (Master Context)

**Last Updated**: 2026-06-09 — by Grok 4.3 (WebApp primary focus) — cards xAI bleed removal (colored labels now clean on load; full xAI surfaces stay in pad only) + prior rotation health + pad polish; tsc clean, version 0.817
**Status**: Active / In Progress  
**Current Epic**: WebApp ShiftBuilder + Sudo tools + AI insights + Nightwatch (native `opsApp` paused for now)

---

## The Mission (One Sentence)

Build the internal GRAVE scheduling system that ZDS operators actively brag about and defend — trusted, fair, fast, explainable, and Apple-grade in calm and beauty — while creating the world's best agentic development environment around it.

## Key Caveats (Current Operating Reality — 2026-06-09)

- **Graves Default Schedule is root source of truth for scheduled data**: All roster classification, TM Picker scheduled lists, "on-schedule" pools, eligibility weighting, engine context, Weekly Roster / Sudo scheduling surfaces, and getScheduledTmsForNight must solely derive from the Graves Default Schedule page (`/shiftbuilder/graves-schedule`) + `graves_default_schedule` table + `night_on_call` overrides. This is the canonical scheduled roster (via `/api/shiftbuilder/scheduled-roster` and `getScheduledTmsFromGravesDefault`). Legacy `tm_default_schedules` / ADP paths are secondary or deprecated for this purpose. Notify cache / invalidate on edits.
- **AI / xAI usage — power over cost**: As the primary (sole) user, prioritize *deliberate, intentional, powerful* Grok usage. Use variable reasoning effort (basic/low for fast interactive; high/medium for deep analysis, insights, complex reasoning). Richer prompts, more context, and higher effort are encouraged when they produce meaningfully better quality, fairness signals, or explainability. Do not default to aggressive low-token optimizations.

---

## Current High-Level Objective

**Phase A (Complete)**: ✅ AI Agentic Command Post (`Agentic/`) is live. Any new AI session boots with full context from the magic one-liner.

**Phase B (Resumed as Primary — 2026-06-09)**: WebApp evolution for ShiftBuilder (the 1056×816 Golden canvas), Sudo operator power tools, AI co-pilot features (insights, training, powerful deliberate Grok per caveats), Nightwatch freeform, engine improvements, and polish. Many Wave 2 quick wins addressed incrementally (see recent log); monolith split progressed via extractions + lazy loading but Client remains the large orchestrator (~6.4k LOC). Focus on quality, performance, explainability, and fidelity while following coding-engineer + live browser validation.

**Phase C (Paused)**: Native-first `opsApp` (SwiftUI + PencilKit) strategy. The plan and `/opsApp` tree remain; work deprioritized per user direction. Will resume when directed. Web remains the active development surface for now (browser + iPad Safari parity important).

See `Agentic/Plans/active/ATTACK_PLAN_2026-05-22.md` (and MONOLITH_SPLIT) for web details. The OPSAPP plan is retained in `active/` for when native work restarts.

---

## Active Plan

- **PRIMARY**: `Plans/active/ATTACK_PLAN_2026-05-22.md` (web Wave 2/3 polish + architecture) + `Plans/active/SHIFTBUILDER_MONOLITH_SPLIT_2026-05-24.md` (incremental extraction + hygiene; target slim orchestrator not yet fully realized).
- **Supporting / On Hold**: `Plans/active/OPSAPP_NATIVE_FIRST_2026-05-25.md` (paused; plan + `/opsApp` preserved for resumption).
- **Related Vision**: `SCHEDULING_MASTERLIST.md` (long-term north star — "the scheduling system operators revere")
- **Related Technical**: `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`, `Key-Information/ops-agent-data-model.md`, `src/lib/shiftbuilder/` (placement, scoring, engineConfig, data, grok* )
- **Archive**: `Plans/archive/` — previous plans filed when complete.

All new implementation plans go in `Plans/active/` and are archived when complete. Plans in active/ may be historical snapshots; cross-check top of AGENT_ACTIVITY_LOG for what actually shipped.

---

## Non-Negotiables (Sacred Rules — Never Violate)

1. **Diligently & Systematically** — All major web work follows planning (see coding-engineer), small vertical slices, tsc gates, and live browser validation (Playwright + Chrome DevTools MCP preferred for visual/interaction fidelity). No hero coding.
2. **Golden Artboard Contract** — 1056×816 logical canvas. Atkinson typography, liquid glass aesthetics, zero visual noise. Print fidelity to the physical GRAVE sheet is the ultimate metric. Applies to ShiftBuilder, Sudo surfaces, Nightwatch, and any new web UI.
3. **Operator Always in Control** — Draft Mode + perfect history (useShiftHistory / recordAtomicChange) + explainability for every assignment and Grok suggestion. Never bypass Draft for production state except narrow admin flows.
4. **Supabase Security First** — RLS policies designed before implementation. Never expose cross-tenant or over-privileged data. All access paths (Client, actions, Sudo) must respect week/night scoping and tm_profiles visibility.
5. **Log Here** — Every agent appends to `AGENT_ACTIVITY_LOG.md` at key milestones (start, decision, completion, blocker, mission change). Re-read THIS_IS + recent log entries at session start.
6. **Live Browser is King for Web** — Any change affecting visuals, interactions, drag, palette, cards, or rendering **must** be validated in the running dev server via browser tools / MCP (not just unit or static). Console errors, hit-target, or fidelity issues = incomplete.

The "coding-engineer 7-phase workflow" (plan → implement → review → live validate → fix → document) is mandatory for web code changes (per .grok/AGENTS.md). Native/Pencil rules are paused with the opsApp work.

Pencil Pro 2 differentiator and real-device validation rules apply only when opsApp work is active.

---

## Key Hotspots (Current Code Focus)

- `src/app/shiftbuilder/` (primary) — ShiftBuilderClient (orchestrator + canvas), components/ (ZoneCard, RRCard, Aux, RosterRail, MarkerPad/PlacementPad, OpsStatusBar, etc.), sudo/ tabs (Team, Tasks, Reports, BatchPlanner, Defaults, EngineConfig, etc.), AI surfaces (insights, Grok hybrid, xai/), store, hooks, Golden fidelity work.
- `src/lib/shiftbuilder/` — Core (placement.ts + PLACEMENT_ORDER + isEligible, scoring.ts, engineConfig, data.ts loaders + batch, grokEngine/grokIntelligence, useShiftHistory, slot-keys, etc.). Granular engine model (tm_zone_matrix, overrides) shipped earlier.
- `src/app/nightwatch/` — Freeform canvas evolution (Pencil-friendly on web too), events, timeline, as the experimental/reference surface.
- Sudo power tools and engine tuning surfaces for the operator.
- AI co-pilot features: powerful deliberate insights (variable high reasoning per caveats), live training (thumbs), provenance, chain-of-thought surfacing.

Native `/opsApp/` and related rules are paused. Web is the active surface (including iPad Safari testing for touch/pencil parity where relevant).

---

## Project Voice & Philosophy

- Hard constraints (PLACEMENT_ORDER, eligibility, locks) are non-negotiable.
- The operator is always in control via Draft Mode.
- Beauty and calm matter as much as correctness.
- We are building for the human operator *and* for the AI agents that will one day co-pilot at the highest level.

---

## Immediate Next Goals (as of 2026-06-09 web focus resumption)

### ✅ Shipped (cumulative, including June 2026 work):

**Wave 1 + foundational**: DB migrations (grok_reasoning_effort, agent tables, zone unique nulls, etc.), task drag, RR keys, onAddTask, null guards, Sudo tabs (Tasks 520LOC full CRUD+defaults, Reports, BatchPlanner), Coverage command + bar, Nightwatch basics (FreeformCanvas + Pencil pressure on web, Timeline, events table), dark mode, touch pinning, ADP import, live status pill, session-stable queries, cmdk fixes, Grok post-response UX.

**Recent June web work (post native pivot)**:
- Break pills full roundtrip: zone_assignments.breakGroup + break_assignments sync, Sudo Defaults "Breaks → Today/Week" immediately visible on cards via store patch + dual write, top counters accurate.
- TM gender: full edit surface in TeamTab (IdentityForm segmented M/F/Unknown), persist to tm_profiles, shared normalizeGender, eligibility/picker/Marker history pills now correct (e.g. known females excluded from MRR).
- Giant Client Turbopack stability: full dynamic `import()` + effect-driven LazyCommandPalette / LazySudoWindow (no static top-level imports of heavy modules), effect discipline, .next nuke patterns; eliminated factory ReferenceErrors for useCommandActions etc.
- OpsStatusBar + AI telemetry: extracted, viewMode localStorage persist (canvas direct on refresh), imperative ensure/hide singletons (idempotent DOM), always-visible "ai 0.0k ~$0.00" session tokens/cost pill, usage accumulation from engine runs + pad insights + palette, globals + poll.
- Marker/Placement Pad xAI analyst: prompts grounded with verbatim PLACEMENT_ORDER + eligibility + matrix signals + current affinity + slot history; live training loop (👍/👎 thumbs after deeper insight inject priorGoodExamples as dynamic few-shots for the session); succinct analytical (not sycophantic) style.
- Other: gender normalization robustness, powerful insight strategies exploration (high-effort where valuable per caveats), various store/query sync patterns.

**Engine**: Granular model (tm_zone_matrix, versioned overrides) shipped; N+1 scoring fixed (preload matrix); rich telemetry (logEngineRunSummary); runCoveragePlanner deprecated skeleton.

**Monolith hygiene progress**: Components/ (35+ files: cards, RosterRail, MarkerPad, OpsStatusBar, Lazy*, etc.), hooks/ (9+ including useCurrentNight, useRosterPanels, useZoom, useTheme), store/ extraction, many dynamic imports for giant-file safety.

---

### 🔴 / 🟡 Current Open / High-Leverage Web Focus Areas (refreshed; many original W2 quick wins addressed incrementally):

From ATTACK_PLAN (status table historical — many W2 now mitigated via refs, Sets, single record+batch, dead code removal, etc.; re-verify on task):
- W2-1 (useShiftHistory identity): Workaround via recordChangeRef + useEffect in Client; hook still returns fresh object. Full stabilization (useMemo on return or better hook API) if re-renders persist.
- W2-9 / W2-10 style: AuxCard draft duplication, stale closures in task lists — audit for similar.
- W2-11: MAX_HISTORY=50 already in useShiftHistory; confirm trim everywhere.
- applyDraft batching: Single history + one batchApply now for engine draft; ensure all paths (Grok suggestions, manual?) are atomic.

Wave 3 Architecture (high leverage):
- W3-5: Full decomposition of ShiftBuilderClient (useShiftData, useDragDrop, section components). Still ~6439 LOC orchestrator despite extractions. Requires careful plan + live validation (Turbopack sensitivity).
- W3-1: Real `runCoveragePlanner` (or fully remove delegation + deprecate).
- W3-3: Surface Grok reasoning / CoT ("magic one line" headline + full structured) in pad + card corner (fit chip override) after xAI tap / `?`. Use high effort for powerful deliberate analysis (per caveats); always filter context to graves default schedule scheduled TMs only. Expose reasoning summaries if available. Build on current unilateral PlacementPad analyst + training.
- W3-4: Server-side isEligible re-check guard before committing any Grok proposal.
- W3-6: Real-time Supabase Realtime status visible in OpsStatusBar / pill.

Other active:
- AI power + quality: Deliberate, intentional, powerful xAI/Grok usage (per current caveats; single user = favor quality/power). Variable: basics/low for quick corner reads/instant, high/medium for deep pad analyst/insights. Use grok-4.3 (or 4.20-reasoning variants) + 1M ctx where valuable; Responses API/tools for agentic; vision experiments optional. Smart tokens: always cache (contextSig + graves filter), prune inputs to only graves-scheduled relevant TMs + exceptions, modes (basics cheap), structured outputs + guards. Current: PlacementPad "More details (xAI)" + headline (magic one line) + training thumbs + usage pill. Expand to card corners, engine, Sudo, XAISphere integration, full powerful explainability. Continue training loop, provenance.
- Nightwatch: Real event authoring UI (beyond seed), improved timeline/UX, layer mgmt, link events to assignments/TMs.
- Sudo / power tools: Address remaining TODOs (e.g. WeeklyRoster write path, dnd in Tasks), more reports, defaults UX.
- Perf / re-renders: Ongoing (Zustand selectors, React Query + liveCache, giant component effects).
- Golden fidelity + new UI: Any card/pad/pill changes must pixel-match spec + PDF goldens; use live browser validation.
- Monolith + lazy: Continue safe extractions / dynamic boundaries following the established "effect + Loader state" pattern for Turbopack.
- History / Draft UX: Polish (unbounded edge cases, apply all paths, better descriptions).

**If you are an AI reading this for the first time**: 
- Read `Plans/active/ATTACK_PLAN_2026-05-22.md` (its status table is a May snapshot; many items advanced since — check recent AGENT_ACTIVITY_LOG top 15-20 entries for actual shipped + current context).
- Re-read the newest log entries (break sync, gender, lazy fixes, status+AI pill, insight training are recent high-signal examples).
- **Internalize the Key Caveats section above immediately** (Graves Default Schedule as sole scheduled data source; AI power/quality over low-cost, variable high reasoning).
- WebApp (ShiftBuilder + lib + Sudo + Nightwatch) is now the active surface.
- Ask Brian for the specific task (bug, polish item, new AI feature, monolith slice, Sudo tab, Nightwatch, perf, etc.).
- Follow coding-engineer 7-phase + live browser validation for any code, and always append to this log.

This file is the heartbeat. Keep it alive and accurate. When the mission shifts (e.g. back to native), update here immediately + log the change.
