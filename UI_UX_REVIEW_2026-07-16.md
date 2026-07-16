# ShiftBuilder UI/UX Review — 2026-07-16

Five review passes over the full UI surface (~52k lines of TSX): core builder, card/visual layer, Projects/Tasks console, admin consoles (Team/Settings/Sudo/Print), and cross-cutting infrastructure (nav, auth, theme, PWA, a11y). Findings were verified against the implementation and the primary workflows were exercised in a running app at desktop, iPad, split-view, and compact widths. Ranked by how much they matter to a grave-shift operator on an iPad.

## Executive assessment

**Overall:** the product already has an unusually coherent visual point of view. The paper-and-glass system, restrained color, card hierarchy, typography choices, PIN gate, motion discipline, and print experience feel authored rather than assembled. Preserve that character. The gap is now between how polished the product *looks* and how safe, concise, and self-explanatory some workflows *behave*.

**Best next move:** do one hardening sprint before adding surface area. Fix the state/DB correctness issues, install a single feedback layer, make destructive actions recoverable, and reduce the board's action menu. That work will improve trust and perceived quality more than another round of visual decoration.

**Recommended sequence:**

1. Correct data-loss and false-success paths (Tier 1 items 1–6).
2. Add one global toast/Undo system and normalize confirmations.
3. Collapse navigation into task-oriented groups and clarify the empty-slot assignment flow.
4. Separate screen density from print density; make keyboard, touch, and focus states first-class.
5. Defer week-wide history/prefetch work and lazy-load print/export tooling.

## Live workflow review

### ShiftBuilder canvas

- **What works:** the assignment canvas is distinctive, information-dense without feeling industrial, and remarkably calm for an operational tool. The colored edge system and strong assignee names make scanning fast. Authentication is responsive, labeled, focus-trapped, reduced-motion aware, and still permits browser zoom.
- **Action overflow is doing too much.** `FloatingNav.tsx:795-1121` puts roughly 18 actions in one tall menu. Group them into **Build**, **Publish**, and **Output**, expose the one primary context action, and move low-frequency tools behind a command palette. This makes the interface easier to learn without removing power.
- **Empty assignment is a dead end.** Opening an unassigned slot can lead to a picker that says “All TMs placed,” while the broader roster appears only after typing. In `MarkerPad.tsx:917-1095`, replace the empty state with: “Everyone scheduled is placed. Search to replace or add on-call,” plus explicit **Show placed** and **Swap assignment** actions.
- **Assignment panels need dialog semantics.** `PlacementPad.tsx:1257-1337` should move focus inside, support Escape, restore focus to the originating card, and expose a real dialog/popover name. The close control is also undersized.
- **The card interaction model is ambiguous to assistive technology.** DnD makes card shells button-like while break, task, and remove buttons live inside them. Make the shell an `article`/`div` and provide one explicit assignment button, or make the whole shell a button and move secondary controls outside it—never both.
- **Compact widths scale the artboard past legibility.** At 320px, the layout technically fits but card columns collapse to roughly 38px. Below the supported split-view width, switch to a linear/collapsible assignment list or show a deliberate “wider view required” state; do not keep shrinking the canvas.

### Projects, Reports, and Settings

- **Projects has a real compact-width overflow bug.** At 390px the document is 375px wide but its content reaches roughly 522px. `projects/components/TaskFilterBar.tsx:36-141` keeps nine filters and seven view modes in one non-wrapping row. Keep List/Board/Calendar primary; move Recurring/Pools/Defaults/Planner into a secondary menu and saved filters.
- **Quick Add is visually clean but not quick for a long roster.** `TaskQuickAdd.tsx:60-130` uses a native select containing 100+ names, and several controls have no accessible name. Use a labeled searchable combobox, retain recent assignees, and let `/` or `N` focus the title field.
- **Reports and Settings repeat too much chrome.** Status bar + hero + route tabs + local panel header consumes a large portion of a 768px-tall viewport. Use one shared route shell and one local toolbar; this recovers roughly 140–180px for the actual work.
- **The design system is visually consistent but behaviorally fragmented.** Toasts, confirms, modals, save semantics, dark-mode tokens, and touch-target rules each have multiple implementations. Consolidating these primitives is the highest-leverage consistency work in the codebase.

## Verification snapshot

- `pnpm build`: passes (Next.js 16 production build).
- `pnpm test`: 41 files, 349 tests pass.
- ShiftBuilder-scoped ESLint: 922 findings (621 errors, 301 warnings). The root lint is additionally polluted by generated/hidden directories; configure ignores first, then pay down the real React and accessibility findings.
- Warm navigation is fast, but cold development runs showed poor TTFB/FCP and LCP around 4.2s. Full-week prefetch starts almost immediately (`builderPrefetch.ts:33-64` and `ShiftBuilderClient.tsx:2748-2762`), while placement-history calls were observed taking several seconds. Fetch the selected night first, cap background concurrency at two, cancel stale work, and batch/cache placement history.
- The client ships about 4.9 MB of uncompressed JavaScript chunks; print/export dependencies such as jsPDF are among the largest. Lazy-load print, export, AI, tutorial, and report-only features on first use.
- `ShiftBuilderClient.tsx` is ~9,000 lines, `ShiftBuilderBoard.tsx` ~2,100, `FloatingNav.tsx` ~1,100, and `globals.css` ~3,800. Feature slices plus an explicit board state machine will make future UX refinement safer and faster.

---

## Tier 1 — Bugs that bite real users

### Data-integrity class (board state vs DB)

1. **Failed saves look like successes.** `src/lib/shiftbuilder/useLiveAssignments.ts:235` — the rollback snapshot of the main board store is captured *after* the optimistic patch is applied, so `onError` "restores" the failed change instead of reverting it. The query cache and live store roll back, but the store the board renders from keeps showing the rejected assignment while the toast claims the board was restored. **Fix:** capture `useShiftBuilderStore.getState().assignments` into a local *before* the `setAssignments` patch.

2. **Undo/redo is client-only.** `ShiftBuilderClient.tsx:3244` (`applySnapshot`) — Cmd+Z restores assignments in client state but never writes to the DB, so the "undone" change silently reappears on the next 20s nightCore poll or day switch. **Fix:** diff before/after snapshots and issue the corresponding upserts/deletes — or disable assignment undo and say so.

3. **WeekLens "swap" drops a TM.** `ShiftBuilderClient.tsx:7589-7706` (`applyWeekLensMove`) — suggestions labeled "swap with X" apply as delete-source + overwrite-target; the displaced TM (`sugg.to.viaSwapWith`) silently vanishes from the board, with no confirmation for overwriting an occupied slot. **Fix:** honor `viaSwapWith` by writing the displaced TM to the source slot (mirror `applyDraftMoveOrSwap`).

4. **Two-slot drag swap is not atomic.** `ShiftBuilderClient.tsx:5685-5734` — two sequential `upsertZoneAssignment` calls; if the second fails, UI rolls back but the first write already committed. `batchApplyDraftAssignments` already exists as the model. 

5. **Fast day-switch can poison the previous night's cache.** `useLiveAssignments.ts:284-291`, `ShiftBuilderClient.tsx:6012-6020`, `:5721-5728` — after awaits, store state is written into `["nightCore", <captured dateKey>]` without checking the board is still on that day. `liveCache.ts:92-96` has exactly the right guard; the cache patches don't. **Fix:** add the same day-key guard.

6. **Session expiry mid-draft destroys work.** `providers.tsx:48-55` + `src/lib/auth/opsAuth.tsx:154-158` — the 45s poll or a visibilitychange wipes night queries, `setAssignments({})`, and `clearDraft()` the moment the session reads expired — before the operator can re-PIN. Drafts are in-memory only; an iPad sleeping past the 30-min idle loses everything even when the same operator logs right back in. `PwaRegister.tsx:40-44` silent auto-reload on deploy is a second path to the same loss. **Fix:** snapshot draft state keyed by user id before clearing and restore on re-auth; defer reload while `draftSlotCount > 0`.

### Feedback-void class (user acts, nothing happens)

7. **UsersTab admin feedback never renders.** `sudo/UsersTab.tsx:141` — `useToast()` is per-instance local state and UsersTab never renders the toast list. All 11 call sites (save privileges, create user, deactivate/reactivate, load failure) show nothing. An admin whose privilege save fails gets zero signal.

8. **Projects console has no error surface at all.** `projects/hooks/useTaskMutations.ts:123-125` rolls back optimistically with no signal (failed board drag = card snaps back unexplained); `TaskQuickAdd.tsx:44-58` and `PoolsView.tsx:24-28` await mutations uncaught. Worst: the comment box renders for all viewers (`TaskDetailContent.tsx:370-383`) but POST requires complete-level access — a viewer hits Enter, the draft clears, the 403 is swallowed, the comment is silently lost. **Fix:** one shared toast provider wired into mutation `onError` (see Tier 3, toasts).

9. **Skill sliders fire a mutation per tick.** `sudo/TeamTab.tsx:1204-1211` — every `onChange` of the range input calls `upsertSlotSkill` + full `getTMDetail` refetch; one drag = dozens of unordered mutations with race-prone refetches. **Fix:** commit on pointer-up or debounce ~300ms.

### Interaction hazards

10. **Drag-to-nowhere silently unassigns.** `ShiftBuilderClient.tsx:5746-5750` — dropping an assigned card outside any droppable removes the TM; undo is Cmd+Z only, which doesn't exist on the iPad this board is built for. **Fix:** restrict unassign to the explicit roster drop zone, or show a toast with an Undo action.

11. **ConfirmDialog: Enter anywhere = confirm.** `components/ConfirmDialog.tsx:62-70` — document-level keydown maps Enter to confirm unconditionally, including danger dialogs (Clear Day, Apply to Live); Tab-to-Cancel + Enter still confirms. No focus trap, no focus restoration. PinGate (`PinGate.tsx:14-44`) already has the right trap to reuse.

12. **Month picker skips February.** `components/FloatingNav.tsx:380,393` — paging by `addDays(±30/32)` from the 1st: March − 30 days = Jan 30, so February is unreachable going backward, and forward paging drifts. **Fix:** `new Date(y, m ± 1, 1)`.

13. **Publish Day can double-fire.** `FloatingNav.tsx:87-92` — `publishDayBusy` is passed by the parent but never destructured; the Publish pill never disables in flight, so a double-tap toggles publish→unpublish. (Same dead-prop set: `onThemeToggle`, `weekHealthPercent`, `isSyncing` — the wired theme toggle simply doesn't exist in the nav.)

14. **Recurring tasks lose their location.** `api/shiftbuilder/projects/tasks/[taskId]/generate-next/route.ts:44-62` — generating the next occurrence omits `slot_key`/`slot_type`/`rr_side`/`pool_id` even though templates store them. "Weekly deep-clean Zone 4" materializes unlocated every week.

15. **Approval decisions can race.** `api/.../requests/[id]/decision/route.ts:32-54` — check-then-update without `.eq("approval_state","pending")`; two managers deciding concurrently both pass, second silently overwrites first (approve→reject flips a live task). Also `requests/[id]/route.ts:82-105`: a requester can withdraw (soft-archive) an approved, in-progress task — it vanishes from every list with no manager notification.

16. **Board card headers lost their font to a typo.** `components/assignmentCardChrome.tsx:245` — `fontFamily: "var(--font-atkinson, var(--font-ui, system-ui)"` is missing a closing paren; the browser drops the declaration, so every zone/RR/aux/overlap header renders in the inherited font instead of Atkinson.

17. **`viewport.ts` is dead config.** `src/app/viewport.ts` is never imported/re-exported; `viewport-fit=cover` and `interactiveWidget` are never emitted, which `env(safe-area-inset-*)` (OpsStatusBar) depends on for the full-bleed iPad PWA shell. **Fix:** `export { viewport } from "./viewport"` in `src/app/layout.tsx`.

18. **Grave-date rollover freezes on idle tabs.** `projects/ProjectsClient.tsx:119-125` + `TaskListView.tsx:104` — `tonightDateISO()` is called inside memos keyed only on `[tasks]`; React Query structural sharing keeps the reference stable, so Overdue/Due-Tonight grouping freezes at the pre-08:30 date on an open tab. The ticking `now` state already exists — pass it into the memos.

---

## Tier 2 — Violations of your own invariants

**Unpaired `backdropFilter` (drops blur on iPadOS < 18)** — 5 sites, found independently by two agents:
- `components/ConfirmDialog.tsx:84` (scrim)
- `components/InteractiveStage.tsx:203` and `:224` (drag ghost)
- `components/assignmentCardChrome.tsx:982` (`cardBodyInteriorStyle`, consumed by AuxCard)
- `ai/page.tsx:229` (header)

**Portal invariant regressions** (fixed modals stayed fixed; two new offenders):
- `projects/components/TaskBoardView.tsx:107-149` — the drag-to-Blocked "reason" modal is bare `position:fixed` inside a shell whose `sb-content-enter` animation retains a transform (`authGate.css:624-637`, `fill-mode: both`) — the shell becomes the containing block, so the dialog can center off-screen on a scrolled board and scrolls with the page.
- `components/TasksPad.tsx:769-783` — the `!usePortal` fallback branch renders `fixed inset-0` without `createPortal`, inside the scaled viewport. The portaled branch at `:786` is correct; this fallback triggers whenever the host-attribute lookup fails.

**Service worker hygiene** (`public/sw.js`):
- `:16` — `CACHE_VERSION = "v4-ipad-20260712"` but three release commits landed 7/14 with no bump; the per-release policy is drifting two days after being instituted. Consider injecting a build hash at CI instead of relying on discipline.
- `:146-151` — every successful navigation overwrites the offline fallback under the `OFFLINE_URL` key, so an offline boot can hydrate the wrong route's HTML. Only cache when `url.pathname === OFFLINE_URL`.

---

## Tier 3 — Consistency and design-system drift

**Toasts: four systems and a void.** Per-instance `useToast` (never rendered in UsersTab), DefaultsTab's own LocalToast queue (`DefaultsTab.tsx:210-249`), TeamTab's single-slot flash (`TeamTab.tsx:72`), SudoGlass inline banner (`SudoGlass.tsx:153-193`) — and /projects has none. BatchPlannerTab is alone in using native `window.confirm` (`BatchPlannerTab.tsx:142,189`) instead of ConfirmDialog. **The single highest-leverage consistency fix in the app: one ToastProvider next to ConfirmProvider in `shiftbuilder/layout.tsx`, everything migrates to it.**

**Dark mode is fractured.**
- `ios26-colors.css:78-110` — `--ios-*` tokens flip on OS dark via media query while `--sb-*` flips via `.dark` class; a user who explicitly chooses light on an OS-dark device gets a mixed theme (e.g. FloatingNav's calendar popover paints dark). Drop the media block; the `.dark` mirror already exists at `:113-138`.
- `sudo/TeamTab.tsx:900-942,1185-1226` — PrefsForm/SkillsForm are hardcoded dark-zinc, but /team renders TeamTab with `isDark={false}` — near-invisible light-gray-on-light text on the primary people console.
- `BatchPlannerTab.tsx:266-517` and `EngineConfigTab.tsx:217-307` ignore `isDark` (zinc-950 cards inside light Settings paper).
- `PlacementPad.tsx:427` requires `isDark` in its props and never reads it — a bright white slab on the dark glass board.

**Typography/geometry drift on the board:**
- Hardcoded `"Helvetica Neue"` stacks in `OverlapSlot.tsx:138`, `BreakWaveColumn.tsx:34`, `TasksPad.tsx:430,710`, `BoardTaskPill.tsx:48` while zone cards use `--font-bricolage`/`--font-atkinson` tokens — the same TM's name renders in different faces on different card types. BreakWaveColumn even drifts internally (Golden variant tokenized, builder variant Helvetica).
- `OverlapSlot.tsx:146` uses `rounded-xl` where all sibling cards use `rounded-2xl`.
- `AuxCard.tsx:456` role-picker portals at `z-[9999]`, off the app's deliberate z-scale (55→210).

**Focus visibility fails app-wide.** `globals.css:391-395` — the global `:focus-visible` replaces outlines with a 3px `#E5F0FF` glow (≈1.1:1 contrast on white; similarly faint in dark), and box-shadow rings clip under `overflow:hidden` cards. Use a 2px solid `--accent-2` outline with offset.

**Destructive-action confirm drift.** Request withdraw gets ConfirmDialog, but archive task (`TaskDetailContent.tsx:407-415`), archive recurring template (`RecurringView.tsx:128-135`), and delete pool (`PoolsView.tsx:105-111`) are single-click, and there's no unarchive UI anywhere — "reversible" soft delete is only reversible via SQL. Sudo drift is inverted: role change demands PIN re-entry but Deactivate user is a soft confirm and Reactivate is zero-confirm (`UsersTab.tsx:363-396`).

**Unsaved-edit hazards in explicit-save modals.** TM drawer closes on Esc/backdrop with no dirty check (`TeamTab.tsx:455-464`; Esc double-registered with `SudoGlass.tsx:251-261`); one modal mixes three save semantics (explicit Save / labeled auto-save / unlabeled instant-commit). "New TM" inserts a live engine-eligible row *before* any editing (`TeamTab.tsx:228-241`) — abandoning the drawer leaves junk TMs. GravesDefaultSchedulePage's 400ms debounced save has no flush on pagehide (`GravesDefaultSchedulePage.tsx:360-369`) — toggle-then-close-PWA drops the edit.

**A11y gaps beyond ConfirmDialog:** `AdminPinConfirmModal` and `RequestBoardModal` lack `role="dialog"`, Escape, focus trap, label association; `assignmentCardChrome.tsx:318-341, 673-693` — primary assign/covered actions are `motion.div onClick` with no role/tabIndex/keyboard path, so the assignment surface is keyboard-unreachable; FloatingNav day buttons expose only "S"/"M"/"T" as accessible names; AuxCard's clear × is a ~16×18px target where CoverageBar's equivalent gets a 44px floor (`sb-tablet-touch-target`).

---

## Tier 4 — Performance

1. **The board's `React.memo` is defeated every render.** `ShiftBuilderClient.tsx:8101-8186, 8734-8801` — ~8 unstable props (inline arrows + non-memoized `assign`/`unassign`/`toggleLock`/`setBreakGroupForSlot`/`applyDraft`) hand the memoized board fresh identities on every render of the 9k-line client. Memoize the handlers and the board memo actually bails out. Likely the single biggest perceived-latency win.
2. **Week health recomputes synchronously mid-drag.** `ShiftBuilderClient.tsx:4076-4214` — full week × ~30 slots × `computeSlotPlacementFit` on every assignment/draft change; `useDeferredValue` is applied downstream of the computation instead of to its inputs (`deferredAssignmentsForFit` already exists — feed it in), or move the loop into the existing day worker.
3. **Row-equalize thrash.** `ShiftBuilderBoard.tsx:816-952` — double-rAF forced layout of ~25 cards + a fresh ResizeObserver on every data-shaped dep change. One persistent RO + debounce.
4. **Realtime full-tree invalidation.** `projects/hooks/useProjectsRealtime.ts:32-47` — any `ops_work_items` change refetches tasks+projects+pools+defaults+requests+detail+roster on every client; pool distribute's N sequential updates (`distribute/route.ts:67-82`) emit N events past the 250ms debounce. Split the roster key root, invalidate per-table, batch distribute into one UPDATE. Related: dropping a card on its own column issues a real PATCH that broadcasts to everyone (`TaskBoardView.tsx:72-82`).
5. **Small paid-per-open/per-render costs:** PlacementPad registers duplicate listener sets (dead `portalStyle` at `:680-681` shadowed by `:1254-1255` — delete two lines); Orb rebuilds the whole WebGL pipeline on any prop change (`Orb.tsx:304` — HealthOrb's propsRef pattern is the in-repo fix); undo/redo keydown listeners tear down/re-add every render (`ShiftBuilderClient.tsx:1892-1909` — use the existing ref pattern); BoardTaskPill animates `left` instead of transform (`BoardTaskPill.tsx:40-50`).

---

## Tier 5 — Dead weight worth deleting

- **MarkerPad main component is ~1,100 dead lines** (`MarkerPad.tsx:1188-1929` + internal sections) — never rendered anywhere; only `getSlotMeta`/`TmPicker`/`TmEntry` are consumed. It's also the one fixed-position panel that doesn't portal — a latent invariant violation if revived. Extract the three used exports; delete the rest.
- `engineRunPhase` exists twice with incompatible unions (store slice unused; `useEngineRunner` local is real); `useLiveAssignments.toggleLock` is a console.log stub; dead board fallbacks (`?? auxDefsProp ?? {}` would throw if reached).
- Legacy `tm_groups` overlap fallback is now a dead-end: band eligibility honors "AM/PM Overlaps" group membership (`gravesDefaultSchedule.ts:418-446`) but SpecialGroupsPanel deliberately hides those groups — a TM in a legacy group is band-eligible forever with **no UI anywhere to remove them**. Migrate and drop the fallback.
- EngineConfigTab ships a permanent "coming in next Sudo pass" placeholder card dated 2026-05-28 (`EngineConfigTab.tsx:238-259`).
- Planner view ships `prompt()`/`alert()` stubs as live buttons; the "Brian-exclusive" smart filters are keyword heuristics presented as real filters (`ProjectsClient.tsx:223-265, 44-53`) — gate behind a flag or label experimental.
- Dead globals.css blocks: `.btn-primary`/`.slot.drag-over`/`.drag-preview` referenced by no TSX; three parallel gray text scales; #007AFF spelled three ways; unused shadcn `--sidebar-*`/`--chart-*` tokens.
- Dev-surface fossils: `ui/cards/CardShell` and `book-cards` palettes now contradict GOLDEN_VISUAL_SPEC and each other; `BookZoneCard.tsx:58` `draggable={hasName || true}`.

---

## Tier 6 — Things to implement (highest smile-per-line first)

1. **One ToastProvider + success-with-Undo.** Fixes findings 7, 8, 10 in one move and becomes the app-wide feedback standard. Undo-toast on drag-to-unassign turns the board's scariest silent action into a safe one.
2. **Draft/board work preservation across auth + deploys.** Snapshot drafts keyed by user id before session-clear; defer PWA auto-reload while a draft is open. Directly kills the worst data-loss path on the iPad.
3. **Projects: URL-persisted state + bulk select + quick-add keyboard layer.** `view`/`smartFilter`/`selectedProjectId` to searchParams (muscle memory + shareable links); checkbox column + bulk bar in List (today, pooling 6 tasks = 6 detail sheets); `n` or `/` focuses TaskQuickAdd, `1-5` switches views, j/k + x on rows.
4. **Approve-with-triage.** Inline project + assignee selects beside Approve in PendingRequestsPanel (data's already loaded) so approval doesn't force a second edit pass. Plus "Edit & resubmit" for rejected requests — currently a dead-end state.
5. **Calendar interactivity.** Click empty day → TaskQuickAdd pre-filled with that date; drag chips between days to reschedule (dnd-kit + `useUpdateTask` already support it).
6. **Membership doctor.** Banner on /team → Graves Schedule listing TMs whose three overlap stores disagree, one-click reconcile — retires the known 3-way drift and the legacy-group dead-end.
7. **Deep-linkable TM drawer** (`/shiftbuilder/team?tab=roster&tm=<id>` — drawer already keys on tmId) so board/audit/report surfaces jump straight to a person.
8. **Dry-run diff for Defaults pushes** ("12 slots will change: Z3 2→1…") in the confirm dialog before overwriting per-shift overrides — the applied-counts plumbing already exists.
9. **Print Command Center: "restore last selection" chip** — `loadLastPrintConfig` exists and works but the modal always resets to tonight-defaults; mid-week re-prints re-click every chip.
10. **Branded error boundary + real loading states.** No `error.tsx` anywhere — any throw lands on Next's unbranded "Application error" on a floor-facing iPad. `loading.tsx` returns null → blank flash on section navigation. BuilderLoadingShell exists to reuse.

---

## What's genuinely excellent (preserve through any refactor)

- **Race-free capture discipline** — every mutator captures `(nightId, date, dayName)` at gesture time; persist helpers never re-read state. The "write lands on the night it was issued against" contract holds everywhere.
- **The applyDraft commit path** — server-side eligibility guard that fails closed, batch write with `expectedUpdatedAt` concurrency check, board never painted until DB confirms. A real transaction boundary.
- **Drag-stability machinery** — `pendingDrag` overlay keeps source cards draggable mid-gesture; `useSlotDnd` documents the exact regression that once killed the coverage gesture; the coverage-drag invariant currently holds on all 4 card types.
- **`SlotAssignmentBody` state machine** — one loading/draft/assigned/covered/unassigned body consumed identically by Zone/RR/Aux/Overlap.
- **The print pipeline** — solved layout system, snapshot rendering, focus trap, status-aware defaults; the most disciplined code in the app.
- **Layered permission gating** — route gates → per-tab flags → server-side checks on every write; legacy URLs redirect with care.
- **`src/lib/tasks` core** — genuinely portable, tested recurrence math; grave semantics quarantined in one adapter; API surface consistently defended (same-origin, rate limit, owner-scoping that 404s).
- **Service worker + PIN gate + reduced-motion discipline** — network-first/no-store navs exactly as intended; PinGate is the a11y standard the other modals should copy; nearly every animation has a reduce path.

## Suggested fix order

1. **One-line/one-file criticals:** assignmentCardChrome font paren (16), viewport re-export (17), month picker (12), rollback capture order (1), decision-route predicate (15), generate-next slot copy (14), publishDayBusy wiring (13).
2. **The feedback layer:** ToastProvider + migrate 4 systems + wire projects mutations + Undo toast for drag-unassign (7, 8, 10, Tier 3).
3. **Invariant sweep:** 5 backdrop pairs + 2 portal fixes + sw.js offline-key guard + CI cache-version bump (Tier 2).
4. **Data-loss hardening:** draft preservation across session expiry/deploy (6), swap atomicity (4), day-key guards (5), undo-DB write or removal (2), WeekLens swap (3).
5. **Perf pass:** board memo props (the big one), week-health deferral, row-equalize, realtime key split.
6. **Then the smile features** (Tier 6), starting with projects URL state + bulk select and approve-with-triage.
