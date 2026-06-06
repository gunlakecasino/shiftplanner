# Plans — Implementation & Architecture Plans

**What belongs here**: All significant implementation plans, design docs, and roadmaps. The currently active plan lives in `active/`. Completed plans are moved to `archive/` (or kept with a clear "Completed" marker).

**Update Contract**: When you finish Phase 1 planning under coding-engineer, write (or update) the plan here. When the plan is fully shipped, move it out of `active/` and update `THIS_IS_WHAT_WE_ARE_DOING.md`.

---

## Active Plans (as of 2026-06-09)

- `active/ATTACK_PLAN_2026-05-22.md` — Primary web work (Wave 2/3 polish, architecture, AI co-pilot, engine, Sudo surfaces). Status tables inside are historical snapshots (May); many items addressed incrementally. Cross-check top of `AGENT_ACTIVITY_LOG.md` + `THIS_IS_WHAT_WE_ARE_DOING.md` for current shipped reality.
- `active/SHIFTBUILDER_MONOLITH_SPLIT_2026-05-24.md` — Incremental extraction of ShiftBuilderClient orchestrator + hygiene (components/, hooks/, lib/ constants). Client remains large (~6k LOC as of June 2026); progress via Lazy boundaries + effect-driven loading for Turbopack safety. See recent log for actual state.
- `active/OPSAPP_NATIVE_FIRST_2026-05-25.md` — Retained in active/ for future resumption. Native (SwiftUI + PencilKit) work is **paused** per user direction (2026-06-09); WebApp is the active development surface.

## Archive

- `archive/2026-05-22-Agentic-Command-Post-Setup.md` — AI Agentic Command Post bootstrap (complete; verified by first magic-sentence activation)
- `archive/2026-05-22-Sudo-Tasks-Tab.md`
- `archive/2026-05-23-Reports-Tab.md`
- `archive/CODEBASE_CRITIQUE_2026-05-22.md`
- `archive/COMMAND_PALETTE_UPGRADE_PLAN.md`

---

## Plan Template (for future use)

When writing a new plan, follow the shape from `coding-engineer/branches/01-planning-architect.md` + the approved plan for this Command Post:

1. Context & Problem
2. Success Criteria (measurable)
3. Recommended Approach + alternatives considered
4. Files to touch / architecture
5. Risks & unknowns
6. Verification strategy
7. Phase gate JSON (if using full coding-engineer flow)

Store the full plan as a dated markdown file in `active/`.

---

**This directory makes "what is the current plan?" a one-line answer for any AI.**
