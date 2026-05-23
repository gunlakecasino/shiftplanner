# AI Agentic Command Post — OMS / ZDS ShiftPlanner

**The single, permanent, human- and LLM-readable home for "what we are doing right now" on this project.**

Any AI — Grok, Claude, Cursor, Gemini, local models, or future agents — can be dropped into this codebase with one sentence and immediately know the current mission, recent activity, rules, and context.

---

## The Magic One-Liner (Use This in Every New Chat)

> **"Start by reading the Agentic folder in the project root."**

After reading this folder (README + THIS_IS_WHAT_WE_ARE_DOING.md + last entries of the log), the AI will have better context than 95% of long-running human teams.

---

## Quick Orientation (30–60 seconds)

1. **README.md** (this file) — You are here. Understand the system and your obligations.
2. **THIS_IS_WHAT_WE_ARE_DOING.md** — The single master statement of the current objective, status, active plan, and non-negotiables. Read this every time.
3. **AGENT_ACTIVITY_LOG.md** — Reverse-chronological log of every significant action by every agent. Read the **newest 15–20 entries** to know what just happened.
4. Dive deeper only as needed:
   - `Plans/` — Current and historical implementation plans (active plan is in `Plans/active/`)
   - `Memories/` — Enduring facts, preferences, "never again" rules, successful patterns
   - `Key-Information/` — Authoritative excerpts (Golden artboard spec, data model, engine rules, etc.)
   - `Decisions/` — Architecture Decision Records (ADRs)
   - `References/` — Curated external knowledge

---

## Rules Every Agent Must Follow (Non-Negotiable)

1. **Always start here** when the user gives you the magic sentence or you are told this is a new/continuation session on OMS.
2. **Always append to `AGENT_ACTIVITY_LOG.md`** when you:
   - Begin a meaningful task
   - Make a significant decision or activate a branch
   - Complete work, hit a blocker, or hand off
   - Update the current mission
3. Keep `THIS_IS_WHAT_WE_ARE_DOING.md` accurate. When the "what we are doing" changes, update it and log the change.
4. Never delete or rewrite history in the log. Append only.
5. When touching real code, you **must** also follow the full `coding-engineer` 7-phase workflow defined in `.grok/skills/coding-engineer/SKILL.md` (the sibling system to this Command Post).
6. Prefer surgical, high-signal updates. Do not bloat the top-level files.

---

## Relationship to Other Systems

| System                        | Purpose                                      | Relationship to Agentic Command Post |
|-------------------------------|----------------------------------------------|--------------------------------------|
| `.grok/skills/coding-engineer/` | Master 7-phase React + Supabase engineer    | The "how we code" engine. Agentic is the "what we are doing + memory" layer. |
| `.grok/AGENTS.md`             | Project-wide mandatory rules                 | Now points here. Updated in this setup. |
| `docs/ops-agent-data-model.md` + Supabase `agent_*` tables | Runtime agent threads & in-app memory | Complementary. This folder is the cross-tool, cross-model, human-first context. |
| `SCHEDULING_MASTERLIST.md`    | Long-term vision                             | The "north star". Current mission here points to relevant sections. |
| `.grok/memory/oms-root-...`   | Grok-internal dream consolidation            | Internal only. This folder wins for any external AI. |

---

## Directory Contract

- **Top level stays tiny** (4 files max). All volume lives in subdirectories.
- Every subdirectory has its own `README.md` explaining exactly what belongs inside and the update contract.
- Dates are always ISO-8601 (2026-05-22). Times in 24h if present.
- The structure is intentionally simple so even the smallest model can navigate it perfectly.

---

## How This Was Created

This Command Post was bootstrapped on 2026-05-22 using the approved Phase 1 plan (see `Plans/active/`) under the `coding-engineer` system at the explicit request of the user. The goal was to eliminate the "every new chat starts from zero" problem forever.

**Welcome, future agent.** You now have the context. Use it well.

— The coding-engineer (executing the approved plan)
