# Phase 1 — Unified Operational Core Model Design

**Phase**: 1 (Unified Operational Core Model)  
**Status**: Design + Initial Implementation  
**Date**: 2026-05-25  
**Mode**: Silent autonomous execution (per user directive)

---

## Strategic Goal

Move from the current evolutionary, fragmented data model to a clean, future-proof unified operational core that can support the full GRAVE Ops Shift Hub for 5–10+ years.

This is the most important structural change in the entire project.

---

## Current Problems (Recap from Phase 0 Audit)

- Fragmented assignment tables (`zone_assignments`, `break_assignments`, `overlap_assignments`)
- Scattered activity data (notes, events, tasks, agent decisions)
- `nights` table carrying too much responsibility
- No single source of truth for "what happened during a shift"
- Hard to build rich agent context or advanced reporting

---

## Target Model

### 1. `grave_shifts` (Canonical Entity)

Evolution of `nights`. This becomes the primary anchor for everything.

Key columns (proposed):
- id (uuid)
- shift_date (date)
- week_id (fk)
- status (draft/published/archived/locked)
- is_locked
- locked_by / locked_at
- notes (general shift notes)
- created_at / updated_at
- created_by / updated_by (future)

### 2. `shift_activities` (Central Append-Only Log)

This is the heart of Phase 1.

```sql
CREATE TABLE shift_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grave_shift_id uuid NOT NULL REFERENCES grave_shifts(id),
  
  activity_type text NOT NULL,           -- 'assignment', 'break', 'note', 'event', 'task', 'agent_decision', 'huddle', etc.
  slot_key text,                         -- if activity is slot-related
  slot_type text,
  tm_id text,                            -- affected team member
  
  payload jsonb NOT NULL,                -- rich structured data
  summary text,                          -- human-readable short description
  
  actor_type text NOT NULL,              -- 'operator', 'agent', 'system'
  actor_id text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**Why this is powerful**:
- Everything that happens during a shift is recorded here.
- Excellent for agent memory, audits, timelines, fairness analysis, and future AI.
- Append-only = very safe and queryable.

### 3. Assignment Tables — Strategy

**Recommended Path**:
- Keep the existing `zone_assignments`, `break_assignments`, `overlap_assignments` tables for now (to avoid breaking opsApp + web).
- Create a new unified `shift_assignments` table (or use `shift_activities` with specific activity_types for the source of truth going forward).
- Build views (`v_shift_assignments_current`) and RPCs that present a clean unified interface.
- Gradually migrate new features and the agent layer to the new model.
- Old tables become legacy read sources during transition.

---

## Migration Philosophy (Important)

- **Zero breaking changes** for the iPad opsApp and current web usage during Phase 1.
- All new work (especially agent intelligence and future Ops Hub features) goes through the new model.
- Use views + security definer functions as the transition layer.
- Old tables can be deprecated in Phase 2 or later.

---

## Deliverables for Phase 1

1. `grave_shifts` table + migration from `nights`
2. `shift_activities` table (core of the design)
3. Supporting views and RPCs (including evolution of `v1_ops_context`)
4. Migration strategy document + dual-write patterns
5. Updated data access patterns in both web and native

---

*This document is the working design for Phase 1. It will be updated as implementation reveals new realities.*
