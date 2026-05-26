# GRAVE Ops Shift Hub — Phase 0 Supabase Current State Audit Report

**Date**: 2026-05-25  
**YOLO Session**: grave-ops-hub-yolo-2026-05-25  
**Lead**: LiquidForge (apple-dev) + coding-engineer (Supabase expert branch)  
**Status**: Initial comprehensive audit complete

---

## Executive Summary

The current Supabase implementation is a classic evolutionary "mess" resulting from rapid feature addition without a unifying architectural vision. It contains strong foundations in places (especially the recent agent tables and task catalog work), but suffers from:

- Inconsistent and sometimes dangerously lax security posture
- Fragmented domain modeling
- Heavy technical debt around multi-user readiness and long-term maintainability
- Divergent client access patterns between web and native

**Risk Level**: High for production multi-user use. Moderate-to-high for single-operator production use due to RLS gaps.

**Recommendation**: Execute Phase 0 in full before any major new feature work on the Ops Hub.

---

## 1. Table Inventory & Classification

### Core Operational Tables (ShiftBuilder Domain)
| Table                    | Status     | RLS Quality     | Notes |
|--------------------------|------------|-----------------|-------|
| `tm_profiles`            | Core       | Unknown         | String PK (`tm_id`). Central identity. |
| `nights`                 | Core       | Unknown         | Central night entity. |
| `weeks`                  | Core       | Unknown         | Week container. |
| `zone_assignments`       | Core       | Unknown         | Primary assignment table. |
| `break_assignments`      | Core       | Unknown         | Separate from zones. |
| `overlap_assignments`    | Core       | Unknown         | Separate from zones. |
| `night_tm_status`        | Core       | Unknown         | Per-TM per-night flags. |
| `slot_task_catalog`      | Good       | Unknown         | Well-designed picklist. |
| `night_slot_tasks`       | Good       | Unknown         | Denormalized for history. |
| `engine_config`          | Good       | Unknown         | Tunable weights + Grok settings. |
| Various preference/affinity tables | Supporting | Unknown | Good domain modeling. |

### Recently Added Tables (2026-05)
| Table                    | Status          | RLS Quality          | Critical Issue |
|--------------------------|-----------------|----------------------|---------------|
| `agent_threads`          | Good foundation | Strong (per-user)    | Excellent |
| `agent_messages`         | Good foundation | Strong (per-thread)  | Excellent |
| `shift_notes`            | New (Nightwatch)| **Permissive (true)** | **High risk** |
| `canvas_strokes`         | New (Nightwatch)| **Permissive (true)** | **High risk** |
| `shift_events`           | New (Nightwatch)| **Permissive (true)** | **High risk** |

**Finding**: The three Nightwatch tables were added with `USING (true) WITH CHECK (true)` policies. This is explicitly called out as an anti-pattern in the project's own `coding-engineer` Supabase branch.

---

## 2. RLS & Security Posture

### Known Issues
1. **Nightwatch tables**: Extremely permissive policies. Any authenticated or anon user can read/write everything. This is unacceptable for operational casino data.
2. **Core tables**: No evidence of strong, role-aware RLS policies in the migrations reviewed. Heavy reliance on application-layer trust or service role.
3. **Service Role Exposure**:
   - Web app (`src/lib/supabase.ts`): Explicitly prefers `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` when present. Logs "Using SERVICE ROLE key (dev only)".
   - This completely bypasses all RLS. Dangerous pattern for anything beyond pure local dev.
4. **Native opsApp**: Uses anon key via Secrets.plist (correct architecture per SudoModels.swift comment).

### Positive Signals
- `agent_threads` / `agent_messages` have proper user-scoped policies + service role bypass. This is the model to follow.
- Some migrations mention RLS intent.

**Overall Grade**: D+ (passing only because of the recent agent tables quality).

---

## 3. Client Access Patterns & Divergence

### Web (Next.js)
- Centralized in `src/lib/shiftbuilder/data.ts` (very rich, ~1300+ lines).
- Heavy direct `.from()` usage throughout Sudo tabs, engine, etc.
- Mix of raw queries and some helper functions.
- Service role usage in development.

### Native (SwiftUI opsApp)
- Clean actor-based `ShiftPlannerRepository.swift`.
- Uses Supabase Swift SDK.
- Good separation (repository actor).
- Currently limited scope compared to web data layer.

**Gap**: No shared contract or generated models between the two surfaces. Duplication risk is high as the hub expands.

---

## 4. Missing or Weak Areas for a Full Ops Hub

- No unified activity/event log.
- No modeled support for incidents, compliance, huddles, training, equipment.
- No `profiles` + roles table visible (still single-human assumption in many places).
- No Edge Functions directory (`supabase/functions`).
- Limited use of database functions, views, or security definer patterns.
- Audit trails (`updated_at`, change logs) are inconsistent.

---

## 5. Recommendations for Phase 0 Execution Order

**Priority 1 (This Week)**:
1. Harden RLS on `shift_notes`, `canvas_strokes`, `shift_events` immediately.
2. Remove or strictly guard service role key usage in web client.
3. Add `updated_at` + basic audit triggers to all mutable operational tables.
4. Document current RLS state for every table (even if "none").

**Priority 2**:
- Create a clean `v_ops_context` or set of RPCs for agent + hub consumption.
- Begin design of unified `shift_activities` concept.

---

## 6. Files & Migrations Reviewed (This Audit)

- All 7 migrations in `oms_root/supabase/migrations/`
- `src/lib/supabase.ts`
- `src/lib/shiftbuilder/data.ts` (heavy usage)
- `src/app/shiftbuilder/sudo/*` (light usage)
- `oms_root/opsApp/.../ShiftPlannerRepository.swift`
- `Agentic/Key-Information/ops-agent-data-model.md`
- `coding-engineer/branches/02-supabase-expert.md`

**Next Audit Steps** (if deeper investigation needed):
- Direct inspection of live RLS policies via Supabase MCP / Studio.
- Full grep for all `CREATE POLICY` or RLS mentions across the repo.
- Review of any existing database functions.

---

**Audit Sign-off**: This is a living document. Will be updated as Phase 0 work progresses.

*LiquidForge note: A world-class Ops Hub cannot be built on a shaky, insecure foundation. Phase 0 is not boring infrastructure work — it is the most important creative act we will do in this project.*