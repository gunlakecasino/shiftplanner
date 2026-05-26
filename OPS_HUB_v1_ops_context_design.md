# v1_ops_context — Unified Operational Snapshot for GRAVE Ops Shift Hub + Agent Intelligence

**Status**: Design Phase (Phase 0/1 boundary)  
**Owner**: LiquidForge (overall) + coding-engineer (Supabase architecture)  
**Date**: 2026-05-25  
**Related**: Approved "GRAVE Ops Shift Hub — Backend-First Plan"

---

## Purpose

Provide a single, clean, well-typed, permission-aware interface that any consumer can use to understand the current state of a GRAVE shift.

Consumers include:
- The native iPad opsApp (ShiftPlanner + BreakTracker + future features)
- Web ShiftBuilder + Sudo tools
- xAI Sphere / Master Agent intelligence layer
- Future reporting, compliance, and manager dashboards
- Edge Functions (placement engine, PDF generation, etc.)

This replaces the current scattered `.from()` calls and duplicated snapshot logic across `data.ts`, `grokEngine.ts`, `grokIntelligence.ts`, etc.

---

## Design Principles

1. **Single Source of Truth** — One well-designed contract.
2. **Security by Default** — Must respect RLS. Prefer security definer functions + explicit parameters over raw table access.
3. **Performance** — Pre-joined or carefully batched. Avoid N+1 from clients.
4. **Stability** — Versioned (`v1_`, later `v2_`). Breaking changes require migration path.
5. **Rich but Focused** — Include what the Ops Hub and agents need, not everything.
6. **Auditability** — Every snapshot should be traceable (who requested it, for which night/shift).

---

## Proposed Shape (Initial v1)

### Primary RPC (recommended entry point)

```sql
CREATE OR REPLACE FUNCTION public.v1_get_ops_context(
  p_night_id uuid DEFAULT NULL,
  p_night_date date DEFAULT NULL,
  p_include_history boolean DEFAULT false,
  p_include_agent_context boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;
```

**Returns** (structured JSONB):

```json
{
  "night": { ... },
  "week": { ... },
  "assignments": {
    "zones": [...],
    "restrooms": [...],
    "aux": [...],
    "overlaps": [...]
  },
  "team_members": [...],
  "break_status": [...],
  "active_tasks": [...],
  "notes": [...],           // Nightwatch + legacy
  "events": [...],
  "agent_context": {
    "recent_threads": [...],
    "key_memory": {...}
  },
  "engine_config": {...},
  "meta": {
    "generated_at": "...",
    "requested_by": "...",
    "version": "v1"
  }
}
```

### Supporting Views (for power users + reporting)

- `v1_shift_assignments_unified`
- `v1_grave_shift_activity_feed`
- `v1_fairness_snapshot`

---

## Implementation Roadmap (for this project)

**Step 1 (Now — Phase 0/1)**: Design + lightweight stub implementation using existing tables. Focus on correctness and the most critical fields.

**Step 2**: Wire the web data layer and native `ShiftPlannerRepository` to use the new RPC where possible (behind feature flags).

**Step 3**: Deep integration with the agent intelligence layer (`grokEngine`, Sphere, etc.).

**Step 4**: Evolve to v2 when the unified `shift_activities` + `grave_shifts` model lands.

---

## Open Questions

- How much denormalization vs joins in the function?
- Caching strategy (materialized views? short-lived cache in Edge Functions)?
- How to handle real-time updates alongside snapshot RPCs?
- Authorization: Should the function accept an optional `operator_id` for elevated views (managers)?

---

*This document will be iterated during implementation. It is the single source of truth for the Ops Hub's data access contract.*