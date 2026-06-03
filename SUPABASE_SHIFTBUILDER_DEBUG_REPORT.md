# Supabase Debugging Report: Main ShiftBuilder Interface (oms_root)

**Date**: 2026-06 (continued from plan)
**Focus**: Thorough static + live analysis of all Supabase connections, queries, realtime, state sync, schema usage, RLS, and architectural gaps in the GRAVE ShiftBuilder (src/app/shiftbuilder + src/lib/shiftbuilder).
**Goal**: Identify as many bugs, inconsistencies, performance issues, and improvement opportunities as possible.
**Methods**: 
- Static: list_dir, read_file (chunked), grep for .from, upsert, realtime, legacy, etc. across oms_root/src and supabase/migrations. Review design docs (OPS_HUB_Phase1_*, Phase1_Data_Migration_Strategy.md, etc.), YOLO-log, Agentic logs.
- Live: Dev server (pnpm dev:network, cleared .next), chrome-devtools MCP (navigate, snapshot, list_console, list_network, evaluate_script), curl for APIs, terminal for direct REST and logs.
- Key observations from browser: Persistent Turbopack HMR "module factory not available" errors for useCommandActions and data.ts related (known in code comments); Service role key warn in dev (bypasses RLS); API calls succeed and return real roster data.

**Note**: Picker/Last N UI redesign requirements (height, scroll, sort, "Last 30 Spread") were explicitly ignored per user direction ("stop the picker things, that was not for you. go back to the supabase debugging").

## Executive Summary of Findings
The ShiftBuilder's Supabase layer is functional for basic ops but has significant technical debt, sync risks, and is completely disconnected from the "Phase 1 Unified Operational Core" (grave_shifts + shift_activities) that is the stated future of the project (per migrations, design docs, YOLO, opsApp, Edge Functions).

**Top Issues**:
1. **Unified Core Disconnect (P0)**: 100% legacy tables (nights, zone_assignments, etc.). No grave_shifts creation, no shift_activities logging from any UI action. The "central append-only log" for agent/Ops Hub is invisible to the main interface. Dual-write planned but not implemented.
2. **Incomplete Realtime (P0)**: Only zone_assignments subscribed in liveCache. Breaks (critical for pills/UI) have no realtime, leading to staleness. Legacy channels in data.ts + Client for other tables (dupe, leaks).
3. **Break Dual-Table Sync (P0)**: zone_assignments.break_group vs break_assignments. Manual dual-writes in multiple places (push, cycle, defaults) without tx. Realtime doesn't carry break info (preserves from local). Recent June "fixes" are bandaids.
4. **Dev vs Prod RLS Mismatch (P1)**: Dev uses service role (bypass, per supabase.ts warn and console). Prod uses anon + 20260530 broad policies. RLS bugs masked in dev.
5. **Side-Effecting Reads + Legacy Normalization (P1)**: getNightAssignments does DB UPDATEs for legacy keys on *every* load. Scattered passthroughs in slot-keys.
6. **Roster Complexity + Fragility (P1)**: Multi-source (night_tm_status, groups, defaults, oncall, fallbacks, API). Empty scheduled common. Affects eligibility, picker, onSchedule.
7. **Mixed Optimistic/Persist Paths (P1)**: In Client (onDragEnd, setBreak etc.): local state, store patch, query, live, legacy persist, background direct. Risk double writes, races on nightId.
8. **No Activity Logging from Main UI**: Despite Edge Function and design for it, no calls from data.ts or Client on assignments, breaks, tasks, notes, engine.
9. **HMR/Turbopack Fragility Affecting Data Layer**: Giant Client + dynamic imports for data (to "shrink HMR surface") cause persistent module factory errors. Affects loading the supabase code paths.
10. **Broad RLS + No Transactions**: Anon FOR ALL on critical tables. Multi-step writes (push, create night, dual breaks) not transactional.

Live verification confirmed: API roster calls work (server supabase exercised, returned real classified TMs with gravePool/gender); service role warn in browser; no network supabase calls in errored main page (HMR blocked mount); dev preview loads (mock).

Many "opportunities" are latent because of recent patches and dev service bypass.

## Detailed Categorized Opportunities (with file:line, repro, impact, fix)

### P0 - Correctness / Data Integrity
- **Unified Core Not Adopted (Critical Architectural Gap)**
  - Files: src/lib/shiftbuilder/data.ts (getOrCreateNightForDate ~402 inserts only "nights"; upsertZoneAssignment ~782 only zone_assignments; no shift_activities anywhere); all other data/schedules/sudo/engine files; no calls to record-shift-activity Edge.
  - Migrations/Docs: 20260525_100000_phase1_unified_core.sql (grave_shifts, shift_activities as "heart"); Phase1_Data_Migration_Strategy.md (dual-write in data.ts planned); YOLO-log (silent execution for dual); OPS_HUB design (new code prefers unified).
  - Repro: Grep shows 0 references to grave_shifts/shift_activities in src; curl API or evaluate returns legacy-shaped data; create night in UI doesn't create grave_shifts row.
  - Impact: Main UI actions invisible to agent memory, Ops Hub, audits. Future cutover will break or require massive retro. Inconsistent with opsApp and Edge.
  - Fix: Implement recordActivity helper in data.ts (dual write to legacy + shift_activities via Edge or direct). Update getOrCreate to also handle grave_shifts (with fallback). Log all mutations (assign, break cycle, task, note, engine proposal/apply). Adopt v1_ops_context for reads where possible. Update plan/Agentic.

- **Break Group Dual Source + No Atomicity**
  - Files: data.ts updateSlotBreakGroup ~617 (zone upsert), pushBreakDefaultsToNight ~3389-3402 (both upsertBreak + updateSlot), setBreakGroupForSlot in Client ~2540 (both), getNightBreakAssignments ~1798 (separate query); liveCache handle ~292 (preserves breakGroup from prev, no payload).
  - Repro: Cycle break on card (updates local/store + DB both); Sudo Defaults push (both); concurrent or failure can desync. Realtime (zone only) doesn't update break pills.
  - Impact: BreakBadge vs break sheet/print diverge. "–" vs number wrong. June fixes (enrich in useCurrentNight ~79, onDataChanged patch, push sync) are reactive bandaids.
  - Fix: Pick canonical (e.g. break_assignments as source, zone as derived or vice versa). Remove dual writes. Add DB trigger or RPC for sync. Implement break_assignments realtime sub in liveCache (parallel to zone). Invalidate secondary query or use live for breaks.

- **NightId Capture Races + Mixed Persist in Drags/Edits**
  - Files: Client.tsx onDragEnd ~4248 (store patch + background upsertZone + legacy persistAssign block still executes per code); setBreakGroupForSlot ~2530 (async with resolveNightIdForDate); many captureDate + resolve.
  - Repro: Rapid day switch during drag or edit; multi-tab; see comments "wrong day got written", "capture at action time".
  - Impact: Writes to wrong night (data corruption for that sheet).
  - Fix: Centralize all persists through a single "withCapturedNight" helper that resolves once and passes nid. Remove legacy blocks. Use live layer consistently for optimistic.

### P1 - Consistency / Sync / Realtime
- **Realtime Coverage Incomplete (Breaks, Tasks, etc.)**
  - Files: liveCache.ts initLiveCacheForNight ~166 (only zone_assignments .on); comment 180 "Future..."; no break sub; handleAssignmentChange only for zone; Client has legacy channels for night_tm_status/calloffs/defaults/oncall (global, dupe with liveCache).
  - Repro: Update break in tab A; tab B sees stale until reload or Sudo hack. No sub for night_slot_tasks, card borders.
  - Impact: Stale UI for breaks (pills), tasks, borders. Relies on poll/invalidate/manual patches.
  - Fix: Add break_assignments, night_slot_tasks, night_card_borders subs in liveCache (handle payloads, patch query/store). Unify channel management (deprecate legacy or merge). Surface connectionStatus in OpsStatusBar.

- **Roster/Scheduled Data Multi-Source Fragility**
  - Files: schedules.ts getScheduledTmsForNight (service or anon fallback to tm_on_call, tm_default, tm_groups + pattern match + group membership); data.ts getOnScheduleTmIdsForNight (night_tm_status + tomorrow AM + week scan fallback); useCurrentNight + API; getGrave* from profiles.
  - Repro: Empty scheduled common (code warns "service role key missing"); picker shows wrong eligible; onSchedule flags disagree with gravePool.
  - Impact: Wrong roster in rail, eligibility (isEligible uses flags from roster), "isOnSchedule", matrix.
  - Fix: Make one canonical (e.g. always use the API/schedules logic or tm_groups). Add realtime for tm_* changes (already some channels). Cache better. Unify flags in roster load.

- **State Layers Fighting (Query vs Live vs Store vs Local vs Draft)**
  - Files: useCurrentNight (core/secondary query), liveCache (patch query + liveStore + mainStore), Client (local assignments for history, effective* bridges), useShiftBuilderStore, draft in history.
  - Repro: See many "prefer modern source" comments; June fixes for break patch in onDataChanged; drag bypass of live.
  - Impact: Inconsistent views, lost updates, need for hacks.
  - Fix: Make live layer the single source for committed assignments (with query as cache). Strict contract for draft overlay. Remove local state where possible.

### P2 - Performance / Query Efficiency
- **Side Effects + Legacy on Every Load**
  - File: data.ts getNightAssignments ~551 (legacy row detection + batch UPDATE to canonical keys on load).
  - Impact: Every day switch/refetch does writes. Risk conflicts, extra latency.
  - Fix: One-time migration script/job. Remove from load path.

- **N+1 / Separate Enrichments**
  - Name enrichment after assignments load (batched but extra roundtrip); break enrichment in secondary; roster API separate.
  - Opportunity: Views or joins in v_current or new RPCs. Preload more.

- **HMR Affecting Data Layer Loads**
  - The dynamic import for data.ts (to avoid factory errors) is itself fragile (see errors for useCommandActions, data related).
  - Opportunity: Further carve the Client (finish monolith split per plan). Use React Server Components for more data if possible.

### P3 - DX / Maintainability
- Scattered normalization (slot-keys.ts, getNight*, persist paths, uiToDb in drags).
- 40 useEffects, giant Client with many dynamic imports for "shrink HMR".
- Console in hot paths, any types, debug window vars.
- Dupe channel code (freshChannel in liveCache and data.ts).

### P4 - Schema / RLS / Ops
- Broad anon FOR ALL policies (20260530 migration) - necessary for current client but risky.
- No tx for multi writes (night create + seeds, dual breaks, push).
- Unified views exist (v_current_assignments corrected in several migrations) but underused (main paths legacy; getUnified has fallback).
- Roster tables (tm_groups etc recent 20260603) with service policies; anon fallback in schedules.
- New grave_shifts RLS is service + authenticated read (not anon?); may affect transition.

### P5 - Future
- No integration with shift_activities for agent context (grokEngine etc still on legacy snapshots).
- Dual model will cause pain for opsApp parity if not addressed.
- Add proper auth + tighten RLS.

## Live Verification Performed
- Dev server restart (rm .next) + reloads: Persistent HMR errors (useCommandActions, data related) - confirms known Turbopack pain with Client size/dynamic imports. Service role warn logged in browser (confirms dev bypass).
- API calls (curl + evaluate fetch to /api/shiftbuilder/scheduled-roster?date=2026-06-05): Success, returned real classified roster (fullGrave, AM overlaps with correct gravePool/gender from Supabase). Exercised schedules.ts + internal supabase (service path).
- Dev preview page (/shiftbuilder/dev/phase1-preview): Loaded (decomposed cards, mock data, provenance). No supabase calls (mock), but shows alternative architecture avoiding giant Client.
- Network list (xhr/fetch): Limited due to error page (mostly API calls when triggered via evaluate). No direct client supabase REST visible (bundled or errored before mount).
- Console: Service role warn (multiple), module factory errors with stack pointing to Client evaluation requiring dynamic things.
- No shift_activities or grave_shifts rows created/queried in any exercised path (confirmed via code + lack of in responses).

## Recommended Immediate Surgical Fixes (Post Debug)
1. Implement recordShiftActivity helper in data.ts (use the Edge Function). Call on night create, every upsertZone, break update, task change, note save. (Dual for now.)
2. Update getOrCreateNightForDate to also create/ensure grave_shifts row (with id mapping or use same id if possible).
3. Add break_assignments listener in liveCache (copy zone pattern, handle for breakGroup updates to store/query).
4. Remove legacy key UPDATE loop from getNightAssignments (or make optional behind flag). Run one-time migration.
5. In dev, force anon key (comment service) to test RLS like prod.
6. Wrap dual break writes in a single RPC or note the risk + add validation query.
7. Adopt v_current_assignments or create RPC for getNightAssignments in main path (reduce fragmentation).
8. Centralize nightId resolution + persist in one helper to kill races.
9. Add indexes on frequent query patterns (e.g. zone_assignments night_id + slot).
10. Update Agentic/THIS_IS and plans with these gaps as P0 for Phase 1 completion.

## Verification for Fixes
- Re-run API + client queries (via evaluate or curl) pre/post.
- Playwright flows: day switch (check no extra writes in legacy normalize), drag/break cycle (check realtime updates in 2nd tab if added, no desync), Sudo push.
- Hard reloads, check no HMR regression (or note as separate).
- Post-fix: grep for grave_shifts/shift_activities in src >0; test that activity logged on assign.
- tsc clean; no new console errors in flows.
- If possible, use Supabase MCP (when auth) to query new tables during flows.

## Conclusion
The Supabase connections are the backbone but the layer is "evolutionary" and lagging the "revolutionary" unified core vision. Fixing the gaps (especially unified adoption, realtime completeness, break sync, dev/prod parity) will make the interface more reliable, observable, and future-proof for agents/Ops Hub/opsApp.

Report compiled from plan execution. Next: implement P0 surgicals under coding-engineer discipline + update Agentic log.

(End of report. More details in the approved plan file.)

## Additional Live/Debug Server Insights (from continued execution)
- Dev server log (after clean restart): Repeated [createAdminClient] Env check showing consistent fallback to NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY (hasServiceRoleKey: false, hasNextPublic: true, usingFallback: true). This happens on every API call to scheduled-roster (used by useCurrentNight hook for roster data in the board).
- The scheduled-roster API is called even when main UI errors (from dev preview interactions or direct).
- Browser console consistently logs the service role warn on /shiftbuilder loads: "Using SERVICE ROLE key in browser (dev only). This bypasses ALL RLS."
- Custom Cache-Control warning for /_next/static/:path* on startup: "Setting a custom Cache-Control header can break Next.js development behavior." This is explicitly called out in the Turbopack HMR error message as a cause for the "module factory not available" errors affecting chunks that include the data/supabase code.
- Middleware deprecation warning: "The 'middleware' file convention is deprecated. Please use 'proxy' instead."
- Persistent HMR errors block full client-side execution of ShiftBuilderClient (which dynamically imports data.ts for supabase calls in many handlers). This makes live client-side Supabase debugging (e.g., direct queries, realtime subs in browser) difficult without workarounds like hard reloads (which don't always clear the Turbopack state in this setup).
- No direct supabase.co/rest or realtime WS calls visible in browser network for main flows (because component doesn't mount due to error); server-side via API is the exercised path.
- The createAdminClientSafe in /src/app/api/admin/_lib/createAdminClient.ts explicitly supports the public fallback for Railway/dev convenience, logging the env state every time. This is used by scheduled-roster (and other admin routes like tm-roster, graves default schedule).

## Clean Dev Server Restart + Main-Page Flow Trigger (2026-06-03 continuation)
**Executed per explicit focus**: "bruh all of this is supposed to be in the main shiftbuilder page at /briankillian/oms_root" + "continue your supabase debugging".

- Clean: killed prior next pids, `rm -rf oms_root/.next`, `pnpm dev:network` (bg + tee to /tmp/oms-dev.log). Fresh Turbopack compile.
- Triggered exact main-page scheduled-roster (the one in useCurrentNight coreQuery + channel refresh effects + several Client effects): 
  - `curl .../scheduled-roster?date=2026-06-03`
  - `curl .../scheduled-roster?date=2026-06-03&night_id=7ac3c58d-ffbf-4098-af39-9b461a13245f` (the nightId returned by getNightIdForDate + passed by hook when present)
- Response shape (parsed): 
  {
    "date": "2026-06-03",
    "nightId": "7ac3c58d-ffbf-4098-af39-9b461a13245f",
    "counts": { "all": 21, "fullGrave": 14, "pm": 0, "am": 7 },
    "first3_all": [ {id, tmId:"tm_amanda", name:"Amanda", gravePool:"Full", gender:"F"}, ... ],
    "has_scheduledWithRoles": true
  }
  This is exactly what the hook consumes, partitions into fullGraveScheduledTonight etc Sets (via tmId fallback), enriches realRoster/graveRoster with isFullGraveTonight etc flags, and exposes as effective* in Client for board/rail/picker eligibility. Then syncs assignments subset to Zustand.
- Dev log greps (multiple after triggers): 
  - Repeated `[createAdminClient] Env check { railwayEnvironment: 'unknown', nodeEnv: 'development', hasServiceRoleKey: false, hasNextPublicServiceRoleKey: true, usingFallbackNextPublic: true }` — fires on *every* scheduled-roster (and graves-default-schedule) hit. Server path always uses fallback.
  - `[browser] [oms-supabase] ⚠️ WARNING: Using SERVICE ROLE key in browser (dev only)... (src/lib/supabase.ts:74:19)` — on every /shiftbuilder GET (page shell + dynamic Client load attempt).
  - GET /api/shiftbuilder/scheduled-roster?... 200s logged with the env checks.
  - No `[SUPABASE DEBUG - main page] useCurrentNight coreQuery running...` or `getNightAssignments called` appeared in this run — because the dynamic import inside queryFn (and thus all client .from in data.ts) never executes.
- HMR block confirmed live: "Uncaught Error: Module .../useCommandActions.tsx ... was instantiated because it was required from .../ShiftBuilderClient.tsx ... but the module factory is not available." Stack points to evaluation of the dynamic Client import in page.tsx. Even with all the "shrink static HMR surface" dynamics (data, LazyCommandPalette wrapper, grokEngine etc), the useCommandActions dep chain still poisons Client module eval. Thus browser client Supabase (getSupabaseClient -> service role -> .from zone_assignments/tm_profiles etc + realtime) + the new debug logs + useCurrentNight queryFn never run for the *main* /shiftbuilder route.
- Other observed in main flow attempts: many POST /api/shiftbuilder/{placement-histories,engine-insight} 500 (likely auto-calls from launchpad/status/AI surfaces that render before/around the crashing Client; engineInsightForPlacement etc failing, not core to roster but pollutes logs during main page loads).
- Dupe roster API calls still present: channel onChange handlers in Client (for night_tm_status, tm_default_schedules, onCall) do their own fetch + setScheduledTmIdsTonight, while hook already provides canonical via currentNight. Inconsistent with "Phase 3.1 unification bridge" comments.
- Confirmation that "all of this" (gravesDefaultSchedule canonical roster + scheduled-roster API + useCurrentNight TanStack + debug logs + effective* bridges + liveCache wiring) **is wired into the main path**: page.tsx -> dynamic ShiftBuilderClient -> useCurrentNight(selectedDay) -> dynamic data + fetch to /api/... -> createAdminClientSafe + getScheduledTmsFromGravesDefault (graves_default_schedule + night_on_call). The dev/phase1-preview remains isolated mock demo (no Supabase).
- No client-side direct supabase REST/WS for assignments etc visible (HMR prevents). Server roster + any legacy Client effects that partially run are the exercised main-page Supabase surfaces.

**New opportunities surfaced / reinforced**:
- P0: HMR instability is now a *data layer correctness* issue — blocks the very debug logs and client queries added to useCurrentNight for main-page visibility. Must resolve useCommandActions isolation or split further before full client Supabase can be live-debugged/verified on main route.
- P1: Always-fallback in createAdminClientSafe + NEXT_PUBLIC service in .env means *no way* to exercise real anon/RLS paths in dev for the roster (or other server admin). The "safe" path always bypasses. (See also browser side always service.)
- P2: Dupe fetches + set local state for scheduled while hook owns it — can cause flicker or stale effectiveScheduledTmIdsTonight during channel events.
- P3: The 500 spam on insight APIs during failed main page load indicates surfaces outside the main canvas still fire privileged calls unconditionally.
- Still 0 unified core usage in any main page exercised path (roster now on graves_* tables which is good progress, but assignments/activities still pure legacy).

This run directly exercised only the main page's declared Supabase connections (no dev previews, no picker UI work).

These reinforce the supabase-specific opportunities:
- Dev/prod parity for RLS testing is broken by the service fallback in both browser (lib/supabase.ts) and server admin client.
- HMR/Cache issues are a barrier to testing the client supabase layer (the one that would use anon in prod).
- The admin client logging is helpful for debugging but the fallback means "service" key is effectively public in this setup.
- Recommendation: In the report's P4, emphasize making the non-public key mandatory in dev too (remove or warn on NEXT_PUBLIC_SERVICE fallback), and fix the Cache-Control for static to help HMR for data layer testing.

This continues the supabase debugging by highlighting how the env and build setup directly impact the reliability and observability of Supabase connections in the ShiftBuilder.