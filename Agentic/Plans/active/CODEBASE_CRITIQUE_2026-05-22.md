# OMS / ZDS ShiftPlanner — Full Codebase Critique
**Date**: 2026-05-22  
**Agent**: Claude Sonnet 4.6 (Cowork)  
**Scope**: Full static analysis of all shiftbuilder source files  
**Files reviewed**: ShiftBuilderClient.tsx (5724 lines), CommandPalette.tsx (1873 lines), useCommandActions.tsx, data.ts, placement.ts, scoring.ts, grokEngine.ts, grokIntelligence.ts, grokClient.ts, engineConfig.ts, commandParser.ts, useShiftHistory.ts, sudoActions.ts, slot-keys.ts, actions.ts, and supporting files.

---

## ██ CRITICAL BUGS — Fix before next shift

### BUG-1: Task drag-and-drop is completely dead code
**File**: `ShiftBuilderClient.tsx` ~line 3131  
**Severity**: CRITICAL (feature non-functional)

```typescript
if (a.type === "assigned") {          // ← this guard fires first
  if (over?.data.current?.type === "slot") { ... return; }
  
  if (a.type === "task") {            // ← UNREACHABLE: a.type is already "assigned"
    ...task drag logic...
  }
}
```

The task-drag handler is nested inside `if (a.type === "assigned")`, so the inner `if (a.type === "task")` can never be true. **Task drag between cards is completely non-functional**. The task type check needs to be a top-level branch alongside `tm` and `assigned`, not nested inside `assigned`.

**Fix**:
```typescript
const onDragEnd = (event: DragEndEvent) => {
  // ...
  if (a.type === "tm") { /* roster drag */ return; }
  if (a.type === "task") { /* task drag */ return; }   // ← hoist to top level
  if (a.type === "assigned") { /* TM move/swap */ return; }
};
```

---

### BUG-2: Border flow sends wrong slot keys for RR cards
**File**: `CommandPalette.tsx` ~lines 1195–1230 (border select-card step)  
**Severity**: CRITICAL (feature broken)

The border flow renders a list of slot key strings like `'RR1'`, `'RR6'`, `'RR7'`, etc., and calls `onAddCardBorder(selectedKey, color)`. But the canonical UI slot keys for RR slots are `'MRR1'`/`'WRR1'`, `'MRR6'`/`'WRR6'`, etc. A lookup of `cardBorders['RR1']` will never match any card's `data-slot-key` attribute.

**Fix**: Replace the string literals in the border card-select list with the actual key strings from `PLACEMENT_ORDER` or from `slot-keys.ts`'s canonical set (`MRR1`, `WRR1`, etc.).

---

### BUG-3: `onAddTask` from palette refreshes with DB keys instead of UI keys
**File**: `ShiftBuilderClient.tsx` ~lines 5619–5648  
**Severity**: CRITICAL (tasks added via palette don't appear on cards until refresh)

```typescript
const fresh = await getNightSlotTasks(nightId);
const byKey: Record<string, NightSlotTask[]> = {};
for (const t of fresh) {
  if (!byKey[t.slotKey]) byKey[t.slotKey] = [];  // ← t.slotKey is DB key ("zone_1")
  byKey[t.slotKey].push(t);
}
setSelectedTasks(byKey);  // ← but selectedTasks is keyed by UI keys ("Z1")
```

`getNightSlotTasks` returns rows with `slotKey` in DB format (`"zone_1"`, `"rr"`, etc.). The rest of the app indexes `selectedTasks` by UI format (`"Z1"`, `"MRR1"`, etc.) via `dbToUi`. After palette task addition, tasks visually disappear from cards because the bucket keys don't match. The exact translation used in the main data load (lines 3388–3398) must be applied here too.

**Fix**:
```typescript
const fresh = await getNightSlotTasks(nightId);
const byKey: Record<string, NightSlotTask[]> = {};
for (const t of fresh) {
  const uiKey = dbToUi(t.slotKey, t.slotType, t.rrSide ?? null);
  if (!uiKey.startsWith("UNK:")) {
    (byKey[uiKey] ??= []).push(t);
  }
}
setSelectedTasks(byKey);
```

---

### BUG-4: `AuxCard` has duplicate `isDraftMode && draftInfo` render block
**File**: `ShiftBuilderClient.tsx` ~lines 1081–1113  
**Severity**: HIGH (dead render branch, confusing, renders the same overlay twice or has stale copy risk on future edits)

The `isDraftMode && draftInfo` conditional block is copy-pasted twice inside `AuxCard` with identical content. Only one fires but the duplication creates a maintenance trap — future edits to draft display will only apply to the first copy if the second is forgotten.

**Fix**: Delete one block. If both were intentionally different, consolidate into a single conditional with the correct combined logic.

---

### BUG-5: `handleSetTaskColor` and `handleEditTask` bypass null-night guard and use `as any` casts
**File**: `ShiftBuilderClient.tsx` ~lines 3706–3754  
**Severity**: HIGH

```typescript
(updateNightSlotTaskColor as any)(targetNightId, slot_key, taskLabel, color, rr_side).catch(...)
(updateNightSlotTaskLabel as any)(targetNightId, slot_key, oldLabel, trimmed, rr_side).catch(...)
```

- `targetNightId` is captured from `nightId` which can be null (no night loaded for this date yet). If null is passed, the DB call will fail silently — the `.catch` only logs, no toast.
- The `(... as any)` casts suppress TypeScript's param type checking. These functions likely don't have the right signature on the imported symbol.

**Fix**: Add early-return null guard matching the pattern used in `persistRemoveTask`. Remove `as any` and fix the function call signatures.

---

## █ SIGNIFICANT ISSUES — Fix soon, before expanding features

### ISSUE-1: History effect fires on every render due to unstable `shiftHistory` reference
**File**: `ShiftBuilderClient.tsx` ~line 2391

```typescript
useEffect(() => {
  if (pendingHistoryRef.current) { ... }
}, [assignments, auxDefs, shiftHistory]);  // ← shiftHistory is a new object every render
```

`useShiftHistory()` returns a plain object literal `{ recordChange, undo, ... }` on every call. Even though the functions inside are memoized with `useCallback`, the wrapping object is re-created each render. So `shiftHistory` changes every render, the effect fires every render, and `pendingHistoryRef.current` is checked every render (always null except on actual state changes). This is wasteful.

**Fix**: Depend on `shiftHistory.recordChange` directly (the stable memoized fn), not the whole object. Or extract a stable ref inside `useShiftHistory`.

---

### ISSUE-2: Command Palette orb opens palette via synthetic keyboard event
**File**: `ShiftBuilderClient.tsx` ~line 5388

```typescript
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: isMac, ctrlKey: !isMac, bubbles: true }));
```

This is fragile. It detects Mac by `navigator.platform` (deprecated), dispatches to `document` but the handler is on `window`, and relies on the synthetic event matching the exact guard in the `isCommandPalette` check. If the handler ever changes, this silently breaks.

**Fix**: Call `setCmdkOpen(true)` directly. The orb has access to the setter.

---

### ISSUE-3: Status pill is hardcoded / misleading
**File**: `ShiftBuilderClient.tsx` ~lines 5425–5443

The bottom-right status pill always shows:
- Orange dot + "Draft" (even when not in Draft Mode)
- "Last saved moments ago" (static string, never updated)
- Green dot + "Engine ready" (always)

Operators in Draft Mode will see the same display as when they're not — meaningless. "Last saved moments ago" never reflects whether the last persist succeeded or failed.

**Fix**: Wire `isDraftMode` to the dot color (gray = clean, orange = draft mode active). Track the last successful persist timestamp and display it. Use the existing toast system for persist errors.

---

### ISSUE-4: `applyDraft` calls `assign`/`unassign` per-slot in a forEach loop
**File**: `ShiftBuilderClient.tsx` ~line 2178

```typescript
Object.entries(draftAssignments).forEach(([slotKey, info]) => {
  if (info.proposedClear) { unassign(slotKey); }
  else if (info.proposedTmId) { assign(slotKey, info.proposedTmId, info.proposedTmName); }
});
```

Each `assign`/`unassign` call: 
1. Sets `pendingHistoryRef.current`, overwriting the previous one (history entries are lost for all but the last slot).
2. Triggers a Supabase fire-and-forget per slot — N separate network calls not coordinated (though the night race is fixed per the earlier bug fix).
3. Causes N re-renders via `setAssignments`.

**Fix**: Batch the state update into a single `setAssignments` call that applies all draft slots at once. Persist with a single nightId resolution and N awaits inside one IIFE. Record one history entry covering the batch.

---

### ISSUE-5: `addCustomTaskForSlot` in palette uses nightId from closure
**File**: `ShiftBuilderClient.tsx` ~line 3762

```typescript
const addCustomTaskForSlot = React.useCallback(
  async (uiKey: string, label: string) => {
    const targetNightId = nightId;  // ← captured at call time, good
    ...
    toggleTaskForSlot(uiKey, created);  // ← toggleTaskForSlot also captures nightId
  },
  [nightId, selectedDay.date, selectedDay.name, showToast, toggleTaskForSlot]
);
```

`toggleTaskForSlot` also captures `nightId` from its own closure. If `nightId` is null when the callback was last recreated but non-null when `addCustomTaskForSlot` runs, the inner `toggleTaskForSlot` uses the stale null. This is a latent race.

---

### ISSUE-6: `filterTerm` defined at two levels in ShiftBuilderClient
**File**: `ShiftBuilderClient.tsx` ~lines 1931 and 4045

`filterTerm` is declared at component scope (line 1931) as `const filterTerm = rosterSearch.trim().toLowerCase()`. Then declared again inside the roster IIFE at line 4045 with the same expression. The outer one is never read — the inner one shadows it. The outer is dead code.

**Fix**: Delete the outer `filterTerm` declaration.

---

### ISSUE-7: `getOnScheduleTmIdsForNight` uses sequential queries in AM overlap path
**File**: `src/lib/shiftbuilder/data.ts`

The function does 4+ sequential Supabase queries when resolving AM overlap TMs. These should be parallelized with `Promise.all` for the branches that don't depend on each other.

---

### ISSUE-8: `updateCatalogSortOrders` runs sequential per-row updates
**File**: `src/lib/shiftbuilder/data.ts`

Sequential `for...of` with `await` per row. For a catalog of 50+ items this is unnecessary latency. Should batch into `Promise.all` or ideally a single bulk upsert.

---

## ▲ DEAD CODE — Remove to reduce cognitive load

### DEAD-1: `recordChange` and `recordChangeWithBefore` stubs in `useShiftHistory`
**File**: `src/lib/shiftbuilder/useShiftHistory.ts` ~lines 43–79

Both are exported stubs with no implementation — extensive comments explaining why they don't work, but no actual logic. The real function is `recordAtomicChange` which is correctly mapped to the public `recordChange` API. The stubs above it are vestigial.

**Fix**: Delete `recordChange` (stub with mutator parameter) and `recordChangeWithBefore`. Clean up the comment wall. Only `recordAtomicChange` + the final return block is needed.

---

### DEAD-2: `runCoveragePlanner` is a stub
**File**: `src/lib/shiftbuilder/placement.ts`

```typescript
export function runCoveragePlanner(...) {
  // TODO: implement coverage-first planner
  return runWeightedPlanner(...);
}
```

This wraps `runWeightedPlanner` with a misleading name and a TODO. Either implement it or delete it and call `runWeightedPlanner` directly everywhere.

---

### DEAD-3: `validatePlacementOrder` always returns `[]`
**File**: `src/lib/shiftbuilder/placement.ts`

The function exists and is called (notably from `addAuxSlot`) but always returns an empty array. The caller logs warnings if the array is non-empty — never happens. 

**Fix**: Either implement it properly (validate that PLACEMENT_ORDER covers all keys in the current AUX set) or delete it and its call site.

---

### DEAD-4: `assign` prop in `UseCommandActionsProps` is never used
**File**: `src/lib/shiftbuilder/useCommandActions.tsx`

`assign` appears in the `UseCommandActionsProps` interface, is destructured in the hook, is included in the `useMemo` dependency array — but is never called inside the memo body. This is a dead prop that inflates the dependency array and causes spurious memo recomputation.

**Fix**: Remove from the interface, the destructure, and the dep array.

---

### DEAD-5: Outer `filterTerm` at line 1931 (see ISSUE-6 above)

---

### DEAD-6: `pmOverlapMembers` and `amOverlapMembers` loaded but unused
**File**: `ShiftBuilderClient.tsx` ~lines 3269–3270 in `Promise.all`

These two fetches are loaded in the big parallel data load, but the comment at line 3321 explicitly says "Derive isPMOverlap / isAMOverlap directly from grave_pool — the authoritative source. (The pmOverlapMembers / amOverlapMembers lists are still loaded for any downstream use but are no longer the flag source.)" There is no downstream use. Two extra Supabase calls per day switch for nothing.

**Fix**: Remove the two fetch calls from `Promise.all`.

---

## ⚡ PERFORMANCE

### PERF-1: 19 parallel Supabase queries on every day change
**File**: `ShiftBuilderClient.tsx` ~lines 3263–3283

This is the correct approach (parallel is good), but some queries fetch roster-level data that never changes mid-session (`getGraveAvailableTeamMembers`, `getActiveEngineConfig`, `getTMSkillScores`, `getSlotDifficultyRaw`, `getTMPreferences`, `getTMPairAffinities`, `getTMAccommodations`). These could be loaded once on mount and cached in refs, saving ~7 calls per day switch.

---

### PERF-2: `Object.values(assignments).some(...)` in per-TM roster render
**File**: `ShiftBuilderClient.tsx` ~lines 4199, 4225, 4250, 4292, 4333, etc.

Inside the roster IIFE, every `RosterItem` render does `Object.values(assignments).some((a: any) => a.tmId === tm.id)` to compute `isAssigned`. With ~30 TMs × ~30 assignments, this is ~900 comparisons per render. Memo a `Set<string>` of assigned TM IDs outside the map loop (already partially done at line 3970 as `assignedThisNight`, but then not used in the section renders below).

**Fix**: Derive `assignedThisNight` once (already done), then check `assignedThisNight.has(tm.id)` instead of re-scanning `Object.values(assignments)` in each render call.

---

### PERF-3: History stack has no size cap
**File**: `src/lib/shiftbuilder/useShiftHistory.ts`

With no `MAX_HISTORY_SIZE`, a multi-hour shift session accumulates unbounded snapshots. Each entry clones `assignments` + `auxDefs`. After 200 actions this is ~200 snapshots in memory.

**Fix**: Add `const MAX_HISTORY = 50;` and `setHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), entry])`.

---

## 🔒 TYPE SAFETY

### TYPE-1: `isPMOverlap`/`isAMOverlap` not in `TeamMember` interface
**File**: `src/lib/shiftbuilder/data.ts`

These are added ad-hoc in ShiftBuilderClient via `graveMembers.map(m => ({ ...m, isPMOverlap: ..., isAMOverlap: ... }))` but the `TeamMember` type doesn't include them. Every access throughout the component uses `(tm as any).isPMOverlap` or `tm.isPMOverlap` without TypeScript protection.

**Fix**: Add `isPMOverlap?: boolean; isAMOverlap?: boolean;` to `TeamMember` or create an `EnrichedTeamMember` type for UI-layer use.

---

### TYPE-2: `AssignmentRecord = Record<string, any>` 
**File**: `src/lib/shiftbuilder/useShiftHistory.ts` line 9

The assignment map's value type is `any`. This means every access inside undo/redo is untyped. Define a proper `AssignmentEntry` type mirroring the shape built in `onDragEnd`/`assign`.

---

### TYPE-3: `(updateNightSlotTaskColor as any)` and `(updateNightSlotTaskLabel as any)`
**File**: `ShiftBuilderClient.tsx` ~lines 3724, 3750

These casts exist because the actual function signatures either don't exist in `data.ts` or have different param orders. The fix is to check the actual exported signatures and call them correctly.

---

### TYPE-4: Extensive `(r: any)` in `data.ts`
The Supabase queries return `any[]` throughout. Introducing even partial types (or using Supabase CLI type generation) would prevent entire classes of runtime errors at compile time.

---

## 🏗 ARCHITECTURE

### ARCH-1: ShiftBuilderClient.tsx is 5,724 lines — an unsustainable monolith
The file contains at least 12 distinct concerns:
- Card components (ZoneCard, RRCard, RRSide, AuxCard, OverlapSlot)
- Roster display components (RosterItem, RosterDropZone)
- UI utility components (HeaderOverflow, CustomTaskInput, BreakBadge, AssignmentLine)
- Custom hooks (useSlotDnd, useCollapsiblePill)
- Main component state (~25 useState declarations)
- Data loading effect (120+ lines)
- Persist helpers (persistAssign, persistLock, persistAddTask, persistRemoveTask)
- Drag-and-drop handlers
- Engine/draft orchestration (enterDraftMode, applyDraft, applyGrokSuggestions)
- Print logic (handlePrintBothPages — 120 lines)
- Roster render IIFE (~400 lines)
- Artboard render (~500 lines)

**Suggested split**:
```
src/app/shiftbuilder/
  ShiftBuilder.tsx           ← main component (state + effects + orchestration only)
  components/
    cards/ZoneCard.tsx
    cards/RRCard.tsx  
    cards/AuxCard.tsx
    cards/OverlapSlot.tsx
    roster/RosterPanel.tsx
    roster/RosterItem.tsx
    artboard/DeploymentView.tsx
    artboard/BreaksView.tsx
    controls/ControlCluster.tsx
    modals/TaskSelectorModal.tsx
  hooks/
    useSlotDnd.ts
    usePersistHelpers.ts
    useDraftMode.ts
    usePrintBothPages.ts
```

---

### ARCH-2: `sudoActions.ts` uses client-side Supabase with implicit service-role key
**File**: `src/lib/shiftbuilder/sudoActions.ts` — acknowledged in a comment

This is fine for internal dev tooling, but should be explicitly documented and never shipped with a public-facing surface. A server action wrapper would be the right long-term path.

---

### ARCH-3: Dual-page print uses `flushSync` + DOM serialization
**File**: `ShiftBuilderClient.tsx` ~lines 2806–2945

`flushSync` inside an async function, manual DOM cloning, and post-processing cloned DOM with `querySelector` are all fragile patterns. React 18 Concurrent Mode may make this unreliable. The `nextFrames` countdown is a timing hack. 

**Better approach**: Render both views with React (render off-screen into a portal or a hidden container that's always present), then print only that container. Eliminates all the `flushSync`/timing complexity.

---

### ARCH-4: `deriveTmId` in `sudoActions.ts` is non-deterministic
```typescript
const id = `tm_${base}_${Math.random().toString(16).slice(2, 8)}`;
```

This generates a different ID every call for the same TM name. Creating a TM twice gives two rows. IDs should be deterministic (e.g., hash of the canonical name, or a counter from Supabase `gen_random_uuid()`).

---

### ARCH-5: `commandParser.ts` line — unused destructure element
```typescript
const [_, y, m, dd] = iso;   // ← _ is unused
```

Should be `const [, y, m, dd] = iso;`

---

## 🎯 QUICK WINS (Low effort, high clarity impact)

1. **Delete the 2 dead `useShiftHistory` stubs** — removes 35 lines of confusing comments
2. **Fix the outer `filterTerm` shadow** — one-line delete
3. **Remove `pmOverlapMembers`/`amOverlapMembers` from Promise.all** — 2 fewer DB calls per day switch
4. **Fix the ⌘K orb button to call `setCmdkOpen(true)` directly** — one line
5. **Add history size cap** — 3 lines
6. **Fix `commandParser.ts` unused destructure** — one character
7. **Use `assignedThisNight` Set in all roster item renders** — replaces 6+ `Object.values().some()` patterns

---

## 📋 PRIORITY ORDER FOR FIXES

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| P0 | BUG-1: Task drag dead code | 10 min | Restores broken feature |
| P0 | BUG-2: RR border keys wrong | 15 min | Restores broken feature |
| P0 | BUG-3: Palette task refresh DB keys | 15 min | Fixes invisible tasks |
| P1 | BUG-4: AuxCard duplicate block | 5 min | Maintenance safety |
| P1 | BUG-5: handleSetTaskColor null night | 20 min | Prevents silent data loss |
| P1 | ISSUE-1: shiftHistory deps churn | 10 min | Perf + correctness |
| P1 | ISSUE-2: Orb synthetic keyboard event | 5 min | Reliability |
| P1 | ISSUE-3: Status pill hardcoded | 30 min | Operator trust |
| P2 | ISSUE-4: applyDraft forEach loop | 30 min | Data integrity |
| P2 | DEAD-1: Remove useShiftHistory stubs | 5 min | Clarity |
| P2 | DEAD-4: Remove unused `assign` prop | 5 min | Perf + clarity |
| P2 | DEAD-6: Remove unused overlap fetches | 5 min | Perf |
| P3 | PERF-1: Cache session-stable queries | 2 hrs | Load speed |
| P3 | PERF-2: Use assignedThisNight Set | 20 min | Render perf |
| P3 | TYPE-1: TeamMember type for overlaps | 30 min | Type safety |
| P4 | ARCH-1: Split monolith | 1-2 days | Maintainability |
| P4 | ARCH-3: Print architecture | 2 hrs | Robustness |

---

## ✅ THINGS THAT ARE GENUINELY GOOD

- The **loadEpochRef + epoch gating** pattern in the data load effect is excellent. Day-switch races are correctly handled.
- The **race-free persist pattern** (capture nightId at action time, never re-read from state) is the right approach and is applied consistently across assign, lock, tasks, and breaks.
- The **onDragEnd swap bug fix** (resolve night once, await both persists sequentially) is correct and well-commented.
- **`slot-keys.ts`** three-way mapping with loud failures on unmappable keys is great defensive engineering.
- **`normalizeRawAction` in grokIntelligence.ts** rescuing Grok schema drift is robust.
- **`guardGrokActions`** and **`guardGrokEnginePicks`** on the server side are the right safety layer.
- **`buildDefaultAdjacency`** in scoring.ts provides a clean, extensible graph structure.
- **`useCollapsiblePill`** pattern is clean and reusable.
- The **Apple Pencil Pro squeeze gesture** wiring is a genuinely elegant touch-first interaction.
- `CommandPalette.tsx`'s `RosterItemRow` correctly documents the camelCase vs. snake_case TM property issue that caused blank rows in a prior session.

---

*Generated by Claude Sonnet 4.6 Cowork — full line-by-line static analysis pass, 2026-05-22*
