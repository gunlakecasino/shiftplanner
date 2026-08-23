# THIS IS WHAT WE ARE DOING — SheetBuilder

**Last Updated**: 2026-08-23 — Grok Build PR A (chrome slim + heartbeat rewrite)  
**Status**: Active  
**Product**: **SheetBuilder** (code folder may still say `shiftbuilder` — do not rename it)  
**Operator**: Brian (sole user). Dyno directs Build.

---

## Heartbeat

SheetBuilder is the live GRAVE sheet product. Nightwatch is archive. `opsApp` is paused. Ops Hub / `grave_shifts` are unused — do not resume.

Current epic: slim chrome **A → B → C**, then the portrait planner sheet. Work lane only.

`Agentic/Plans/active/` is a museum. Ignore it. Live direction is this file, the top of `AGENT_ACTIVITY_LOG.md`, and Dyno.

June 2026 heartbeat archived at `Plans/archive/THIS_IS_WHAT_WE_ARE_DOING_2026-06-09.md`.

---

## Sacred (never violate)

1. **Golden 1056×816** print fidelity is the floor.
2. **Draft → Apply** — engine output is Draft until Apply. No silent official-flag. No raw `zone_assignments` writes unless the task says so.
3. **Live engine is `runNightEngine`** (greedy + local optimizer + `canPlace`). Not Hopcroft, not `runCoveragePlanner`, not Timefold, not `runEnginePipeline`. `engine/optimizer.ts` is the live hill-climb — keep it.
4. **Graves Default Schedule (GDS)** is the scheduled roster source of truth.
5. **`canPlace` + `PLACEMENT_ORDER`** are the hard placement constitution.

---

## Do not resume

Nightwatch, opsApp, Ops Hub, PIN/RLS, identifier rename soup, monolith split of `ShiftBuilderClient.tsx`.
