# SheetBuilder

**World-class GRAVE sheet system for ZDS operations** (product name: **SheetBuilder**; formerly ShiftBuilder / ShiftPlanner).

ShiftPlanner is the internal tool used to build precise, fair, and auditable nightly GRAVE sheets. It combines a strict domain-specific placement engine, weighted multi-signal optimization, Grok-powered intelligence, **Draft Mode** for planning roles, and session-gated mutations.

## Key Capabilities

- **Authoritative Placement Engine** — Non-negotiable `PLACEMENT_ORDER` with eligibility rules (full-grave vs overlaps, Z9SR, etc.)
- **Weighted Scoring + Unified Engine** — Skill, preferences, pair affinity, rotation health; Top-K + optional AI judgment in Draft
- **Draft Mode (planning roles)** — Engine and Grok land as provisional placements with `was → proposed` review, then **Apply to Live** (double-confirm, server `canPlace` re-validate)
- **Live board edits** — Floor operators with edit rights can drag/assign on published nights without Draft; planning roles use Draft for engine runs
- **Tasks & Breaks** — Per-slot night tasks + break waves with off-sheet (“–”) semantics
- **Shift notes** — Per-night notes pad (session-gated save)
- **Print** — Golden artboard fidelity + Print Command Center (⌘P)
- **SCHEDULING_MASTERLIST** — Long-term vision and phased roadmap

## Getting Started (Development)

```bash
pnpm install
pnpm dev:network
```

The app expects a Supabase project with the ZDS GRAVE schema and **server** secrets:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (build)
- `SUPABASE_SERVICE_ROLE_KEY` + `OPS_SESSION_SECRET` (runtime — required in production)

**UI/UX development**: Use **Frontman** for rapid visual iteration. After `pnpm dev`, open `/frontman` in a second tab/window. See `UI_UX_DEVELOPMENT.md` and `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`.

## Repository Structure

- `src/app/shiftbuilder/` — Main ShiftBuilder UI (Golden artboard)
- `src/lib/shiftbuilder/` — Core engine, mutations, eligibility
- `src/app/api/shiftbuilder/mutations` — Session-gated write plane
- `SCHEDULING_MASTERLIST.md` — Product vision
- `Agentic/` — AI Agentic Command Post

## Philosophy

- Hard rules are never violated (placement order, eligibility, locks) — enforced on Apply **and** single-slot writes.
- Planning changes prefer **Draft Mode** then **Apply to Live**; Batch Planner is an explicit live-write sudo tool.
- Multi-operator sync is **poll-based** (~20s) after Realtime retirement for board data.
- Beauty and calm matter (Golden print + Liquid Glass aesthetics).

## License

Internal / Private — Gun Lake Casino
