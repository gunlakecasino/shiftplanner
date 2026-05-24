# THIS IS WHAT WE ARE DOING — OMS / ZDS ShiftPlanner (Master Context)

**Last Updated**: 2026-05-24 — by Claude Sonnet 4.6 (Agentic Command Post audit + full status sync)
**Status**: Active / In Progress  
**Current Epic**: Wave 2 remaining cleanup (W2-1/6/7/8/9/10/11) → Wave 3 architecture + Nightwatch evolution

---

## The Mission (One Sentence)

Build the internal GRAVE scheduling system that ZDS operators actively brag about and defend — trusted, fair, fast, explainable, and Apple-grade in calm and beauty — while creating the world's best agentic development environment around it.

---

## Current High-Level Objective

**Phase A (Complete)**: ✅ AI Agentic Command Post (`Agentic/`) is live. Any new AI session boots with full context from the magic one-liner.

**Phase B (Ongoing)**: Continue evolving the ShiftBuilder (the 1056×816 Golden artboard) with:
- Wave 2 remaining code quality + perf fixes (`useShiftHistory`, `applyDraft`, and quick wins — last open items before Wave 3)
- Wave 3 architecture: ShiftBuilderClient.tsx monolith split, real Coverage Planner, Grok WhyPanel reasoning surface
- Nightwatch evolution (real event logging, timeline UX, canvas maturity)
- Laying groundwork for the eventual **Master Operational AI Agent ("xAI Sphere")**

---

## Active Plan

- **PRIMARY**: `Plans/active/ATTACK_PLAN_2026-05-22.md` — Master bug kill + UX roadmap. Has inline completion status table at the top. The only remaining open items are Wave 2 cleanup and Wave 3 architecture.
- **Related Vision**: `SCHEDULING_MASTERLIST.md` (long-term north star)
- **Related Technical**: `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`, `Key-Information/ops-agent-data-model.md` (Master Agent / xAI Sphere groundwork)
- **Archive**: `Plans/archive/` — all prior plans (Command Palette, Codebase Critique, Reports Tab, Tasks Tab, Agentic Bootstrap) are done and filed.

All new implementation plans go in `Plans/active/` and are archived when complete.

---

## Non-Negotiables (Sacred Rules — Never Violate)

1. **coding-engineer 7-Phase Workflow** — Every coding change follows Plan → Implement → Multi-Review (security/perf/a11y/code) → Live Browser Validation (Playwright + Chrome DevTools) → Fix → Preview → Document. See `.grok/skills/coding-engineer/SKILL.md`.
2. **Live Browser is King** — Any visual or interaction change must be validated in the real running app against the Golden PDF spec.
3. **Supabase Security First** — RLS policies designed before implementation. Never expose cross-tenant or over-privileged data.
4. **Golden Artboard Contract** — 1056×816 logical canvas. Atkinson typography, liquid glass aesthetics, zero visual noise. See `Key-Information/golden-visual-spec.md`.
5. **Operator Always in Control** — Draft Mode + perfect history + explainability for every assignment.
6. **Log Here** — Every agent appends to `AGENT_ACTIVITY_LOG.md` at key milestones.

---

## Key Hotspots (Current Code Focus)

- `src/app/shiftbuilder/ShiftBuilderClient.tsx` — `useShiftHistory` hook identity fix (W2-1), `applyDraft` batch fix (W2-6), quick wins (W2-7/8/9/10/11)
- `src/lib/shiftbuilder/useShiftHistory.ts` — identity instability (new object every render) + no `MAX_HISTORY` cap
- `src/app/nightwatch/` — Nightwatch is new and evolving; NightwatchClient.tsx + FreeformCanvas, Widgets, db.ts
- `src/lib/shiftbuilder/placement.ts` — `runCoveragePlanner` stub + `validatePlacementOrder` dead code (Wave 3)
- `src/app/shiftbuilder/sudo/` — All tabs now live: Tasks, Reports, BatchPlanner, Schedules, Team, EngineConfig

---

## Project Voice & Philosophy

- Hard constraints (PLACEMENT_ORDER, eligibility, locks) are non-negotiable.
- The operator is always in control via Draft Mode.
- Beauty and calm matter as much as correctness.
- We are building for the human operator *and* for the AI agents that will one day co-pilot at the highest level.

---

## Immediate Next Goals (as of last update)

### ✅ All Shipped (as of 2026-05-23):

**Wave 1 — Critical bugs**: DB migration, task drag fix, RR border keys, onAddTask key format, null guard. All done.

**Wave 2 (partial)**: Live status pill, session-stable query split (32% fewer round-trips), cmdk value-prop fix, Grok post-response UX. Done.

**iPad + Apple Pencil Pro 2 Suite**: `touch-none`, sensor tuning, autoScroll fix, `usePencilHover` gold ring, long-hover palette trigger (3500ms). Done.

**Dark Mode**: No-flash system detection + manual toggle, full `.dark` CSS override, sun/moon toggle in zoom chip. Done.

**Sudo Tabs — all built and wired**:
- `TasksTab.tsx` (520 lines) — full CRUD on `slot_task_catalog`, drag reorder, edit/delete with usage count guard, Default Daily Tasks toggle + seed button
- `ReportsTab.tsx` — zone frequency per TM, TM-first + zone-first views, 14/30/60d window, CSS bars
- `BatchPlannerTab.tsx` — run weighted placement engine across entire week, per-night status, skip-filled option

**Coverage command** — new palette action: pick source card → pick target → `CoverageBar` renders on both cards, `isCoverage` flag in data model. Done.

**Touch toolbar pinning** — task row toolbar pins/unpins on touch tap (no hover on iPad). ADP import now auto-creates nights/weeks. Done.

**Nightwatch** (`/nightwatch` route) — FreeformCanvas (pressure-sensitive Pencil, eraser, DB-persisted strokes), TimelineStrip, ShiftStrip, QuickStamp, Widgets, real `shift_events` table. Early but functional.

**DB fix** — `zone_assignments` unique constraint changed to `NULLS NOT DISTINCT` (Postgres 15+). Ghost row dedup applied. Drag/swap persistence now correct.

---

### 🔴 Open — Wave 2 Remaining (quick wins, do before any Wave 3):

- **W2-1** · `useShiftHistory` hook identity — plain object returned from hook = new reference every render = effect fires every render. Fix: stabilize with `useRef` wrapper or depend on individual memoized fn refs.
- **W2-6** · `applyDraft` — N serial history entries + N serial Supabase upserts → one `recordAtomicChange` + one batch upsert.
- **W2-7** · `assignedThisNight` O(n²) — replace `Object.values(assignments).some(a => a.tmId === id)` × 20 with `assignedThisNight.has(id)` (Set already exists in scope).
- **W2-8** · Dead outer `filterTerm` at line 1931 — delete it.
- **W2-9** · `AuxCard` duplicated `draftInfo` render block — extract `<DraftBadge>`.
- **W2-10** · `OverlapSlot`/`ZoneTaskList` stale closure on `taskDragEnabled` — pass as explicit prop.
- **W2-11** · History stack unbounded — add `MAX_HISTORY = 50` trim.

### 🔵 Wave 3 (Architecture — When Wave 2 is Clear):
- **W3-5** (highest leverage, highest risk): Split `ShiftBuilderClient.tsx` into `useShiftData`, `useDragDrop`, section components — feature branch + Playwright smoke tests required.
- **W3-1**: `runCoveragePlanner` real implementation (currently delegates to `runWeightedPlanner`).
- **W3-3**: Surface Grok chain-of-thought in WhyPanel after `?` queries.
- **W3-4**: Server-side `isEligible()` re-check before committing Grok-suggested assignments.
- **W3-6**: Real Supabase Realtime connection status in status pill.

### 🟡 Nightwatch Evolution (parallel track):
Nightwatch is early. Natural next: real event add UI (currently DB-seeded only), improved Timeline UX, canvas layer management, linking events to specific TM/zone assignments.

---

**If you are an AI reading this for the first time**: Read `Plans/active/ATTACK_PLAN_2026-05-22.md` (status table at the top shows what's done/open). Read the last 10–15 log entries to know what just shipped. Ask Brian what to tackle next.

This file is the heartbeat. Keep it alive and accurate.
