# ShiftPlanner

**World-class GRAVE shift scheduling and assignment system for ZDS operations.**

ShiftPlanner is the internal tool used to build precise, fair, and auditable nightly GRAVE sheets. It combines a strict domain-specific placement engine, weighted multi-signal optimization, Grok-powered intelligence, a powerful Command Palette, and mandatory Draft Mode safety.

## Key Capabilities

- **Authoritative Placement Engine** — Non-negotiable `PLACEMENT_ORDER` with `isEligibleForSlot` rules (full-grave vs overlaps, Z9SR fixed position, etc.)
- **Weighted Scoring** — Skill match, hard/soft preferences, pair affinity, within-repeat, with DB-tunable weights via `engine_config`
- **Grok Intelligence (Hybrid)** — Deterministic planner produces Top-K candidates + rich context; Grok provides contextual judgment overrides. All suggestions are server-guarded and land in Draft.
- **Draft Mode** — Every change (manual, engine, or Grok) is proposed safely with history, "was → proposed" visuals, and double-confirm Apply.
- **Command Palette (Cmd+K)** — Single control surface for roster search, actions, tasks, breaks, Grok analysis, and hotkeys.
- **Tasks & Breaks** — Per-slot night tasks + 3-wave break assignment with correct "–" (off-sheet) semantics.
- **SCHEDULING_MASTERLIST** — Comprehensive roadmap for evolving this into the scheduling system operators revere.

## Getting Started (Development)

```bash
pnpm install
pnpm dev:network
```

The app expects a Supabase project with the ZDS GRAVE schema (tm_profiles, zone_assignments, overlap_assignments, break_assignments, tm_preferences, etc.).

**UI/UX development**: Use **Frontman** for rapid visual iteration. After `pnpm dev`, open `/frontman` in a second tab/window, click any live element on the Golden artboard / PlacementPad / cards / etc., and describe the change in plain English. See `UI_UX_DEVELOPMENT.md` (and `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`).

## Repository Structure

- `src/app/shiftbuilder/` — Main ShiftBuilder UI (the 1056×816 Golden artboard)
- `src/lib/shiftbuilder/` — Core engine
  - `placement.ts` — PLACEMENT_ORDER + eligibility + planners
  - `scoring.ts` — Multi-signal weighted scoring
  - `engineConfig.ts` — Tunable weights & placement methods
  - `grokIntelligence.ts` + `grokEngine.ts` — Structured Grok context + guarded suggestions
  - `data.ts` — All Supabase access (roster, preferences, breaks, tasks, ADP import)
- `SCHEDULING_MASTERLIST.md` — The full vision and phased roadmap for a world-class system
- `Agentic/` — AI Agentic Command Post (THIS_IS_WHAT_WE_ARE_DOING.md + agent log + Memories/Key-Information/Plans for any AI). Start here in every new chat: "Read the Agentic folder in the project root."

## Philosophy

- Hard rules are never violated (placement order, eligibility, locks).
- The operator is always in control via **Draft Mode**.
- The Command Palette is the primary power surface.
- Beauty and calm matter (Golden PDF print fidelity + Apple Liquid Glass aesthetics).

## License

Internal / Private — Gun Lake Casino

---

> See `SCHEDULING_MASTERLIST.md` for the complete long-term vision and what it will take to make this system "reveled by all".