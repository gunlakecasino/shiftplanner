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
