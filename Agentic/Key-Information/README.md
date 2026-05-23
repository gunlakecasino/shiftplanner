# Key Information — Authoritative References (Read-Only, High Signal)

**What belongs here**: Stable, factual extracts from specs, data models, engine rules, visual contracts, and architecture that agents need fast access to without reading 2000-line source files.

**Update Contract**: Only when the source of truth changes. Always include the source path + date of extract. Prefer pointers + 1-2 screen excerpts over full copies.

---

## Current Contents

- `golden-visual-spec.md` — The 1056×816 artboard contract (excerpt + reference to full `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`)
- `ops-agent-data-model.md` — Critical tables and relationships for the Master Ops Agent / xAI Sphere (moved here from docs/ for centralization)
- `placement-engine-rules.md` — PLACEMENT_ORDER and eligibility (pointer to `src/lib/shiftbuilder/placement.ts`)
- `engine-config.md` — Live tunable weights and posture (pointer to `src/lib/shiftbuilder/engineConfig.ts` + SUDO surface)

---

## 1. Golden Visual Spec (Core Contract)

**Source**: `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md` (read the full file for pixel-perfect work)

**Key Invariants** (never violate):
- Logical artboard: 1056 × 816 points
- Typography: Atkinson Hyperlegible (or system equivalent) at precise sizes/weights
- Liquid Glass / Cupertino aesthetics on iPad Pro 13" target
- Zero visual noise. Every pixel must earn its place.
- Print fidelity to the physical GRAVE sheet is the ultimate success metric
- Roster rail, zone cards, quick action fan, command palette, and draft overlays all live inside this canvas

**When doing any UI work**: Re-read the full spec and validate in browser against the PDF golden files in `ZDS Goldens/`.

---

## 2. Core Data Model for Agentic Work (2026-05-22 snapshot)

**Source**: `Key-Information/ops-agent-data-model.md` (moved from docs/ for agentic centralization) + `supabase/migrations/20260522_create_agent_tables.sql`

**Critical Tables**:
- `nights`, `weeks`, `tm_profiles`
- `zone_assignments`, `overlap_assignments`, `break_assignments`, `night_slot_tasks`
- `agent_threads`, `agent_messages` (runtime), `agent_memory` (planned Phase 2)

**Week scoping** is the dominant pattern: most agent context is `(week_start Friday + current night_date)`.

**Engine posture lives in `engine_config`** — this is the live "how the intelligence should behave" table.

---

## 3. Placement Engine Sacred Rules

**Source**: `src/lib/shiftbuilder/placement.ts` (the PLACEMENT_ORDER export + `isEligibleForSlot`)

This file is the constitution. Any planner, Grok call, or manual override that violates it is a bug.

---

**Add new high-signal extracts below when a new stable reference emerges.**
