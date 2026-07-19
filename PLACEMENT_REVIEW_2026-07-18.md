# TM Placement Matrix & Placement Algorithm — Gap Review (2026-07-18)

Granular review of the tm_zone_matrix pipeline, the placement/scoring algorithm
(legacy `runWeightedPlanner` + unified engine), rotation gates, and the Supabase
data layer. Sources: direct code read of the core modules + a matrix-pipeline
audit and a unified-engine audit (sub-agent reports, findings verified against
file:line), + live schema/data inspection of the "Graves Ops" Supabase project.

Ratified hierarchy under test: **coverage > rotation > preferences > skill**
(2026-07-01). Hard rules (eligibility, locks, gender, one-TM-per-night) are
constraints at every tier.

Severity: **P0** = violates a ratified contract or corrupts data today.
**P1** = real correctness hole, needs a triggering condition. **P2** = drift /
dead code / hygiene. Line numbers as of commit `fceee26`.

---

## P0 — contract violations & live data corruption

### 1. Week engine runs without Supervisor Brain accommodations
`engine/adapters.ts:106-122` drops `knowledge` when mapping night inputs;
`app/shiftbuilder/actions.ts:1000-1025` (`previewWeekEngine`) never loads
opsKnowledge; week polish swaps gate on `canPlace` without knowledge
(`engine/week.ts:288-290`). A hard `no_sweeper`/blocked-slot dossier (e.g.
Daryl) is enforced by Run Engine but **ignored by Run Week**, and the week
result presents as guard-clean.

### 2. `tm_accommodations` is loaded but enforced nowhere
Threaded into `NightContext` and `ScoringContext`
(`engine/context.ts:191`, `scoring.ts:67`) — zero consumers anywhere. Only
accommodations duplicated into knowledge dossiers actually block placements.
Operator records an accommodation in Sudo → every engine path ignores it.
Two sources of truth; one is dead.

### 3. Optimizer can strand a required slot no candidate can reach
`engine/optimizer.ts:167-214`: open slots are only fillable by **unused** TMs;
no move relocates a placed (unlocked, preserved) TM into an open slot. Under
the default preserve="all-existing", the only MRR-eligible free male preserved
in a zone leaves the restroom open all night while a legal full-coverage board
exists. Coverage is tier 1 — strongest hierarchy violation found.

### 4. Operator eligibility rules: scoped conditions act globally
`engineOverrides.ts:139-153`: each condition returns false independently, so
`slot_types:["rr"]` blocks every TM from every non-RR slot; `exclude_tm_ids`
bans the TM everywhere regardless of slot scoping in the same rule. "Ban X
from zones only" / "Z9SR specialist Fri-Sat" are **inexpressible**; one scoped
rule can zero coverage for whole slot classes. Related: `min_weeks` rules fail
the entire roster because `TmModel` never populates `weeksInRole`
(`engine/context.ts:125-143`).

### 5. Call-off path leaves ghost history + stale matrix
`opsMutations.server.ts:1755-1804` (`markTmCallOffServer`) nulls the TM's
slots but never clears `tm_placement_history` for them and never refreshes
`tm_zone_matrix`. The called-off TM keeps a zone exposure for a night never
worked → `area_diversity`/`cross_week_rotation` penalize them unfairly until
another assignment overwrites that night×slot or a backfill runs.

### 6. Rescue ladder places hard-avoid TMs; header says "never placed"
`placement.ts:318-340` (+ backfill `:631`): when all candidates are excluded,
`notSameArea` retains hard-avoid-preference and hard-pair-avoid candidates and
**prefers them**. Defensible reading of the hierarchy (break preferences before
rotation to save coverage) but directly contradicts the declared contract
(`placement.ts:18-23`). Same drift in the unified engine: the optimizer
relaxes hard-avoid for mere health gains (`optimizer.ts:198,209,238` always
pass relax level 2), and week polish does it **with no relaxation flag at all**
(`week.ts:276-280,338`). Rescue doctrine says hard-avoid relaxes only for
required-slot coverage. Pick one semantics and enforce it everywhere.

### 7. Rotation fairness is numerically below preferences
`DEFAULT_WEIGHTS` (`engineConfig.ts:106-123`): area_diversity 0.7 +
cross_week_rotation 0.5 → max rotation swing 1.2 < preference_fit 1.5, ≈
skill_match 1.0. Outside the prior-3 hard gate, "rotation > preferences >
skill" is not enforced by the night scorer — a hard *prefer* outvotes the
entire matrix-fairness band. (The unified objective's tier multipliers try to
fix this but have their own hole — see P1-12.) Also: no guardrail stops
operator weight overrides from inverting tiers silently.

## P1 — correctness holes needing a trigger

8. **Guard repair loop can reinstate violations; scorecards can't report
   them.** Planner pass 1 preserves live-board placements with no `canPlace`
   check (`engine/planner.ts:80-108`); guard "repair" falls back to that seed
   with no re-validation (`engine/index.ts:99-109`); `scorecardFor` hardcodes
   `hardViolations: []` (`objective.ts:113`) so the result *cannot* carry
   violations and the UI toasts success.
9. **Tier-1 restrooms get no main-loop rescue** (legacy path):
   `isCoreZoneAdminSlot` excludes MRR/WRR/Z9SR/TR/SP but includes AUXn
   (`placement.ts:268-277`) — rotation-blocked RR candidates can be consumed
   by zones before backfill returns to the RR. Coverage-tier inversion.
   (Legacy planner is dev-flag-only; unified planner ordering differs.)
10. **`record_placement_history` route**: discards cleared occupants (no
    matrix refresh), inserts the raw client slot key next to normalized-key
    ownership (`route.ts:524-546`), so a `zone_4`-keyed row survives future
    `Z4` clears → permanent ghost matrix count. Backfill script similarly
    writes un-normalized aux/RR keys (`backfill-tm-zone-matrix.ts:156-173`)
    — the live dual vocabulary in prod (see 17) proves this bit.
11. **Matrix windows only decay on write** (`matrixRebuild.ts:40-41`):
    `count_4w/8w` are frozen at last refresh; nothing schedules the backfill.
    Inactive-TM counts overstate exposure, self-reinforcing (penalized → not
    placed → never refreshed). `last_placed_at` is loaded by scoring but
    unused — no recency decay signal (`scoring.ts:503-509`).
12. **Unified objective preference sum is unclamped**
    (`objective.ts:34-45`) unlike the night scorer — stacked family+exact
    prefer rows exceed the tier-domination bound; optimizer improvements get
    discarded at the stage gate. `greedyFillOpen`'s `health*1000 + pref`
    tiebreak breaks if preference_fit ≥ ~1000.
13. **Optimizer moves unlocked preserved placements** despite its own
    "pass through untouched" contract (`optimizer.ts:187,292-334`) — manual
    (unlocked) placements silently moved or dropped under default preserve.
14. **Eligibility fails open**: unknown slot keys eligible for everyone incl.
    overlap TMs (`eligibilityCore.ts:121`); unknown/missing gender passes
    BOTH MRR and WRR (`:90-105`) while feasibility counts them toward
    neither (`engine/feasibility.ts:34-39`) — gate and feasibility disagree.
15. **Timefold "Optimize Tonight" still runs bare liturgy** — no operator
    rules, no knowledge (`timefold/timefoldLocalSolver.ts:117`); third
    optimizer proposes placements `canPlace` forbids. Still UI-wired.
16. **Full-grave drift**: `normalizeForGate` drops `isFullGrave`
    (`engine/eligibility.ts:65-76`) — schedule-derived full-grave TMs
    (gravePool null) count in feasibility but are rejected for every zone.
17. **Two parallel history stores**: prior-3 hard gate + fit chips read live
    `zone_assignments` (30/90-day fetch); matrix signals read committed
    `tm_placement_history`. Batch planner fetches 30 calendar days
    (`sudoBatchPlanner.server.ts:65`) vs the 90-day contract every
    interactive surface uses (`placementPadHelpers.ts:53-57`) — batch and
    interactive judge the same TM differently.
18. **Client config loading fails open** (`engineConfig.ts:192-201`,
    `engineOverrides.ts:191-210`): an anon read hiccup silently runs the
    interactive engine with zero operator rules; the server Apply path
    hard-fails by design. Also `week polish evaluates stale night contexts`
    after cross-night swaps (`week.ts:298-336,443-444`).

## P2 — drift, dead dials, hygiene

19. Dead weight dials operators can tune with no effect: fatigue_index,
    weekly_load_balance, prior_run_continuity, order_priority
    (`engineConfig.ts:106-123`); "disabled" override sets 0.01 not 0.
20. Hard prefer + hard avoid on the same slot cancel to 0 — avoid should
    dominate (`scoring.ts:221,337-341`).
21. Rotation hard gate applies to continuity roles: JC/STEP/OAS/TR pass
    `shouldShowPlacementFitChip` → the regular Job Coach is rotation-blocked
    from JC; Admin got the exemption, other fixed roles didn't.
22. Preference targets are free text (`TeamTab.tsx:943-949`); "RR" and
    TM-name targets silently match nothing in scoring.
23. Feasibility numbers disagree: tiers say Tier1+2 = 20 TMs, texts say 21
    with Admin, `getPlacementOrderDescription()` describes the pre-2026-07-03
    tier layout (`target-derivation.ts:160-171,230-231,296-308`).
24. Stale docs: `placement.ts:22` still claims "Z1/Z2 manual-only";
    `data.ts` zone-report comment claims zone-only but includes rr/aux;
    `slot_difficulty` key docstring conflict (`data.ts:2046` vs
    `scoring.uiKeyToSlotDifficultyKey`).
25. `matrixTmsAfterHistoryChange`/`historyInsertRow` helpers codify the
    contract but production hand-rolls it; `is_committed` never filtered by
    either matrix rebuild path; `refresh_tm_zone_matrix` route accepts
    lookbackWeeks < 8 which corrupts count_8w until next full refresh;
    backfill `--matrix-only` leaves stale rows for TMs absent from window.
26. AI stage's `checkEligibility` tool omits knowledge → tells the model
    placements are OK that the guard then rejects (`engine/ai/tools.ts:46-49`).
27. Test gaps (none exist): optimizer preserve policy, relocation coverage,
    week+knowledge, any tm_accommodations enforcement, guard repair
    re-validation, rescue/backfill in placement.ts, matrix fairness signals,
    stacked-preference tier domination, week polish relaxation flags.

---

## Supabase layer (live audit, project "Graves Ops")

### Security — needs Brian's decision, NOT auto-applied
- **13 tables with RLS disabled** (anon key can read AND write):
  deleted_entities_archive, engine_config_history, engine_config_drafts,
  zone_tasks, zone_task_assignments, task_day_overrides, zds_annotations,
  night_audit_log, zds_settings, tm_slot_skills, break_template,
  am_overlap_fill_order, pm_overlap_tasks. Enabling RLS without policies
  breaks app access — needs a deliberate policy pass.
- **anon has write policies on the board**: `opsapp_anon_insert/update/
  delete_zone_assignments`, `opsapp_anon_insert_nights`. The public key can
  rewrite deployments.

### Data hygiene (proposal only — data mutations need sign-off)
- `zone_assignments` mixed vocabulary: stray UI keys under wrong slot_types
  (Z4/Z8/ADM/MRR1/WRR7 as aux/zone strays), admin+ADM, z9_sr+Z9SR,
  OL-AM-N + overlap_am_N, and **overlap seats duplicated under both
  slot_type='aux' and 'overlap'** (confirmed identical occupants 2026-07-17
  → naive head-counts double-count). 3 rr rows with NULL rr_side.
- `tm_placement_history` dual vocabulary live: ADM/ADMIN, MRR8/RR8M,
  SP1/SUP1, TR1/TSH1, OL-AM-N/overlap_am_N — breaks singular night×slot
  ownership across forms (fix #10 first or cleanup regresses).
- Legacy views `v_zone_assignments_current` / `v_current_assignments` are
  stale/misleading (break waves labeled "restroom"; zones only).

### Shipped this review (additive migration `ai_readable_deployment_views`)
`sb_ui_slot_key()` + `sb_slot_label()` (SQL mirrors of slot-keys.ts, covering
all three vocabularies incl. trail codes) and six security_invoker views:

| View | One-liner |
|---|---|
| `v_night_deployment` | who is on what slot, any night, with names/labels |
| `v_night_tasks` | every task per slot with the assigned TM |
| `v_tm_night` | per-TM per-night placements + call-off flag + task count |
| `v_placement_history` | engine trail, dual vocab collapsed |
| `v_tm_zone_matrix` | the Placement Matrix with names + days_since_last |
| `v_call_offs` | call-offs with names |

Verified: full named board + tasks for 2026-07-17 in single SELECTs; decoder
covers 100% of production keys (zero UNK across all three tables). RLS still
applies through the views (security_invoker).

---

## Suggested fix order
1. P0-1/2 (accommodations): enforce `tm_accommodations` in `canPlace`, thread
   knowledge through week engine + adapters + polish gate.
2. P0-5 + P1-10 (matrix integrity): clear history + refresh matrix in
   `markTmCallOffServer`; normalize keys on the record route + backfill;
   then run the backfill to heal the dual vocabulary.
3. P0-3 + P1-13 (optimizer): add relocation move; honor preserve policy.
4. P0-4 + P1-16 (rules interpreter): make conditions compose as scoped
   predicates; populate `weeksInRole`; carry `isFullGrave` through the gate.
5. P0-6/7 (hierarchy): decide hard-avoid semantics once; raise rotation
   band above preferences (or gate lexicographically); clamp objective prefs.
6. Schedule the matrix backfill (cron) so windows decay (P1-11).
7. Supabase: RLS pass on the 13 tables + revisit anon write policies;
   then the data cleanup scripts.

---

## Addendum — matrix UI-consumption audit (landed post-wrap)

Architecture fact first: there are **two unrelated "matrices"** — the DB
`tm_zone_matrix` (read only by the legacy planner/Grok signals) and the pad's
"Matrix · last 30 nights" (computed from `zone_assignments` history; feeds
chips, pad, picker, AND the unified engine health model). The `components/`
copies of the fit files are pure re-export shims — no fork.

### A1 — P0: RR history keys ("RR8M") don't match the rotation kernel ("MRR8")
Since the Jul 11 normalization, per-TM history stores restrooms as `RR8M`/
`RR8W` (`constants.ts:176-177`, `auxLayout.ts:484-491`), but
`placementRepeatKey` only matches `^(?:M|W)?RR\d+$`
(`rotation/placementPadHelpers.ts:189-198`). Consequence, on every surface:
RR spread counts read 0×, the prior-3 hard gate and last-5 trail **never fire
for restrooms across weeks**, pad RR cells render permanently gray while the
same pad's LAST-5 pills show the placements, and the engine health model
awards the +7.5 "never here" bonus to RR repeats (propagates into the unified
objective, Run Week, picker sort). A TM who worked WRR6 the last two Fridays
scores strong-fit for WRR6 tonight. Zones are unaffected (shared `Z*` vocab),
which is why this went unnoticed. Fix is one regex: teach `placementRepeatKey`
the `RR(\d+)[MW]` form.

### A2 — P0: Flex aux shell keys (`AUXn`) break rotation matching and the Admin exclusions
History/week maps use canonical codes (`STEP`, `TSH1`, `ADMIN`…) but fit
computations key on tonight's shell key (`AUX4`): aux spread counts read 0×,
prior-3/last-5/week-repeat never fire for aux cards. Worse, Admin's live key
`AUX1` passes `shouldShowPlacementFitChip` and `slotSwapFamily` ("aux") — so
Admin now GETS a fit chip, is averaged into rotation health, and is a legal
swap-lane peer, all against documented intent; the week-policy half still
excludes it → the two halves of one health number disagree. Fix: canonicalize
via `canonicalizeAuxSlotKeyForTrail` at the fit boundary; key Admin/swap
exclusions on role, not legacy names.

### A3 — P1: Z9SR matrix rows are write-only under flex layouts
`scoring.ts:491-494` accepts `Z9SR` but the live flex key is `AUX2` → the
matrix fairness signals silently stopped applying to Z9SR when flex aux
shipped; `matrixRebuild` keeps aggregating data nothing reads.

### A4 — P1: `provenance.fairnessSignals` never populated in production
The designed `tm_zone_matrix` → fit-chip datapath (`count_8w` facts, xAI
repeat forgiveness, "engine-backed" copy) is dead code — only dev mock pages
construct provenance (`placementFitScore.ts:276-320`,
`shiftRotationHealth.ts:378-387`).

### A5 — P1: same 30-night spread computed from three different fetches
90d (interactive contract) vs 30 calendar days (`sudoBatchPlanner.server.ts:65`
and "Optimize Week" `actions.ts:910-912`) vs timefold passing the *nights*
constant as the calendar-days param (`timefoldLocalSolver.ts:320`). "Run Week"
and "Optimize Week" run the same engine on different histories.

### A6 — P1: client `tm_zone_matrix` snapshot is mount-once + rebuild self-counts tonight
Post-apply engine re-runs use the stale page-load matrix (under-count); after
reload the rebuild includes tonight's own placement (no `beforeIso`), biasing
`area_diversity` against the incumbent. The history pipeline is clean on both.

### A7/A8 — P2: two coexisting rotation formulas can visibly disagree in
grok-hybrid mode (Why? panel = matrix signals, chips = history model; Grok
prompt band says 80 while verdicts use 76); new-hire narratives contradict
("everything is a gap" on the pad vs "0 spread gaps" in the picker) though
verdicts agree. `getZoneDetailReport` docstring stale (rr/aux included).

Verified correct by the same audit: the "last 30 nights" legend is honest
(30 grave nights, thresholds match the scorer), no tonight double-count in
the history pipeline, one shared health model across chips/orb/picker/engine,
and the DB matrix write path fires on upsert/batch/delete as designed.

### Revised top of the fix order
1. **A1** (one-regex RR fix) and **A2** (aux canonicalization) — they blind
   rotation for a third of the board and are cheap.
2. Then the original list (accommodations → matrix integrity → optimizer →
   rules interpreter → hierarchy weights → scheduled backfill → Supabase).
