# Plans — Implementation & Architecture Plans

**What belongs here**: All significant implementation plans, design docs, and roadmaps. The currently active plan lives in `active/`. Completed plans are moved to `archive/` (or kept with a clear "Completed" marker).

**Update Contract**: When you finish Phase 1 planning under coding-engineer, write (or update) the plan here. When the plan is fully shipped, move it out of `active/` and update `THIS_IS_WHAT_WE_ARE_DOING.md`.

---

## Active Plans (as of 2026-06-10)

- `active/ATTACK_PLAN_2026-05-22.md` — Historical web Wave 2/3 + architecture. Many items addressed incrementally; see top of AGENT_ACTIVITY_LOG for current reality.
- `active/SHIFTBUILDER_MONOLITH_SPLIT_2026-05-24.md` — Monolith hygiene (significant extractions done; Client at 7264 LOC). Superseded by the (now archived) 2026-06-10 stabilization plan.
- `active/OPSAPP_NATIVE_FIRST_2026-05-25.md` — Retained in active/ for future resumption. Native (SwiftUI + PencilKit) work is **paused** per user direction; WebApp is the active development surface.

**Note**: The 2026-06-10 PRODUCTION_STABILIZATION plan has been fully shipped and moved to `archive/`. See Archive section and the plan file for delivered value (server guard, data layer, audit, atomicity + visibility).

## Archive

- `archive/PRODUCTION_STABILIZATION_2026-06-10.md` — Production hardening & stabilization (slices 1/3/4/5 delivered + 6 partial; server eligibility guard, data layer centralization, Graves audit, applyDraft atomicity + visibility). Executed to completion per user "continue". Core goals met; deferred items (full drag extraction) noted for future. Plan archived after full implementation and gates.
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
