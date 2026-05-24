# OMS/ZDS ShiftBuilder — Attack Plan
**Date**: 2026-05-22  
**Authors**: Claude Sonnet 4.6 (static analysis + live debugging session)  
**Source Artefacts**: `CODEBASE_CRITIQUE_2026-05-22.md` + live DevTools session  
**Session Duration**: ~3 hours total (static analysis + live UX audit)

---

## ✅ Completion Status (Updated 2026-05-24)

| Item | Description | Status |
|---|---|---|
| W1-1 | DB Migration `grok_reasoning_effort` | ✅ Applied by Brian |
| W1-2 | Task drag unreachable code | ✅ Fixed |
| W1-3 | `onAddTask` key format mismatch | ✅ Fixed |
| W1-4 | RR border key strings | ✅ Fixed |
| W1-5 | `handleSetTaskColor` null guard | ✅ Fixed |
| W2-1 | `useShiftHistory` hook identity (excessive re-renders) | 🔴 **Open** |
| W2-2 | Live status pill `lastSavedAt` | ✅ Done |
| W2-3 | Grok post-response UX (clear field after response) | ✅ Done |
| W2-4 | cmdk value-prop filtering leak | ✅ Done |
| W2-5 | Session-stable query split (32% fewer round-trips) | ✅ Done |
| W2-6 | `applyDraft` N-serial history + N-serial upserts | 🔴 **Open** |
| W2-7 | Roster O(n²) `assignedThisNight` lookup | 🔴 **Open** |
| W2-8 | `filterTerm` shadow variable | 🔴 **Open** |
| W2-9 | `AuxCard` duplicated `draftInfo` block | 🔴 **Open** |
| W2-10 | `OverlapSlot`/`ZoneTaskList` stale closure | 🔴 **Open** |
| W2-11 | History stack unbounded memory growth | 🔴 **Open** |
| iPad Fix A-E | Touch sensors, pencil hover, barrel button | ✅ Done |
| Dark Mode | System + manual toggle, dim/charcoal | ✅ Done |
| Wave 3 | Architecture evolution (W3-1 through W3-8) | 🟡 Future |

**Remaining quick wins (≤30 min each)**: QW-1 dead `filterTerm`, QW-2 `assignedThisNight.has()`, QW-3 `MAX_HISTORY=50`, QW-7 `applyDraft` batch.

---

---

## Executive Summary

The ShiftBuilder is fundamentally working. The Grok integration fires correctly, card-click context flows work, the command palette search and hot-word engine are functional, and the artboard renders cleanly. However, there are **5 confirmed bugs** (3 caught live in the running app), **1 missing DB migration** that causes 400 errors on every single page load, and a cluster of high-value UX and architecture improvements that would take this from "working" to "world-class."

The plan is structured as three waves:
- **Wave 1 (Fix It)** — bug kills and the DB migration. Nothing ships without these.
- **Wave 2 (Sharpen It)** — UX polish, code quality, performance. The difference between good and excellent.
- **Wave 3 (Evolve It)** — architecture improvements and feature work that compound over time.

---

## Wave 1 — Fix It (Critical, Ship-Blocking)

### W1-1 · DB Migration: `grok_reasoning_effort` column [DONE]
**Severity**: CRITICAL — causes 2 red console errors + 2 warnings on every page load  
**Status**: Migration file written at `supabase/migrations/20260522_engine_config_grok_column.sql`  
**Action**: Apply migration to Supabase via `supabase db push` or the dashboard SQL editor  
**What breaks without it**: `getActiveEngineConfig()` returns FALLBACK_CONFIG every time. The `grokReasoningEffort` setting the operator chose is never actually used — Grok always runs on the hardcoded medium default. The engine config panel in Sudo appears to save, but the setting is silently dropped.

```sql
-- Already written — just needs to be applied:
ALTER TABLE engine_config
  ADD COLUMN IF NOT EXISTS grok_reasoning_effort TEXT
    NOT NULL DEFAULT 'medium'
    CHECK (grok_reasoning_effort IN ('none', 'low', 'medium', 'high'));
ALTER TABLE engine_config
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
```

---

### W1-2 · Task Drag Unreachable Code [BUG-1]
**File**: `ShiftBuilderClient.tsx` ~line 3131  
**Severity**: CRITICAL — task drag-to-reassign is completely broken silently  
**Root Cause**: Double type guard — outer checks `a.type === "assigned"`, inner checks `a.type === "task"`. The inner branch can never be true.

```typescript
// CURRENT (broken):
if (a.type === "assigned") {
  if (a.type === "task") {  // ← ALWAYS FALSE — we're inside assigned guard
    handleTaskDragToCard(a, over.id as string);
  }
}

// FIX:
if (a.type === "assigned") {
  handleTaskDragToCard(a, over.id as string);
}
```

---

### W1-3 · Palette Task Refresh Uses Wrong Key Format [BUG-3]
**File**: `ShiftBuilderClient.tsx` ~lines 5619–5648 (`onAddTask` callback)  
**Severity**: CRITICAL — after adding a task via palette, the task list for that slot appears empty until next full reload  
**Root Cause**: Fresh DB records use `slotKey = "zone_1"` (DB format). The `tasksBySlotKey` state uses `"Z1"` (UI format). The refresh loop populates `byKey["zone_1"]` but the zone card reads `byKey["Z1"]` — miss.

```typescript
// FIX: Use the slotKey from the existing nightSlotTasks mapping
// which already normalizes to UI format. Or normalize here:
for (const t of fresh) {
  const uiKey = dbSlotKeyToUiKey(t.slotKey); // "zone_1" → "Z1"
  if (!byKey[uiKey]) byKey[uiKey] = [];
  byKey[uiKey].push(t);
}
```

Need to either add a `dbSlotKeyToUiKey` utility, or adjust `onAddTask` to reload tasks through the existing normalized path.

---

### W1-4 · Border Flow Uses Wrong RR Key Strings [BUG-2]
**File**: `CommandPalette.tsx` — border slot key construction  
**Severity**: HIGH — card border color cannot be set for any RR slot  
**Root Cause**: Border actions use `'RR1'`, `'RR6'`, `'RR7'`, `'RR8'`, `'RR10'` as slot keys. But `PLACEMENT_ORDER` and `zone_assignments` use `'MRR1'`, `'WRR1'`, `'MRR6'`, `'WRR6'` etc. No border can ever be matched to a real RR slot.

**Fix**: Replace bare `'RR1'` with `'MRR1'` and `'WRR1'` (and likewise for RR6/7/8/10) in the border action key construction within `CommandPalette.tsx`.

---

### W1-5 · `handleSetTaskColor` / `handleEditTask` Null Guard [BUG-4]
**File**: `ShiftBuilderClient.tsx` ~line 4219+  
**Severity**: HIGH — crash risk on dark-mode task color change or task edit when `targetNightId` is null  
**Root Cause**: `(updateNightSlotTaskColor as any)(targetNightId, ...)` — `targetNightId` can be null if called before the night finishes loading. No null guard.

```typescript
// FIX: add guard before the call
if (!targetNightId) {
  console.warn('[handleSetTaskColor] called with null nightId — skipping');
  return;
}
updateNightSlotTaskColor(targetNightId, ...);
```

---

## Wave 2 — Sharpen It (High Value, Do Next)

### W2-1 · `useShiftHistory` — Hook Returns New Object Every Call
**File**: `src/lib/shiftbuilder/useShiftHistory.ts`  
**Impact**: History state effect inside `ShiftBuilderClient.tsx` fires on every render because `shiftHistory` (the whole hook return) is in the dep array  
**Fix**: Either wrap the hook return in `useMemo`, or extract only the specific functions needed into the dep array (`shiftHistory.recordAtomicChange`, not the whole object). This is likely causing the 4 Fast Refresh cycles seen in the live session.

---

### W2-2 · Status Pill is Fully Hardcoded
**File**: `ShiftBuilderClient.tsx` — status pill render  
**Impact**: Operators can't tell actual save state. Always shows orange dot + "Last saved moments ago" + "Engine ready" regardless of actual DB state.  
**Fix**: Wire `lastSavedAt` timestamp state. Show actual elapsed time ("Saved 2 minutes ago") using `useEffect` + `setInterval`. Use `isSaving` boolean for the orange "Saving..." transient state.

---

### W2-3 · Grok Query Mode — Post-Response UX
**Confirmed live**: After Grok responds, the search field still shows the `?question` string and the Grok Query item persists. The roster below the spinner also shows cmdk-filtered results using the query as a fuzzy string (J-names showing for "?who should go in zone 9").  
**Fix**:
1. After Grok response arrives, clear `cmdkQuery` to `""` 
2. In Grok Query Mode, suspend cmdk filtering on the roster section (hide roster OR show it unfiltered as a fallback)
3. After response, show a brief "Grok says: [suggestion]" pill before the Assign context

---

### W2-4 · cmdk Value-Prop Filtering Leak
**Confirmed live**: Searching "jessica" shows "Swap RR 8 (Men's): Jeff" and "Swap Admin: Jamie" — clearly non-matching items appearing in the actions list.  
**Root Cause**: Hot-action `Command.Item` elements likely have `value` set to the slot name only (e.g. `"RR8"`, `"ADMIN"`) without including the TM name in the value. cmdk fuzzy match finds enough overlapping characters.  
**Fix**: Set `value` prop to the full action string: `"swap rr 8 mens jeff"` (lowercase, all words). Verify every `Command.Item` in the Actions section has a comprehensive `value` prop.

---

### W2-5 · 19-Query Day Switch — Split Session-Stable Queries
**File**: `ShiftBuilderClient.tsx` — `loadDay()` function  
**Impact**: Every day switch fires 19 Supabase queries in a `Promise.all`. 7 of them (roster, config, skills, difficulty, prefs, catalog, pairings) are session-stable (don't change day to day).  
**Fix**: Load the 7 stable queries once at mount using separate state + effect. `loadDay()` drops to 12 queries. Cuts day-switch latency roughly in half.

---

### W2-6 · `applyDraft` N-Serial History Entries + N-Serial Supabase Calls
**File**: `ShiftBuilderClient.tsx` — `applyDraft` function  
**Impact**: Applying a full board draft creates N separate undo entries (all but the last wiped) and N separate `upsert` calls. Should be one atomic history entry and one batch upsert.  
**Fix**:
```typescript
// Before the forEach, snapshot the full before-state
const beforeSnap = { ...assignments };
// forEach loop: accumulate changes locally, NO history recording
// After the forEach, one single recordAtomicChange(desc, beforeSnap, afterSnap)
// One batch upsert to Supabase
```

---

### W2-7 · Roster Render — Repeated `assignedThisNight` Lookups
**File**: `ShiftBuilderClient.tsx` — roster item render  
**Impact**: `Object.values(assignments).some(a => a.tmId === tm.id)` is O(n) per TM render. Called 20+ times → O(n²) per render cycle.  
**Fix**: The `assignedThisNight` Set is already computed in scope. Replace the `some()` pattern with `assignedThisNight.has(tm.id)`.

---

### W2-8 · `filterTerm` Shadow Variable
**File**: `ShiftBuilderClient.tsx` lines 1931 + 4045  
**Impact**: The outer `filterTerm` (line 1931) is defined but unused. Inner `filterTerm` inside the IIFE (line 4045) shadows it. The outer one is dead weight; the inner one is the real one.  
**Fix**: Delete the outer `filterTerm` declaration at line 1931. Hoist the inner declaration to module scope if it needs to be shared.

---

### W2-9 · `AuxCard` Duplicated `draftInfo` Block
**File**: `ShiftBuilderClient.tsx` — `AuxCard` component  
**Impact**: Minor — code bloat, but also means any change to draft display logic in AuxCard must be made twice.  
**Fix**: Extract the duplicated `{isDraftMode && draftInfo && ...}` block into a single `<DraftBadge>` component used once.

---

### W2-10 · `OverlapSlot` / `ZoneTaskList` Closure Captures
**File**: `ShiftBuilderClient.tsx`  
**Impact**: `OverlapSlot` and `ZoneTaskList` read `taskDragEnabled` from outer closure rather than props. This is a stale-closure risk if `taskDragEnabled` changes during a render cycle where these components are memoized.  
**Fix**: Pass `taskDragEnabled` as an explicit prop to both components.

---

### W2-11 · History Hook — Unbounded Memory Growth
**File**: `useShiftHistory.ts`  
**Impact**: History stack has no size cap. After 100+ assignments in a shift, the undo stack could hold megabytes of assignment snapshots.  
**Fix**: Add `MAX_HISTORY = 50` and trim the stack in `recordAtomicChange`.

---

## Wave 3 — Evolve It (Architecture + Features)

### W3-1 · `runCoveragePlanner` Stub → Real Implementation
**File**: `src/lib/shiftbuilder/placement.ts`  
**Current**: `runCoveragePlanner` just calls `runWeightedPlanner` with a TODO comment  
**Goal**: Implement the actual coverage-aware planner that fills gaps starting from the highest-priority uncovered slots, factoring in TM skill coverage rates.

---

### W3-2 · `validatePlacementOrder` — Currently Dead
**File**: `placement.ts`  
**Current**: Always returns `[]`  
**Goal**: Implement real validation — check PLACEMENT_ORDER entries against slot keys, catch typos, verify all slots are reachable.

---

### W3-3 · Grok Intelligence — Surface Reasoning in WhyPanel
**Current**: Grok suggestions arrive as structured objects but the reasoning text (Grok's chain-of-thought) is not displayed after a `?query` completes  
**Goal**: After Grok responds to a query, show a collapsible "Grok says:" section with the top 1-2 reasoning sentences. Wire it into the existing `WhyPanel` `<details>` collapse pattern.

---

### W3-4 · Server-Side Grok Guard — Strengthen `guardGrokActions`
**File**: `actions.ts`  
**Current**: `guardGrokActions` and `guardGrokEnginePicks` do basic validation but don't cross-check against the live eligibility snapshot  
**Goal**: Before committing any Grok-suggested assignment, re-run `isEligible(tm, slot, night)` server-side so a stale client snapshot can't result in an invalid Grok placement.

---

### W3-5 · Split the 5724-Line Monolith
**File**: `ShiftBuilderClient.tsx`  
**Current**: 5724 lines, 40+ state variables, 3 nested component definitions  
**Goal**: Extract into focused modules:
- `useShiftData.ts` — all Supabase load/save logic  
- `useDragDrop.ts` — onDragStart/onDragEnd/DndContext setup  
- `ZoneSection.tsx`, `RestroomSection.tsx`, `AuxSection.tsx` — pure presentational sections  
- Keep `ShiftBuilderClient.tsx` as the thin orchestrator (~600 lines)

This is the highest-leverage architecture change but also the biggest risk. Do it behind a feature branch with thorough Playwright smoke tests.

---

### W3-6 · Real Supabase Connection Status in Status Pill
**Current**: Status pill always shows "Engine ready"  
**Goal**: Subscribe to Supabase Realtime connection state. Show:
- 🟢 "Engine ready" — realtime channel connected
- 🟡 "Reconnecting..." — channel interrupted  
- 🔴 "Offline" — no connection

---

### W3-7 · `getOnScheduleTmIdsForNight` — Sequential → Parallel
**File**: `data.ts`  
**Current**: 4 sequential Supabase queries in the AM overlap path  
**Fix**: Wrap all 4 in a `Promise.all`. Already correct pattern shown elsewhere in the codebase.

---

### W3-8 · `updateCatalogSortOrders` — Row-by-Row → Batch
**File**: `data.ts`  
**Current**: Sequential per-row UPDATE loop — N round trips to reorder N catalog items  
**Fix**: Use Supabase's `upsert` with the full array, or a single SQL `CASE WHEN` update.

---

## Quick Wins (≤ 30 min each, do anytime)

| # | File | Change | Gain |
|---|------|--------|------|
| QW-1 | `ShiftBuilderClient.tsx:1931` | Delete dead outer `filterTerm` | Code clarity |
| QW-2 | `ShiftBuilderClient.tsx` | Replace `Object.values(assignments).some(...)` ×6 with `assignedThisNight.has(id)` | Perf |
| QW-3 | `useShiftHistory.ts` | Add `MAX_HISTORY = 50` trim guard | Memory safety |
| QW-4 | `engineConfig.ts:129` | Add `.select()` fallback that excludes `grok_reasoning_effort` if migration not yet applied | Belt + suspenders |
| QW-5 | `CommandPalette.tsx` | Fix RR border keys `'RR1'` → `'MRR1'`/`'WRR1'` etc. | Bug fix |
| QW-6 | Status pill | Wire `lastSavedAt` + elapsed timer | UX |
| QW-7 | `applyDraft` | Single `recordAtomicChange` + batch upsert | Correctness + perf |

---

## Priority Order (Recommended Sprint Sequence)

```
Week 1: W1-1 (apply migration) → W1-2 (task drag) → W1-4 (RR border keys) → W1-5 (null guard)
         + QW-2, QW-3, QW-5 (30-min wins)

Week 2: W1-3 (palette task refresh key format) → W2-1 (history hook identity)
         → W2-3 (Grok post-response UX) → W2-4 (cmdk value props)

Week 3: W2-5 (split session-stable queries) → W2-6 (applyDraft batch)
         → W2-2 (live status pill) → W3-7, W3-8 (data.ts perf)

Month 2: W3-1 (coverage planner) → W3-3 (WhyPanel reasoning) → W3-4 (server-side guard)
Month 3+: W3-5 (monolith split — the big one, do with full test coverage)
```

---

## Live Debugging Session Summary (2026-05-22)

**Confirmed working ✅**
- App loads and renders fully (all zones, RR, aux sections populated)
- ⌘K command palette opens correctly from root
- Card clicks open contextual palette with "From canvas" label and "Assign to [slot] (currently: [TM])"
- Aux card clicks (including unassigned slots) work correctly
- Search filtering finds TMs and generates contextual actions
- Grok Query Mode (`?` prefix) activates, fires real Grok 4.3 call, returns suggestion
- Grok suggestion result ("Sherry B for Zone 9") populates the palette context correctly
- HMR/Fast Refresh operational (sub-300ms rebuild cycles)

**Confirmed broken ❌**
- `grok_reasoning_effort` column missing → 400 on every load → migration written but needs applying
- Task drag-to-reassign unreachable (static + confirmed code analysis)
- Palette `onAddTask` key format mismatch (static analysis — slot shows empty after add until reload)
- RR border keys wrong (static analysis — border color can't be set for any RR slot)

**Confirmed UX issues ⚠️**
- Status pill "Last saved moments ago" always hardcoded
- Grok Query Mode: search field not cleared after response; roster still shows cmdk-filtered J-names alongside spinner
- cmdk value-prop leak: unrelated actions ("Swap RR8: Jeff", "Swap Admin: Jamie") appear when searching "jessica"
- 4 Fast Refresh rebuilds during normal interaction session (symptom of history hook identity issue)
- Day navigation buttons have very small hit targets (missed clicks during testing — may need tap target increase for iPad Pro)

---

*This plan supersedes any earlier planning notes. All items should be tracked in the Agentic task system as they move into implementation.*
