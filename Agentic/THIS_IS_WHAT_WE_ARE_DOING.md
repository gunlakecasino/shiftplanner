# THIS IS WHAT WE ARE DOING — OMS / ZDS ShiftPlanner (Master Context)

**Last Updated**: 2026-05-25 — by Grok 4.3 (Native-first direction locked)
**Status**: Active / In Progress  
**Current Epic**: Native-first flagship iPad app (`opsApp` — SwiftUI + PencilKit) + continued webapp support

---

## The Mission (One Sentence)

Build the internal GRAVE scheduling system that ZDS operators actively brag about and defend — trusted, fair, fast, explainable, and Apple-grade in calm and beauty — while creating the world's best agentic development environment around it.

---

## Current High-Level Objective

**Phase A (Complete)**: ✅ AI Agentic Command Post (`Agentic/`) is live. Any new AI session boots with full context from the magic one-liner.

**Phase B (Ongoing)**: Foundational webapp work (monolith split complete, Wave 2 cleanup largely done, Nightwatch real, multiple Sudo tabs shipped).

**Phase C (New Primary Focus — 2026-05-25 onward)**: Execute native-first strategy.
- Build `opsApp` (SwiftUI + PencilKit) in `/opsApp` as the **leading, world-class Apple Pencil Pro 2 iPad experience** for GRAVE operators.
- Make the native app the flagship "Apple-grade in calm and beauty" surface.
- Webapp becomes the important secondary surface (browser, Mac, lighter workflows, fallback).
- Use XcodeBuildMCP aggressively for native development velocity.
- Maintain Golden artboard fidelity and domain rules across both surfaces.

See `Agentic/Plans/active/OPSAPP_NATIVE_FIRST_2026-05-25.md` for the detailed plan.

---

## Active Plan

- **PRIMARY (New)**: `Plans/active/OPSAPP_NATIVE_FIRST_2026-05-25.md` — Native-first iPad app (`opsApp`) with SwiftUI + PencilKit as the leading GRAVE experience.
- **Supporting**: `Plans/active/ATTACK_PLAN_2026-05-22.md` (webapp Wave 2/3 items) + `Plans/active/SHIFTBUILDER_MONOLITH_SPLIT_2026-05-24.md` (already largely complete).
- **Related Vision**: `SCHEDULING_MASTERLIST.md` (long-term north star)
- **Related Technical**: `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`, `Key-Information/ops-agent-data-model.md`
- **Archive**: `Plans/archive/` — previous plans filed.

All new implementation plans go in `Plans/active/` and are archived when complete.

---

## Non-Negotiables (Sacred Rules — Never Violate)

1. **Diligently & Systematically** — Major initiatives (especially `opsApp`) follow proper planning, phased execution, and real-device validation. No hero coding.
2. **Pencil Pro 2 is the Differentiator** (new) — For `opsApp`, every significant interaction decision must demonstrably improve the Apple Pencil Pro 2 experience over what is possible on the web.
3. **Golden Artboard Contract** — 1056×816 logical canvas. Atkinson typography, liquid glass aesthetics, zero visual noise. This contract applies to both the webapp and `opsApp`.
4. **Operator Always in Control** — Draft Mode + perfect history + explainability for every assignment (native implementation must match or exceed the webapp bar).
5. **Supabase Security First** — RLS policies designed before implementation. Never expose cross-tenant or over-privileged data. Applies to both surfaces.
6. **Log Here** — Every agent appends to `AGENT_ACTIVITY_LOG.md` at key milestones.
7. **Real Device + Pencil Validation** (new for opsApp) — Critical Pencil interactions must be validated on actual iPad Pro hardware with Pencil Pro 2, not only simulators. XcodeBuildMCP is the primary tool for this.

The original "coding-engineer + Live Browser is King" rules continue to apply to all webapp changes.

---

## Key Hotspots (Current Code Focus)

- **New Primary**: `/opsApp/` — New native SwiftUI + PencilKit iPad app (flagship Pencil Pro 2 experience)
- `src/app/shiftbuilder/` (webapp) — Maintenance + parity work only going forward
- `src/app/nightwatch/` (webapp) — Continued evolution as the web reference surface
- `src/lib/shiftbuilder/` — Core domain logic (shared conceptually with opsApp)
- `Key-Information/ops-agent-data-model.md` — Authoritative data model for both surfaces

Webapp work is now secondary to `opsApp` execution.

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
