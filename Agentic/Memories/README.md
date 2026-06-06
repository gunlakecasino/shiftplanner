# Memories — Long-Lived Agent Context for OMS

**What belongs here**: Enduring, high-value facts that survive many sessions and many different AIs. Things that are true across months of work, not just the current sprint.

**Update Contract**: Only add when you have high confidence the memory will still be relevant in 3+ months. When a memory is superseded, append a "Superseded by..." note rather than deleting. Date every entry.

---

## Seeded Initial Memories (2026-05-22)

### 1. Operator Psychology & UI Preferences
- The GRAVE operator values **calm, power, and speed** above flashy animations. The 1056×816 Golden artboard must feel like a precision instrument, not a dashboard.
- Draft Mode + perfect undo/history is sacred. The operator must **never** feel they can accidentally break a sheet.
- Command Palette (Cmd+K / Pencil) is the future primary surface. Side panels and buttons are transitional.
- "Why did the engine put this person here?" must be answerable in one tap with exact signals and scores.

### 2. Non-Negotiable Domain Rules (Never Let an AI Violate These)
- PLACEMENT_ORDER and `isEligibleForSlot` in `placement.ts` are the single source of truth. Grok suggestions, manual moves, and solvers must all respect them.
- Hard preferences and accommodations always win over soft scoring.
- No TM can be placed in a slot for which they are ineligible (grave pool, overlaps, fixed positions, etc.).
- Every change lands in Draft first. Direct "apply" to production state is forbidden except in very narrow admin flows.

### 3. Successful Patterns We Have Re-Learned
- The hybrid Grok approach (deterministic Top-K planner → rich snapshot → Grok contextual judgment → guarded proposal) produces dramatically better results and trust than pure LLM or pure rules.
- Live browser validation with Playwright + Chrome DevTools catches coordinate, hit-target, and visual fidelity bugs that unit tests and screenshots miss.
- When in doubt about UI component choice, the `ui-mcp` skill + shadcn + design-system-presets branch + real-device testing wins.

### 4. Agentic Development Meta (This Command Post Exists Because of These)
- Every new chat starts from zero context. Without this folder, 80% of agent time is spent re-explaining the project.
- The combination of `coding-engineer` (how we code) + this `Agentic/` Command Post (what we are doing + memory) is the highest-leverage setup we have found for long-running, multi-AI projects.

---

**Add new memories below this line when you discover something truly durable.**

---

## 2026-06-09 — Graves Default Schedule as Sole Source of Truth

**Context**: During June 2026 engine hardening and UI work, it became clear that multiple surfaces (roster classification, TM Picker "scheduled" lists, on-schedule pools for eligibility, engine context for both deterministic planner and Grok-hybrid, Weekly Roster, Sudo tools, and `getScheduledTmsForNight`) were still at risk of drifting toward legacy `tm_default_schedules` / ADP paths or full active roster.

**Memory**:
- The **Graves Default Schedule page** (`/shiftbuilder/graves-schedule`) + `graves_default_schedule` table + `night_on_call` overrides is the **canonical and sole root** for all scheduled data.
- All "on-schedule" filtering, candidate pools for the engine, "scheduledUnassigned" prioritization, `getScheduledTmsFromGravesDefault`, and the `/api/shiftbuilder/scheduled-roster` path must derive exclusively from this source.
- Legacy ADP / `tm_default_schedules` paths are secondary or deprecated for roster scheduling purposes in this system.
- Any edit to the Graves schedule must trigger appropriate cache invalidation / refetch so that Draft Mode, picker, engine runs, and status surfaces see the change immediately.
- This rule is now treated as a sacred invariant (see also `THIS_IS_WHAT_WE_ARE_DOING.md` Key Caveats and the hard enforcement work landed in `runCoverageEngine` / planningRoster filtering in June 2026).

Future agents must not relax this or introduce parallel schedule sources without an explicit, logged architectural decision.

---

## 2026-06-09 — Deliberate Powerful AI Usage (Power & Quality Over Cost)

**Context**: As the sole primary user and operator of the system, a conscious policy decision was made regarding xAI / Grok usage inside the builder, PlacementPad analyst, engine, insights, and co-pilot surfaces.

**Memory**:
- Prioritize **deliberate, intentional, powerful** Grok usage.
- Use variable reasoning effort: `basic` / `low` only for fast interactive corner cases; `high` or `medium` for deep analysis, rotation health optimization, complex judgment, training data quality, and explainability.
- Richer prompts, fuller relevant context (always filtered to graves-scheduled TMs per the above rule), and higher-effort calls are encouraged when they produce meaningfully better fairness signals, operator trust, or "why did it do that?" answerability.
- Do **not** default to aggressive low-token optimizations or cheapest models across the board. The operator experience and the quality of the scheduling decisions matter more than marginal cost savings.
- Usage tracking (30d + session) and the OpsStatusBar pill exist to give visibility, not to drive stinginess.
- This stance is recorded in `THIS_IS_WHAT_WE_ARE_DOING.md` Key Caveats and was actively applied during the June 2026 xAI engine improvements, PlacementPad "magic one-liner" + matrix work, and usage telemetry hardening.

This is a durable operating philosophy for the project while the user remains the primary (and for now, sole) operator.
