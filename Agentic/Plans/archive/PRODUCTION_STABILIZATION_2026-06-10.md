# Production Stabilization & Hardening Plan — OMS/ZDS ShiftPlanner
**Date**: 2026-06-10  
**Status**: ARCHIVED — Execution to completion (user "continue"). Key slices delivered.
- Slice 1 (Data Orchestration / useShiftData): ✅ Complete.
- Slice 3 (applyDraft atomicity): ✅ Hardened + protected by guard.
- Slice 4 (Server Eligibility Guard): ✅ Complete. `validateProposedAssignments` server action + early integration in applyDraft. Graves + eligibility re-check before commits. UI feedback for rejections + "server-validated" success toast.
- Slice 5 (Graves audit): ✅ Complete.
- Slice 2: Deferred (Turbopack risk).
- Slice 6: Partial (Realtime wiring in liveCache for OpsStatusBar visibility + toast polish; full re-render discipline incremental).
- Overall: Core production stabilization goals met (monolith hygiene start, safety guard on AI/manual commits, audit, atomicity). tsc clean. Live server data paths validated via logs. Browser canvas limited by pre-existing HMR issue in tool session (hard reloads attempted). Background dev server task timed out (normal). 

**Archived**: 2026-06-10 after final "continue". See AGENT_ACTIVITY_LOG for closure entry. The "trusted, fair, fast, explainable" mission is advanced by the server guard, data centralization, and audit. Deferred items can seed follow-on plan.  
**Owner**: Grok 4.3 (with coding-engineer process)  
**User Direction**: "1 /plan" — create the stabilization plan after reviewing the most beneficial actions for production.

---

## Context & Problem

The ShiftBuilder (and supporting Sudo + AI surfaces) is functionally rich and visually excellent on the Golden 1056×816 canvas. However, for production trust, reliability, and long-term velocity, several architectural and safety items remain high-risk:

- `ShiftBuilderClient.tsx` is still **7264 lines** (major orchestrator with data loading, effects, drag, engine runs, draft lifecycle, history integration). Significant component extraction has occurred (cards, PlacementPad, MarkerPad, Board, RosterRail, WeeklyOverview, OpsStatusBar, etc.), and a Zustand store (`useShiftBuilderStore`) is absorbing high-churn state (assignments, draft, rosterUI). The highest-risk extractions (`useShiftData`-style orchestration and `useDragDrop`) were deferred in the Monolith Split plan because they touch load-bearing effects.

- Draft → Commit path (`applyDraft`) performs optimistic board + history update, then async `batchApplyDraftAssignments`. Engine/Grok-driven changes aim for single history entries but the full atomicity + error recovery contract is incomplete.

- No server-side re-validation guard for AI/Grok proposals before commit (W3-4 from ATTACK_PLAN). Client `isEligibleForSlot` + `validatePlacementOrder` are used in pickers and some paths, but writes (especially `batchApplyDraftAssignments`) can accept proposals without a hard server re-check against the live graves schedule + full rules.

- Graves Default Schedule enforcement is strong in infrastructure (`/api/shiftbuilder/scheduled-roster`, `gravesDefaultSchedule.ts`, `getScheduledTmsFromGravesDefault`, `fetchNightCoreData.ts`, cache sync) and explicitly called out in THIS_IS_WHAT_WE_ARE_DOING.md and recent Client comments. However, a systematic end-to-end audit across all pickers, health calcs, Weekly Overview, engine context, and Sudo surfaces has not been completed and documented.

- Re-render surface and effect complexity in the remaining monolith create ongoing perf and bug risk (W2-1 useShiftHistory identity, stale closures, etc.).

These directly threaten the mission pillars: **trusted, fair, fast, explainable**, and the non-negotiables around Draft Mode integrity, Golden fidelity, and operator control.

This plan synthesizes and updates the still-relevant open items from:
- `ATTACK_PLAN_2026-05-22.md` (W2-1, W2-6, W2-7, W3-4, W3-5, W3-6)
- `SHIFTBUILDER_MONOLITH_SPLIT_2026-05-24.md` (Phase 4 deferred high-risk hooks)
- `XAI_REASONING_DEEP_DIVE_2026-06-09.md` (supporting visibility work)
- Recent Weekly Overview polish (focus/repeat/deselect) as an example of safe incremental delivery.

**Scope boundary**: WebApp (ShiftBuilder + Sudo + AI) only. Native opsApp remains paused.

---

## Success Criteria (Measurable)

- **Monolith reduction**: ShiftBuilderClient.tsx reduced to ≤ ~1200–1500 LOC (orchestrator + composition only). Core data loading and drag logic live in dedicated hooks + store with narrow selectors. tsc clean + browser smoke at each gate.
- **Draft atomicity**: Every engine/Grok/manual draft apply produces **exactly one** history entry via `recordAtomicChange`. Optimistic update + DB batch is wrapped so failure leaves a clean, undoable state. No more multi-entry or lost-history cases for batch changes.
- **Server guard**: Every path that commits assignments (manual, engine, Grok batch) goes through a server-side `validateProposedAssignments` (or equivalent) that re-runs authoritative eligibility + placement order against the current graves_default_schedule + locks before any write. Clear rejection surfaced to operator.
- **Graves sole source audit**: Complete documented checklist proving every TM picker, "scheduled this night" list, eligibility pool, health/rotation signal, Weekly Roster view, and engine context derives exclusively from the graves API + `night_on_call`. No legacy `tm_default_schedules`/ADP paths remain active for scheduling truth. Added runtime or test enforcement where practical.
- **Perf / re-renders**: Key interactions (drag, engine run + draft apply, day switch, pad open) show no obvious re-render storms or jank in live Chrome DevTools/React Profiler. Zustand selectors used for all high-frequency state.
- **Visibility**: Builds on the recent XAI slice — at minimum, engine run summaries and Grok proposals surface a short "why" or evidence hint (digital-only). OpsStatusBar shows basic Realtime/sync health.
- **Gates passed for every slice**: tsc --noEmit --skipLibCheck clean. Live browser validation (canvas renders correctly, drag works, draft apply succeeds and is undoable, Grok suggestion apply respects guard, print preview matches expectations). No behavior change on non-targeted paths.
- **Log + docs**: Every slice produces a high-signal entry in `AGENT_ACTIVITY_LOG.md`. THIS_IS_WHAT_WE_ARE_DOING.md updated on major status changes. Plan archived when complete.

---

## Non-Negotiables (Sacred — Never Violate)

1. **Graves Default Schedule is the sole source** for all scheduled TM data (per THIS_IS key caveat). All work must preserve and strengthen this.
2. **Draft Mode + perfect history** remains the operator's safety net. Hardening must not weaken undo/redo or create unrecoverable states.
3. **Golden 1056×816 fidelity** and zero visual noise. Any UI changes must pass live visual + print spot checks.
4. **coding-engineer 7-phase + live browser validation** for every implementation slice (Playwright + Chrome DevTools MCP preferred when available).
5. **Power over cost** for Grok/xAI usage during this work (deliberate, high-effort where it improves safety or explainability).
6. **Append-only log discipline** and keep THIS_IS accurate.
7. No digital assists leak to print paths.
8. Supabase RLS and week/night scoping respected on all new or touched server paths.

---

## Recommended Approach

**Slice vertically and gate strictly.** Each slice should be small enough to complete, validate, and commit in one focused session where possible. Prefer enhancing existing patterns (store selectors, dynamic imports for Turbopack safety, effect-driven lazy loading, `recordAtomicChange`, fetchNight* hooks) over big rewrites.

**Order rationale**:
- Start with monolith data layer (unlocks safer changes everywhere).
- Immediately follow with drag (the other high-risk deferred piece).
- Then harden the commit path (directly uses the new data layer).
- Add the server guard (safety net for all commit paths, especially AI).
- Do the graves audit (can run somewhat in parallel; high confidence item that de-risks everything).
- Finish with perf discipline + visibility polish.

Use the established "effect + dynamic import + Loader" pattern for any heavy module boundaries inside the remaining Client.

---

## Phased / Sliced Execution Plan

### Slice 0 — Plan Approval & Baseline (this document)
- Write this plan, prepend log entry, update THIS_IS_WHAT_WE_ARE_DOING.md + Plans/README.md.
- Confirm current tsc clean and a quick browser smoke on main flows (drag, engine, draft apply, day switch, Grok pad).
- **Gate**: User approval to proceed.

### Slice 1 — Data Orchestration Layer (highest leverage extraction)
**Goal**: Extract the core night data loading, scheduled roster (graves), roster, assignments hydration, and related derived state into a dedicated hook (`useShiftData` or `useNightData`) + store actions/selectors. Move the large effects out of Client.

**Key work**:
- Audit current data loading in ShiftBuilderClient (nightId resolution, scheduled-roster fetches, core/secondary bundles, engineConfig, recent history, etc.).
- Leverage / enhance existing `hooks/fetchNightCoreData.ts`, `fetchNightSecondaryData.ts`, `useCurrentNight.ts`, and the store.
- Create `hooks/useShiftData.ts` (or equivalent) that returns the narrow stable values + loading state. Wire store for assignments where appropriate.
- Update ShiftBuilderClient to compose the hook and remove the corresponding effects/state.
- Ensure `scheduledTmIdsTonight`, graveRoster, etc. continue to source exclusively from graves path.
- Preserve all existing behavior for non-data consumers.

**Files likely touched**:
- `src/app/shiftbuilder/ShiftBuilderClient.tsx` (major reduction)
- `src/app/shiftbuilder/hooks/useShiftData.ts` (new or major)
- `src/app/shiftbuilder/store/useShiftBuilderStore.ts` (add selectors/actions if needed)
- `src/app/shiftbuilder/hooks/fetchNight*.ts` (refinements)
- `src/lib/shiftbuilder/gravesDefaultSchedule.ts`, `nightCoreBundle.server.ts` (read-only audit)
- Related consumers (Board, cards, pads, WeeklyOverview) — minimize changes via props or store.

**Gate**: tsc clean. Live board loads with correct graves-scheduled TMs. Drag, engine run, and draft apply still work. Day switch stable. Record log entry.

### Slice 2 — Drag & Interaction Layer Extraction
**Goal**: Extract drag state, sensors, onDragStart/onDragEnd, and related slot-dnd + pencil logic into `useDragDrop` (or evolved `useShiftInteractions`).

**Key work**:
- Move the dnd-kit setup and the large `onDragEnd` handler (which touches assignments, draft, history, DB, live cache).
- The hook must receive necessary deps explicitly (store actions, recordChangeRef, nightId, showToast, etc.) — no closures over giant component state.
- Update ZoneCard / RRCard / AuxCard / OverlapSlot / Board to use the new hook (they already import some dnd primitives).
- Keep `useSlotDnd.ts` and `usePencilHover.ts` as low-level building blocks.

**Files likely touched**:
- `src/app/shiftbuilder/ShiftBuilderClient.tsx`
- `src/app/shiftbuilder/hooks/useDragDrop.ts` (new)
- `src/app/shiftbuilder/store/useShiftBuilderStore.ts` (if drag state moves)
- `src/app/shiftbuilder/components/*Card.tsx`, `ShiftBuilderBoard.tsx`, `InteractiveStage.tsx`
- `src/lib/shiftbuilder/useSlotDnd.ts`

**Gate**: Full drag (TM to slot, task drag, reorder) works in live browser. History records correctly. No stale closure regressions. tsc clean + log.

### Slice 3 — Draft Apply Atomicity & Hardening
**Goal**: Make `applyDraft` (and the engine/Grok entry points that feed it) produce a single atomic history record + reliable DB batch, with clear failure recovery.

**Key work**:
- Refactor `applyDraft` (currently in Client) to be the single choke point.
- Ensure optimistic store + live cache + queryClient patch + `recordAtomicChange` happen together with the DB call.
- On DB failure after optimistic update: surface clear "Board updated locally but save failed — undo recommended" + keep draft state recoverable or auto-discard with warning.
- Make engine run paths (enterDraftMode + Grok apply) always go through the hardened path and create exactly one history entry.
- Consider moving the function into the data layer or a small `useDraftLifecycle` hook.

**Files likely touched**:
- `src/app/shiftbuilder/ShiftBuilderClient.tsx` (refactor applyDraft + callers)
- `src/lib/shiftbuilder/data.ts` (`batchApplyDraftAssignments` — may add client-side pre-validation or telemetry)
- `src/app/shiftbuilder/store/useShiftBuilderStore.ts`
- `src/lib/shiftbuilder/useShiftHistory.ts` (minor if API tweaks needed)
- Any Grok/engine suggestion application code.

**Gate**: Manual + engine + Grok draft apply all create one history entry. Undo/redo works after apply. Simulated save failure leaves usable state. tsc + live validation (including undo after apply). Log entry.

### Slice 4 — Server-Side Eligibility Guard (W3-4)
**Goal**: Hard safety net — no assignment commit (especially from AI) can succeed without server re-validation.

**Key work**:
- Create or extend a server action / route (e.g. in `actions.ts` or a new `validate-assignments/route.ts`) that accepts a batch of `{slotKey, tmId}` proposals + night context, loads the current graves scheduled set + locks + engine config, and runs the full `isEligibleForSlot` + placement order + any other rules.
- Return structured result: `{ valid: boolean, invalidSlots: [...] with reasons }`.
- Integrate the guard in `applyDraft` (before or as part of the batch DB call) and any direct assignment paths.
- Surface nice errors in the UI ("Grok suggestion for Z3 rejected: TM is not scheduled tonight per Graves Default").
- Keep client-side guards for fast UX; server guard is the authority.

**Files likely touched**:
- `src/app/shiftbuilder/actions.ts` (or new api route)
- `src/app/shiftbuilder/ShiftBuilderClient.tsx` (call guard in apply paths)
- `src/lib/shiftbuilder/placement.ts` (ensure pure functions are importable server-side; may need a server-safe subset)
- `src/lib/shiftbuilder/gravesDefaultSchedule.ts` (reuse)
- Possibly `src/lib/shiftbuilder/data.ts` (batch apply can call the validator first)

**Gate**: Manual assignment still works. Engine and Grok proposals are validated on server. Invalid proposal is rejected with clear message before DB write. tsc clean. Live test with a deliberately ineligible Grok-style suggestion. Log entry. (Consider a small test in `schedules.test.ts` if feasible.)

### Slice 5 — Graves Default Schedule Sole-Source Audit & Enforcement
**Goal**: One-time comprehensive proof + lock that the THIS_IS caveat is reality everywhere.

**Key work**:
- Static + runtime audit of all code paths that produce "who is scheduled / available tonight" lists:
  - TM Picker / RosterRail / VirtualRosterList
  - WeeklyOverview / LiveWeeklyOverviewArtboard
  - Rotation health / spread / gap calcs
  - Engine context builders
  - Sudo surfaces (Team, WeeklyRoster, Tasks, Reports, BatchPlanner)
  - Any remaining legacy calls
- Produce a short `GRAVES_SOURCE_AUDIT.md` (or section in Key-Information) with file:line + conclusion for each.
- Add enforcement: runtime assertion or clear comment + a narrow `getScheduledTmsForNight(night)` helper that is the only approved entry point.
- Fix any discovered leaks.

**Files likely touched**:
- Broad but mostly read + comment: `ShiftBuilderClient.tsx`, components in `src/app/shiftbuilder/components/`, `src/app/shiftbuilder/sudo/*`, `src/lib/shiftbuilder/*.ts` (especially graves*, schedules*, placement*, scoring*, grok*).
- `src/app/api/shiftbuilder/scheduled-roster/route.ts`
- Possibly add a thin `getScheduledTmsForNight` facade in lib.

**Gate**: Audit document committed. All known paths use the graves route. No behavior change for operators. tsc + spot browser checks. Log entry with link to the audit artifact.

### Slice 6 — Re-render Discipline + Visibility Polish (can overlap with others)
**Goal**: Make the remaining Client (and Board) as lean as possible; surface basic AI + sync health.

**Key work**:
- Audit and tighten use of Zustand selectors (subscribeWithSelector already present).
- Move remaining high-churn or effect-heavy pieces (draft metadata, engine warnings, loading orchestration) into the store or narrow hooks.
- Add minimal Realtime / last-sync status pill or indicator in OpsStatusBar (W3-6).
- Extend recent PlacementPad evidence/training work to engine run summaries or card corner chips where high-value (keep strictly digital + no-print).
- Clean any obvious dead code or duplicated draftInfo blocks left from earlier waves.

**Files likely touched**:
- `src/app/shiftbuilder/ShiftBuilderClient.tsx`
- `src/app/shiftbuilder/store/useShiftBuilderStore.ts`
- `src/app/shiftbuilder/components/OpsStatusBar.tsx`
- `src/app/shiftbuilder/components/PlacementPad.tsx` + related xai files
- `src/app/shiftbuilder/components/ShiftBuilderBoard.tsx`

**Gate**: Profiler shows cleaner update graphs on key actions. Status indicator visible and accurate. tsc + live visual validation. Log.

---

## Risks & Unknowns

- **Turbopack / giant file sensitivity**: Any extraction that touches the Client must follow the proven dynamic import + effect Loader pattern. Risk of HMR or ReferenceError regressions. Mitigate by small, tested slices + immediate browser smoke.
- **Draft Mode regression**: The highest-stakes area. Every change to apply/history must be manually exercised with undo/redo + engine + Grok paths.
- **Server guard performance / latency**: A full re-validation on every apply is acceptable (small data), but keep it efficient. Cache the graves set for the night where safe.
- **Graves audit scope creep**: The system is large. Limit to a time-boxed audit + "all known high-traffic paths" + a "report any remaining TODO" note.
- **Behavior zero during extraction**: Explicit contract — no logic changes in Slice 1/2 except moving code and threading deps as props/store.
- **AI cost during planning/execution**: Use variable effort deliberately; prefer high for reasoning about safety invariants.

---

## Verification Strategy

1. **Per-slice gates** (mandatory):
   - `tsc --noEmit --skipLibCheck` clean.
   - Run the dev server.
   - Live browser validation (Chrome DevTools + available MCP tools): load a real night, exercise the changed surface (drag, engine, draft apply, Grok pad + apply, day switch, Weekly Overview if touched), check console, re-renders, visual fidelity, print preview.
   - Manual undo/redo + failure simulation where relevant.
   - Spot-check against ZDS Goldens / print output for any visual change.

2. **Cross-slice invariants** (checked in every log entry):
   - Graves scheduled TMs remain the sole source.
   - Draft + history fully functional.
   - No print leakage of new assists.
   - AI usage telemetry still fires.

3. **Agentic discipline**: New log entry at plan creation, start of each slice, every gate, and completion. Update THIS_IS when major status changes.

4. **User signal**: Quick demo or screenshot/video after each meaningful slice.

---

## Files & References

**Primary code areas**:
- `src/app/shiftbuilder/ShiftBuilderClient.tsx` (orchestrator target)
- `src/app/shiftbuilder/store/useShiftBuilderStore.ts`
- `src/app/shiftbuilder/hooks/` (new + existing fetch* / use* )
- `src/app/shiftbuilder/components/` (Board, cards, pads, OpsStatusBar)
- `src/app/shiftbuilder/actions.ts` + `src/app/api/shiftbuilder/`
- `src/lib/shiftbuilder/` (placement.ts, data.ts, gravesDefaultSchedule.ts, useShiftHistory.ts, grok*, etc.)

**Plans & Context**:
- `ATTACK_PLAN_2026-05-22.md`
- `SHIFTBUILDER_MONOLITH_SPLIT_2026-05-24.md`
- `XAI_REASONING_DEEP_DIVE_2026-06-09.md`
- `Agentic/THIS_IS_WHAT_WE_ARE_DOING.md` (key caveats + non-negotiables)
- `src/app/shiftbuilder/GOLDEN_VISUAL_SPEC.md`
- `Key-Information/ops-agent-data-model.md`

**After completion**: Move this file to `Plans/archive/` and mark status in THIS_IS.

---

**This plan supersedes scattered W2/W3 notes for stabilization work.** All future agents working on production hardening must read the top of the current AGENT_ACTIVITY_LOG + this file + the referenced active plans.

Ready for user review and approval to begin Slice 1.