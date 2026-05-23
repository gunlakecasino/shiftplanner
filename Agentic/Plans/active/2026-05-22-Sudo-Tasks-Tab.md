# Plan: Sudo "Tasks" Tab — Central Hub for Card Task Catalog + Command Palette Integration

**Status**: Phase 1 Planning — Ready for Review  
**Owner**: Grok 4.3 (coding-engineer + ui-mcp)  
**Date**: 2026-05-22  
**Related**: Command Palette Phase 3 (hot actions), existing task schema (20260520 migrations), data.ts task functions, SudoWindow tabs, GOLDEN_VISUAL_SPEC (tasks on cards)

---

## 1. Problem Statement

Operators currently manage "deployment tasks / responsibilities" (the labels shown under zone cards, RR sides, overlaps, AUX on the GRAVE sheets) through:
- A per-card popover (catalog checkboxes + free-text "+ Add custom task")
- Direct DB edits or the limited custom add (which only appends, no central curation, no reordering, no overview)

There is a solid DB foundation (`slot_task_catalog` + `night_slot_tasks`, overlap support) and optimistic UI in ShiftBuilderClient, but **no first-class hub**.

The Command Palette has a stub "Tasks" action with a multi-select + free-text flow, but it does **not** surface or pull from the curated catalog — missing the power of operator-defined standard tasks.

**Goal**: Create a dedicated "Tasks" tab in the SUDO admin surface that is the single source of truth for curating the task catalog, while making the palette's `{tasks}` / Tasks hotword first-class by offering the live catalog for fast, consistent assignment.

---

## 2. Success Criteria (Measurable)

- A new "Tasks" tab appears in SudoWindow (between Engine Config and coming-soon items or logically grouped), styled consistently with existing sudo tabs (dark zinc, red accents, Atkinson, Lucide icons).
- Full CRUD on `slot_task_catalog`:
  - View all tasks grouped by slot_type (Zone / RR / Overlap / AUX) and slot_key
  - Add new task to any slot_key (or sensible "apply to all zones" helper)
  - Edit label, sort_order, (future) default color
  - Delete (with guard if referenced by night_slot_tasks)
  - Search / filter across the entire catalog
- Changes made in the hub are immediately usable:
  - Per-card task popovers in the main canvas can use newly added catalog items after a lightweight refresh or automatic re-fetch trigger
  - Command Palette "Tasks" flow surfaces catalog items (searchable quick picks + free text fallback) for the selected slot(s)
- The palette flow supports both catalog selection **and** the existing free-text multi-assign, preserving current behavior while upgrading it.
- No regressions in existing task assignment, rendering on cards, or print fidelity.
- Live browser validation (sudo tab interactions + palette task assignment flows) passes with zero critical issues.
- Operators can answer "where do I define the standard tasks that appear in the palette and on cards?" with one answer: the Sudo → Tasks tab.

---

## 3. Data / Supabase Impact

**No new tables or columns required** (the schema is already production-grade and seeded).

**Extensions needed in data layer** (src/lib/shiftbuilder/data.ts):
- `updateCatalogTask(id, { label?, sort_order?, rr_side? })`
- `deleteCatalogTask(id)` — with optional safety check for existing night_slot_tasks references (warn but allow, since label is denormalized)
- Possibly `getCatalogStats()` or simple count of usages per catalog item

**RLS / Security**:
- Catalog is global reference data (low sensitivity). Current writes in sudo use the service-role key (same as all other sudo tabs).
- Review existing policies on `slot_task_catalog` (if any). If row-level policies exist that would block service-role or need an "operator" role later, document. No new RLS changes expected for v1 — follow the exact pattern used by EngineConfig / Team updates.
- Night_slot_tasks mutations already have working optimistic + persist paths; hub will primarily mutate the catalog.

**Realtime** (future-friendly):
- Catalog changes are rare. For v1 we will not add a realtime subscription (keeps scope small). The hub will call `onDataChanged` and we will add a minimal "refresh catalog" capability to the main client (or a `window.dispatchEvent` + listener, or lift catalog into a small context/provider).
- If usage proves the need, Phase 2 can add `supabase.channel('catalog')`.

**Migration impact**: None. Existing seed data remains authoritative.

---

## 4. Frontend Architecture

**New / Modified Files**:

1. `src/app/shiftbuilder/sudo/TasksTab.tsx` (new, ~300–450 LOC)
   - Props: `onDataChanged?: () => void`
   - State: full catalog list, search query, active filter (all / zone / rr / overlap / aux), editing row id, add-form state, loading/saving/error/success toasts (local, matching EngineConfigTab pattern)
   - Groups the catalog using the same slot_type + slot_key logic as the main app
   - Rich list or table-like rows with:
     - Label (inline editable or edit button → input)
     - Slot badge (colored or icon per type)
     - Sort order (number input or up/down buttons; on blur/commit → update)
     - Delete (with confirmation for referenced items)
   - Top bar: Search input + "Add Task" button → modal or inline form (slot_type select, slot_key select or "All Zones" helper, label, optional sort)
   - "Apply to all matching slots" helper for common zone tasks
   - Footer note: "Changes to the catalog are global and affect all future nights + the Command Palette"
   - On successful mutation: `onDataChanged?.()` + local refresh of list + optional toast

2. `src/app/shiftbuilder/sudo/SudoWindow.tsx`
   - Add `Tasks` to the TABS array (label: "Tasks", icon: ListTodo or CheckSquare from lucide-react, status: "ready")
   - Import + render `<TasksTab onDataChanged={onDataChanged} />`
   - Place it logically after "Engine Config" (before the coming-soon items) or group "Data" tabs.

3. `src/lib/shiftbuilder/data.ts`
   - Export the two new mutation functions (updateCatalogTask, deleteCatalogTask) + types if needed
   - Keep `getSlotTaskCatalog` as the single source (used by both main canvas and the new tab)

4. `src/lib/shiftbuilder/sudoActions.ts` (optional but recommended for consistency)
   - Thin wrappers `updateCatalogTaskViaSudo`, `deleteCatalogTaskViaSudo` if we want future audit logging or extra guards. For v1 we can call the data.ts functions directly from the tab (like some other paths) or add the wrappers for parity with Team/Engine.

5. `src/app/shiftbuilder/CommandPalette.tsx` + `useCommandActions.ts`
   - Enhance the existing "tasks" action (id: "tasks", keepOpen: true)
   - When the tasks context is active (or when the action is invoked), render a catalog-aware picker:
     - Grouped or flat searchable list of catalog items relevant to the current context (slot-to-person or the multi-selected slots in the existing tasks flow)
     - Selecting a catalog item calls the existing `onAddTask` (or a new `onAddCatalogTask`) with the proper label + catalogTaskId
     - Keep the free-text "Describe the task..." as a fallback / "custom" option at the bottom
   - Update the header text in tasks steps to mention "Catalog or custom"
   - The multi-select zone flow ("Select cards for the same task") remains; after choosing cards the user sees catalog suggestions first.

6. Minor supporting changes:
   - Possibly a small `refreshCatalog` callback or `useEffect` listener in ShiftBuilderClient so that when the tab mutates the catalog while the builder is open, popovers update without full page reload (low-effort win).
   - Export any missing types.
   - Update any inline comments that say "add catalog rows in Supabase Studio".

**State & Data Flow**:
- Catalog remains loaded once in the main client (or enhanced to support refresh).
- The sudo tab is a separate tree (portal), so it fetches its own list and pushes mutations.
- Command Palette receives `onAddTask` (and in future `catalog` or a `getCatalogForSlot` helper) from parent.
- Optimistic updates already exist for night selections — we reuse them.

**No new heavy dependencies**. Reuse dnd-kit if drag-reorder is implemented for sort_order (the project already depends on it for the canvas). Otherwise simple numeric inputs + "Move up/down" are sufficient for v1 and keep the diff tiny.

---

## 5. Interaction & UX Considerations (ui-mcp informed)

**Design Direction** (after ui-mcp + existing sudo patterns + Golden consistency):
- Match the exact visual language of SudoWindow / EngineConfigTab / TeamTab:
  - Dark zinc-950 / zinc-900 surfaces
  - Red-500/ red-400 accents for active/important
  - Atkinson + Geist font stack
  - Lucide icons, subtle borders, generous but dense rows (sudo is power-user, not the calm 1056×816 artboard)
  - Clear section headers, search bar at top, primary "Add Task" action prominent
- Grouped sections or a filter pill row: All | Zones (Z1–Z10) | Restrooms | Overlaps (PM/AM) | AUX
- Each row shows: [checkbox or drag handle] Label (editable)  ·  Slot badge (e.g. "Z3" or "OL-PM-2" or "Mens RR 7")  ·  Sort #  ·  [edit] [delete]
- Add form is a compact horizontal or slide-down: Type select → Slot select (dynamic) → Label input → Add button
- For the palette side (Phase 3 synergy): when the user types "tasks" or invokes the action, the palette glass card shows a beautiful fuzzy list of catalog items (same Liquid Glass aesthetic as the rest of the palette) with the current context pre-filtered. Free text always available as the last item ("Custom: …").
- Accessibility: Full keyboard (Tab, Enter, arrows in lists, Esc to close), proper labels, focus rings consistent with existing.
- iPad/Mac parity: The sudo tab is primarily a Mac/power-user surface today (keyboard + mouse). Touch targets will be reasonable; if iPad sudo usage grows we can enlarge later.

**ui-mcp usage**:
- Consulted shadcn registry (table, combobox, command, input, badge, etc.) and Tailgrids theming for dark.
- Decision: Do **not** pull in the full shadcn `<Table>` + TanStack for v1. The existing sudo tabs are deliberately hand-authored for perfect control and minimal surface area. We will compose a custom grouped `<ul>` / row components using the project's existing Tailwind + cn + lucide primitives. This guarantees pixel-perfect match to the "SUDO" terminal aesthetic and avoids new bundle weight or styling conflicts in the dark zinc context.
- If the list becomes very long in practice, a future micro-iteration can adopt shadcn Table with virtualized rows.

**Impact on existing surfaces**:
- The per-card task popover (light theme, used on the Golden artboard) is **untouched** in rendering — only benefits from richer catalog content.
- Command Palette (Liquid Glass) gains better data but keeps its current multi-step state machine.
- No changes to the 1056×816 canvas coordinates, drag/drop, or print output.

---

## 6. Testing Strategy

- **Unit / Logic**: The data-layer mutations (new update/delete catalog) will be exercised via the tab + existing toggle paths.
- **Integration**: 
  - Add task in hub → appears in main canvas popover for the matching slot (after refresh trigger)
  - Assign via palette catalog pick → appears on card + persists to night_slot_tasks + visible in print
  - Edit label in hub → updates future selections; existing night rows keep the denormalized snapshot (correct behavior)
- **Live Browser Validation (mandatory per coding-engineer)**: Use `04-browser-live-debug` + Playwright + Chrome DevTools MCPs.
  - Open Sudo (type `sudo` in palette or hotkey) → switch to new Tasks tab
  - Add 3–4 new tasks across different types, reorder, edit labels, delete one
  - While tab is open, open Command Palette → invoke Tasks on a zone card → verify catalog items appear + can be assigned
  - Verify no console errors, correct optimistic states, RLS not violated (service key path)
  - Screenshot comparisons against previous task popovers and palette states
- **Golden Fidelity**: No direct artboard change, but spot-check that newly catalogued tasks render correctly on cards and in the printed sheet preview.
- **Edge Cases**: Duplicate labels per (slot_key, rr_side), empty catalog for a slot (still allow custom), very long labels (UI truncation + DB constraint is TEXT), concurrent edits (last write wins, same as today).

---

## 7. Risks & Unknowns

- **Catalog refresh latency for open canvas**: If operator edits in sudo while main view is live, popovers may be stale until page reload or we implement the lightweight refresh hook. **Mitigation**: Implement a simple custom event or callback in Phase 2 of this work; document "reload after heavy catalog work" for the first cut.
- **Delete safety**: Deleting a catalog row that is still referenced by historical nights is safe (denormalized label) but may surprise operators. **Mitigation**: Show usage count in delete confirmation ("Used on 7 nights — label will remain on historical sheets").
- **Scope creep into full task assignment hub**: User asked for "hub for ... tasks to be assigned". We focus on **catalog curation + palette consumption** first. Bulk per-night assignment UI inside the tab can be a follow-up if the basic hub proves valuable.
- **RLS / auth future**: When real operator auth lands, catalog writes will need proper policies. Today everything is service-role (documented in SudoWindow). No change required.
- **Performance**: Catalog is tiny (<100 rows expected). No issue.

**Estimated Complexity**: Medium (new tab + 2–3 data functions + palette data wiring + validation). One focused engineer + live browser loops.

**Open Questions for User** (to resolve before or during Phase 1 approval):
1. Preferred tab order in the left rail? (e.g. Schedules / Team / Engine Config / **Tasks** / SQL…)
2. Should the hub support "template tasks" that apply to *all* zones of a certain type (e.g. one "High Limit" task definition that every Z gets by default)?
3. Any must-have columns in the list view beyond label / slot / sort / actions? (e.g. default color sphere, notes)
4. For the palette integration: when multiple slots are chosen for a task, should we show only the *intersection* of catalog items that apply to all selected, or a union + "some slots may not have this task defined"?
5. Do we want drag-to-reorder rows in the hub (using existing dnd-kit) or numeric sort_order inputs + buttons for v1?

---

## 8. Phase 1 Gate JSON (Exact Format)

```json
{
  "phase": 1,
  "status": "plan_ready",
  "title": "Sudo 'Tasks' Tab as Catalog Hub + Command Palette Catalog Integration",
  "data_changes": [
    "Extend data.ts with updateCatalogTask + deleteCatalogTask (no schema change)",
    "Optional thin wrappers in sudoActions.ts for audit parity"
  ],
  "components_touched": [
    "src/app/shiftbuilder/sudo/SudoWindow.tsx (add tab + import)",
    "src/app/shiftbuilder/sudo/TasksTab.tsx (new)",
    "src/app/shiftbuilder/CommandPalette.tsx (enhance tasks flow with catalog)",
    "src/lib/shiftbuilder/useCommandActions.ts (minor)",
    "src/lib/shiftbuilder/data.ts (new catalog mutations)",
    "src/app/shiftbuilder/ShiftBuilderClient.tsx (optional: catalog refresh hook)"
  ],
  "live_validation_required": true,
  "security_critical": false,
  "estimated_effort": "medium",
  "ui_mcp_used": true,
  "branches_planned": ["01-planning-architect", "03-react-ui-ux-pro", "12-shadcn-ui-expert (consulted)", "04-browser-live-debug", "09-code-reviewer", "13-typescript-zod-tanstack-expert (light)"],
  "open_questions": [
    "Tab ordering preference",
    "Template / bulk-apply helpers for zones",
    "Drag reorder vs numeric inputs for sort_order",
    "Intersection vs union behavior for multi-slot catalog picks in palette"
  ],
  "next_action": "User reviews this plan + answers open questions. Upon approval, proceed to Phase 2 (Implementation) with active branches + ui-mcp for any final component polish."
}
```

---

**This plan respects the full coding-engineer contract, the Agentic Command Post, the Golden visual contract, and the existing task data model.** It turns the partially-hidden task system into a first-class, operator-owned hub while directly improving the Command Palette (Phase 3 alignment).

Ready for your review and approval, Brian. What would you like to adjust before we implement?