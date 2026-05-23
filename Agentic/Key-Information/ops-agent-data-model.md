# GRAVE Ops Data Model for the Master Agent (xAI Sphere)

**Purpose**: Authoritative reference for building the intelligence layer of the Master Operational AI Agent.
**Status**: Initial inventory (2026-05-22) — Work in progress. Being populated systematically per the active plan section 10.2.
**Owner**: Primary agent (with user review gates).

---

## 1. Table Inventory (from code + migrations)

This list is compiled from exhaustive `.from()` searches in `src/lib/shiftbuilder/data.ts`, `grokEngine.ts`, `grokIntelligence.ts`, `sudoActions.ts`, and all `supabase/migrations/`.

### Core Operational Tables

| Table                        | Purpose                                      | Key Columns / Notes                                                                 | Used By (examples)                  | Relevance to Master Agent |
|------------------------------|----------------------------------------------|-------------------------------------------------------------------------------------|-------------------------------------|-----------------------------|
| `tm_profiles`                | Master roster of Team Members                | tm_id, display_name, full_name, status, primary_section, active, grave_pool        | getActiveTeamMembers, roster        | High — identity + grave pool + availability |
| `nights`                     | One row per operational night (GRAVE shift)  | id, night_date, week_id, status, is_locked, **notes** (TEXT)                       | getOrCreateNightForDate, notes      | **Critical** — notes, current state anchor |
| `weeks`                      | GRAVE week container (Friday start)          | id, week_start, ...                                                                | Multiple night loaders              | High — week scoping for threads & history |
| `zone_assignments`           | Live zone assignments for a night            | night_id, slot_key, tm_id, slot_type='zone', updated_at                            | All assignment loaders              | **Core** — who is where |
| `break_assignments`          | Break / RR break assignments                 | night_id, slot_key, tm_id, slot_type='break'                                       | Break sheet, overlap logic          | High |
| `overlap_assignments`        | PM/AM Overlap assignments                    | night_id, slot_key, tm_id, slot_type='overlap'                                     | Overlap section                     | High |
| `night_tm_status`            | Per-TM per-night availability / status       | night_id, tm_id, status ('on' / 'off' / 'called_off' etc.)                         | On-schedule, called-off filtering   | **Critical** for context |
| `slot_task_catalog`          | Picklist of possible tasks per slot type     | slot_key, slot_type, rr_side, label, sort_order                                    | Task selector                       | Medium (to-dos) |
| `night_slot_tasks`           | Which tasks are active for a night+slot      | night_id, slot_key, task_label, catalog_task_id                                    | Task selector + print               | High (to-dos / responsibilities) |
| `night_card_borders`         | Visual card border colors per night+slot     | night_id, slot_key, color, rr_side                                                 | Color theming                       | Low-Medium |
| `tm_preferences`             | TM slot/role preferences                     | tm_id, slot_type / slot_key, preference_level                                      | Scoring / fairness                  | High |
| `tm_pair_affinities`         | Learned / configured TM-TM affinities        | tm_id_a, tm_id_b, affinity_score                                                   | Scoring                             | High |
| `tm_accommodations`          | Hard constraints / accommodations            | tm_id, accommodation_type, value                                                   | Eligibility + scoring               | High |
| `slot_difficulty`            | Difficulty weighting per slot                | slot_key, difficulty_score                                                         | Weighted planner                    | Medium |
| `engine_config`              | Live operator-tunable engine settings        | placement_method, weights, thresholds, grok_reasoning_effort                       | SUDO + Grok-Hybrid + Sphere         | **Critical** — posture for the agent |

### New Agent Tables (from 20260522 migration)

- `agent_threads` (done, in use)
- `agent_messages` (schema exists, not yet wired)
- `agent_memory` (planned for Phase 2)

---

## 2. Key Relationships

- `nights.week_id → weeks.id`
- `zone_assignments.night_id → nights.id`
- `break_assignments.night_id → nights.id`
- `overlap_assignments.night_id → nights.id`
- `night_slot_tasks.night_id → nights.id`
- `night_tm_status.night_id → nights.id`
- All TM-related tables use `tm_id` (string, e.g. "tm_abby") referencing `tm_profiles.tm_id`

**Week scoping**: Most agent context will be "for a given `week_start` (Friday) + current night".

---

## 3. Existing Snapshot Builders (Audit Status)

**Already excellent foundations** (do not reinvent):

- `grokEngine.ts:buildGrokEngineSnapshot`
  - Pulls: `operatorNotes` (directly from `nights.notes`)
  - `calledOffTmNames`
  - `recentHistory` (rotation / fairness)
  - Per-slot candidates + scores from the deterministic planner
  - Engine weights + thresholds + `grokReasoningEffort`

- `grokIntelligence.ts` (Command Palette)
  - Builds board snapshot for structured suggestions (current assignments, draft, candidates, notes)

- `data.ts`
  - Rich loaders for roster, assignments (all slot types), night creation, notes, tasks, preferences, affinities, accommodations.

**Recommendation**: Create a new `src/lib/shiftbuilder/agent/buildOpsContext.ts` that **composes** the above rather than duplicating.

---

## 4. Initial Gap Analysis (for Master Agent Use Cases)

**What the agent needs that current snapshots partially cover**:
- Unified view across *all* assignment types for the current night + draft.
- Full historical notes + task history (not just current night).
- Cross-week synthesis (last 3 GRAVE windows for fairness).
- Live "what the engine currently recommends" + the agent's ability to critique it.
- Structured memory of operator-agent interactions.

**Next actions in this review**:
- Read full `grokIntelligence.ts`
- Read `placement.ts` + `scoring.ts` for the deterministic layer the agent must understand.
- Deep dive on `night_tm_status` + called-off representation.
- Decide on the first minimal `OpsContextSnapshot` shape for the first real Grok call in the sphere.

---

**Document will be updated iteratively as the systematic review progresses.**

This is the single source of truth for the intelligence layer data understanding.