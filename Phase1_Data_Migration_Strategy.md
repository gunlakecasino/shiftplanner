# Phase 1: Data Migration Strategy - Fragmented Legacy to Unified Core

**Date**: 2026-05-25
**Phase**: 1 - Unified Operational Core Model
**Status**: Design & Initial Implementation
**Mode**: Silent YOLO execution (per user directive - no updates until Phase 3)

## Executive Summary

We have introduced `grave_shifts` (canonical replacement/evolution of `nights`) and `shift_activities` (central append-only activity log) in Phase 1.

The legacy model is heavily fragmented:
- Multiple assignment tables (zone_assignments, break_assignments, overlap_assignments)
- Scattered activity data (night_slot_tasks, night_card_borders, shift_notes, canvas_strokes, shift_events, agent_* tables, etc.)
- Direct table access from both web (data.ts, Sudo tabs) and native (ShiftPlannerRepository.swift)

**Goal for Phase 1**: Establish a clean contract layer so new development (especially agentic features and future Ops Hub surfaces) can use the unified model immediately, while existing surfaces continue to function with minimal risk.

## Migration Principles (Non-Negotiable)

1. **Zero downtime for operations** - Grave shifts must continue without interruption.
2. **Dual-read / Dual-write where necessary** during transition.
3. **New code prefers unified model** (via views, RPCs, or v1_ops_context).
4. **Old tables become legacy** - Read-only for historical data over time.
5. **Strong RLS and audit** on new core tables from day one (already partially applied).
6. **iPad opsApp (LiquidForge)** gets a clean, future-proof repository contract.
7. **Web remains functional** - Sudo tools, ShiftBuilder, etc. can migrate incrementally.

## Current State Snapshot (Post Phase 0 + Early Phase 1)

- grave_shifts and shift_activities tables exist.
- Basic RLS on new tables (service_role full + authenticated read).
- v_unified_assignments and pragmatic views exist (with some schema mismatches fixed in later migrations).
- v1_ops_context stub deployed and evolved to reference new tables with fallback to nights.

## Recommended Phased Approach

### Sub-Phase 1.1: Contract Layer (Current Focus)
- Create robust, schema-aware unified views:
  - v_current_grave_assignments (union of all assignment types with normalized columns)
  - v_shift_activity_feed (recent activities across types)
- Enhance v1_ops_context to return richer unified payload.
- Add security definer RPCs for common access patterns (e.g., get_assignments_for_night, record_activity).

### Sub-Phase 1.2: Dual-Write Pattern
- In web data layer (src/lib/shiftbuilder/data.ts):
  - Modify assignment save functions to write to both legacy tables + shift_activities.
  - Use transaction where possible.
- For native opsApp:
  - Update ShiftPlannerRepository to support writing to new activity log (via Edge Function or direct if RLS allows).
  - Keep legacy writes for compatibility during transition.

### Sub-Phase 1.3: Read Migration (New Surfaces First)
- Agent intelligence (grokEngine, Sphere, etc.) starts consuming via v1_ops_context and new views.
- New Ops Hub features (incidents, huddles, equipment checks) built exclusively on unified model.
- Sudo tools and reporting gradually migrate reads.

### Sub-Phase 1.4: Backfill & Historical Unification
- One-time or batched backfill of historical data into shift_activities (using existing data from notes, events, assignments).
- This enables rich longitudinal agent memory and fairness analytics.

### Sub-Phase 1.5: Legacy Deprecation
- Mark old direct table access as deprecated in code.
- Eventually (Phase 2+), make legacy tables read-only or archive historical snapshots.

## Specific Technical Steps (Execution Order)

1. **Fix & Harden Unified Views** (immediate)
   - Account for real schema differences:
     - break_assignments uses `slot_ref`
     - overlap_assignments uses `overlap_window` + `position` + `task`
     - zone_assignments has rich flags (is_sweeper, has_trainee, etc.)
   - Create `v_current_assignments` with proper normalization + category column.

2. **Core RPCs**
   - `record_shift_activity(grave_shift_id, activity_type, payload, actor...)`
   - `get_shift_activity_feed(grave_shift_id, limit, since)`
   - Enhance v1_get_ops_context to include activity feed summary.

3. **Web Data Layer Updates**
   - In data.ts: Add `recordActivity(...)` and gradually route new writes.
   - Update Sudo tabs (Tasks, Reports, etc.) to read from new views where beneficial.

4. **Native opsApp Preparation (LiquidForge)**
   - In Swift: Add `ShiftActivity` model.
   - Extend `ShiftPlannerRepository` with `recordActivity` and `fetchActivityFeed`.
   - Keep legacy paths working (dual support).
   - Ensure TCA actions can emit activities for agent context.

5. **Agent Intelligence Integration**
   - Update grokEngine / buildOpsContext to use new unified sources.
   - Ensure citations in agent_messages can point to shift_activities rows.

6. **Testing & Validation**
   - Use Supabase branch for safe testing.
   - Verify RLS on new tables with different roles.
   - Performance test activity feed queries (add indexes as needed).
   - End-to-end with iPad simulator + web.

## Risks & Mitigations

- **Schema drift during transition**: Mitigated by views + strict contracts.
- **Performance on activity table**: Append-only design + proper indexing + partitioning by grave_shift_id later.
- **Data inconsistency**: Transactional dual-writes + eventual reconciliation jobs.
- **OpsApp compatibility**: Conservative changes + feature flags in repository layer.
- **RLS complexity**: Start simple (service + authenticated read), tighten in Phase 2 with roles.

## Success Criteria for Phase 1 Completion

- New `grave_shifts` + `shift_activities` are the preferred source for new features.
- v1_ops_context returns unified, rich data.
- Both web and native can read/write through the new contract with fallback.
- Historical data is accessible via unified views.
- No breakage to live grave shift operations.
- Clear documentation and migration guide for future surfaces.

## Next Immediate Actions (Autonomous)

1. Create and apply corrected `v_current_assignments` view migration (accounting for real column names).
2. Write the full migration strategy document (this file).
3. Begin dual-write implementation in web data.ts for assignments.
4. Add corresponding Swift repository methods (non-breaking).
5. Enhance v1_ops_context with activity summaries.
6. Log all changes to YOLO-log.md and update internal todos.
7. Verify via Supabase MCP tools (list_tables, get_advisors, execute_sql for testing).

This strategy will be executed step-by-step in silent YOLO mode.

---
*Document will be updated as implementation reveals realities. All changes logged in YOLO-log.md.*
