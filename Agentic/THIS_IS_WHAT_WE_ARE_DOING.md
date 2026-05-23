# THIS IS WHAT WE ARE DOING — OMS / ZDS ShiftPlanner (Master Context)

**Last Updated**: 2026-05-23 ~04:30 UTC — by Claude Sonnet 4.6 after shipping dark mode (system + manual toggle, dim/charcoal)
**Status**: Active / In Progress  
**Current Epic**: Wave 2 follow-ups + Wave 3 architecture from ATTACK_PLAN_2026-05-22.md

---

## The Mission (One Sentence)

Build the internal GRAVE scheduling system that ZDS operators actively brag about and defend — trusted, fair, fast, explainable, and Apple-grade in calm and beauty — while creating the world's best agentic development environment around it.

---

## Current High-Level Objective

**Phase A (Immediate)**: Stand up the **AI Agentic Command Post** (`Agentic/`) so every future AI session (new chat or not) begins with perfect orientation using the single instruction *"Start by reading the Agentic folder in the project root."*

**Phase B (Ongoing)**: Continue evolving the ShiftBuilder (the 1056×816 Golden artboard) with:
- World-class Command Palette (iPad Pro + Pencil Pro + Mac keyboard power users)
- Improved roster rail, drag/drop, draft mode safety, task/break assignment
- Deeper Grok intelligence (hybrid deterministic + LLM judgment) with guardrails
- Laying groundwork for the eventual **Master Operational AI Agent ("xAI Sphere")**

---

## Active Plan

- **PRIMARY**: `Plans/active/ATTACK_PLAN_2026-05-22.md` — **READ THIS FIRST.** Comprehensive bug kills + UX hardening roadmap. Wave 1 = ship-blocking bugs. Wave 2 = UX/code quality. Wave 3 = architecture evolution.
- **Supporting**: `Plans/active/CODEBASE_CRITIQUE_2026-05-22.md` — full static analysis findings with code excerpts
- **Migration NEEDS APPLYING**: `supabase/migrations/20260522_engine_config_grok_column.sql` — add `grok_reasoning_effort` column to `engine_config`. Currently causing 400 errors on every page load.
- **Previous**: `Plans/active/COMMAND_PALETTE_UPGRADE_PLAN.md` (Command Palette Phases 1–3.5 all complete)
- **Related Vision**: `SCHEDULING_MASTERLIST.md` (the long-term "Scheduling System Operators Revere")
- **Related Technical**: `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`, Key-Information/ops-agent-data-model.md (Master Agent / xAI Sphere groundwork)

All new implementation plans will be placed in `Plans/active/` and archived when complete.

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

- `src/app/shiftbuilder/ShiftBuilderClient.tsx` + `CommandPalette.tsx`
- `src/lib/shiftbuilder/` — `placement.ts`, `scoring.ts`, `grokEngine.ts`, `grokIntelligence.ts`, `data.ts`, `engineConfig.ts`
- `src/app/shiftbuilder/sudo/` — configuration surface
- Supabase migrations in `supabase/migrations/`

---

## Project Voice & Philosophy

- Hard constraints (PLACEMENT_ORDER, eligibility, locks) are non-negotiable.
- The operator is always in control via Draft Mode.
- Beauty and calm matter as much as correctness.
- We are building for the human operator *and* for the AI agents that will one day co-pilot at the highest level.

---

## Immediate Next Goals (as of last update)

### ✅ Done — Wave 1 + Wave 2 (all shipped):
1. ✅ **Migration applied by Brian**: `supabase/migrations/20260522_engine_config_grok_column.sql` — clears 400 errors.
2. ✅ **Task drag fix**: Moved `if (a.type === "task")` to top-level in `onDragEnd` — was unreachable inside assigned block.
3. ✅ **RR border keys**: `'RR1','RR6'…` → `'MRR1','WRR1','MRR6','WRR6'…` in both border flows.
4. ✅ **onAddTask key format**: Now uses `dbToUi(t.slotKey, t.slotType, t.rrSide)` in refresh loop — tasks appear on cards immediately.
5. ✅ **Live status pill**: `lastSavedAt` state + `persistAssign` stamps it — shows "Just now", "3m ago", etc. Dot green after first save.
6. ✅ **Session-stable query split**: 6 queries moved to `[tmCommandEpoch]` effect — day switches fire 13 queries, not 19 (32% fewer round-trips).
7. ✅ **cmdk value-prop filtering leak**: Action items now use `item.label` only as value — no more "jessica" matching "Jeff" keywords.
8. ✅ **Grok post-response UX**: After response, `setInputValue("?")` — query cleared, mode stays active, roster not cluttered.
9. ✅ **Day nav tap targets**: `w-11 h-11` (44×44px) on both day arrow buttons — Apple HIG compliant.

### ✅ Done — iPad + Apple Pencil Pro 2 Suite (Session 2):
- ✅ **Fix A**: `touch-none` on ZoneCard, RRSide, AuxCard, OverlapSlot outer divs
- ✅ **Fix B**: Sensor tuning — PointerSensor `distance:4`, TouchSensor `delay:250 tolerance:8`
- ✅ **Fix C**: `autoScroll={false}` on DndContext
- ✅ **Fix D**: `usePencilHover` hook → gold ring (`ring-[#FFD60A]`) on pen hover for all card types
- ✅ **Fix E**: Barrel button (`pointerType=pen, button===2`) on all cards → opens ⌘K for that slot

### ✅ Done — Dark Mode (Session 3):
- ✅ **`layout.tsx`**: No-flash `<head>` script + `dark:` body classes
- ✅ **`globals.css`**: Full `.dark` component override block (artboard, cards, RRs, header, footer, notes)
- ✅ **`ShiftBuilderClient.tsx`**: `isDark` state, `toggleTheme`, sun/moon toggle in zoom chip, all structural `dark:` variants on floating chips, roster panel, canvas stage, status pill
- ✅ **Long-hover delay**: 3500ms (per user — "3s4c, 600ms is far too quick")

### Now (Wave 2 remaining + Wave 3):
- Fix `useShiftHistory` hook identity (causing excessive re-renders on every action).
- Architecture evolution: slot-keys centralization, placement engine refactor (Wave 3).
- Optional: tune card task text readability in dark mode (`.card-meta` amber is very subtle).

**If you are an AI reading this for the first time**: Read `Plans/active/ATTACK_PLAN_2026-05-22.md` for the full roadmap. The log has the complete session history. Ask Brian what to tackle next.

This file is the heartbeat. Keep it alive and accurate.
