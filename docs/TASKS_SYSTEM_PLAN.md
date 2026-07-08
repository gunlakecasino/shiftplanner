# ShiftBuilder Tasks System — Project Plan

**Status:** v2.1 draft for review — no implementation started
**Authors:** Claude (Sonnet 5 draft, Fable 5 revision) with Brian Killian
**Date:** 2026-07-02
**Branch:** `shiftbuilder-ultra-20260627`

**v2 revision notes (Fable 5 review):** v1's data model, portable-core architecture, and
strangler boundary were sound and are kept. v2 adds what a review against the actual
codebase surfaced: the plan must ride the existing realtime/optimistic-mutation
infrastructure (`liveCache.ts` — v1 never mentioned it), define a night-rollover
**carryover policy**, define **recurrence edit semantics** (this occurrence vs. future),
specify the **design language** precisely (gold is semantically reserved; tasks get their
own accent), and — the headline reframe — treat Tasks as **the brain behind the board**:
deeply integrated into the deployment canvas, not a side page. New §5 (design language),
§6 (board integration), expanded schema, restructured phases, five new decision items.

**v2.1 (Brian's call, 2026-07-02):** Ops Tasks are **not a parallel track — they replace
the legacy default-task machinery outright.** Once cut over, recurring Ops Task templates
are the *only* source of nightly default chips; `slot_default_tasks`, the push buttons,
and the Apply Default/Overlap Tasks actions are retired. D1 and D11 are resolved (yes,
and mandatory). New §4.12 (the replacement mandate), reworked T2, §7, and Phase 7.

---

## 0. Mission

Take "Tasks" out of Settings — where it lives today as a buried admin sub-panel called
Card Defaults — and grow it into a first-class `/shiftbuilder/tasks` surface: a real task
planner and tracker with due dates, weekly/monthly recurrence, pools, assignment to
people (not just zone cards), status, and history.

But not a side page. **Tasks is the brain behind the board.** The deployment board knows
*who is where*; the tasks system knows *what must get done*. The intersection is where
the value lives: when Marcus lands in Zone 4, the board should know Zone 4 has three open
ops tasks tonight; when the night starts, the operator should get a brief of what's due;
when the night ends, the system should know what didn't happen and carry it forward. The
`/tasks` page is mission control, and the board is where the work surfaces.

And this is a **replacement, not a coexistence**. Per Brian's direction (v2.1), once the
system is live and cut over, recurring Ops Task templates become the *only* source of
nightly default chips. The legacy defaults machinery — `slot_default_tasks`, the
Tasks→Today / Tasks→Week push buttons, Apply Default Tasks, Apply Overlap Tasks — is
retired. The chip *rendering* system (what operators see on cards and what prints) stays
byte-identical; what changes is where chips come from and that they finally track truth.

This is explicitly **Phase 1 of a two-phase ambition**. Phase 2, later and separate, is a
fully customizable standalone project-management web app that Tasks feeds into / is
absorbed by. Nothing in this plan should make Phase 2 harder. Concretely: the task core
gets built as a portable module with no hard ShiftBuilder dependencies, so it can be
lifted into its own service later instead of rewritten.

### Why now, in one paragraph

Today's "tasks" are card annotations, not tasks: a `night_slot_tasks` row is a styled
text chip pinned to a zone/RR/AUX/overlap slot for one specific night, with no assignee,
no due date, no status, and no memory once the night rolls over. There is no way to say
"replace the Zone 7 carpet filters every month," "this needs to happen by 5am," or "this
is Marcus's job tonight, not the zone occupant's." The only structure that exists —
`slot_task_catalog` (a picklist) and `slot_default_tasks` (push-to-night defaults) — is
managed through a buried Settings tab that is duplicated across two different admin
surfaces and has nothing to do with actually tracking whether work got done.

---

## 1. Non-negotiable principles

| # | Principle |
|---|-----------|
| **T1** | Tasks never become a placement/coverage scoring input. The engine's `coverage > rotation > preferences > skill` hierarchy (ratified 2026-07-01) is untouched by anything in this plan. Task badges on the board are informational; they never move a TM. |
| **T2** | Split the legacy system into **substrate** and **machinery**. The chip *rendering substrate* (`night_slot_tasks` + `TasksPad`, `TaskRow`, `ZoneTaskList`, rich text styling, print rendering) is presentation — it stays, unmodified, and becomes the surface Ops Tasks project onto. The *defaults machinery* (`slot_default_tasks`, push-to-night/week, Apply Default/Overlap Tasks) is **replaced and removed at cutover** (v2.1 mandate, §4.12). Strangler discipline still governs the path there (see [[unified-engine-core]] N9 precedent): both systems run untouched side-by-side until the Phase 7 atomic cutover — never a half-migrated in-between on a live night. |
| **T3** | One task core, many views. List, board, calendar, timeline, pools, and catalog all read/write the same `tasks` table through the same API. No per-view duplicate state or shadow copies. |
| **T4** | Recurrence **materializes real rows**. A weekly task never exists as a "virtual repeating event" computed on the fly — each occurrence is a real `tasks` row with its own id, status, assignee, and history, generated ahead of time by a scheduled job. This mirrors how `nights` in this app are real rows, not derived dates. |
| **T5** | Every mutation is audited. Create, assign, reassign, status change, due-date change, carryover, comment, complete, reopen, delete — all write to `tasks_activity_log`. |
| **T6** | Built for extraction. The task core (`src/lib/tasks/**`, new DB tables) must not hard-depend on ShiftBuilder-only concepts (zone slots, nights, TM profiles). Those are an *adapter* layer on top, so the core is what eventually moves into the standalone PM app. |
| **T7** | Production-data safety. The ShiftBuilder dev server hits production Supabase (see [[shiftbuilder-preview-live-data]]). All verification during this build is read-only or against clearly-marked test rows; every migration is reviewed before applying. |
| **T8** | Permission-gated like everything else in this app. New capabilities extend `ShiftBuilderPermissions` / `PERMISSION_CATALOG` — no parallel auth system. |
| **T9** | Mobile/tablet is a first-class surface, not an afterthought. Floor operators complete tasks from an iPad while walking the floor (the app already special-cases `isTabletTouchDevice()` for tap-vs-double-click). Task completion UX must work one-handed on a 10" screen. |
| **T10** | **Live like the board is live.** Tasks ride the existing Supabase Realtime + TanStack Query + optimistic-mutation infrastructure (`liveCache.ts` conventions): every mutation is optimistic with snapshot rollback, remote changes from other operators appear without refresh, and conflicts surface as clear toasts — "never silently lose data" (the covenant already written into `liveCache.ts`). |
| **T11** | **Native to the design language.** Every Tasks surface uses the established tokens, motion, and interaction grammar (§5). No new UI dialects: glass is `--sb-glass`, motion is `premiumSpring` with `useReducedMotion` fallbacks, pads are the flyout convention, gold keeps its reserved meaning. If a Tasks screen were screenshotted next to the board, nothing should look imported. |

---

## 2. Current state — inventory

### 2.1 What exists today (the card-annotation system)

| Concern | File(s) |
|---|---|
| Data types | `NightSlotTask`, `CatalogTask`, `SlotDefaultTask` — [data.ts:1176-1201](../src/lib/shiftbuilder/data.ts) |
| DB tables | `slot_task_catalog` (picklist), `night_slot_tasks` (per-night selections), `slot_default_tasks` (push-to-night defaults) — `supabase/migrations/20260520_slot_tasks.sql` + 6 follow-on patches through `20260630` |
| Admin management UI | `DefaultsTab.tsx` ("Card Defaults") — embedded **twice**: [SettingsShell.tsx:195](../src/app/shiftbuilder/settings/SettingsShell.tsx) (`/shiftbuilder/settings?tab=defaults`) and [SudoWindow.tsx:174](../src/app/shiftbuilder/sudo/SudoWindow.tsx) (floating in-canvas panel) |
| Board rendering | `TasksPad.tsx` (edit flyout), `TaskRow.tsx` (drag-and-drop-capable row), `ZoneTaskList.tsx` (per-card list), `CardTaskZone.tsx` (tap/dblclick zone), `TaskMarkerLabel.tsx`, `FormattedTaskLabel.tsx`, `TaskTextEditPad.tsx`, `taskMarkerStyle.ts`, `taskTextStyle.ts` |
| Nav actions | `FloatingNav.tsx`: Apply Default Tasks, Apply Overlap Tasks, Copy Tasks from Prior Week, Copy Tasks from Yesterday |
| Pools (informal) | "AM Overlap Pool" — one hardcoded pool (`overlap_am_0`) shuffled 1:1 across 6 AM Overlap cards on "Apply Overlap Tasks" |
| Print | Task chips render on the printed zone deployment sheet via the Golden print pipeline (`print/*.ts`, `GOLDEN_VISUAL_SPEC.md`) |
| Audit | `today_assignment_changes.action` enum includes `task_add`, `task_remove`, `task_color` (migration `20260611_assignment_changes_tasks_coverage.sql`) |
| **Realtime** | `liveCache.ts` already subscribes to `postgres_changes` on `night_slot_tasks` (among others) and pushes into TanStack Query + a Zustand live store; `useShiftBuilderIdleResume.ts` keeps REST + realtime warm across idle/background/offline gaps |
| Undo/history | Board has per-tab Cmd+Z undo/redo (history snapshots in `ShiftBuilderClient.tsx`); Draft Mode is the sacred proposal overlay (`DraftStatusPill`, gold frame) |

### 2.2 Gap register — what a task tracker needs that doesn't exist

| ID | Gap |
|----|-----|
| **G1** | No assignee. A task lives on a *slot*, not a *person*. Whoever is dragged into Zone 3 tonight inherits the chip; there is no "this is Marcus's job." |
| **G2** | No due date/time. Everything is scoped to "tonight" (the night the row belongs to). Nothing can be due "by 5am," "Friday," or "the 15th of the month." |
| **G3** | No recurrence. "Every Monday" or "monthly" doesn't exist — the closest thing is manually re-adding a catalog task to `slot_default_tasks` and pushing it every night forever. |
| **G4** | No status/completion. A task chip has no done/not-done state — it's decorative text, checked off mentally or crossed out on a printed sheet. |
| **G5** | No history beyond the audit log. Once a night rolls over, `night_slot_tasks` rows for that night are effectively archived with no "was this actually done" record — and no carryover of what wasn't. |
| **G6** | Single hardcoded pool. "AM Overlap Pool" is the only pool concept, is not user-creatable, and its distribution logic (shuffle 1:1 across 6 fixed cards) is hardcoded in `data.ts`. It also distributes across *cards*, not across *the people actually working tonight*. |
| **G7** | Duplicated admin surface. The same management UI is embedded in both `/shiftbuilder/settings` and the floating `SudoWindow`, both gated behind `canAccessSudo` only — no `canAccessTasks`/`canManageTasks` granularity for, e.g., a shift lead who should manage tasks but not the rest of Settings. |
| **G8** | Not portable. Table names, column shapes, and the management UI are all ShiftBuilder-specific (`slot_key`, `slot_type`, `rr_side` baked into the core row) — nothing here could move into a standalone PM app without a rewrite. |
| **G9** | The board is blind to work. Nothing on the deployment canvas can tell an operator "this zone has open work tonight" or "you have 2 tasks due before end of shift." |

---

## 3. Terminology

Two things share the word "task" today and will keep sharing the app after this build.
Naming them distinctly prevents ambiguity in code, UI copy, and this document.

| Term | Meaning |
|---|---|
| **Card Task** | A styled text chip pinned to a zone/RR/AUX/overlap slot for one specific night. Rendering, styling, drag, and print behavior are *unchanged forever*. What changes at cutover is its **source**: default chips are materialized from Ops Task templates (`ops_task_id` set) instead of pushed from `slot_default_tasks`. Chips with no `ops_task_id` are deliberate manual annotations. Lives in `night_slot_tasks`. |
| **Ops Task** | *New.* A real tracked work item: title, assignee, due date, status, optional recurrence, optional pool membership, comments, history. Lives in the new `tasks` core. This is what `/shiftbuilder/tasks` manages — and after cutover, the only authoring path for default chips. |
| **Default Task (legacy)** | The `slot_default_tasks` rows + push machinery. Exists only until the Phase 7 cutover, then retired (§4.12). |

---

## 4. Target architecture

### 4.1 Three task shapes, one core

Every Ops Task is one row with a `due_at`. Three usage patterns emerge from how that row
comes to exist and how it repeats — they are not separate tables:

1. **Standing (recurring) tasks** — "Fire extinguisher inspection, monthly," "Radio
   battery check, every Monday." Defined once as a **template** with a recurrence rule;
   a generator job materializes real instance rows on a rolling horizon (T4).
2. **Ad-hoc tasks** — "Call security about camera 4 by end of shift." One row, one
   due date, no recurrence, created on the spot.
3. **Pool tasks** — a set of tasks (recurring or not) that are distributed across
   available people/slots rather than assigned to one specific person up front —
   generalizes today's AM Overlap Pool (G6) to any category, with a chosen distribution
   mode instead of one hardcoded shuffle.

### 4.2 Data model (new tables, additive — no changes to existing task tables in this phase)

Naming uses a `tasks_` prefix and stays free of ShiftBuilder-specific required columns
(T6) — zone/night linkage is a nullable *adapter* column, not the spine of the schema.

```
tasks                     — the core row (template AND instance; is_template flags which)
  id                       uuid pk
  title                    text not null
  description              text
  category                 text            -- 'maintenance' | 'cleaning' | 'admin' |
                                            --   'compliance' | 'training' | 'guest_experience' | 'other'
  priority                 text default 'normal'  -- 'low' | 'normal' | 'high' | 'urgent'
  status                   text default 'not_started'
                                            -- 'not_started' | 'in_progress' | 'blocked' |
                                            --   'done' | 'skipped' | 'cancelled'
  status_reason            text            -- required by API when status -> 'blocked' or 'skipped'
  is_template              boolean default false   -- true = recurrence definition, never "done"
  paused                   boolean default false   -- templates only: stop generating without deleting
  recurrence_rule_id       uuid references tasks_recurrence_rules(id)
  generated_from_template  uuid references tasks(id)   -- set on materialized instances
  carried_from_task_id     uuid references tasks(id)   -- rollover lineage (see §4.7)
  carry_count              integer default 0            -- how many nights this work has rolled
  pool_id                  uuid references tasks_pools(id)
  assignee_type            text            -- 'tm' | 'role' | 'pool' | 'unassigned'
  assignee_tm_id            text           -- FK-by-value to tm_profiles.tm_id (adapter concern)
  assignee_role            text            -- e.g. 'z9_sr', free text, adapter-defined
  due_at                   timestamptz
  due_anchor               text            -- nullable ops-native display anchor:
                                            --   'start_of_shift' | 'first_break' | 'am_overlap' | 'end_of_shift'
                                            --   (adapter resolves anchor -> due_at; anchor kept for honest display)
  all_day                  boolean default false
  night_id                 uuid references nights(id)   -- nullable adapter link
  zone_slot_key            text                          -- nullable adapter link (mirrors slot_key)
  created_by               text
  completed_by             text
  completed_at             timestamptz
  created_at               timestamptz default now()
  updated_at               timestamptz default now()

tasks_recurrence_rules
  id                 uuid pk
  freq               text          -- 'daily' | 'weekly' | 'monthly'
  interval           integer default 1        -- every N freq units
  by_weekday         integer[]     -- 0=Sun..6=Sat, for weekly / monthly "nth weekday" mode
  by_monthday        integer[]     -- day-of-month, for monthly "on the 15th" mode
  set_pos            integer       -- nullable, for "first/last <weekday> of month"
  starts_on          date not null
  ends_on            date          -- nullable = no end
  lead_time_days     integer default 14   -- how far ahead the generator materializes
  last_generated_through  date    -- generator watermark

tasks_pools
  id                 uuid pk
  name               text not null
  description        text
  distribution_mode  text          -- 'random' | 'round_robin' | 'claim' | 'manual'
  scope              text          -- 'am_overlap' | 'pm_overlap' | 'custom'
  active             boolean default true

tasks_pool_members
  pool_id            uuid references tasks_pools(id)
  task_id            uuid references tasks(id)   -- template or standalone task eligible for the pool
  sort_order         integer default 0

tasks_checklist_items
  id                 uuid pk
  task_id            uuid references tasks(id)
  label              text not null
  is_done            boolean default false
  sort_order         integer default 0

tasks_comments
  id                 uuid pk
  task_id            uuid references tasks(id)
  author             text
  body               text not null
  created_at         timestamptz default now()

tasks_activity_log
  id                 uuid pk
  task_id            uuid references tasks(id)
  actor_id           text
  actor_name         text
  action             text      -- 'created'|'assigned'|'reassigned'|'status_changed'|
                                --   'due_date_changed'|'commented'|'completed'|'reopened'|
                                --   'carried_over'|'recurrence_generated'|'pool_distributed'|'deleted'
  from_value         jsonb
  to_value           jsonb
  created_at         timestamptz default now()
```

Indexes: `tasks(due_at)`, `tasks(assignee_tm_id)`, `tasks(status)`, `tasks(night_id)`,
`tasks(pool_id)`, `tasks(is_template)`; unique partial index preventing double-generation
of the same template+due date pair (generator idempotency).

**Chip linkage — one additive patch to an existing table.** The derived artifact points
at its source, not the other way around:

```sql
ALTER TABLE night_slot_tasks
  ADD COLUMN ops_task_id uuid NULL REFERENCES tasks(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX night_slot_tasks_ops_task_unique
  ON night_slot_tasks (night_id, ops_task_id) WHERE ops_task_id IS NOT NULL;
```

Same additive style as the `marker_type` / `text_style` / `coverage_side` patches this
table has already absorbed — nothing existing breaks, and the partial unique index makes
chip materialization idempotent (one chip per task per night, ever). A chip with
`ops_task_id IS NULL` is a manual annotation; a chip with it set is owned by the tasks
system — edits and deletes of the Ops Task flow down to its chip via the adapter.

**Realtime:** the `tasks` table (at minimum) is added to the `supabase_realtime`
publication in the same migration, so `liveCache.ts`-style subscriptions work on day one.

**RLS split, matching existing convention:** reads allowed to the app's anon-key client
under RLS (like `20260624_slot_defaults_anon_read.sql`); **all writes go through
authenticated API routes only** (like `20260624_revoke_anon_write_ops_tables.sql`).

### 4.3 Module layout — portable core + ShiftBuilder adapter

```
src/lib/tasks/                     # portable core — no ShiftBuilder imports (T6)
├── types.ts                       # Task, RecurrenceRule, Pool, ChecklistItem, ActivityEntry
├── recurrence.ts                  # expandRecurrence(rule, from, to) -> due dates (pure fn, unit-testable)
├── generator.ts                   # materializeDueInstances() — the horizon job (T4)
├── carryover.ts                   # rollIncomplete(nightBoundary) — the rollover job (§4.7)
├── pools.ts                       # distribution algorithms: random / round-robin / claim
├── activity.ts                    # logActivity() helper, shared shape
└── queries.ts                     # supabase-agnostic query builders (thin, swappable later)

src/lib/shiftbuilder/tasksAdapter.ts   # the ONLY file that knows about slot_key / night_id /
                                        # tm_profiles / grave-week semantics; resolves due anchors
                                        # against the night's 11pm–6:55am span; validates assignees
                                        # against the scheduled roster

src/app/api/shiftbuilder/tasks/        # REST endpoints, following existing _lib/_handlers pattern
├── route.ts                       # GET (list, filtered), POST (create)
├── [id]/route.ts                  # GET, PATCH, DELETE
├── [id]/complete/route.ts         # POST — status -> done, completed_by/at, activity log
├── recurrence/route.ts            # CRUD for tasks_recurrence_rules
├── pools/route.ts                 # CRUD for tasks_pools + distribute action
└── _lib/                          # same-origin check, rate limit, permission gate — reused, not reinvented

src/app/shiftbuilder/tasks/
├── page.tsx                       # dynamic import, ssr:false, QueryProvider — mirrors reports/page.tsx
├── tasksShell.css                 # extends settings-shell tokens, like reportsShell.css does
├── TasksClient.tsx                # shell: view switcher, filter bar, permission gate
├── hooks/
│   ├── useTasksData.ts            # TanStack Query + realtime bridge (liveCache pattern)
│   └── useTaskMutations.ts        # optimistic mutations w/ snapshot rollback (T10)
└── components/
    ├── TaskQuickAdd.tsx            # single-line quick add w/ inline date & recurrence chips
    ├── TaskListView.tsx
    ├── TaskBoardView.tsx           # Kanban: Not Started / In Progress / Blocked / Done (dnd-kit)
    ├── TonightTimelineView.tsx     # the night's due timeline, 11pm → 6:55am (§4.8)
    ├── TaskCalendarView.tsx        # month/week grid keyed by due_at
    ├── RecurringTasksView.tsx      # manage templates, see next-due, completion rate, generation log
    ├── PoolsView.tsx               # manage pools + membership + trigger distribution
    ├── TaskCatalogView.tsx         # successor to Card Defaults' slot-task picklist management
    ├── TaskDetailPad.tsx           # desktop: right-anchored pad flyout (PlacementPad convention)
    ├── TaskDetailSheet.tsx         # tablet: full-height shadcn Sheet (same inner content)
    └── TaskFilterBar.tsx           # smart filters: Mine / Unassigned / Overdue / Category / Zone / Pool
```

Two shadcn primitives already sit unstaged in the working tree —
[`dropdown-menu.tsx`](../src/components/ui/dropdown-menu.tsx), [`sheet.tsx`](../src/components/ui/sheet.tsx),
[`tabs.tsx`](../src/components/ui/tabs.tsx) — and are exactly the building blocks this
page needs (filter dropdowns, the tablet detail sheet, the view-switcher tabs). Confirm
with Brian whether these were added for this purpose before reusing them (see D6).

### 4.4 Page IA — views, not tabs-within-tabs

A single segmented view-switcher (same pill grammar as FloatingNav's
deployment/breaks/weekly switcher) + a persistent filter bar — Linear-style, not
Settings-style:

- **Tonight** (default) — mission control for the current grave night: due timeline,
  carryovers, overdue, grouped by zone/pool/person (§4.8).
- **This Week** — the Fri–Thu grave week, mirroring Graves Schedule's week framing.
- **Board** — Kanban across all open tasks (dnd-kit drag between status columns).
- **Calendar** — due-date grid, month or week.
- **Recurring** — manage standing-task templates; next occurrence, last completed,
  completion rate per template, generation log, pause/resume.
- **Pools** — manage pool membership, distribution mode, trigger distribution (successor
  to "Apply Overlap Tasks").
- **Catalog** — the slot-linked task picklist (successor to Card Defaults' catalog
  management half — see §7).

Filter bar (persists across views): **Mine** / **Unassigned** / **Overdue** / category /
zone / pool, plus search (`/` focuses it). "Overdue" and "Mine" are the two views a floor
operator actually opens on a tablet — never more than one tap away.

**Night-publish note:** Ops Tasks are *work*, not schedule data — they are visible
regardless of a night's draft/published state. (Zone linkage rendering on the board
itself naturally follows whatever board access the viewer already has.)

### 4.5 Permissions

Extend `ShiftBuilderPermissions` ([opsAuthTypes.ts](../src/lib/auth/opsAuthTypes.ts)) and
`PERMISSION_CATALOG` ([permissionCatalog.ts](../src/lib/auth/permissionCatalog.ts)):

| New flag | Grants |
|---|---|
| `canAccessTasks` | View `/shiftbuilder/tasks` |
| `canManageTasks` | Create/edit/assign/delete Ops Tasks, complete tasks assigned to others |
| `canManageTaskTemplates` | Create/edit recurrence rules and pools (a smaller, trusted circle than day-to-day task management) |
| `canCompleteOwnTasks` | Everyone with board access, implicitly — mark **your own** assigned tasks done without full `canManageTasks` |

This finally gives task management its own grant (fixes G7) instead of piggybacking on
`canAccessSudo`. Default role mapping is a D-item (D2, §9).

### 4.6 Recurrence engine — generation *and* edit semantics

`expandRecurrence()` supports three `freq` modes deliberately kept small (not a full
RFC 5545 RRULE implementation — no yearly, no complex `BYSETPOS` combinations beyond
"nth weekday of month," which covers every real case Brian named):

- `daily` + interval (every N days)
- `weekly` + `by_weekday[]` + interval (every Monday; every 2 weeks on Tue/Thu)
- `monthly` + either `by_monthday[]` (the 15th) or `by_weekday` + `set_pos` (first Monday)

A scheduled generator (`materializeDueInstances()`) runs daily (mechanism: D3), walks
every active non-paused template, and inserts real `tasks` rows for occurrences within
`lead_time_days`, advancing `last_generated_through`. The unique partial index
(template_id, due_date) makes it idempotent — safe to re-run.

**Edit semantics (v2 addition — this was the biggest v1 gap).** Because instances are
real rows (T4), the classic "this event or all future events?" problem has a clean
answer:

- **Editing an instance** edits only that row. It stays linked to its template for
  reporting but its title/assignee/due time are its own.
- **Editing a template** affects **future, not-yet-generated occurrences only** — by
  default. The edit surface offers one explicit checkbox: *"Also update the N already-
  generated open instances"* (never touches done/skipped/cancelled rows).
- **Skipping an occurrence** sets `status = 'skipped'` + required `status_reason` — the
  row stays for the completion-rate history rather than being deleted.
- **Pausing a template** (`paused = true`) stops generation without deleting anything;
  resume picks up from today, never backfills the gap.
- **Deleting a template** prompts: keep open instances as orphaned one-offs, or cancel
  them. Done instances are always kept (history is history).

Grave-night rollover nuance: a task "due by end of shift" on night-date N resolves
against that night's ~11pm–6:55am span, not calendar midnight. `tasksAdapter.ts` owns
this translation (and the `due_anchor` presets — *by start of shift / by first break /
by AM overlap / by end of shift*) using the night-boundary helpers `dateUtils.ts`
already provides. The portable `recurrence.ts` core only ever deals in plain dates.

### 4.7 Carryover — what happens when the night ends (v2 addition)

A tracker that forgets unfinished work at rollover is a to-do list, not a brain. Policy:

- At the first open of a new night (lazy trigger — same "get-or-create night" moment the
  board already has), `rollIncomplete()` finds open instance tasks from prior nights that
  are neither done/skipped/cancelled.
- Each is **carried forward**: `due_at` re-anchored to the new night, `carried_from_task_id`
  set, `carry_count` incremented, activity-logged as `carried_over`. The original row is
  closed as superseded — one live row per piece of work, with lineage.
- The Tonight view shows carryovers as a distinct group with a `↻ 2nd night` badge —
  visible debt, not silent debt. `carry_count ≥ 3` escalates the row to overdue styling.
- Per-template override: a recurring task can opt out (`skip if missed` — e.g. a daily
  walk-through that's pointless to double up) — the missed instance is auto-marked
  `skipped` with reason `missed_night` instead. Default behavior is D9.

### 4.8 The Tonight view — mission control

The default view, and the one that makes Tasks feel like the brain of the night:

- **Header strip:** night date + big three numbers — due tonight / done / overdue —
  rendered in the velvet-glass pill grammar (`canvasPillGlass` / `DraftStatusPill`
  anatomy: glass, dot, `tabular-nums`).
- **Timeline lane:** 11pm → 6:55am with tasks plotted at their due anchors (huddle,
  first break, AM overlap, end of shift). A "now" line tracks the current time during
  the live night.
- **Groups below the timeline:** Carryovers (§4.7) → Overdue → Due tonight (by zone /
  pool / person, operator's choice) → Done (collapsed).
- **One-tap complete** on every row (checkbox target ≥ 44px on tablet; swipe-right to
  complete on touch, matching the app's touch-first conventions).
- **Night Brief:** a compact, dismissible summary shown when opening Tonight for a fresh
  night — "12 tasks tonight: 3 carryovers, 2 compliance due before 2am." (This is also
  the natural future hook for the shift-recap workflow — out of scope here, noted for
  Phase 2 PM app.)

### 4.9 Pools & distribution

Generalizes AM Overlap Pool (G6) into `tasks_pools` with a `distribution_mode`:

- **random** — today's behavior (shuffle 1:1 across scope), reusable for any pool
- **round_robin** — cycles fairly across the roster, avoiding one person hitting the
  same pool task three nights running
- **claim** — pool tasks visible to everyone in scope; first to tap "claim" gets it
- **manual** — an admin assigns pool members by hand; pool just groups them for reporting

**Roster-aware (v2 addition):** distribution targets *the people actually scheduled
tonight* (adapter reads the scheduled roster), not fixed card positions. Distributing to
a TM who called off is worse than useless. The legacy AM-overlap card-shuffle remains
available as the `scope: 'am_overlap'` behavior for continuity.

`PoolsView` replaces the "Apply Overlap Tasks" nav button with an explicit "Distribute
Now" action per pool — auditable (`pool_distributed`), idempotent per night, undoable.

### 4.10 Notifications & due-date surfacing

Phase 1 is in-app only: an overdue/due-tonight badge on the Tasks nav entry (derived
from the same live query, `tabular-nums`), the Overdue smart filter, due-soon styling in
every view, and the Night Brief (§4.8). Push/email/SMS is explicitly deferred — D4.

### 4.11 Audit & reporting

`tasks_activity_log` (§4.2) is the system of record for task history — richer than
`today_assignment_changes` needs to be, so it's a dedicated table rather than an
extension of that enum. Every task's detail pad shows its activity timeline. A later
phase (§8, Phase 8) adds a Tasks panel to `/shiftbuilder/reports` (completion rate,
overdue trend, category breakdown, per-TM load, per-template streaks) using the same
`ReportsShell`/`ReportsDashboard` composition pattern already established there.

### 4.12 Defaults replacement — the mandate (v2.1 addition)

Per Brian's direction, Ops Task templates **replace all legacy default-task variables
and instances**. The mechanism, end to end:

1. **Materialization.** When the generator creates a zone-linked instance for a night
   (§4.6), the adapter also writes its Card Task chip into `night_slot_tasks` with
   `ops_task_id` set. The chip renders, drags, and prints exactly as chips do today —
   the board and the Golden print pipeline cannot tell the difference. Completion,
   assignee, and history live on the Ops Task; the chip is projection.
2. **Sync.** Retitling the Ops Task retitles its chip; cancelling/deleting it removes
   the chip; carryover (§4.7) re-materializes on the new night. One direction only —
   the tasks system owns its chips.
3. **Import.** At cutover, every `slot_default_tasks` row becomes a nightly recurring
   template linked to its slot (D11 — resolved, mandatory). The AM Overlap Pool rows
   become the first real `tasks_pools` row (Phase 4 already does this). Catalog
   `is_default_on_new_night` seeding is superseded the same way.
4. **Adoption pass.** Existing nights (tonight + already-created future nights) may
   already carry pushed legacy chips. The cutover job *claims* any chip matching an
   imported template (same slot + label) by backfilling `ops_task_id` — so history and
   in-flight nights adopt cleanly instead of double-chipping.
5. **Atomic cutover.** The import, the adoption pass, and the removal of the push
   actions (Tasks→Today, Tasks→Week, Apply Default Tasks, Apply Overlap Tasks) ship in
   the **same release** — running templates and push buttons simultaneously would
   duplicate chips. `slot_default_tasks` goes read-only for a rollback window, then is
   dropped.
6. **What survives on the annotation layer.** Direct chip adds via `TasksPad` and the
   Copy-from-Prior-Week/Yesterday actions operate on manual annotations and keep
   working through cutover; whether card-adds should *create* zone-linked Ops Tasks
   instead (one system, one truth) is D13 — proposed yes, at or shortly after cutover.

---

## 5. Design language & interaction spec (v2 addition)

The rule of thumb for every screen: **if it were screenshotted next to the deployment
board, nothing should look imported** (T11).

### 5.1 Tokens & color semantics

| Semantic | Token / value | Rule |
|---|---|---|
| Page shell | settings-shell paper tokens + own `tasksShell.css` (the `reportsShell.css` precedent) | Tasks gets a dedicated accent: `--sb-tasks-accent` — **proposal: teal `#30B0C7`** (already in `TASK_COLOR_SPHERES`, distinct from all four settings-section accents). D8. |
| Floating chrome (pills, pads, quick-add bar) | `var(--sb-glass)` + `var(--sb-glass-blur)` + `--sb-glass-highlight` inset | Same velvet-glass recipe as `DraftStatusPill` / `canvasPillGlass`. |
| **Gold** (`--sb-gold-*`) | **Reserved.** Gold means Draft covenant + coverage semantics on the board. | Tasks must NOT use gold as its accent — an operator's eye already reads gold as "unapplied draft." |
| Overdue | `var(--ios-red)` | Also drives the nav badge when count > 0. |
| Due soon (< 2h to anchor) | `#ff9500` (iOS orange) | |
| Done | `#34c759` (iOS green) | |
| Status/priority chips | iOS system palette already codified in `TASK_COLOR_SPHERES` | No new hexes without cause. |
| Typography | `var(--font-atkinson), var(--font-geist-sans)`; counts in `tabular-nums` | Atkinson everywhere, matching board + settings. |
| Icons | lucide-react on page surfaces | Material Symbols (`ms` class) stay Sudo-only, as today. |
| Dark mode | `isDark` threading + `html.dark` token overrides, as in every existing surface | Both palettes specified from day one, not retrofitted. |

### 5.2 Motion

- All entrances/exits/reorders use `premiumSpring` / `premiumEntrance` /
  `premiumStagger` / `premiumPresence` from [premiumSpring.ts](../src/lib/premiumSpring.ts),
  each with its `*Reduced` variant behind `useReducedMotion()` — the file already ships
  both; consumers must use them.
- List rows animate with `AnimatePresence mode="popLayout"` + `layout` (the exact
  `ZoneTaskList` recipe) — completing a task exits with the same opacity/x/scale grammar
  a removed card task uses today.
- View switches use `premiumDaySwitchTween` crossfades (no springs on grid swaps — the
  board learned this lesson; the comment is in the file).
- Completion micro-moment: checkbox draws its check with the spring, row settles into
  the Done group via layout animation. One moment of delight, ≤ 400ms, reduced-motion
  falls back to opacity.
- Nothing from this section may leak into any print path (the `premiumSpring.ts` header
  rule stands).

### 5.3 Surfaces & layout grammar

- **Detail editing:** desktop gets `TaskDetailPad` — a right-anchored portal flyout with
  backdrop, the `PlacementPad`/`TasksPad` convention (backdrop below pad, z-205/210
  layering, `stopPropagation` guards). Tablet gets `TaskDetailSheet` (shadcn Sheet,
  full-height). Identical inner content component; only the container differs.
- **Quick add:** a persistent single-line input at the top of List/Tonight views —
  type a title, then inline chips for due anchor (`tonight · end of shift` default),
  assignee, zone, category. Enter creates; the row appears optimistically with a
  stagger entrance. No modal for the 80% case. (AI ghost-text parsing via the existing
  `useShiftCompletion` infra is a deferred enhancement — D12.)
- **Board view drag:** dnd-kit (already the app's DnD layer for TM cards *and* task
  chips) — no second drag library.
- **Empty states:** every view gets a designed empty state with a one-line CTA
  ("No tasks tonight — add one or check This Week"), not a blank panel.
- **Loading:** skeletons matching the `SudoTabLoading` / `BuilderBusyLabel` grammar.

### 5.4 Input & accessibility

- **Keyboard (desktop):** `N` new task (focus quick-add), `/` search, `E` edit focused
  row, `X` toggle complete, `Esc` closes pads (already the pad convention). Cmd+Z
  undo-last-action within the page session, honoring the board's existing undo muscle
  memory.
- **Undo everywhere it hurts:** complete, delete, and distribute all raise an action
  toast with **Undo** (the board's "never silently lose data" covenant, applied to
  tasks). Deletes are soft for the toast window.
- **Touch (T9):** single-tap conventions per `padUsesSingleTap()`; ≥ 44px tap targets;
  swipe-right completes, swipe-left snoozes (re-anchor to tomorrow, activity-logged as
  a due-date change); long-press opens the detail sheet.
- **A11y:** status changes announced via `aria-live` (the `DraftStatusPill` precedent),
  full keyboard traversal of lists and the Kanban board, WCAG AA contrast in both
  themes (Atkinson Hyperlegible helps, doesn't excuse).

### 5.5 Live behavior (T10)

- `useTasksData` subscribes to `postgres_changes` on the tasks tables for the active
  window, pushing into TanStack Query exactly as `liveCache.ts` does for assignments —
  including registration with `useShiftBuilderIdleResume` keepalive so an iPad that
  slept in a hallway catches up cleanly.
- `useTaskMutations` wraps every write in an optimistic update with an `onMutate`
  snapshot and rollback + conflict toast on error ("another operator changed this task,
  your change was reverted") — verbatim the documented liveCache policy.
- Two operators watching Tonight see each other's completions animate in live. That's
  not garnish; on a floor with multiple leads it's the difference between a tracker and
  a whiteboard.

---

## 6. Board integration — the brain behind the board (v2 addition)

The `/tasks` page is mission control, but the board is where the night is lived. These
integrations are deliberately thin — read-mostly, additive, and behind the same
permission flags — so they can't destabilize the deployment canvas:

1. **Zone-card task badge.** A small counter dot (tasks-accent; red once overdue) on any
   zone/RR/AUX card whose `zone_slot_key` has open Ops Tasks tonight. Tapping it opens a
   compact read/complete list in the existing pad position — it does *not* replace or
   restyle Card Tasks (T2). Builder-only, never printed, gated behind a visibility
   toggle in the board's view options so the canvas stays clean for operators who don't
   want it.
2. **Nav presence.** `/shiftbuilder/tasks` joins Reports and Graves Schedule in
   `FloatingNav`'s menu, with the due-tonight/overdue badge (§4.10). The legacy "Apply
   Overlap Tasks" action forwards to the pool's Distribute action once Phase 4 lands.
3. **Ops pill.** A "Tasks: 9 due · 2 overdue" glass pill available in the board's
   floater stack (the `RotationHealthFloater` / ops-pill grammar, portal-to-body,
   `velvetGlassPillStyle`) — tap-through to Tonight. Dismissible/collapsible like the
   health floater.
4. **Roster awareness.** In the TM placement pad, a one-line note when the TM has
   assigned tasks tonight ("Marcus: 2 open tasks") — informational only, never a scoring
   signal (T1).
5. **Chip materialization (D1 resolved — this is the replacement path, §4.12).** Every
   zone-linked Ops Task instance materializes its nightly Card Task chip
   (`night_slot_tasks.ops_task_id`) — "Empty Zone 4 trash" auto-appears on the Zone 4
   card and prints, exactly as pushed defaults do today. This is the mechanism that
   retires `slot_default_tasks` and the push buttons. Completion state never renders on
   the printed sheet (the Golden print pipeline is sacred — D10).

---

## 7. The strangler boundary (T2) — what stays vs. what dies

**Stays forever (the rendering substrate):**

- `TasksPad`, `TaskRow`, `ZoneTaskList`, `CardTaskZone`, `TaskMarkerLabel`,
  `taskMarkerStyle.ts`, `taskTextStyle.ts` — the entire rich-text, drag-to-reassign,
  print-accurate chip rendering system. Zero changes in Phases 0–6; the only Phase 7
  touch is the additive `ops_task_id` column its queries ignore.
- `night_slot_tasks` (plus the one additive column) and `slot_task_catalog`.
- The Golden print pipeline's rendering of Card Task chips on the deployment sheet.
- Draft Mode semantics: Ops Tasks are live data like notes/comments — they do not
  participate in the board's draft/apply cycle, and never restyle the gold covenant.

**Replaced and removed at the Phase 7 atomic cutover (§4.12):**

- `slot_default_tasks` (read-only rollback window, then dropped).
- `pushTaskDefaultsToNight` / `pushTaskDefaultsToWeek` and the Tasks→Today / Tasks→Week
  buttons in `DefaultsTab` (break-group defaults in that tab are unrelated and stay).
- Apply Default Tasks + Apply Overlap Tasks in `FloatingNav` (overlap distribution
  forwards to the pool's Distribute action from Phase 4 onward).
- The AM Overlap Pool shuffle hardcoded in `data.ts`.
- `slot_task_catalog.is_default_on_new_night` seeding behavior (the flag column can
  linger harmlessly; the catalog itself lives on under `TaskCatalogView`).

**Untouched until both systems have soaked, then hard-switched — never a half-migrated
in-between on a live night.**

---

## 8. Phased plan

### Phase 0 — Foundation (no user-visible change)
- Write and review migrations for all `tasks_*` tables (§4.2), including realtime
  publication membership and the RLS read/write split (T7 — reviewed before applying).
- Add `canAccessTasks` / `canManageTasks` / `canManageTaskTemplates` to
  `ShiftBuilderPermissions`, `PERMISSION_CATALOG`, and role defaults in `permissions.ts`.
- Scaffold `src/lib/tasks/` and `src/lib/shiftbuilder/tasksAdapter.ts`.
- `pnpm test` coverage for `recurrence.ts` expansion **and** the carryover re-anchoring
  logic before anything reads a real table — pure functions, cheap to get exhaustively
  right up front.

### Phase 1 — Data layer + API
- `src/lib/tasks/queries.ts` CRUD + `src/app/api/shiftbuilder/tasks/**` routes, reusing
  `_lib/sameOrigin.ts` + `_lib/rateLimit.ts` + a `requireTasksAccess` guard mirroring
  `requireSudoAdmin.server.ts`.
- `useTasksData` (realtime bridge) + `useTaskMutations` (optimistic w/ rollback) — the
  T10 layer is Phase 1 infrastructure, not a later polish item.
- `tasks_activity_log` writes on every mutation (T5) from day one.

### Phase 2 — Core page: List + Board + quick-add
- `page.tsx` + `tasksShell.css` + `TasksClient.tsx` shell with view switcher and filter
  bar; `TaskQuickAdd`, `TaskListView`, `TaskBoardView`, `TaskDetailPad`/`Sheet`.
- Full ad-hoc task lifecycle: create (quick-add) → assign → complete/undo → activity
  timeline in the detail pad. Keyboard + swipe interactions from §5.4.
- `/shiftbuilder/tasks` entry in `FloatingNav` (badge arrives Phase 5).

### Phase 3 — Recurrence engine
- `generator.ts` materialization job + `RecurringTasksView` template management with the
  full §4.6 edit-semantics surface (future-only edits, propagate checkbox, skip w/
  reason, pause/resume, delete prompts).
- Stand up the trigger mechanism (pg_cron vs external hit vs manual button stopgap — D3).

### Phase 4 — Pools
- `pools.ts` distribution algorithms (roster-aware) + `PoolsView`.
- Migrate "AM Overlap Pool" to a real `tasks_pools` row as the first real-world pool;
  forward the legacy "Apply Overlap Tasks" nav action to it.

### Phase 5 — Time surfaces & the living night
- `TonightTimelineView` (§4.8) with Night Brief; This Week; `TaskCalendarView`;
  Overdue/Mine filters; search; bulk select (multi-complete/reassign); nav badge.
- `carryover.ts` rollover job wired to the night get-or-create moment (§4.7).

### Phase 6 — Board integration (the brain, §6)
- **Chip materialization** (§4.12 items 1–2): the adapter writes/syncs `night_slot_tasks`
  chips for zone-linked instances, `ops_task_id` unique-guarded. Soak-tested against
  *new* standing tasks created in Phases 3–5 — the legacy defaults are still running
  untouched, and the two populations don't overlap until the Phase 7 import.
- Zone-card badges + compact complete-from-board pad; ops pill in the floater stack;
  placement-pad TM note. All behind a board view-options toggle.

### Phase 7 — The atomic cutover (§4.12 items 3–5)
- One release: import `slot_default_tasks` → nightly templates, run the adoption pass
  over tonight + existing future nights, remove the push buttons and Apply
  Default/Overlap Tasks actions, set `slot_default_tasks` read-only.
- `TaskCatalogView` absorbs the catalog-management half of `DefaultsTab`; the task-chip
  half of `DefaultsTab` is removed outright (break-group defaults stay).
- Repoint both embed sites — [SettingsShell.tsx:195](../src/app/shiftbuilder/settings/SettingsShell.tsx)
  and [SudoWindow.tsx:174](../src/app/shiftbuilder/sudo/SudoWindow.tsx) — to link out to
  `/shiftbuilder/tasks` for everything task-shaped.
- Update `settingsConfig.ts`'s `DEPRECATED_SETTINGS_TAB_REDIRECTS` so `?tab=tasks`
  redirects to `/shiftbuilder/tasks` instead of `defaults`.
- Gate: ships only after `/shiftbuilder/tasks` + materialization fully cover Card
  Defaults' use cases and Phase 6 has soaked on live nights (T2 discipline). Verify the
  printed deployment book against the Golden spec before and after cutover — identical
  output is the acceptance test.
- Drop `slot_default_tasks` after the rollback window closes.

### Phase 8 — Reporting integration
- Tasks panel in `/shiftbuilder/reports`: completion rate, overdue trend, category
  breakdown, per-TM load, per-template streaks — `ReportsShell`/`ReportsDashboard`
  composition.

### Phase 9 — PM-app extraction readiness (no new user features)
- Audit `src/lib/tasks/**` for ShiftBuilder leakage; everything ShiftBuilder-specific
  fully contained in `tasksAdapter.ts`; enforce with a lint rule or CI grep.
- Document the module boundary as the seed for the standalone PM app.

---

## 9. Decision log — needs Brian's call before the affected phase starts

| # | Question | Affects |
|---|---|---|
| **D1** | ~~Should a standing Ops Task ever auto-populate tonight's Card Task chip?~~ **Resolved 2026-07-02 (Brian): yes, and stronger — chip materialization is the replacement mechanism for the entire defaults system (§4.12), not an optional bridge.** | Phase 6–7 |
| **D2** | Default permission grants per role — should every operator role get `canAccessTasks`, or only shift leads+? Should floor viewers get `canCompleteOwnTasks` without full `canManageTasks`? | Phase 0 role defaults |
| **D3** | Recurrence generator trigger: Supabase `pg_cron` vs an external scheduled hit to a Next.js route vs manual "generate now" button as a stopgap? | Phase 3 |
| **D4** | Notification channel beyond in-app badges — none for now, or is push/SMS/email worth pulling forward given time-sensitive maintenance/compliance work? | Phase 3–5, deferred by default |
| **D5** | Photo evidence on completion (Supabase Storage is provisioned)? Real value for maintenance/porter work, real scope. | Phase 2/8, not in initial cut unless confirmed |
| **D6** | The unstaged `dropdown-menu.tsx` / `sheet.tsx` / `tabs.tsx` shadcn primitives — added in anticipation of this build? Confirm before the plan claims them. | Phase 2 |
| **D7** | Category taxonomy — is `maintenance / cleaning / admin / compliance / training / guest_experience / other` right, or should it mirror the GLCR ops vocabulary already in use elsewhere? | Phase 1 schema — cheap before data exists, expensive after |
| **D8** | Tasks accent color — proposal is teal `#30B0C7` (in the existing sphere palette, distinct from the four settings-section accents, and gold is off-limits per §5.1). | Phase 2 |
| **D9** | Carryover default — auto-carry with visible `↻` lineage (proposed), vs prompt-per-night, vs opt-in per template only? And is `carry_count ≥ 3` the right escalation threshold? | Phase 5 |
| **D10** | Should due-tonight Ops Tasks ever print on the deployment book (opt-in section), or is print strictly Card Tasks forever? Default: **no** — the Golden pipeline stays untouched. | Phase 6+, default no |
| **D11** | ~~Seed templates from `slot_default_tasks`?~~ **Resolved 2026-07-02 (Brian): mandatory — the import is the cutover, not a convenience (§4.12 items 3–4). Moves to Phase 7.** | Phase 7 |
| **D12** | AI-assisted quick-add (parse "replace Z7 filters monthly on the 15th" via the existing `useShiftCompletion` infra) — deferred by default; pull forward? | Phase 5+, deferred |
| **D13** | After cutover, should direct chip adds via `TasksPad` on a card create a zone-linked ad-hoc **Ops Task** (one system, one truth — proposed) instead of a bare annotation? Pure annotations would then be a deliberate rarity rather than the default path. | Phase 7+ |

---

## 10. Definition of done (this plan's scope, Phases 0–8)

- `/shiftbuilder/tasks` is live, nav-linked, permission-gated, and fully replaces the
  task-chip half of Card Defaults in both embed sites.
- **The defaults system is gone.** Every nightly default chip originates from an Ops
  Task template; `slot_default_tasks`, the push buttons, Apply Default Tasks, and Apply
  Overlap Tasks no longer exist. The only chips without an `ops_task_id` are deliberate
  manual annotations.
- The printed deployment book is pixel-identical before and after cutover for the same
  set of chip labels — the Golden acceptance test.
- An operator can create a one-off task with a due date/time, assign it to a specific TM,
  and mark it complete from an iPad in fewer taps than opening Settings takes today —
  and can complete a zone's task **from the zone card** without leaving the board.
- A standing task ("every Monday," "the 15th of the month") can be defined once and
  generates real, trackable instances without manual re-entry — and editing it has
  predictable this-one/future-ones semantics.
- Unfinished work survives the night: carryover is automatic, visible, lineage-tracked,
  and escalates instead of silently accumulating.
- The AM Overlap Pool is a real, user-editable `tasks_pools` row distributing across the
  people actually scheduled, not a hardcoded card shuffle.
- Two operators see each other's task changes live, every mutation is optimistic with
  rollback, and every destructive action has an Undo toast.
- Every task mutation has an activity-log entry an admin can review.
- Card Task rendering, print output, and drag-to-reassign behavior are byte-for-byte
  unchanged — what changes for the operator is authoring: default chips arrive from
  templates automatically instead of from push buttons.
- Both themes, reduced motion, keyboard traversal, and ≥ 44px touch targets ship with
  each view — not as a follow-up pass.
- `src/lib/tasks/**` has zero imports from `src/lib/shiftbuilder/**` — verified by a
  lint rule or a CI grep check, not just convention.
