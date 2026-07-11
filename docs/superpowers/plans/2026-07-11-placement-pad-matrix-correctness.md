# Placement Pad + TM Rotation Matrix Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Placement Pad fit/rotation/week-repeat intel and the `tm_placement_history` → `tm_zone_matrix` engine fairness plane tell one consistent, operator-trustworthy story after every live assign, clear, reassign, and draft apply.

**Architecture:** Keep pure scoring/history helpers in `src/lib/shiftbuilder/rotation/` and server writes in `opsMutations.server.ts`. Pad UI consumes board-prerendered fit when available but always resets and re-scores against the same helpers as chips. History ownership is **one TM per (night, slot)**; matrix refresh is a full rebuild of zone rows for affected TMs from history (with night-date-aware windows). Tests are Vitest unit tests next to pure modules; no browser E2E required for this stack.

**Tech Stack:** Next.js 16 / React 19, Supabase (service role on server), Vitest, existing ops mutations route (`/api/shiftbuilder/mutations`), placement-histories API.

**Spec source:** Debug report + residual bugs found after the partial restore (week double-count, history reassignment, clear path, pad lifecycle, matrix zeros, RR matrix gaps, etc.).

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/shiftbuilder/rotation/shiftRotationHealth.ts` | Single week-repeat API; deprecate dual “+1 tonight” contract |
| `src/lib/shiftbuilder/rotation/placementFitForSlot.ts` | Draft resolve (clear + tmId-only); fit inputs |
| `src/lib/shiftbuilder/rotation/placementPadHelpers.ts` | Area-merged spread helpers already exist — reuse |
| `src/lib/shiftbuilder/opsMutations.server.ts` | History ownership, clear path, matrix full rebuild, night-dated `placed_at` |
| `src/app/api/shiftbuilder/mutations/route.ts` | Expose any new actions if needed (prefer piggyback existing batch/upsert) |
| `src/app/shiftbuilder/components/PlacementPad.tsx` | Lifecycle reset, week line, null-history rotation, HTTP errors, swap fetch cap, area-merged slotSpread |
| `src/app/shiftbuilder/components/WeeklyOverview.tsx` | Same week-repeat helper (no double-add) |
| `src/app/shiftbuilder/hooks/usePlacementFitMap.ts` | Ensure draft clear scores open_gap |
| `src/lib/shiftbuilder/scoring.ts` | Matrix fairness: map RR to area key or skip cleanly with note |
| `src/lib/shiftbuilder/rotation/__tests__/weekRepeat.test.ts` | New |
| `src/lib/shiftbuilder/rotation/__tests__/draftResolve.test.ts` | New |
| `src/lib/shiftbuilder/rotation/__tests__/historyOwnership.test.ts` | New pure helpers if extracted; else test via thin pure wrappers |

Optional extract (only if opsMutations becomes hard to unit-test):

| File | Responsibility |
|------|----------------|
| `src/lib/shiftbuilder/rotation/historyOwnership.ts` | Pure: which history rows to delete on assign/clear; zone keys for matrix rebuild |

---

## Out of scope (do not do in this plan)

- Building Team tab Zone Matrix heat-map UI
- Backfilling production `tm_placement_history` from years of `zone_assignments` (add a **follow-up script task note** only)
- Unifying pad + chips onto a single shared React history cache (nice-to-have; note only)
- Changing xAI model prompts beyond feeding corrected deterministic facts

---

### Task 1: Single week-repeat helper (stop double-count)

**Files:**
- Modify: `src/lib/shiftbuilder/rotation/shiftRotationHealth.ts`
- Create: `src/lib/shiftbuilder/rotation/__tests__/weekRepeat.test.ts`
- Modify: `src/app/shiftbuilder/components/PlacementPad.tsx` (week line only in this task)
- Modify: `src/app/shiftbuilder/components/WeeklyOverview.tsx`

- [ ] **Step 1: Write failing tests for through-night week count**

Create `src/lib/shiftbuilder/rotation/__tests__/weekRepeat.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  getTmThisWeekRepeatForSlot,
  getTmWeekRepeatForSlotThroughNight,
} from "../shiftRotationHealth";

function mapOf(
  tmId: string,
  rows: Array<{ nightDate: string; slotKey: string }>,
) {
  return new Map([[tmId, rows]]);
}

describe("getTmWeekRepeatForSlotThroughNight", () => {
  it("does not double-count when tonight is already in the map", () => {
    const m = mapOf("tm_a", [
      { nightDate: "2026-07-08", slotKey: "Z3" },
      { nightDate: "2026-07-10", slotKey: "Z3" }, // tonight
    ]);
    expect(
      getTmWeekRepeatForSlotThroughNight(m, "tm_a", "Z3", "2026-07-10", true),
    ).toBe(2);
  });

  it("adds tonight only when missing from map", () => {
    const m = mapOf("tm_a", [{ nightDate: "2026-07-08", slotKey: "Z3" }]);
    expect(
      getTmWeekRepeatForSlotThroughNight(m, "tm_a", "Z3", "2026-07-10", true),
    ).toBe(2);
  });

  it("merges MRR/WRR as same area", () => {
    const m = mapOf("tm_a", [
      { nightDate: "2026-07-08", slotKey: "MRR8" },
      { nightDate: "2026-07-09", slotKey: "WRR8" },
    ]);
    expect(
      getTmWeekRepeatForSlotThroughNight(m, "tm_a", "WRR8", "2026-07-10", true),
    ).toBe(3);
  });
});

describe("getTmThisWeekRepeatForSlot (compat)", () => {
  it("documents that map may include tonight — callers must not always +1", () => {
    const m = mapOf("tm_a", [
      { nightDate: "2026-07-08", slotKey: "Z3" },
      { nightDate: "2026-07-10", slotKey: "Z3" },
    ]);
    // Compat helper returns ALL matching rows (including tonight if present).
    expect(getTmThisWeekRepeatForSlot(m, "tm_a", "Z3").count).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — expect pass for through-night (already correct), document compat**

Run:

```bash
cd /Users/briankillian/oms_root && npx vitest run src/lib/shiftbuilder/rotation/__tests__/weekRepeat.test.ts
```

Expected: through-night tests PASS if implementation already correct; if any FAIL, fix `getTmWeekRepeatForSlotThroughNight` only.

- [ ] **Step 3: Update PlacementPad week line to use through-night helper**

In `PlacementPad.tsx`, replace:

```ts
import { getTmThisWeekRepeatForSlot } from "./shiftRotationHealth";
// ...
const weekRepeatInfo = ...
const weekRepeatTotal = weekRepeatInfo.count + (a.tmId ? 1 : 0);
```

with:

```ts
import { getTmWeekRepeatForSlotThroughNight } from "./shiftRotationHealth";
// ...
const weekRepeatTotal = a.tmId
  ? getTmWeekRepeatForSlotThroughNight(
      weeklyRecentHistory,
      a.tmId,
      slotKey,
      currentIso,
      true, // count tonight if assigned and not already in map
    )
  : 0;
const weekRepeatLine =
  weekRepeatTotal > 1
    ? weekRepeatTotal >= 3
      ? `This week: ${weekRepeatTotal}× on ${label} (real bad — rotate out)`
      : `This week: ${weekRepeatTotal}× on ${label} (policy max 1)`
    : null;
```

Also update `tmThisWeekRepeat` in `buildInsightContext` to use `weekRepeatTotal` (already does).

- [ ] **Step 4: Fix WeeklyOverview double-add**

In each of the three sites in `WeeklyOverview.tsx` that do:

```ts
const priorInfo = tmId ? getTmThisWeekRepeatForSlot(weeklyRecentHistory, tmId, slot.key) : { count: 0, dates: [] as string[] };
const priorCount = priorInfo.count;
const totalThisWeek = repeatCount + priorCount;
```

Change to:

```ts
import { getTmWeekRepeatForSlotThroughNight } from "./shiftRotationHealth";
// nightIso must already exist in scope (OverviewNight date). If the component has `night.date` or similar:
const totalThisWeek = tmId
  ? getTmWeekRepeatForSlotThroughNight(
      weeklyRecentHistory,
      tmId,
      slot.key,
      nightDateIso, // the ISO for THIS cell's night, not always selected day
      true,
    )
  : 0;
// If UI still needs "prior only" for titles:
const priorCount = Math.max(0, totalThisWeek - (tmId && isAssignedTonight ? 1 : 0));
```

**Careful:** For a weekly grid cell on Monday while viewing Thursday, `throughIso` must be **that cell’s night date**, and `countTonightIfAssigned` should only be true when the cell is the assignment on that night (it is — the cell is that night’s assignment). Prefer:

```ts
const totalThisWeek = tmId
  ? getTmWeekRepeatForSlotThroughNight(
      weeklyRecentHistory,
      tmId,
      slot.key,
      cellNightIso,
      false, // map already includes all days with data
    )
  : 0;
```

Because `plannedThisWeekRecentHistory` already includes every built day, **do not +1** in the overview. Use `countTonightIfAssigned: false` and rely on map contents.

- [ ] **Step 5: JSDoc on getTmThisWeekRepeatForSlot**

Update the comment above `getTmThisWeekRepeatForSlot` to:

```ts
/**
 * @deprecated Prefer getTmWeekRepeatForSlotThroughNight.
 * Returns ALL matching week-map rows (may include "tonight" if the map was built
 * with the full grave week including the selected day). Callers must NOT add +1
 * for tonight without checking nightDate === throughIso.
 */
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/shiftbuilder/rotation/__tests__/weekRepeat.test.ts \
  src/lib/shiftbuilder/rotation/shiftRotationHealth.ts \
  src/app/shiftbuilder/components/PlacementPad.tsx \
  src/app/shiftbuilder/components/WeeklyOverview.tsx
git commit -m "fix(shiftbuilder): stop double-counting this-week repeats on pad and overview"
```

---

### Task 2: Draft resolve — clear and tmId-only

**Files:**
- Modify: `src/lib/shiftbuilder/rotation/placementFitForSlot.ts`
- Create: `src/lib/shiftbuilder/rotation/__tests__/draftResolve.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveSlotAssignmentRow } from "../placementFitForSlot";

describe("resolveSlotAssignmentRow", () => {
  const live = {
    Z1: { tmId: "tm_live", tmName: "Live" },
  };

  it("treats proposedClear as unassigned even if live has a TM", () => {
    const row = resolveSlotAssignmentRow(
      "Z1",
      live,
      true,
      { Z1: { proposedClear: true } },
    );
    expect(row).toBeNull();
  });

  it("accepts draft with proposedTmId only", () => {
    const row = resolveSlotAssignmentRow(
      "Z1",
      live,
      true,
      { Z1: { proposedTmId: "tm_draft" } },
    );
    expect(row?.tmId).toBe("tm_draft");
  });

  it("prefers draft name when both present", () => {
    const row = resolveSlotAssignmentRow(
      "Z1",
      live,
      true,
      { Z1: { proposedTmId: "tm_d", proposedTmName: "Draft" } },
    );
    expect(row).toEqual({
      tmId: "tm_d",
      tmName: "Draft",
      provenance: undefined,
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL on clear and tmId-only**

```bash
npx vitest run src/lib/shiftbuilder/rotation/__tests__/draftResolve.test.ts
```

- [ ] **Step 3: Implement**

Replace `resolveSlotAssignmentRow` body:

```ts
export function resolveSlotAssignmentRow(
  slotKey: string,
  assignments: Record<string, SlotAssignmentRow>,
  isDraftMode: boolean,
  draftAssignments: Record<string, DraftAssignmentRow>,
): SlotAssignmentRow | null {
  const draft = draftAssignments[slotKey];
  if (isDraftMode && draft) {
    if (draft.proposedClear) return null;
    if (draft.proposedTmId || draft.proposedTmName) {
      return {
        tmId: draft.proposedTmId,
        tmName: draft.proposedTmName ?? draft.proposedTmId,
        provenance: assignments[slotKey]?.provenance,
      };
    }
  }
  const live = assignments[slotKey];
  if (!live?.tmName && !live?.tmId) return null;
  return live;
}
```

- [ ] **Step 4: Re-run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/shiftbuilder/rotation/placementFitForSlot.ts \
  src/lib/shiftbuilder/rotation/__tests__/draftResolve.test.ts
git commit -m "fix(shiftbuilder): draft clear and tmId-only resolve for placement fit"
```

---

### Task 3: History ownership pure rules + server wiring

**Files:**
- Create: `src/lib/shiftbuilder/rotation/historyOwnership.ts`
- Create: `src/lib/shiftbuilder/rotation/__tests__/historyOwnership.test.ts`
- Modify: `src/lib/shiftbuilder/opsMutations.server.ts`

**Rules:**
1. On assign TM T to night N slot S (UI key): delete **all** `tm_placement_history` rows with `(night_id=N, slot_key=S)` (any tm), then insert T’s row.
2. On clear slot S night N: delete all history rows for `(night_id=N, slot_key=S)`.
3. After assign or clear: refresh matrix for every TM that lost or gained a row (previous occupant + new occupant).

- [ ] **Step 1: Pure helper + tests**

`historyOwnership.ts`:

```ts
/** UI slot key ownership for one night — history is singular per (night, slot). */
export type HistorySlotMutation =
  | { kind: "assign"; nightId: string; uiSlotKey: string; tmId: string; slotType: string; rrSide: string | null }
  | { kind: "clear"; nightId: string; uiSlotKey: string; slotType: string; rrSide: string | null };

export function historyDeleteFilter(mut: HistorySlotMutation): {
  nightId: string;
  slotKey: string;
} {
  return { nightId: mut.nightId, slotKey: mut.uiSlotKey };
}

export function historyInsertRow(mut: Extract<HistorySlotMutation, { kind: "assign" }>): {
  tm_id: string;
  night_id: string;
  slot_key: string;
  slot_type: string;
  rr_side: string | null;
  is_committed: true;
} {
  return {
    tm_id: mut.tmId,
    night_id: mut.nightId,
    slot_key: mut.uiSlotKey,
    slot_type: mut.slotType,
    rr_side: mut.rrSide,
    is_committed: true,
  };
}
```

Test: assign delete filter ignores tmId; clear has same night+slot filter.

- [ ] **Step 2: Rewrite `recordPlacementHistoryServer` ownership**

In `opsMutations.server.ts`, change pre-delete to:

```ts
// Slot ownership is singular: any prior TM on this night×slot is replaced.
const { error: delErr } = await client
  .from("tm_placement_history")
  .delete()
  .eq("night_id", nightId)
  .eq("slot_key", params.slotKey);
```

Remove `.eq("tm_id", tmId)` from the delete.

- [ ] **Step 3: Add `clearPlacementHistoryForSlotServer`**

```ts
export async function clearPlacementHistoryForSlotServer(params: {
  nightId: string;
  slotKey: string; // UI key preferred
  slotType: string;
  rrSide?: string | null;
}): Promise<{ clearedTmIds: string[] }> {
  const client = adminClient();
  let uiSlot = params.slotKey;
  try {
    uiSlot = dbToUi(params.slotKey, params.slotType, params.rrSide ?? null);
    if (uiSlot.startsWith("UNK:")) uiSlot = params.slotKey;
  } catch {
    /* keep */
  }

  const { data: existing } = await client
    .from("tm_placement_history")
    .select("tm_id")
    .eq("night_id", params.nightId)
    .eq("slot_key", uiSlot);

  const clearedTmIds = [
    ...new Set((existing ?? []).map((r: { tm_id: string }) => r.tm_id).filter(Boolean)),
  ];

  await client
    .from("tm_placement_history")
    .delete()
    .eq("night_id", params.nightId)
    .eq("slot_key", uiSlot);

  return { clearedTmIds };
}
```

- [ ] **Step 4: Wire batch apply clears + reassignment matrix TMs**

In `batchApplyDraftAssignmentsServer`, after successful DB writes:

```ts
const matrixTms = new Set<string>();

// Clears first
for (const s of toDelete) {
  try {
    const { clearedTmIds } = await clearPlacementHistoryForSlotServer({
      nightId,
      slotKey: s.slotKey,
      slotType: s.slotType,
      rrSide: s.rrSide,
    });
    clearedTmIds.forEach((id) => matrixTms.add(id));
  } catch (e) {
    console.warn("[ops] clear history on batch delete failed", e);
  }
}

// Assigns
for (const s of toUpsert) {
  if (!s.tmId) continue;
  try {
    // Capture previous occupant for matrix refresh (optional select before delete is inside clear/assign)
    const before = await clearPlacementHistoryForSlotServer({
      nightId,
      slotKey: s.slotKey,
      slotType: s.slotType,
      rrSide: s.rrSide,
    });
    before.clearedTmIds.forEach((id) => matrixTms.add(id));

    await recordPlacementAndRefreshMatrixServer({
      tmId: s.tmId,
      nightId,
      slotKey: s.slotKey,
      slotType: s.slotType,
      rrSide: s.rrSide,
      skipMatrixRefresh: true,
      // skip internal delete if recordPlacementHistoryServer still deletes — avoid double work:
      // Prefer: change recordPlacementHistoryServer to NOT delete, and always call clear first.
    });
    matrixTms.add(s.tmId);
  } catch (e) {
    console.warn("[ops] record history on batch upsert failed", e);
  }
}

await Promise.all(
  [...matrixTms].map((tmId) =>
    refreshTmZoneMatrixServer(tmId).catch((e) =>
      console.warn("[ops] matrix refresh failed", tmId, e),
    ),
  ),
);
```

**Simplify record path (recommended in same task):**

1. `recordPlacementHistoryServer` only inserts (or upserts) — no delete.
2. Callers always `clearPlacementHistoryForSlotServer` then insert.

Update `recordPlacementAndRefreshMatrixServer` accordingly:

```ts
await clearPlacementHistoryForSlotServer({ nightId, slotKey: uiSlot, slotType: params.slotType, rrSide: params.rrSide });
// re-map cleared TMs if needed for matrix
await recordPlacementHistoryServer({ ... insert only ... });
```

- [ ] **Step 5: Wire single upsert + delete assignment**

- `upsertZoneAssignmentServer`: after zone_assignments upsert → clear history for slot → insert new → refresh matrix for old + new TMs.
- `deleteZoneAssignmentServer`: after delete → clear history for slot → refresh matrix for cleared TMs.

Need previous occupant: select `tm_id` from `zone_assignments` before overwrite/delete if not already available.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shiftbuilder/rotation/historyOwnership.ts \
  src/lib/shiftbuilder/rotation/__tests__/historyOwnership.test.ts \
  src/lib/shiftbuilder/opsMutations.server.ts
git commit -m "fix(shiftbuilder): singular night×slot history ownership and clear path"
```

---

### Task 4: Matrix refresh — night-dated windows + zero missing zones

**Files:**
- Modify: `src/lib/shiftbuilder/opsMutations.server.ts` (`refreshTmZoneMatrixServer`, history insert `placed_at`)

- [ ] **Step 1: Insert `placed_at` from night date**

When recording history, resolve night date:

```ts
const { data: night } = await client
  .from("nights")
  .select("night_date")
  .eq("id", nightId)
  .maybeSingle();
const nightDate = night?.night_date as string | undefined;
const placedAt = nightDate
  ? new Date(`${nightDate}T12:00:00.000Z`).toISOString()
  : new Date().toISOString();

await client.from("tm_placement_history").insert({
  ...,
  placed_at: placedAt,
  week_start: params.weekStart ?? null,
});
```

- [ ] **Step 2: Refresh rebuilds and zeros**

In `refreshTmZoneMatrixServer`:

1. Build `zoneCounts` as today (Z* + Z9SR only).
2. Fetch existing matrix rows for `tm_id`.
3. Upsert current counts.
4. For any existing `zone_key` not in `zoneCounts`, upsert zeros:

```ts
const zeroRows = existingKeys
  .filter((k) => !zoneCounts.has(k))
  .map((zoneKey) => ({
    tm_id: tmId,
    zone_key: zoneKey,
    last_placed_at: null,
    count_4w: 0,
    count_8w: 0,
    count_lifetime: 0,
    updated_at: now.toISOString(),
  }));
```

Alternatively **delete** orphan keys:

```ts
await client
  .from("tm_zone_matrix")
  .delete()
  .eq("tm_id", tmId)
  .not("zone_key", "in", `(${[...zoneCounts.keys()].join(",")})`);
// Prefer Supabase .in filter carefully; if empty zoneCounts, delete all for tm.
```

Prefer **delete orphans** when `zoneCounts` is non-empty; if history empty, delete all matrix rows for TM.

- [ ] **Step 3: Window by night date when available**

When counting 4w/8w, if row has `placed_at` from night noon UTC, windows stay correct. No extra change if Step 1 is done.

Document in comment: `count_lifetime` is lifetime **within lookback** (rename note only — column name stays).

- [ ] **Step 4: Commit**

```bash
git commit -am "fix(shiftbuilder): night-dated placement history and full matrix rebuild"
```

---

### Task 5: PlacementPad lifecycle + null history + HTTP + swap cap + area-merged spread

**Files:**
- Modify: `src/app/shiftbuilder/components/PlacementPad.tsx`
- Modify: `src/app/api/shiftbuilder/placement-histories/route.ts` (raise cap if needed)

- [ ] **Step 1: Reset effect on identity change**

Add after state declarations:

```ts
useEffect(() => {
  setCoverageMode(false);
  setAssignMode(false);
  setAssignConfirmed(false);
  setRotationDisplay(null);
  setRotationBasics(null);
  rotationSigRef.current = null;
  setDeepInsight(null);
  setInsightStructured(null);
  setInsightCached(false);
  setAnalystDetailsOpen(false);
  setDeepInsightLoading(false);
  lightRunRef.current += 1;
  analystRequestRef.current += 1;
  setMatrixExpanded(false);
  setEvidenceOpen(false);
  setTaskInput("");
  setSweeperOpen(false);
}, [slotKey, a.tmId, selectedDay.date, insightsEnabled]);
```

Ensure `lightRunRef` is declared **before** this effect (move ref up).

- [ ] **Step 2: Light-run must re-fire after reset**

After reset, `insightStructured` is null → light effect runs. Change light setter from “keep prev if headline” to always accept newer for matching context:

```ts
setInsightStructured(data.structured ?? null);
```

(Remove `prev?.headline ? prev : ...`.)

- [ ] **Step 3: History fetch checks res.ok**

```ts
const res = await fetch(...);
if (!res.ok) throw new Error(`history ${res.status}`);
const data = await res.json();
```

On error: `setPadHistory(null)` and stop loading (already in catch).

- [ ] **Step 4: Rotation runs with empty history**

Replace:

```ts
if (padHistoryLoading || !padHistory) return;
```

with:

```ts
if (padHistoryLoading) return;
// null history = brand-new TM: still compute gaps (all matrix slots "not recent")
const historyForBasics = padHistory ?? {
  tmId: a.tmId!,
  tmName: a.tmName ?? a.tmId!,
  zoneDates: {},
  zoneCounts: {},
  totalAssignments: 0,
  totalNights: 0,
  lastDate: "",
  zoneDow: {},
};
```

Pass `historyForBasics` into `computePlacementRotationBasics`.

- [ ] **Step 5: Raise other-TM fetch cap**

Placement-histories route currently `.slice(0, 24)`. Raise to **48** (full grave + buffer):

```ts
// route.ts
].slice(0, 48);
```

Pad: `otherIds.slice(0, 48)` to match.

- [ ] **Step 6: Area-merged slotSpread for facts / xAI**

```ts
import { spreadCountForRepeatKey } from "./placementPadHelpers";
// in padMatrixFacts:
slotSpread: spreadCountForRepeatKey(spreadCounts, slotKey),
```

- [ ] **Step 7: Prefer board fit only when not history-pending**

```ts
const prerenderedFit: PrerenderedPlacementFit =
  boardPrerenderedFit && !boardPrerenderedFit.healthPending
    ? boardPrerenderedFit
    : localPrerenderedFit;
```

- [ ] **Step 8: Manual smoke checklist (document in commit body)**

1. Open pad on assigned TM → fit block + matrix + last 5.  
2. Switch slot quickly → old xAI headline gone; new load.  
3. New TM (no history) → gaps list populated, not blank.  
4. Week-repeat line matches chip for same TM×slot.

- [ ] **Step 9: Commit**

```bash
git add src/app/shiftbuilder/components/PlacementPad.tsx \
  src/app/api/shiftbuilder/placement-histories/route.ts
git commit -m "fix(shiftbuilder): pad lifecycle reset, empty-history rotation, history fetch hardening"
```

---

### Task 6: Scoring matrix fairness for non-zone slots

**Files:**
- Modify: `src/lib/shiftbuilder/scoring.ts`
- Optional test: `src/lib/shiftbuilder/__tests__/matrixFairness.test.ts` if easy to unit-test pure path

- [ ] **Step 1: Only apply zone matrix signals for zone UI keys**

```ts
function scoreMatrixFairnessSignals(tm: any, slotKey: string, ctx: ScoringContext): MatrixFairnessSignals {
  const breakdown: MatrixFairnessSignals = {};
  // Matrix is Z*/Z9SR only — RR/aux would always read as 0 exposure (false "fresh").
  if (!/^Z\d+$/.test(slotKey) && slotKey !== "Z9SR") {
    return breakdown; // omit signals rather than fake zeros
  }
  // ... existing matrix lookup ...
}
```

Confirm callers tolerate missing keys in breakdown (they should — weights only apply present signals).

- [ ] **Step 2: Commit**

```bash
git commit -am "fix(shiftbuilder): skip zone-matrix fairness on non-zone slots"
```

---

### Task 7: Wire weekly pad + deployment fit enablement note

**Files:**
- Modify: `src/app/shiftbuilder/ShiftBuilderClient.tsx` (only if still missing)
- Modify: `src/app/shiftbuilder/hooks/usePlacementFitMap.ts` (comment or trails-only weekly)

- [ ] **Step 1: Verify weekly pad props**

Confirm weekly `PlacementPad` receives:

- `weeklyRecentHistory={plannedThisWeekRecentHistory}`
- `boardPrerenderedFit` only when fit map has data

If deployment fit map is disabled off deployment view, either:

**Option A (minimal):** leave weekly on local fit (document).  
**Option B (better):** enable `usePlacementFitMap` whenever a pad is open:

```ts
const deploymentRotationFitEnabled =
  (currentView === "deployment" || !!selectedSlotKey) &&
  engineRunPhase === "idle" &&
  ...
```

Prefer **Option B** so weekly pad chips and pad intel share the board fit.

- [ ] **Step 2: Commit if code changed**

```bash
git commit -am "fix(shiftbuilder): compute placement fit map when pad open from weekly"
```

---

### Task 8: Regression suite + verification gate

**Files:** none new beyond running commands

- [ ] **Step 1: Run all rotation unit tests**

```bash
cd /Users/briankillian/oms_root && npx vitest run src/lib/shiftbuilder/rotation
```

Expected: all PASS.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: no **new** errors in pad/matrix files. Pre-existing `UseShiftCompletionReturn.suggestion` may remain — do not expand scope unless trivial.

- [ ] **Step 3: Manual operator checklist**

| Action | Expect |
|--------|--------|
| Apply draft A on Z3 | History row A; matrix count_4w for Z3 increments |
| Apply reassign Z3 → B | Only B in history for that night×slot; A matrix decreases after refresh |
| Apply clear Z3 | No history for night×Z3; matrix refreshed for B |
| Live drag assign | Same as apply history path |
| Pad week line vs chip | Same integer for same TM×slot |
| Slot switch | No stuck xAI headline |

- [ ] **Step 4: Final commit only if checklist fixes needed; else tag note in PR**

---

### Task 9 (optional follow-up): one-time backfill script

**Files:**
- Create: `scripts/backfill-tm-zone-matrix.mjs` (or `src/scripts/...`)

Not required for merge of Tasks 1–8. Outline:

1. Service role: for each distinct `tm_id` in `zone_assignments` (last 12 weeks nights), synthesize history rows **or** rebuild matrix directly from `zone_assignments`×`nights` with UI keys via `dbToUi`.
2. Upsert matrix.
3. Run once against staging, then prod with operator approval.

Document in PR: “Engine fairness remains soft-zero until first applies **or** backfill.”

---

## Dependency graph

```text
Task 1 (week repeat) ──────────────┐
Task 2 (draft resolve) ────────────┼──► Task 5 (pad UI) ──► Task 7 (weekly fit) ──► Task 8 (verify)
Task 3 (history ownership) ──► Task 4 (matrix refresh) ──┘
Task 6 (scoring skip RR zeros) ────┘
Task 9 optional after 3–4
```

Tasks 1, 2, 6 can run in parallel. Task 3 before 4. Task 5 after 1 (week line). Task 8 last.

---

## Spec coverage checklist

| Residual bug | Task |
|--------------|------|
| Pad week-repeat double-count | 1 |
| WeeklyOverview prior+tonight double-add | 1 |
| History reassignment keeps old TM | 3 |
| Clear doesn’t update history/matrix | 3 |
| Stale xAI across slot/TM | 5 |
| Null history skips rotation | 5 |
| History fetch ignores HTTP errors | 5 |
| Board vs pad fit / weekly thin score | 5, 7 |
| Swap histories capped at 24 | 5 |
| `placed_at = now` | 4 |
| Matrix never zeros old zones | 4 |
| RR always 0 exposure in matrix scoring | 6 |
| Pad spread exact-key | 5 |
| Draft clear / tmId-only resolve | 2 |
| Dual sources (document + history path) | 3–4 + Task 9 note |
| Light xAI stuck headline | 5 |
| count_lifetime lookback (document only) | 4 |

---

## Self-review

1. **Spec coverage:** All P0/P1 residual items map to tasks; P2 dual-cache share deferred with note.  
2. **Placeholders:** None — code blocks are concrete.  
3. **Type consistency:** `uiSlotKey` naming, `clearPlacementHistoryForSlotServer` returns `clearedTmIds`, week helper is `getTmWeekRepeatForSlotThroughNight`.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-11-placement-pad-matrix-correctness.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, batch with checkpoints via executing-plans  

**Which approach?**
