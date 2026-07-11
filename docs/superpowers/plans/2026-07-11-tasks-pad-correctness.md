# Tasks Pad Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tasks Pad save/edit/remove trustworthy: await full mutation chains, identify tasks by stable id (not only label), toast + rollback on failure, and fix pad sync/format UX so operators never lose styling after rename.

**Architecture:** Keep UI in `TasksPad.tsx`; persist through existing session-gated `data.ts` → mutations → `opsMutations.server.ts`. Add optional `taskId` on all update/remove paths (label remains fallback for catalog/CMD-K). Client handlers become async, return promises, and roll back optimistic `selectedTasks` on error. Pure text-style helpers gain tests; no new draft mode for tasks in this plan.

**Tech Stack:** Next.js 16 / React 19, Supabase `night_slot_tasks`, Vitest, existing ops mutations route.

**Spec source:** Tasks Pad debug report (P0 rename race, label identity, silent fail; P1 sync deps, selection format, nightId guards, close discard).

**Workspace:** `/Users/briankillian/oms_root` only (same repo as shiftplanner; do not use `oms_shiftbuilder_ultra` worktree).

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/shiftbuilder/opsMutations.server.ts` | Server task update/remove by `id` when provided |
| `src/lib/shiftbuilder/data.ts` | Client wrappers pass `taskId` through mutations |
| `src/app/api/shiftbuilder/mutations/route.ts` | Accept `taskId` on existing action bodies (if body is free-form already, no change) |
| `src/app/shiftbuilder/components/TasksPad.tsx` | Awaited save pipeline, discard confirm, sync deps, selection UX |
| `src/app/shiftbuilder/ShiftBuilderClient.tsx` | Async handlers, toast, optimistic rollback |
| `src/lib/shiftbuilder/taskTextStyle.ts` | Pure helpers (already exist) |
| `src/lib/shiftbuilder/__tests__/taskTextStyle.test.ts` | New unit tests for remap/format |
| `src/app/shiftbuilder/components/__tests__/tasksPadSaveOrder.test.ts` | Optional pure test of save-order helper if extracted |

---

## Out of scope

- Task **draft mode** (always live writes remain)
- Redesigning felt markers / full rich-text editor (only fix selection mode honesty)
- Catalog admin UI
- Migrating historical duplicate labels in DB (optional note only)

---

### Task 1: Server + data — mutate by `taskId` when present

**Files:**
- Modify: `src/lib/shiftbuilder/opsMutations.server.ts` (`updateNightSlotTaskLabelServer`, `updateNightSlotTaskColorServer`, `updateNightSlotTaskStyleServer`, `removeNightSlotTaskServer`)
- Modify: `src/lib/shiftbuilder/data.ts` (matching client wrappers)
- Create: `src/lib/shiftbuilder/__tests__/taskMutationIdentity.test.ts` (pure helper for filter builder if extracted)

**Contract:** Every update/remove accepts optional `taskId?: string | null`. When non-empty, filter `.eq("id", taskId)` and **do not** require label match for the primary filter (still pass label for logging). When absent, keep current label + slot + rr_side filters (CMD-K / legacy).

- [ ] **Step 1: Extract pure filter helper (testable)**

Create `src/lib/shiftbuilder/taskMutationIdentity.ts`:

```ts
export type TaskRowFilter = {
  nightId: string;
  slotKey: string;
  slotType?: string;
  rrSide?: string | null;
  taskLabel?: string;
  taskId?: string | null;
};

/** Prefer stable id; fall back to composite night×slot×label. */
export function preferTaskIdFilter(f: TaskRowFilter): {
  mode: "id" | "label";
  taskId?: string;
  taskLabel?: string;
} {
  const id = typeof f.taskId === "string" ? f.taskId.trim() : "";
  if (id) return { mode: "id", taskId: id };
  const label = typeof f.taskLabel === "string" ? f.taskLabel : "";
  if (!label) throw new Error("task mutation requires taskId or taskLabel");
  return { mode: "label", taskLabel: label };
}
```

- [ ] **Step 2: Unit test**

```ts
// src/lib/shiftbuilder/__tests__/taskMutationIdentity.test.ts
import { describe, expect, it } from "vitest";
import { preferTaskIdFilter } from "../taskMutationIdentity";

describe("preferTaskIdFilter", () => {
  it("prefers taskId over label", () => {
    expect(
      preferTaskIdFilter({
        nightId: "n1",
        slotKey: "zone_1",
        taskId: "uuid-1",
        taskLabel: "Old",
      }),
    ).toEqual({ mode: "id", taskId: "uuid-1" });
  });

  it("falls back to label", () => {
    expect(
      preferTaskIdFilter({
        nightId: "n1",
        slotKey: "zone_1",
        taskLabel: "Sweep",
      }),
    ).toEqual({ mode: "label", taskLabel: "Sweep" });
  });

  it("throws when neither", () => {
    expect(() =>
      preferTaskIdFilter({ nightId: "n1", slotKey: "zone_1" }),
    ).toThrow(/taskId or taskLabel/);
  });
});
```

Run: `npx vitest run src/lib/shiftbuilder/__tests__/taskMutationIdentity.test.ts`  
Expected: PASS after implement.

- [ ] **Step 3: Wire server update color**

In `updateNightSlotTaskColorServer`, add optional last param or options object:

```ts
export async function updateNightSlotTaskColorServer(
  nightId: string,
  slotKey: string,
  taskLabel: string,
  color?: string | null,
  rrSide: "mens" | "womens" | null = null,
  markerType?: "highlight" | "underline" | "circle" | "none" | null,
  taskId?: string | null,
): Promise<void> {
  // ...
  const pref = preferTaskIdFilter({ nightId, slotKey, taskLabel, taskId, rrSide });
  let q = client.from("night_slot_tasks").update(update);
  if (pref.mode === "id") {
    q = q.eq("id", pref.taskId!);
  } else {
    q = q.eq("night_id", nightId).eq("slot_key", slotKey).eq("task_label", pref.taskLabel!);
    if (rrSide) q = q.eq("rr_side", rrSide);
    else q = q.is("rr_side", null);
  }
  // ...
}
```

Apply the same pattern to **style**, **label** (label update: when mode is id, set `task_label` to newLabel; when mode is label, filter oldLabel), and **remove**.

For `updateNightSlotTaskLabelServer`:

```ts
export async function updateNightSlotTaskLabelServer(
  nightId: string,
  slotKey: string,
  oldLabel: string,
  newLabel: string,
  rrSide: "mens" | "womens" | null = null,
  taskId?: string | null,
): Promise<void> {
  const trimmed = newLabel.trim();
  if (!trimmed) throw new Error("Task label cannot be empty");
  const client = adminClient();
  const pref = preferTaskIdFilter({
    nightId,
    slotKey,
    taskLabel: oldLabel,
    taskId,
    rrSide,
  });
  let q = client.from("night_slot_tasks").update({ task_label: trimmed });
  if (pref.mode === "id") {
    q = q.eq("id", pref.taskId!);
  } else {
    q = q
      .eq("night_id", nightId)
      .eq("slot_key", slotKey)
      .eq("task_label", oldLabel);
    if (rrSide) q = q.eq("rr_side", rrSide);
    else q = q.is("rr_side", null);
  }
  const { error } = await q;
  if (error) throw new Error(`Failed to update task label: ${error.message}`);
}
```

- [ ] **Step 4: Thread `taskId` through `data.ts` wrappers**

Example for color:

```ts
export async function updateNightSlotTaskColor(
  nightId: string,
  slotKey: string,
  taskLabel: string,
  color?: string | null,
  rrSide: "mens" | "womens" | null = null,
  markerType?: "highlight" | "underline" | "circle" | "none" | null,
  taskId?: string | null,
): Promise<void> {
  // pass taskId in runBoardMutation body and server call
}
```

Ensure mutation route body spreads into server (already free-form for most actions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shiftbuilder/taskMutationIdentity.ts \
  src/lib/shiftbuilder/__tests__/taskMutationIdentity.test.ts \
  src/lib/shiftbuilder/opsMutations.server.ts \
  src/lib/shiftbuilder/data.ts \
  src/app/api/shiftbuilder/mutations/route.ts
git commit -m "feat(shiftbuilder): task mutations prefer stable task id over label"
```

---

### Task 2: Client handlers — async, toast, rollback

**Files:**
- Modify: `src/app/shiftbuilder/ShiftBuilderClient.tsx`

**Handlers to convert** (return `Promise<void>`, accept optional `taskId`):

| Handler | Optimistic | On error |
|---------|------------|----------|
| `handleEditTask` | rename in `selectedTasks` | restore old label + toast |
| `handleSetTaskAppearance` | color+marker | restore previous row + toast |
| `handleSetTaskTextStyle` | textStyle | restore + toast |
| `handleSetTaskColor` / `handleSetTaskMarker` | same | restore + toast |
| remove task path used by pad | already optimistic | restore + toast |

- [ ] **Step 1: Snapshot helper**

Near task handlers:

```ts
function snapshotSlotTasks(
  selectedTasks: Record<string, NightSlotTask[]>,
  uiKey: string,
): NightSlotTask[] {
  return [...(selectedTasks[uiKey] || [])];
}

function restoreSlotTasks(
  setSelectedTasks: React.Dispatch<React.SetStateAction<Record<string, NightSlotTask[]>>>,
  uiKey: string,
  snap: NightSlotTask[],
) {
  setSelectedTasks((prev) => ({ ...prev, [uiKey]: snap }));
}
```

- [ ] **Step 2: Rewrite `handleEditTask`**

```ts
const handleEditTask = React.useCallback(
  async (uiKey: string, oldLabel: string, newLabel: string, taskId?: string | null) => {
    if (!nightId) {
      showToast("No active night selected", "error");
      throw new Error("no night");
    }
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === oldLabel) return;

    const snap = snapshotSlotTasks(selectedTasks, uiKey);
    let remappedStyle: TaskTextStyle | null = null;

    setSelectedTasks((prev) => {
      const existing = prev[uiKey] || [];
      const next = existing.map((t) => {
        if (taskId ? t.id !== taskId : t.taskLabel !== oldLabel) return t;
        remappedStyle = remapTaskTextStyleForLabelChange(t.textStyle, oldLabel, trimmed);
        return { ...t, taskLabel: trimmed, textStyle: remappedStyle };
      });
      return { ...prev, [uiKey]: next };
    });

    const { slot_key, rr_side } = uiToDb(uiKey);
    try {
      const { updateNightSlotTaskLabel, updateNightSlotTaskStyle, getNightSlotTasks } =
        await import("@/lib/shiftbuilder/data");
      await updateNightSlotTaskLabel(
        nightId,
        slot_key,
        oldLabel,
        trimmed,
        rr_side,
        taskId,
      );
      if (remappedStyle) {
        await updateNightSlotTaskStyle(
          nightId,
          slot_key,
          trimmed,
          remappedStyle,
          rr_side,
          taskId,
        );
      }
      const fresh = await getNightSlotTasks(nightId);
      if (currentNight.queryClient) {
        patchNightSecondaryTasksCache(
          currentNight.queryClient,
          formatLocalDateISO(selectedDay.date),
          fresh,
        );
      }
    } catch (err) {
      console.error("[ShiftBuilder] Failed to edit task label:", err);
      restoreSlotTasks(setSelectedTasks, uiKey, snap);
      showToast("Failed to rename task — changes reverted", "error");
      throw err;
    }
  },
  [nightId, selectedDay.date, selectedTasks, currentNight.queryClient, showToast],
);
```

- [ ] **Step 3: Same pattern for appearance / style / color / marker**

Pass `taskId` into `updateNightSlotTaskColor` / style. On failure: restore snapshot + `showToast(..., "error")` + rethrow.

- [ ] **Step 4: Board wrappers pass taskId**

```ts
const handleBoardEditTask = React.useCallback(
  (slotKey: string, oldLabel: string, newLabel: string, taskId?: string | null) =>
    handleEditTask(slotKey, oldLabel, newLabel, taskId),
  [handleEditTask],
);
// Same for appearance/style/remove if signatures change
```

- [ ] **Step 5: Commit**

```bash
git add src/app/shiftbuilder/ShiftBuilderClient.tsx
git commit -m "fix(shiftbuilder): awaitable task handlers with toast and optimistic rollback"
```

---

### Task 3: TasksPad save pipeline — single awaited chain

**Files:**
- Modify: `src/app/shiftbuilder/components/TasksPad.tsx`
- Modify: prop types for `onEditTask` / `onSetTaskAppearance` / etc. to return `void | Promise<void>` and accept `taskId`

- [ ] **Step 1: Widen prop signatures**

```ts
onEditTask?: (
  slotKey: string,
  oldLabel: string,
  newLabel: string,
  taskId?: string | null,
) => void | Promise<void>;
onSetTaskAppearance?: (
  slotKey: string,
  taskLabel: string,
  appearance: { color: string | null; markerType: "highlight" | "underline" | "circle" | "none" },
  taskId?: string | null,
) => void | Promise<void>;
onSetTaskTextStyle?: (
  slotKey: string,
  taskLabel: string,
  textStyle: TaskTextStyle | null,
  taskId?: string | null,
) => void | Promise<void>;
onRemoveTask?: (
  slotKey: string,
  taskLabel: string,
  taskId?: string | null,
) => void | Promise<void>;
```

- [ ] **Step 2: Rewrite `handleSave`**

```ts
const handleSave = async () => {
  const newLabel = formatTaskLabelTitleCase(labelDraft);
  if (!newLabel) {
    onClose();
    return;
  }

  setSaving(true);
  try {
    if (isAddingNew) {
      if (!onAddTask) {
        onClose();
        return;
      }
      await onAddTask(slotKey, newLabel);
      // Appearance after add still keyed by label (row just created); ok.
      await persistAppearance(newLabel);
      if (textStyleDraft && onSetTaskTextStyle) {
        await onSetTaskTextStyle(slotKey, newLabel, textStyleDraft);
      }
      onClose();
      return;
    }

    if (!activeTask) {
      onClose();
      return;
    }

    const taskId = activeTask.id;
    const labelForMeta =
      newLabel !== originalLabel ? newLabel : originalLabel;

    if (newLabel !== originalLabel && onEditTask) {
      await onEditTask(slotKey, originalLabel, newLabel, taskId);
    }

    await persistAppearance(labelForMeta, taskId);

    if (!isTaskTextStyleEqual(textStyleDraft, originalTextStyle) && onSetTaskTextStyle) {
      await onSetTaskTextStyle(slotKey, labelForMeta, textStyleDraft, taskId);
    }

    onClose();
  } catch {
    // Handlers already toasted; keep pad open so operator can retry.
  } finally {
    setSaving(false);
  }
};
```

Update `persistAppearance`:

```ts
const persistAppearance = async (label: string, taskId?: string | null) => {
  const appearance = {
    color: resolveTaskAppearanceColor(colorDraft, markerType),
    markerType,
  };
  if (onSetTaskAppearance) {
    await onSetTaskAppearance(slotKey, label, appearance, taskId);
    return;
  }
  // fallbacks...
};
```

- [ ] **Step 3: `handleRemove` await**

```ts
const handleRemove = async () => {
  if (!activeTask || !onRemoveTask) {
    onClose();
    return;
  }
  setSaving(true);
  try {
    await onRemoveTask(slotKey, activeTask.taskLabel, activeTask.id);
    onClose();
  } catch {
    /* toast from handler */
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 4: Manual smoke**

1. Rename task + change color → Save → hard refresh → both persisted.  
2. Fail network (devtools offline) → toast + UI reverts or pad stays open.  
3. Add new task with color → both present after refresh.

- [ ] **Step 5: Commit**

```bash
git add src/app/shiftbuilder/components/TasksPad.tsx \
  src/app/shiftbuilder/ShiftBuilderClient.tsx \
  src/app/shiftbuilder/components/ShiftBuilderBoard.tsx
git commit -m "fix(shiftbuilder): TasksPad awaits rename before appearance and keeps pad open on error"
```

---

### Task 4: Fail closed on missing nightId + surface 23505 duplicates

**Files:**
- Modify: `src/lib/shiftbuilder/opsMutations.server.ts` `addNightSlotTaskServer`
- Modify: `src/app/shiftbuilder/ShiftBuilderClient.tsx` (already toasts add; ensure all meta handlers check nightId)

- [ ] **Step 1: Add server — do not swallow all 23505 silently to client**

Option A (recommended): throw a typed message:

```ts
if (error) {
  if ((error as { code?: string }).code === "23505") {
    throw new Error("A task with this label already exists on this slot");
  }
  throw new Error(`Failed to add task: ${error.message}`);
}
```

Client already toasts add failures.

- [ ] **Step 2: Guard every task handler**

At top of appearance/style/color/marker/edit/remove:

```ts
if (!nightId) {
  showToast("No active night selected", "error");
  throw new Error("no night");
}
```

Remove non-null assertions `nightId!` after guard.

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(shiftbuilder): fail closed on missing nightId and duplicate task labels"
```

---

### Task 5: Pad sync deps + discard confirm

**Files:**
- Modify: `src/app/shiftbuilder/components/TasksPad.tsx`

- [ ] **Step 1: Task list signature for sync**

```ts
const slotTasksSig = React.useMemo(
  () =>
    regularTasks
      .map((t) => `${t.id}:${t.taskLabel}:${t.color ?? ""}:${t.markerType ?? ""}`)
      .join("|"),
  [regularTasks],
);
```

Replace deps on the mount/sync effect:

```ts
}, [slotKey, initialTask?.id, initialAddMode, slotTasksSig, usePortal]);
```

Keep the active-task effect as-is for live updates of the selected row.

- [ ] **Step 2: Unsaved discard**

```ts
const requestClose = useCallback(() => {
  if (hasChanges && !saving) {
    const ok = window.confirm("Discard unsaved task changes?");
    if (!ok) return;
  }
  onClose();
}, [hasChanges, saving, onClose]);
```

Wire Cancel button, ✕, Escape, and backdrop `onClick` to `requestClose` instead of raw `onClose`.

Board outside-click still calls `closeTaskTextEditPad` without confirm — optional: expose `onRequestClose` or accept that outside click is hard close for v1. **In this task:** also update board doc click to not close if target is inside pad (already checks `[data-tasks-pad]`); for outside, hard close is OK **or** leave confirm only on explicit Cancel/Escape.

Minimum: Cancel / Escape / ✕ use confirm.

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(shiftbuilder): TasksPad resync on task content and confirm discard"
```

---

### Task 6: Selection format honesty

**Files:**
- Modify: `src/app/shiftbuilder/components/TasksPad.tsx`

**Decision (YAGNI):** Hide “Selection” scope until spans render in the editor. Whole-task format remains.

- [ ] **Step 1: Remove or disable selection scope UI**

```tsx
{/* Selection scope deferred — contentEditable does not render spans. */}
<span className="text-[10px] text-neutral-400 px-2 py-0.5">Whole task</span>
```

Force `formatScope` always `"task"`:

```ts
const formatScope: TaskFormatScope = "task";
// remove setFormatScope UI
```

Or keep toggle but when selection chosen show banner:

```tsx
{formatScope === "selection" && (
  <p className="px-3 text-[10px] text-amber-700">
    Selection formatting applies on Save (preview below). Editor shows plain text.
  </p>
)}
```

**Prefer hide** to avoid false UX.

- [ ] **Step 2: Enter always saves in whole-task mode**

With scope fixed to task, Enter save path stays.

- [ ] **Step 3: Commit**

```bash
git commit -am "fix(shiftbuilder): TasksPad whole-task formatting only until rich editor exists"
```

---

### Task 7: taskTextStyle unit tests

**Files:**
- Create: `src/lib/shiftbuilder/__tests__/taskTextStyle.test.ts`

- [ ] **Step 1: Tests for normalize + remap**

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeTaskTextStyle,
  remapTaskTextStyleForLabelChange,
  formatTaskLabelTitleCase,
} from "../taskTextStyle";

describe("normalizeTaskTextStyle", () => {
  it("returns null for empty", () => {
    expect(normalizeTaskTextStyle(null)).toBeNull();
    expect(normalizeTaskTextStyle({})).toBeNull();
  });

  it("keeps bold + fontSize", () => {
    expect(normalizeTaskTextStyle({ fontWeight: "bold", fontSizePx: 13 })).toEqual({
      fontWeight: "bold",
      fontSizePx: 13,
    });
  });
});

describe("remapTaskTextStyleForLabelChange", () => {
  it("moves spans when substring survives", () => {
    const style = {
      spans: [{ start: 0, end: 4, bold: true }],
    };
    const next = remapTaskTextStyleForLabelChange(style, "Test room", "Test zone");
    expect(next?.spans?.[0]).toMatchObject({ start: 0, end: 4, bold: true });
  });
});

describe("formatTaskLabelTitleCase", () => {
  it("title-cases words", () => {
    expect(formatTaskLabelTitleCase("sweep high limit")).toMatch(/Sweep/);
  });
});
```

- [ ] **Step 2: Run**

```bash
npx vitest run src/lib/shiftbuilder/__tests__/taskTextStyle.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/shiftbuilder/__tests__/taskTextStyle.test.ts
git commit -m "test(shiftbuilder): cover task text style normalize and remap"
```

---

### Task 8: Verification gate

- [ ] **Step 1: Unit tests**

```bash
cd /Users/briankillian/oms_root
npx vitest run src/lib/shiftbuilder/__tests__/taskMutationIdentity.test.ts \
  src/lib/shiftbuilder/__tests__/taskTextStyle.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

No new errors in TasksPad / data / opsMutations (pre-existing `suggestion` error may remain).

- [ ] **Step 3: Manual checklist**

| Action | Expect |
|--------|--------|
| Rename + color Save | Both after hard reload |
| Offline Save | Toast; pad stays open or UI reverts |
| Duplicate label Add | Toast error, no silent success |
| Remove task | Gone after reload; fail → toast |
| Cancel with dirty editor | Confirm dialog |
| Two tasks different labels | Independent styles |

- [ ] **Step 4: Final commit only if checklist fixes needed**

---

## Dependency graph

```text
Task 1 (id mutations) ──► Task 2 (client handlers) ──► Task 3 (TasksPad save)
Task 4 (nightId / 23505) can parallel Task 2 after Task 1
Task 5 (sync/discard) parallel after Task 3 UI starts
Task 6 (format honesty) independent
Task 7 (textStyle tests) independent
Task 8 last
```

---

## Spec coverage

| Debug report item | Task |
|-------------------|------|
| Rename then appearance race | 3 (+ 2 await) |
| Identity by label only | 1 + 2 + 3 |
| Silent fail / no rollback | 2 |
| nightId! fail open | 4 |
| Sync deps length only | 5 |
| Selection format fake | 6 |
| Enter only in task scope | 6 |
| Add partial appearance fail | 3 (toast, pad open) |
| Remove fire-and-forget | 3 |
| Outside/cancel discard | 5 |
| No tests | 1, 7 |
| Draft mode for tasks | Out of scope |

---

## Self-review

1. All P0/P1 from Tasks Pad report map to tasks; draft mode explicitly deferred.  
2. No TBD placeholders; concrete signatures and code.  
3. `taskId` optional end-to-end; label fallback preserved for add-after-create and CMD-K.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-11-tasks-pad-correctness.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, batch with checkpoints  

**Which approach?**
