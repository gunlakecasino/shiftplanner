# TM Placement Matrix & Placement Algorithm — How It Works

Companion to `PLACEMENT_REVIEW_2026-07-18.md` (the gap review). This document
explains the system **as designed and as built** — the goals, the data model,
every scoring signal, and the exact walk each engine takes. File references
as of commit `fceee26`. Where the build diverges from the design, this doc
describes the *intent* and points to the review finding rather than repeating
it.

---

## 1. Purpose and goals

The system deploys the grave-shift Internal Maintenance roster at Gun Lake
Casino onto a nightly board: 10 zones, 10 restroom slots, Admin, the Z9
Smoking Room, and a flexible auxiliary row (Trash, Support, Oasis, Job Coach,
Step Up), plus PM (11p–1a) and AM (5a–7a) overlap seats. It has four goals,
in strict priority order — the **operator-ratified value hierarchy
(2026-07-01)**:

```
coverage  >  rotation  >  preferences  >  skill
```

1. **Coverage** — a filled required slot beats any other gain. Restrooms and
   zones are "hard coverage"; the engine fights hardest to clear them and has
   dedicated rescue/backfill machinery that relaxes lower tiers to do it.
2. **Rotation** — among coverage-equal boards, spread people across areas.
   Nobody should grind the same zone or restroom night after night. Enforced
   at three ranges: a *hard* prior-3-placements gate, a *soft* last-5 trail,
   and graded 4-week/8-week exposure signals from the matrix.
3. **Preferences** — operator-recorded prefer/avoid signals per TM (slot
   targets and pair affinities). Hard *avoids* are intended as constraints;
   prefers are soft weight.
4. **Skill** — closeness of a TM's skill score to a slot's difficulty is the
   final tiebreaker, never a driver.

Hard rules sit outside the hierarchy entirely — they are constraints at every
tier, never tradeable costs: eligibility (gender for restrooms, full-grave
for zones, overlap bands), locked slots, one TM per night, accommodations,
and schedule membership.

A fifth implicit goal is **explainability**: every engine decision must be
inspectable by the operator (Why? panel, fit chips, thought process) and by
AI copilots (Grok/Fable receive the same rules as text and tools).

---

## 2. Slot vocabulary — the three (and a half) key languages

The single most important thing to know when touching this system: the same
physical slot has different keys in different layers.

| Layer | Zone 4 | Men's RR 8 | Admin | Trash 1 | Step Up | PM overlap seat 1 |
|---|---|---|---|---|---|---|
| **UI / board** (`page.tsx`, engines) | `Z4` | `MRR8` | `ADM` | `TR1` | `STEP`* | `OL-PM-0` |
| **DB** (`zone_assignments`) | `zone_4` | `rr_8` + `rr_side='mens'` | `admin` | `trash_1` | `step_up` | `overlap_pm_0` + `slot_type='overlap'` |
| **Trail / history** (`tm_placement_history`, pad LAST-5) | `Z4` | `RR8M` | `ADMIN` | `TSH1` | `STEP` | `OL-PM-0` |
| **`slot_difficulty` table** | `Zone4` | `MRR8` | `Admin` | `Trash1` | — | — |

\* On a flex-aux night the *live board key* for aux shells is `AUX1..AUXn`;
the shell's role (`admin`, `z9sr`, `trash`, `support`, `oasis`, `job_coach`,
`step_up`) and label live in `nights.aux_layout` (JSONB). History writes the
stable role code, not the shell key.

Translators:
- `src/lib/shiftbuilder/slot-keys.ts` — `uiToDb` / `dbToUi` (the canonical
  pair; `dbToUi` passes already-UI keys through untouched so mixed data never
  produces `UNK:` sentinels), `slotKeyToLabel` for display.
- `normalizeHistoryUiKey` (`constants.ts`) — board key → trail code before a
  history insert (`MRR8`→`RR8M`, `SP1`→`SUP1`, `TR1`→`TSH1`, `ADM`→`ADMIN`)
  so the pad's LAST-5 matches matrix cell labels.
- `canonicalizeAuxSlotKeyForTrail` (`auxLayout.ts`) — `AUXn` shell → role code
  using that night's layout. **Rule: never format historical `AUXn` keys with
  tonight's layout** — shell indices are not stable across nights.
- `sb_ui_slot_key()` / `sb_slot_label()` (Supabase, shipped 2026-07-18) —
  SQL mirrors that collapse *all* vocabularies to the UI form for queries.

Restroom quirk: physical restrooms 1 and 2 are operationally paired, so the
DB key is `rr_1_2` but the UI number is 1 (`MRR1` = "RR 1+2 (Men's)").
`rr_side` (`mens`/`womens`) is a separate column — one DB key hosts two board
slots.

---

## 3. The TM model and hard eligibility

A roster row carries: `gravePool` (a string enum — `"Full"`, `"AM"`, `"PM"`,
not a boolean), per-night flags (`isAMOverlapTonight`, `isFullGraveTonight`),
`gender`, `skill_score`, `tie_break_rank`, and status.

**Full-grave derivation** (`isFullGraveForPlacement`, `placement.ts:253`):
a TM is full-grave when schedule says so, OR when they're grave-pool and
*not* AM/PM-pool and *not* overlap-assigned tonight. Only full-grave TMs can
hold a zone (11pm–7am window); AM/PM overlap TMs work partial shifts and can
hold only their overlap band's seats.

Eligibility is a **layer cake with a constitution** (KD-7: no import cycles,
one composition point):

1. **Liturgy** — `eligibilityCore.ts:isEligibleForSlot`. Pure hard physics:
   gender for MRR/WRR, full-grave for `Z*`, overlap band for `OL-*`,
   overlap-TMs barred from full-night aux/RR/ADM. Imports nothing.
2. **Operator rules** — `engine_eligibility_rules` rows (per config version),
   interpreted by `isEligibleUnderRules` (`engineOverrides.ts`). Conditions:
   `slot_types`, `only_zones`, `exclude_tm_ids`, `min_weeks`. Only
   `hard_exclude` ruleType is implemented. *(Design intent: scoped
   predicates; see review P0-4 for the current global-AND behavior.)*
3. **Knowledge** — Supervisor Brain dossiers (`opsKnowledge/`) with
   `blockedSlotKeys` / `blockedTags` (e.g. Daryl `no_sweeper`). Hard.
4. **Schedule** — `scheduledTmIds` from the Graves Default Schedule + on-call
   overrides; the engine only places TMs scheduled tonight.

All four compose **only** in `canPlace` (`engine/eligibility.ts`) — the
public hard gate every unified-engine stage calls. `placement.ts` (legacy)
composes liturgy + operator rules itself, never importing engine/eligibility
(cycle rule). A separate `tm_accommodations` DB table exists as a fourth
data source *(designed to be hard; currently unwired — review P0-2)*.

Locks: `zone_assignments.is_locked` slots are never reassigned by any engine
run, ever. Z1/Z2 became regular fill-order zones on 2026-07-03
(`OPTIONAL_AUTO_FILL_ZONE_SLOTS` is now empty).

---

## 4. Fill order and coverage tiers

The fill order is data, not code: **Coverage Tiers** in
`skills/placement-engine/core/target-derivation.ts` — the AI-modifiable
"skill layer" both the deterministic engine and Grok consult.

```
Tier 1  Critical — Restrooms   MRR1 MRR7 MRR8 MRR10 MRR6, then WRR same order   (hard coverage, 5M + 5F distinct)
Tier 2  Core — Zones           Z9 Z3 Z4 Z5 Z7 Z8 Z10 Z2 Z1 Z6                   (hard coverage, 10 distinct full-grave)
Tier 3  Auxiliary              ADM then Z9SR                                     (after ALL zones — short roster fills a zone before Admin)
Tier 4  Essential Support      TR1 TR2
Tier 5  Float / Overflow       SP*, OAS*, JC, STEP, operator AUXn
```

`deriveTargetSlotsInOrder(auxDefs)` flattens tiers → the ordered slot list;
with a flex aux layout, tiers 3–5 are rebuilt from the shells' roles.

**Feasibility** (`calculateCoverageFeasibility`) computes, before any
placement, whether the roster can mathematically clear Tier 1+2 — including
the gender split (F10, 2026-07-02): Tier 1 needs ≥5 eligible men AND ≥5
eligible women; 21 full-grave men do not make restrooms "possible". The
result feeds a REALITY CHECK note into engine output so shortfalls are
declared, not discovered.

Physical constant the whole system leans on: clearing restrooms + zones +
Admin takes **21 unique TMs** (10 + 10 + 1); people cannot be reused across
blocks.

---

## 5. History: two stores, one trail

The system records *where everyone worked* twice, for different purposes:

### 5a. `zone_assignments` — the live board (per night × slot)
The operational truth for a night, including manual edits. The **rotation
UI/health pipeline reads this** (not the matrix): `getTmPlacementHistory`
(`data.ts:2957`) fetches 90 calendar days of a TM's rows (excluding
overlap), decodes each to a trail key using that night's `aux_layout`, and
builds `ZoneDetailEntry.zoneDates` (`{trailKey: [nightDates...]}`). All
spread/trail/prior-N helpers consume this shape.

### 5b. `tm_placement_history` — the committed engine trail
Append-per-commit rows `(tm_id, night_id, slot_key, slot_type, rr_side,
placed_at, week_start, is_committed)`. **Ownership is singular per
(night, slot)**: every assign first deletes whatever row owns that night×slot
(any TM), then inserts the new one (`historyDeleteFilter` /
`historyInsertRow` contract, `rotation/historyOwnership.ts`). `placed_at` is
noon UTC of the night date (`placedAtFromNightDate`) so day-window math is
stable. Writers: `upsertZoneAssignmentServer`, `deleteZoneAssignmentServer`,
`batchApplyDraftAssignmentsServer` (`opsMutations.server.ts`), plus the
`record_placement_history` API action and `scripts/backfill-tm-zone-matrix.ts`.

### 5c. `tm_zone_matrix` — THE TM Placement Matrix
A denormalized, fast-scoring rollup of 5b, **zones only** (`Z1..Z10`,
`Z9SR`): one row per (tm, zone) with

| column | meaning |
|---|---|
| `count_4w` | placements in the trailing 28 days (as of last refresh) |
| `count_8w` | trailing 56 days |
| `count_lifetime` | lifetime *within the refresh lookback* (default 12w), not all-time |
| `last_placed_at` | most recent placement timestamp |

Built by the pure aggregator `aggregateZoneMatrixFromHistory`
(`rotation/matrixRebuild.ts`): normalize each history `slot_key` via
`matrixZoneKeyFromSlotKey` (accepts `Z4`, `zone_4`, `Z9SR`, `z9_sr`; anything
else — RRs, aux, overlap — is *not a zone* and is skipped), bucket by the 4w/8w
windows relative to *now*.

**Refresh contract** (`matrixTmsAfterHistoryChange`): after any history
mutation, rebuild the matrix for *previous occupants + the new TM* (assign)
or *previous occupants* (clear). `refreshTmZoneMatrixServer` does a full
per-TM rebuild — upserts current zones, deletes orphaned zone rows, deletes
everything when the TM has no zone history in the lookback. A backfill script
(`scripts/backfill-tm-zone-matrix.ts`) can rebuild the world; nothing
schedules it, so window decay between mutations relies on it being run
*(review P1-11)*.

### The naming trap
The PlacementPad panel titled **"Matrix · last 30 nights"** is *not*
`tm_zone_matrix`. It is the 30-grave-**night** spread computed live from 5a
(within the 90-day fetch), covering zones + RRs + aux, with the legend
1× green / 2× orange / 3+ red (`spreadFrequencyAccent`). `tm_zone_matrix`
is calendar-window (4w/8w), zones-only, and read **only** by the legacy
planner's fairness signals and the Grok tools. Two different objects sharing
one word.

---

## 6. The rotation model, range by range

All matching runs through one kernel in `rotation/placementPadHelpers.ts`:

- `placementRepeatKey(ui)` — the "same deployment area" identity. `MRR8`,
  `WRR8`, `RR8` all collapse to `RR8` (same restroom pair is the same area,
  either side); overlap seats are fungible within band (`OL-PM-*` → `OL-PM`);
  zones and aux are exact. *(Trail-form `RR8M` support: review addendum A1.)*
- `placementSideFamilyRepeatKey` — `WRR*` → `WRR`, `MRR*` → `MRR` (worked
  *any* women's restroom).
- `placementRepeatKeysConflict` — same area OR same side-family.

Ranges, nearest to farthest:

1. **Tonight (within-run)** — `within_repeat`: a TM already in the draft is
   hard-excluded from a second slot. Structural (candidate pools also filter
   used TMs).
2. **Prior-3 events — HARD** (`PRIOR_PLACEMENT_CRITICAL_WINDOW = 3`).
   `isInPriorPlacementSameAreaWindow`: same area in the TM's last 3 placement
   *events* (merged: DB history *before tonight* + already-planned in-week
   engine placements via `weeklyRecentHistory`). Result: hard exclude
   (`-Infinity`) in scoring. Scope: only rotation-tracked slots
   (`shouldShowPlacementFitChip`) — **Admin and overlap are exempt by
   design**: some TMs are intentionally on Admin every night, and the weekly
   health policy already excluded it, so the hard gate must not force-rotate
   it (closes the old health-vs-engine split-brain).
3. **Prior-3, side-family only — NEAR-HARD SOFT.** Different restroom, same
   side (WRR6 after WRR8) → flat penalty `rr_side_family_repeat` (default
   **48**, deliberately dwarfing every other weight: a deterrent coverage can
   still override, expressed as a cost rather than an exclude).
4. **Last-5 trail — SOFT** (`LAST5_SOFT_TRAIL_COUNT = 5`): same area in the
   last 5 events feeds fit-chip verdicts and health deductions, not excludes.
5. **30-night spread** — per-area counts over the last 30 grave nights;
   drives pad matrix colors, "N× in last 30" copy, gap lists ("not in 30
   nights: …"), and health scoring.
6. **4w/8w calendar exposure** — the `tm_zone_matrix` signals (§7,
   `area_diversity` / `cross_week_rotation`), zones only.
7. **Week policy** — within the Fri–Thu grave week, the week engine counts
   area-merged repeats (RR8 = MRR8+WRR8) across planned nights and penalizes
   them in the week scorecard; Admin exempt (same
   `shouldShowPlacementFitChip` filter).

**Health points** (`rotationHealthEngineContext.ts` → `engine/health/model.ts`)
blend these into a 0–100 per-placement score (prior-3 criticals dominate,
then last-5, spread frequency, recency; "+7.5 never worked here" bonus for
genuinely fresh areas). One shared model feeds the fit chips, the pad orb,
the picker sort, the RotationHealthFloater, the week tracker %, and the
unified engine's objective — by construction there is no chip-vs-engine
formula drift.

---

## 7. Scoring: signals and weights

`scoring.ts:scoreAssignment(tm, slotKey, ctx)` — pure, deterministic,
returns `{ total, breakdown, excluded, excludeReason }`. Total is the sum of
weighted signals; any hard hit sets `total = -Infinity` + `excluded`.

| signal | default weight | raw range | what it measures |
|---|---|---|---|
| `within_repeat` | (hard) | 0 / −∞ | already placed this draft |
| `prior_placement_repeat` | (hard) | 0 / −∞ | same area in prior-3 (§6.2) |
| `rr_side_family_repeat` | 48 (penalty) | 0 / −1 | same RR side-family in prior-3 |
| `preference_fit` | 1.5 | −1..+1 | hard-strength `tm_preferences` rows |
| `skill_match` | 1.0 | −1..+1 | closeness of skill to `slot_difficulty` |
| `pair_affinity` | 1.0 | −1..+1 | prefer/avoid vs neighbors already placed |
| `area_diversity` | 0.7 | 0..1 | matrix: `max(0, 1 − count_4w/6)` |
| `soft_prefer_set` | 0.6 | −1..+1 | soft-strength preference rows |
| `cross_week_rotation` | 0.5 | 0..1 | matrix: `max(0, 1 − count_8w/6)` (graded, not a cliff) |

Semantics worth knowing:

- **Preference target matching** (`preferenceTargetMatches`): exact match, or
  prefix match for *category* targets — but digit-terminated targets are
  exact-only (`Z1` must not hit `Z10`; `MRR1` must not hit `MRR10`).
  A hard **avoid** on the slot is a hard exclude. Multiple matching rows sum,
  clamped to [−1, 1].
- **Pair affinity** reads a static adjacency map (`buildDefaultAdjacency`):
  zones chain linearly Z1–Z10; RR blocks 1, 6, 7, 8, 10 attach to their
  neighboring zones and to each other's side. A hard pair-avoid with an
  already-placed neighbor is a hard exclude (flagged structurally by the
  signal, not by note text).
- **Skill match**: `1 − |skill − difficulty|/5`, floored at +0.2 when the TM
  is overqualified (being too good is never penalized below a small
  positive). Missing skill or difficulty data → 0 (neutral), noted.
- **Matrix signals** apply only to `Z*`/`Z9SR` candidates — for RR/aux the
  matrix has no rows and a lookup would fake "fresh". Matrix data is
  preloaded once per run into `ctx.zoneMatrix` (no N+1 in the hot loop);
  missing matrix degrades gracefully to zeros (telemetry records
  `matrixPreloaded`).
- Retired dials kept for config compatibility: `order_priority` (planner
  already walks the order — a constant bonus can't change a pick),
  `prior_run_continuity` (rewarded *any* historical exposure, canceling
  area_diversity), `skill_stretch_reward` / `sweeper_rotation_penalty`
  (no data source).

Weights/thresholds live in the versioned **`engine_config`** row
(`engineConfig.ts`; fallback defaults if no active row), with normalized
per-signal overrides (`engine_signal_overrides`: multiplier / absolute /
disabled) and the operator rules resolved by
`getFullyResolvedEngineConfig` (`engineOverrides.ts`). `placement_method`
selects `greedy` | `weighted` | `grok-hybrid`; grok-hybrid adds a reasoning
effort dial.

*Design intent vs numbers:* the hierarchy intends rotation ≻ preferences.
The hard prior-3 gate is lexicographic, and the unified objective adds tier
multipliers on top; the raw default weight bag alone does not order the
matrix band above preferences (review P0-7).

---

## 8. The legacy weighted planner (`runWeightedPlanner`)

`placement.ts` — the original Phase-1 engine. **Production status: dev-flag
only** (`sb_legacy_engine=1`); the unified engine replaced it on both the
interactive and batch paths, but it remains the reference algorithm, the
Grok-tools substrate, and the clearest statement of the fill contract.

Walk, per slot in fill order:

1. **Preserve** — existing assignment kept (all of them normally; only
   locked ones when `preserveOnlyLocked` / "Run xAI Engine"). The kept TM is
   still scored so the Why? panel isn't silent on preserved slots.
2. **Candidates** — roster, minus TMs already in the draft, through liturgy +
   operator rules.
3. **Score & pick** — `scoreAssignment` each candidate; non-excluded sorted
   by total; winner enters the draft (so later slots' `pair_affinity` /
   `within_repeat` see it).
4. **Coverage rescue** (core zones/Admin/AUX, when *everyone* is excluded) —
   `pickBestCoverageRescueCandidate` ladder: any non-excluded candidate ▸
   best non-*rotation*-excluded (prefer breaking a lower tier before breaking
   rotation) ▸ best overall by *effective score* (finite parts of the
   breakdown, ignoring −∞), preferring full-grave for zones. Every rescue is
   annotated "rotation gates relaxed" in the notes.
5. **Backfill pass** — after the walk, any still-empty slot with eligible
   unused TMs gets the best-scored remaining candidate through the same
   rescue ladder (a previous version took `cands[0]` raw — that regression is
   documented so it never returns).

Output: `proposedAssignments`, `unassignedPeople`, human-readable `notes`
(feasibility REALITY CHECK first), and a per-slot Top-K `breakdown` powering
the Why? panel. `logEngineRunSummary` emits structured telemetry
(mode, fill counts, grok usage, matrix preload state) for every run.

---

## 9. The unified engine (production path)

`src/lib/shiftbuilder/engine/` — Phases 1–3, wired to "Run Engine" (night)
and "Run Week". Deterministic, seeded (mulberry32 — byte-identical reruns),
staged, with a lexicographic scorecard gate between stages.

```
context → planner → optimizer → [AI stage] → guard → NightRunResult
```

- **Context** (`context.ts`) — normalizes the roster to `TmModel`, scopes
  week history to nights *before* tonight (exactly once), threads config,
  histories, matrix, knowledge, schedule.
- **Planner** (`planner.ts`) — successor to §8 on unified primitives: pass 1
  preserves per policy (`all-existing` default | `locked-only` | `none`),
  pass 2 walks fill order calling `canPlace` + the same scoring, with the
  **rescue ladder D1**: relax prior-3 rotation, then hard-avoid, *only* to
  save required-slot coverage — every relaxation recorded on the placement's
  provenance.
- **Optimizer** (`optimizer.ts`) — local search over the planner seed within
  a fixed move budget: swaps and reassignments that must keep `canPlace`
  true, never touch locks, never lose coverage vs the seed. Objective
  (`objective.ts`) collapses the hierarchy into one comparable value with
  tier multipliers; the **stage gate** (`index.ts`) adopts the optimizer
  draft only if `compareScorecards` — lexicographic
  `coverage → hardViolations → health → preferences → skill` — does not
  regress. Health points are clamped 0–100 so health can never
  arithmetically outweigh coverage.
- **AI stage** (`engine/ai/`, grok-hybrid only) — Grok/Fable receives the
  rules as text + tools (`checkEligibility`, `scoreCandidate`, board
  briefs), proposes per-slot overrides; the **AI guard** re-validates every
  override through `canPlace` + scorecard non-regression, applying
  batch-then-incremental and rejecting the rest with reasons. Provider
  failure keeps the deterministic draft.
- **Guard** (`guard.ts`) — final invariants: per-placement eligibility
  (incl. knowledge), no double-booking, locked-slot integrity, coverage not
  below baseline, fill-order advisories. Failures trigger a repair pass that
  falls back to planner-seed placements for offending slots.
- **Result** — draft + per-slot provenance (stage, reason, relaxations,
  scorecard), telemetry (`relaxationsUsed`, stage notes), and a
  thought-process feed the UI renders (EngineThoughtProcess, toast
  summary). The premium "solving" overlay (`EngineRunningOverlay`) rides
  `weekRunBusy`/engine-busy state.

### The week engine (`week.ts`)
Goal: plan Fri–Thu as one fairness problem instead of seven greedy nights.
Rolling solve: night N's accepted draft is appended to `rollingHistory` so
night N+1's context sees it in `weeklyRecentHistory` (prior-3 and week-repeat
checks span planned-but-uncommitted nights). After all nights: a **polish**
pass proposes cross-night swaps that reduce week-policy repeat cost without
losing coverage, then a week scorecard (`computeWeekScorecard`) totals
coverage, health, repeat violations, and TM utilization. "Run Week" is a
read-only preview (`previewWeekEngine` server action) surfaced in
`WeekEngineResultsSheet`; applying goes through the same batch mutation path
as everything else (§10).

### The third optimizer
"Optimize Tonight" (`timefold/timefoldLocalSolver.ts`) is an older local
solver still wired to the UI; it honors schedule + liturgy only. Its fate
(retire vs. port onto `canPlace`) is an open decision — review P1-15.

---

## 10. Persistence and the matrix loop

Every apply path funnels into `opsMutations.server.ts`:

```
assign/clear/batch → zone_assignments upsert
                   → history delete-by-(night,slot) + insert (normalized trail key)
                   → refreshTmZoneMatrixServer(previous occupants + new TM)
```

Undo/redo and drag-swaps persist through the same batch mutation, so the
history/matrix loop closes for every operator gesture *(the call-off vacate
path is the known exception — review P0-5)*. `today_assignment_changes` and
`night_audit_log` record the change stream; `deploymentChangeLog` mirrors it
client-side.

---

## 11. Explainability surfaces

| Surface | Source | Shows |
|---|---|---|
| **Why? panel** | planner `breakdown` (Top-K per slot) | each candidate's per-signal weighted breakdown, exclusion reasons, who was picked and why |
| **Fit chips** (`PlacementFitChip`) | `placementFitForSlot` → health model | verdict (strong/acceptable/rotation-risk), "N× in last 30", prior-3/last-5 hits |
| **PlacementPad** | 30-night spread + LAST-5 trail | per-TM matrix grid (green/orange/red), gaps list, swap suggestions, xAI insight (server-guarded) |
| **RotationHealthFloater / week tracker** | `computeShiftRotationHealth` | board-level health %, violations list |
| **Engine thought process** | `NightRunResult` provenance | stage-by-stage narrative incl. rescues and AI accept/reject |
| **Reports → Zone Rotation Matrix** | `getZoneDetailReport` (live board, dbToUi keys) | per-TM × zone counts/dates over report windows |
| **Telemetry** | `logEngineRunSummary`, stage notes | fill/preserve/unfilled counts, grok picks, matrix preload |

Three "matrix-shaped" surfaces, three different data sources: the pad
(30-night spread from the live board), the reports panel (report-window
aggregation of the live board), and `tm_zone_matrix` (committed history
rollup). They agree in spirit, not by construction.

---

## 12. AI access layer (Supabase, shipped 2026-07-18)

Migration `ai_readable_deployment_views` makes the whole system queryable
without knowing any of §2:

```sql
-- who is on what, any night
select slot, slot_label, tm_name from v_night_deployment
 where night_date = '2026-07-17' order by slot_type, slot;

-- what tasks ride each slot, with the assignee
select slot, task_label, assigned_tm_name from v_night_tasks
 where night_date = '2026-07-17' order by slot, sort_order;

-- a TM's trail / call-offs / the Placement Matrix with names
select * from v_tm_night where tm_name ilike '%daryl%' order by night_date desc;
select * from v_placement_history where night_date >= current_date - 30;
select * from v_tm_zone_matrix order by count_8w desc;
select * from v_call_offs order by night_date desc;
```

All views are `security_invoker` (underlying RLS applies); `raw_slot_key`
columns preserve stored values; the decoder covers every key form in
production (verified zero `UNK:`). Prefer the views over raw
`zone_assignments` — raw rows double-count overlap seats stored under two
`slot_type`s until the cleanup lands.

---

## 13. Design principles worth preserving

1. **One hierarchy, stated where the code lives** — the contract block at the
   top of `placement.ts` is the constitution; every optimizer must cite it.
2. **Hard rules are never costs.** If something must never happen, it's a
   gate (`canPlace`, exclusion), not a big negative weight. The one deliberate
   exception is `rr_side_family_repeat` (near-hard cost, so coverage can
   still complete).
3. **Coverage rescue is explicit and annotated** — relaxations are recorded
   and shown, never silent.
4. **Explainability is load-bearing** — Top-K breakdowns and provenance are
   produced *during* solving, not reconstructed after.
5. **Determinism first, AI second** — the deterministic draft is always
   valid on its own; AI may only refine through the guard.
6. **Leaf modules stay pure** (KD-7): liturgy imports nothing; composition
   happens in exactly one place; the skill layer is data an AI may edit.
7. **History identity is normalized at write time** — trail keys are stable
   codes so cross-night comparison never depends on a night's shell layout.
8. **Fail loud in dev, degrade gracefully in prod** — unknown keys warn and
   pass through; missing matrix zeroes out with telemetry, never crashes an
   engine run.

Known divergences between this design and the current build are catalogued
in `PLACEMENT_REVIEW_2026-07-18.md` (34 findings + war-ranked fix order).
