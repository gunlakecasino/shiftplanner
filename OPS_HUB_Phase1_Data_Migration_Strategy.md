# Phase 1 — Data Migration Strategy (Old Model → Unified Core)

**Status**: Design Document  
**Date**: 2026-05-25

## Goal
Migrate from the fragmented legacy model to the new `grave_shifts` + `shift_activities` model with zero downtime and minimal risk to daily operations.

## Guiding Principles
- Never break the iPad opsApp or current web ShiftBuilder during the transition.
- New features and the agent layer should prefer the new model immediately.
- Use views + RPCs as the primary transition layer.
- Old tables become "legacy read sources".

## Recommended Approach

### Phase 1A (Current)
- Dual-write pattern for new activity:
  - When writing assignments/notes/tasks → write to both old tables **and** `shift_activities`.
  - Use the new `grave_shifts` table for any new night/shift creation.

### Phase 1B
- Build powerful views:
  - `v_current_assignments` (unified view across all old assignment tables)
  - `v_shift_activity_feed`

### Phase 1C
- Gradually move reads in new surfaces (especially agent intelligence and future Ops Hub features) to the new model via `v1_ops_context` and new RPCs.

### Later (Phase 2+)
- Backfill historical data into `shift_activities`.
- Deprecate direct writes to old assignment tables for new functionality.
- Eventually (much later) archive or read-only the old tables.

## Risk Mitigation
- All changes behind feature flags where possible.
- Heavy use of the Supabase MCP + advisors before any large backfill.
- Maintain the ability to fall back to old queries easily.

This strategy will be refined as implementation reveals real constraints.
