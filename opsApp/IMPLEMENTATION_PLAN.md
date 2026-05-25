# opsApp — Implementation Plan
> Sprint-by-sprint execution plan for all 70 UI/UX audit items.
> Full audit context: `opsApp_UIUX_Checklist.docx` in project root.
> Agent onboarding: `opsApp/AGENTS.md`
> Last updated: 2026-05-25

---

## How to Use This File

- Each item has a checkbox `[ ]` — check it off when the fix is merged to `main`.
- Items include the **exact file(s)** to touch and a concise **what to do**.
- Acceptance criteria (AC) tell you what "done" looks like.
- Priority tiers: 🔴 P0 (blocker) · 🟠 P1 (operational) · 🔵 P2 (polish) · 🟣 P3 (innovation/roadmap)

---

## Sprint 0 — Fix Before Next Demo
*9 items · P0 only · Target: ≤ 1 week*

> These are crash risks, silent data-loss paths, or broken core interactions that
> make the app unshippable. Do not advance to Sprint 1 until all 9 are green.

---

### P0-01 — BreakTracker Store Created Inside Sheet Binding Getter
- **File:** `Features/ShiftPlanner/ShiftPlannerView.swift`
- **What to do:**  
  Move `BreakTrackerStore` to a `@State` property at the top of `ShiftPlannerView`. Never
  construct a TCA `Store` inside a `Binding` computed property — it re-creates the store on
  every re-render, leaking state and subscriptions.
  ```swift
  // ❌ Current (inside .sheet binding getter)
  // ✅ Fix
  @State private var breakTrackerStore = Store(initialState: BreakTrackerFeature.State()) {
      BreakTrackerFeature()
  }
  ```
- **AC:** BreakTracker sheet retains its state when dismissed and re-opened within the same
  session. TestStore `BreakTrackerFeature` actions fire exactly once per user gesture.

---

### P0-02 — Manual Store Observation (12 `let _ =` lines)
- **File:** `Features/ShiftPlanner/ShiftPlannerView.swift`
- **What to do:**  
  Replace all 12 `let _ = store.someProperty` observation workaround lines with a single
  `@ObservedObject var viewStore: ViewStore<ShiftPlannerFeature.State, ShiftPlannerFeature.Action>`
  (or `observe {}` closure pattern). Fragile manual observation misses state updates and causes
  stale UI.
- **AC:** Removing any single `let _ =` line does not regress UI refresh. SwiftUI preview
  re-renders correctly on every state mutation in tests.

---

### P0-03 — `fatalError` in `uiKeyToDb(_:)` (Crash Risk)
- **File:** `Core/Models/SlotKey.swift`
- **What to do:**  
  Change `fatalError("[SlotKey] Unmappable UI key: \(uiKey)")` to a throwing function or
  return an `Optional<DbSlot>`. Callers must handle `nil`/error gracefully (show a toast,
  skip the save).
  ```swift
  // Before
  func uiKeyToDb(_ uiKey: String) -> DbSlot { ... fatalError(...) }
  // After
  func uiKeyToDb(_ uiKey: String) -> DbSlot? { ... return nil }
  ```
- **AC:** Passing any unknown key string to `uiKeyToDb` returns `nil`; no crash in production
  or TestFlight builds. Unit test covers the `nil` path.

---

### P0-04 — `fatalError` in `SupabaseManager.configure()` (Crash Risk)
- **File:** `Core/Supabase/SupabaseManager.swift`
- **What to do:**  
  Replace `fatalError(...)` on missing `Secrets.plist` with a structured error enum +
  `assertionFailure` in debug only. In release, surface a `ConfigurationError` through a
  published property that `RootView` observes to show a blocking error screen.
- **AC:** On a device with no `Secrets.plist`, app shows a human-readable error screen
  instead of crashing. Debug builds still assert loudly.

---

### P0-05 — `Night.isLocked` Optional Fragility
- **File:** `Core/Models/Night.swift` + all callers
- **What to do:**  
  Change `var isLocked: Bool?` → `var isLocked: Bool` with a default value of `false`.
  Fix all 12+ optional-chain sites (`night?.isLocked ?? false`) to plain `night.isLocked`.
  Run `grep -rn "isLocked" --include="*.swift"` to find all sites before editing.
- **AC:** Zero optional-chain usages of `isLocked` in the codebase. Codable decoding supplies
  `false` if the field is absent from the JSON (use `CodingKeys` + `decodeIfPresent` or
  `@Default` pattern).

---

### P0-06 — Deployment Book PDF Clips Zone List (ScrollView in ImageRenderer)
- **File:** `Features/ShiftPlanner/PDF/DeploymentBookView.swift`
- **What to do:**  
  Remove the `ScrollView` wrapping `ForEach(ZONE_DEFS)` in `zonesColumn`. `ImageRenderer`
  renders only the visible viewport — all zones beyond the visible area are clipped in the
  exported PDF. Use a plain `VStack` instead; the fixed-height Letter canvas always fits
  all 10 zones.
  ```swift
  // ❌ ScrollView(.vertical) { VStack { ForEach(ZONE_DEFS) ... } }
  // ✅ VStack(spacing: 0) { ForEach(ZONE_DEFS) ... }
  ```
- **AC:** Exported PDF consistently shows all 10 zones, all 5 RR pairs, and all 6 AUX slots.
  Verified on a fully-filled night (30/30 slots).

---

### P0-07 — Deployment Book Missing Overlap Slots
- **File:** `Features/ShiftPlanner/PDF/DeploymentBookView.swift`
- **What to do:**  
  Add a fourth column (or append to AUX column) rendering `DEFAULT_OVERLAP_DEFS`
  (PM_OV1, PM_OV2, AM_OV1, AM_OV2) using the same `deployRow()` pattern.
  Overlap assignments are saved to Supabase but never appear in the printed book — a
  silent data-loss issue for supervisors.
- **AC:** All 4 overlap slots appear in the PDF export. Each overlap row shows the assigned
  TM name (or "—") identical to zone rows.

---

### P0-08 — BreakTracker Timer Frozen (Render-Time Computation)
- **File:** `Features/BreakTracker/BreakTrackerView.swift`
- **What to do:**  
  Replace `Int(Date().timeIntervalSince(date) / 60)` inline in the view body with a
  `TimelineView(.periodic(from: .now, by: 15))` or a `@State var now: Date` updated by a
  `Timer.publish(every: 15, on: .main, in: .common)` via `.onReceive`. The current approach
  computes elapsed time once at render and never updates.
- **AC:** Timer display updates at least every 15 seconds while the Break Tracker sheet is
  open. Elapsed minutes are accurate ±1 minute. Verified with a 2-minute real-time test.

---

### P0-09 — BreakTracker Shows All TMs, Not Just Assigned
- **File:** `Features/BreakTracker/BreakTrackerView.swift`
- **What to do:**  
  Filter `teamMembers` to only TMs who appear in `assignments` for the current night before
  rendering the break list. Currently shows the full roster (30+ TMs) even on a night with
  8 people scheduled.
  ```swift
  let assignedTmIds = Set(state.assignments.compactMap { $0.tmId })
  let relevantTMs = state.teamMembers.filter { assignedTmIds.contains($0.tmId) }
  ```
- **AC:** Break Tracker sheet shows only TMs assigned to the current night. An empty night
  shows an appropriate empty state, not a 30-row list.

---

## Sprint 1 — Operational Reliability
*25 items · P1 · Target: 2–3 weeks after Sprint 0*

> These items don't crash the app but cause supervisor friction, silent failures,
> or broken core workflows every shift.

---

### P1-01 — Accessibility: Zero Labels on Interactive Elements
- **Files:** `ZoneCardView.swift`, `TMChipView.swift`, `RosterRailView.swift`, `ShiftHeaderBar.swift`, `BreakTrackerView.swift`
- **What to do:**  
  Add `.accessibilityLabel()` and `.accessibilityValue()` to every interactive control:
  zone cards, TM chips, date picker, lock button, fill counter, break start/stop buttons.
  Follow pattern: `"Zone 9, assigned to Joy, locked"`.
- **AC:** VoiceOver reads a meaningful description for every tappable element. Zero
  `accessibilityLabel` is empty string. Tested with VoiceOver on physical iPad.

---

### P1-02 — Dynamic Type: All Fonts Hardcoded
- **Files:** `ZoneCardView.swift`, `RosterRailView.swift`, `ShiftHeaderBar.swift`, `BreakTrackerView.swift`, `DeploymentBookView.swift` (PDF exempt)
- **What to do:**  
  Replace `.font(.system(size: N))` with semantic fonts (`.font(.caption)`, `.font(.body)`,
  `.font(.headline)`) or `ScaledMetric` for custom sizes. Exception: `DeploymentBookView`
  must stay fixed-size (PDF layout).
  ```swift
  // ❌  .font(.system(size: 11, weight: .semibold))
  // ✅  .font(.subheadline.weight(.semibold))
  ```
- **AC:** App is fully usable at Accessibility → Larger Text → "XXXL" setting. No text
  overflows or truncates unexpectedly. Snapshot test at each size category.

---

### P1-03 — Reduce Motion: Scale Animations Not Gated
- **Files:** `ZoneCardView.swift`, `RosterRailView.swift`, `ShiftCanvasView.swift`
- **What to do:**  
  Wrap all `.scaleEffect`, `.animation`, and spring transitions with
  `@Environment(\.accessibilityReduceMotion) var reduceMotion`. When `true`, replace
  animated transitions with instant crossfades (`.animation(nil)`).
- **AC:** With "Reduce Motion" enabled in Accessibility settings, zero scale/bounce
  animations trigger. UI state changes are still visually communicated (color/opacity).

---

### P1-04 — Forced Dark Mode on Sheets
- **Files:** `ShiftPlannerView.swift`, `BreakTrackerView.swift`
- **What to do:**  
  Remove `.preferredColorScheme(.dark)` from both sheets. Respect the system appearance.
  If design requires dark-only for the main canvas, scope the override to `ShiftCanvasView`
  only, not the entire window/sheet.
- **AC:** Break Tracker and date picker sheets follow system light/dark mode. Canvas may
  remain dark-only (scoped override). Tested in Light mode on simulator.

---

### P1-05 — Empty `asyncAfter` in Date Picker / Header
- **Files:** `ShiftPlannerView.swift`, `ShiftHeaderBar.swift`
- **What to do:**  
  Remove `DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { }` — it does nothing and
  suggests a deferred callback was abandoned. If date navigation required a delay for a
  reason, replace with a proper `Task { @MainActor in ... }` with an actual action dispatch.
- **AC:** Zero `DispatchQueue.main.asyncAfter` calls in the codebase. Date selection
  triggers the TCA action synchronously.

---

### P1-06 — RosterRail Collapse State Not Persisted
- **File:** `RosterRailView.swift`
- **What to do:**  
  Replace `@State private var isCollapsed = true` with `@AppStorage("rosterRailCollapsed")
  var isCollapsed = true` so the user's preference persists across launches.
- **AC:** If user expands the rail and backgrounds the app, rail is still expanded on
  next launch. Tested via app kill → relaunch.

---

### P1-07 — `assignmentsBySlotKey` / `lockedSlotKeys` O(n) Computed Per Access
- **File:** `Features/ShiftPlanner/ShiftPlannerFeature.swift`
- **What to do:**  
  Convert `var assignmentsBySlotKey: [String: ZoneAssignment]` and
  `var lockedSlotKeys: Set<String>` from computed properties to stored properties. Update
  them at the single point of mutation (inside the reducer, after `assignments` is modified).
  This eliminates O(n) dictionary rebuilds on every property access.
- **AC:** Instruments shows zero allocations of `[String: ZoneAssignment]` during a drag
  gesture. Profile on iPad Air M3 with 30-slot fully-filled night.

---

### P1-08 — Night Notes Not Shown in Dedicated Section
- **File:** `Features/ShiftPlanner/PDF/DeploymentBookView.swift`
- **What to do:**  
  Move night notes out of the AUX column and into a dedicated full-width footer section
  between the three columns and the timestamp footer. This makes notes always visible
  regardless of AUX content length.
- **AC:** Night notes appear in their own labeled section on the PDF. Notes up to 200
  characters display without truncation on US Letter landscape.

---

### P1-09 — Stage Manager / Multi-Window Support Missing
- **File:** `App/opsAppApp.swift`
- **What to do:**  
  Add `WindowGroup` scene modifiers for iPad multi-window:
  `.windowResizability(.contentSize)` and ensure the canvas layout adapts via
  `GeometryReader` or `@Environment(\.horizontalSizeClass)` rather than assuming full-screen.
- **AC:** App opens as a second window in Stage Manager without layout breakage. Canvas
  scrolls correctly at 70% width.

---

### P1-10 — Canvas Background Hardcoded Color
- **File:** `Features/ShiftPlanner/UI/ShiftCanvasView.swift`
- **What to do:**  
  Replace `Color(red: 0.11, green: 0.13, blue: 0.16)` with a named asset color
  `Color("CanvasBackground")` in the asset catalog, supporting both light and dark
  appearances. Same fix for `ZoneCardView.swift` card background.
- **AC:** Canvas uses asset catalog color. No hardcoded `Color(red:green:blue:)` calls for
  background or card surfaces (accent colors like `#FFD700` may remain inline).

---

### P1-11 — Drag-and-Drop: No Drop Animation or Feedback
- **Files:** `ZoneCardView.swift`, `RosterRailView.swift`
- **What to do:**  
  Implement `.dropDestination(for: String.self)` `isTargeted` closure to show a highlighted
  drop-target state (scale up + gold border) when a TM chip hovers over a zone card. Add
  haptic feedback (`UIImpactFeedbackGenerator(style: .medium)`) on successful drop.
- **AC:** Zone card visually highlights when a dragged chip is above it. Successful drop
  triggers a medium haptic. Confirmed on physical iPad Air M3.

---

### P1-12 — No Haptic Feedback on Lock/Unlock
- **Files:** `ZoneCardView.swift`, `ShiftPlannerFeature.swift`
- **What to do:**  
  Add `UIImpactFeedbackGenerator(style: .rigid)` call in the reducer's `lockSlot`/
  `unlockSlot` action handlers, dispatched back to `@MainActor` for UIKit calls.
- **AC:** Lock gesture produces a `.rigid` haptic. Unlock produces a `.light` haptic.
  Tested on device (haptics are silent on simulator).

---

### P1-13 — No Error State for Failed Supabase Saves
- **File:** `Features/ShiftPlanner/ShiftPlannerFeature.swift`
- **What to do:**  
  The reducer handles `.saveAssignmentResponse(.failure)` by rolling back state, but never
  shows an error to the user. Add a `@PresentationState var alert: AlertState?` to
  `ShiftPlannerState` and present a toast/alert on save failure.
- **AC:** When Supabase returns a 4xx/5xx, user sees a brief toast: "Save failed. Changes
  reverted." Assignment is rolled back visually within 100ms.

---

### P1-14 — No Loading State While Fetching Night/TMs
- **File:** `Features/ShiftPlanner/ShiftPlannerView.swift` + `ShiftPlannerFeature.swift`
- **What to do:**  
  Add `isLoading: Bool` to `ShiftPlannerState`. Set it `true` in `.onAppear` / date-change
  action; set `false` in `.fetchNightResponse` and `.fetchTeamMembersResponse`. Show a
  `ProgressView` over the canvas during loading.
- **AC:** Canvas shows a centered `ProgressView` during initial load and date changes.
  No "empty" flash before data populates.

---

### P1-15 — No Empty State for Zero-TM Night
- **File:** `Features/ShiftPlanner/UI/ShiftCanvasView.swift`
- **What to do:**  
  When `teamMembers.isEmpty`, render a centered empty-state illustration and CTA:
  "No team members loaded — pull to refresh or check your connection."
- **AC:** Empty roster shows a non-blank canvas. Retry button dispatches
  `.fetchTeamMembersRequested`.

---

### P1-16 — No Offline / Network Degradation Handling
- **Files:** `Features/ShiftPlanner/ShiftPlannerFeature.swift`, `Core/Services/RealtimeService.swift`
- **What to do:**  
  Add `NWPathMonitor`-based connectivity check to `ShiftPlannerClient`. Surface a
  non-blocking banner ("Offline — changes will sync when reconnected") when network is lost.
  Queue failed saves for retry on reconnect.
- **AC:** Toggling airplane mode shows the offline banner within 2 seconds. Reconnecting
  triggers a re-sync. No data is silently dropped.

---

### P1-17 — Realtime Subscription Leaks on Night Change
- **File:** `Features/ShiftPlanner/ShiftPlannerFeature.swift`
- **What to do:**  
  Verify that `.cancellable(id: "realtime.assignments")` is correctly cancelled before
  subscribing to a new `nightId`. Add a unit test that changes the date twice and asserts
  only one active subscription exists.
- **AC:** After two date changes, there is exactly one `RealtimeService` channel active.
  Verified via Supabase dashboard or a mock `RealtimeService` in tests.

---

### P1-18 — Roster Rail Starts Collapsed Every Launch
*(Resolved by P1-06 `@AppStorage` — mark done when P1-06 is complete.)*
- **AC:** Same as P1-06.

---

### P1-19 — No Confirmation Before Clear/Reset Night
- **File:** `Features/ShiftPlanner/ShiftPlannerFeature.swift` (if `clearNight` action exists)
  + `ShiftHeaderBar.swift`
- **What to do:**  
  Any destructive action (clear all assignments, reset night) must present a confirmation
  `AlertState` before dispatching the destructive reducer action.
- **AC:** Tapping "Clear Night" shows: "Are you sure? This will remove all assignments for
  [date]." with Cancel / Clear buttons. Cancel leaves state unchanged.

---

### P1-20 — Locked Night Allows Drag-and-Drop
- **Files:** `ZoneCardView.swift`, `RosterRailView.swift`
- **What to do:**  
  Check `state.night?.isLocked` (post P0-05, plain `state.night.isLocked`) in the
  `.dropDestination` handler and in `TMChipView.draggable`. Disable drag sources and
  drop targets when night is locked.
- **AC:** On a locked night, dragging a TM chip does nothing. Zone cards show a subtle
  "locked" visual (reduced opacity on drop zone highlight). Toast: "Night is locked."

---

### P1-21 — PDF Export Button Has No Progress Indicator
- **File:** `Features/ShiftPlanner/ShiftPlannerView.swift`
- **What to do:**  
  Show a `ProgressView` overlay during PDF generation (which calls `ImageRenderer`
  synchronously on the main thread). Consider wrapping in `Task.detached` to keep UI
  responsive during rendering.
- **AC:** Tapping "Export PDF" shows a spinner immediately. UI remains responsive.
  Export button is disabled while exporting to prevent double-taps.

---

### P1-22 — `ShiftPlannerClient` Missing `updateNight` Coverage in Tests
- **File:** `Tests/ShiftPlannerFeatureTests.swift` (create if missing)
- **What to do:**  
  Write `TestStore` tests for: assign TM → save → rollback on failure,
  lock night → UI disables drags, date change → realtime re-subscription.
- **AC:** Test target compiles and all new tests pass with `xcodebuild test`.

---

### P1-23 — Night Status Badge Uses Magic String Comparisons
- **Files:** `DeploymentBookView.swift`, `ShiftHeaderBar.swift`
- **What to do:**  
  Replace `switch status { case "active": ... case "draft": ... }` with a `NightStatus`
  enum on the `Night` model. Codable `rawValue: String` keeps DB compatibility.
- **AC:** Zero string literals `"active"`, `"draft"`, `"complete"` in switch statements.
  New status values cause a compile-time exhaustiveness warning.

---

### P1-24 — Gender Indicator Hardcoded Hex Colors
- **File:** `RosterRailView.swift`
- **What to do:**  
  Move `#1976D2` (male blue) and `#B7679A` (female) into named asset catalog colors
  `Color("GenderMale")` and `Color("GenderFemale")`. These should adapt to light/dark mode.
- **AC:** Gender dots use asset colors. Light mode remains legible (auto-generated
  light-mode variants in asset catalog).

---

### P1-25 — Assignment Sort Order Not Enforced on Fetch
- **File:** `Features/ShiftPlanner/ShiftPlannerFeature.swift`
- **What to do:**  
  After `fetchAssignments` returns, sort the result by `PLACEMENT_ORDER` before storing
  in `state.assignments`. Currently relies on DB insertion order, which can drift.
- **AC:** Assignments are always displayed in the canonical `PLACEMENT_ORDER` regardless
  of Supabase row order. Verified by inserting out-of-order rows in the DB console.

---

## Sprint 2 — Polish & Platform Alignment (Part 1)
*12 items · P2 · Target: 1–2 weeks after Sprint 1*

---

### P2-01 — Zone Cards: Not Using Liquid Glass Material
- **File:** `Features/ShiftPlanner/UI/ZoneCardView.swift`
- **What to do:**  
  Replace the opaque `Color(red: 0.14, green: 0.16, blue: 0.20)` card background with
  `.glassEffect(.regular, in: RoundedRectangle(cornerRadius: 12))` wrapped in a
  `GlassEffectContainer`. Keep the gold accent bar as an overlay.
- **AC:** Zone cards display translucent glass material on iOS 26. Canvas content is subtly
  visible through unfilled cards. Filled cards may use `.glassEffect(.thick)` for contrast.

---

### P2-02 — RosterRail: Not Using Liquid Glass
- **File:** `Features/ShiftPlanner/UI/RosterRailView.swift`
- **What to do:**  
  Apply `.glassEffect(.regular)` to the rail panel background. TM chips can use
  `.glassEffect(.thin)` for a layered hierarchy.
- **AC:** Rail visually distinguishes from canvas via glass layering. Matches
  system-native sidebar appearance on iPad.

---

### P2-03 — No Swipe-to-Unassign Gesture
- **File:** `Features/ShiftPlanner/UI/ZoneCardView.swift`
- **What to do:**  
  Add `.swipeActions(edge: .trailing)` with a "Remove" destructive action that dispatches
  `ShiftPlannerFeature.Action.removeAssignment(slotKey:)`.
- **AC:** Swiping left on any filled zone card reveals a red "Remove" button. Tapping it
  clears the assignment and saves to Supabase. Locked slots ignore the swipe.

---

### P2-04 — No Contextual Long-Press Menu on Zone Cards
- **File:** `Features/ShiftPlanner/UI/ZoneCardView.swift`
- **What to do:**  
  Add `.contextMenu` with actions: "Lock/Unlock", "Remove Assignment", "View TM Profile"
  (stubbed). Use `Label` with SF Symbol for each action.
- **AC:** Long-pressing a filled zone card shows a 3-item context menu. Previews the card
  in full size using `.contextMenu { ... } preview: { ... }`.

---

### P2-05 — No Search / Filter in Roster Rail
- **File:** `Features/ShiftPlanner/UI/RosterRailView.swift`
- **What to do:**  
  Add a `.searchable` modifier or inline `TextField` above the TM chip list to filter
  by name. Filter is local state (`@State var query`), no reducer change needed.
- **AC:** Typing "Joy" filters the chip list to show only Joy. Clearing search restores
  full list. Filter is case-insensitive.

---

### P2-06 — Canvas Swipe Day Navigation: No Visual Feedback
- **File:** `Features/ShiftPlanner/UI/ShiftCanvasView.swift`
- **What to do:**  
  Add a `.offset(x:)` animation during the `DragGesture` that tracks gesture translation,
  then snaps to the new date with a spring animation. Also add left/right chevron affordance
  indicators at canvas edges.
- **AC:** Swiping left/right shows the canvas sliding in the swipe direction before snapping.
  Arrows appear when the user holds mid-gesture for >300ms.

---

### P2-07 — No Keyboard Shortcut Support
- **File:** `Features/ShiftPlanner/ShiftPlannerView.swift` + `ShiftHeaderBar.swift`
- **What to do:**  
  Add `.keyboardShortcut` modifiers: `⌘→` (next day), `⌘←` (prev day),
  `⌘P` (export PDF), `⌘L` (lock/unlock night). Register via `.commands {}` on the
  `WindowGroup` for Stage Manager / external keyboard users.
- **AC:** All four keyboard shortcuts work with a paired Magic Keyboard. No conflicts with
  system shortcuts.

---

### P2-08 — Header Fill Counter Color Thresholds Undocumented
- **File:** `Features/ShiftPlanner/UI/ShiftHeaderBar.swift`
- **What to do:**  
  Extract the 75%/100% threshold logic into a named function or `NightFillStatus` enum:
  `.empty`, `.partial`, `.almostFull`, `.full`. This makes the threshold testable and
  the color semantic.
- **AC:** `NightFillStatus` enum exists. `fillCounterColor` is a single-expression
  computed property using the enum. Unit test covers all 4 cases.

---

### P2-09 — PDF Deployment Book: Overlaps Column (Part 2, after P0-07)
*(P0-07 adds the column; P2-09 polishes its styling to match zones/RR/AUX)*
- **File:** `Features/ShiftPlanner/PDF/DeploymentBookView.swift`
- **What to do:**  
  Style the overlap column with correct accent colors (PM = amber `#FFA726`,
  AM = blue `#42A5F5`). Add overlap-specific icons (moon for PM, sun for AM).
- **AC:** Overlap column is visually distinct from zone/RR/AUX columns. PM/AM overlap
  rows have correct accent colors in the exported PDF.

---

### P2-10 — No iPad Multitasking Layout Adaptation
- **File:** `Features/ShiftPlanner/UI/ShiftCanvasView.swift`
- **What to do:**  
  Use `@Environment(\.horizontalSizeClass)` to collapse the roster rail automatically
  when `sizeClass == .compact` (Slide Over / narrow Split View). Canvas card sizes
  should reduce to `Canvas.zoneCardWidth * 0.8` in compact mode.
- **AC:** In 1/3 Split View, canvas shows without overflow or clipping. Roster rail
  auto-collapses. Cards are legible.

---

### P2-11 — ShiftHeaderBar "Go to Date" Button Does Nothing
*(Resolved by removing the empty `asyncAfter` in P1-05. P2-11 adds the actual navigation.)*
- **File:** `ShiftHeaderBar.swift`
- **What to do:**  
  Wire `onDateSelected` callback to dispatch `ShiftPlannerFeature.Action.dateSelected(_:)`.
  Present a `DatePicker` in a popover on the button tap; on selection, dismiss popover
  and call `onDateSelected(date)`.
- **AC:** Tapping "Go to Date" → picking a date → dismissing popover navigates the canvas
  to the selected date and loads its night data.

---

### P2-12 — Apple Pencil Pro: Barrel Roll Not Implemented
- **File:** `Features/ShiftPlanner/UI/ShiftCanvasView.swift` (new gesture handler)
- **What to do:**  
  Use `UIPencilInteraction` with `preferredTapAction` and detect barrel roll via
  `UIPencilInteraction.preferredSqueezeAction` or `UIHoverGestureRecognizer`'s
  `altitudeAngle`/`azimuthAngle`. Map barrel roll to rotate between "assign" and
  "lock" pencil modes.
- **AC:** Barrel-rolling Pencil Pro cycles the active pencil action indicator in the
  header bar. Visible mode indicator (icon in header) changes on roll.

---

## Sprint 3 — Polish & Platform Alignment (Part 2)
*12 items · P2 (continued) · Target: 1–2 weeks after Sprint 2*

---

### P2-13 — No TM Profile Detail View
- **Files:** New file `Features/TM/TMProfileView.swift` + `RosterRailView.swift`
- **What to do:**  
  Create a simple read-only sheet displaying: name, gender, status, skill scores
  (from Supabase `team_members` columns or JSON field). Accessible via long-press on
  a TM chip.
- **AC:** Long-pressing a TM chip opens a sheet with the TM's name, zone skills
  (rated 1–5), and current assignment for the night.

---

### P2-14 — No Night History / Calendar View
- **Files:** New file `Features/ShiftPlanner/NightCalendarView.swift`
- **What to do:**  
  Add a calendar-style month view accessible from the header, showing nights color-coded
  by status (draft/active/complete). Tapping a date navigates to that night.
- **AC:** Month view shows ≥28 nights. Complete nights show in blue, active in green,
  draft in grey. Navigation to any past night works.

---

### P2-15 — Export PDF Lacks Share Sheet Integration
- **File:** `Features/ShiftPlanner/ShiftPlannerView.swift`
- **What to do:**  
  After generating the PDF file, present `ShareLink(item: pdfURL)` (iOS 16+ API, available
  on iOS 26). This allows AirDrop, print, save to Files, email — without writing a custom
  share sheet.
- **AC:** After PDF export, system share sheet appears with the PDF as the attachment.
  AirDrop and Print work correctly.

---

### P2-16 — Logging: No Structured Logging
- **Files:** All feature files
- **What to do:**  
  Replace `print("[SupabaseManager] Ready — \(urlStr)")` and similar `print` calls with
  `Logger(subsystem: "com.glcr.opsApp", category: "networking")` from `OSLog`.
  Structured logs are filterable in Console.app.
- **AC:** Zero `print()` calls in production code. All log statements use `Logger`.
  Console.app shows filterable categories.

---

### P2-17 — No Undo / Redo for Assignment Changes
- **File:** `Features/ShiftPlanner/ShiftPlannerFeature.swift`
- **What to do:**  
  Implement a simple undo stack in `ShiftPlannerState`: `var undoStack: [UndoAction]`
  capped at 10 entries. Register `⌘Z` keyboard shortcut. `UndoAction` covers assign
  and unassign.
- **AC:** `⌘Z` reverses the last assignment change. Undo stack caps at 10. Works with
  external keyboard.

---

### P2-18 — Night Lock Requires Two Taps (No Affordance)
- **File:** `ShiftHeaderBar.swift`
- **What to do:**  
  Make the lock button visually distinct when night is locked (gold fill, not just icon
  change). Add a tooltip/popover explaining lock behavior on first use (store
  `hasSeenLockTip` in `@AppStorage`).
- **AC:** Lock button is gold-filled when locked, outlined when unlocked. First-time tip
  appears once and is dismissible.

---

### P2-19 — No Batch Assignment (Assign Same TM to Multiple Slots)
- **File:** `Features/ShiftPlanner/ShiftPlannerFeature.swift` + `ShiftHeaderBar.swift`
- **What to do:**  
  Add a multi-select mode (toggle in header) where tapping zone cards adds them to a
  selection set. A toolbar action "Assign Selected" opens a TM picker. Save all
  assignments in a single Supabase `upsert` batch.
- **AC:** Multi-select mode selects ≥2 zone cards. Single TM can be assigned to all
  selected slots in one action. Confirmation toast shows "3 zones assigned to Joy."

---

### P2-20 — No Onboarding / First Launch Experience
- **Files:** New file `Features/Onboarding/OnboardingView.swift`, `App/RootView.swift`
- **What to do:**  
  Show a 3-screen onboarding flow on first launch (`@AppStorage("hasSeenOnboarding")`):
  1. Welcome / app purpose, 2. Drag-and-drop demo, 3. Connect to Supabase confirmation.
  Skip button on every screen.
- **AC:** First launch shows onboarding. Subsequent launches skip it. Settings screen
  has "Reset Onboarding" option for demos.

---

### P2-21 — Accessibility: No `.accessibilityHint` on Drag Sources
- **File:** `RosterRailView.swift`
- **What to do:**  
  Add `.accessibilityHint("Double-tap and hold to drag to a zone")` to each `TMChipView`.
  This is the standard VoiceOver interaction hint for draggable elements.
- **AC:** VoiceOver announces the hint when focused on a TM chip. Hint does not duplicate
  the label.

---

### P2-22 — Color Contrast: Gold Text on Dark Background
- **Files:** `ZoneCardView.swift`, `DeploymentBookView.swift`, `ShiftHeaderBar.swift`
- **What to do:**  
  Verify `#B89708` (subdued gold) on the dark canvas background meets WCAG AA 4.5:1
  contrast ratio. If it doesn't (it likely falls to ~3:1 on `rgb(0.11, 0.13, 0.16)`),
  lighten to `#C9A619` or use white text with gold accent bars only.
- **AC:** All text passes WCAG AA contrast check via Xcode Accessibility Inspector.
  Gold accent bars (non-text) are exempt from text contrast rules.

---

### P2-23 — No Widget / App Intent for Quick Night Lock
- **Files:** New `AppIntents/LockNightIntent.swift`
- **What to do:**  
  Implement an `AppIntent` conforming struct `LockNightIntent` that locks/unlocks tonight's
  shift via Siri or Shortcuts. Requires `ShiftPlannerClient.liveValue` to be callable
  outside the TCA store.
- **AC:** "Lock tonight's shift" Siri command works from lock screen. Shortcut automation
  shows the intent in the Shortcuts app.

---

### P2-24 — iPad App Icon Missing (Using Default)
- **Files:** `Assets.xcassets/AppIcon.appiconset`
- **What to do:**  
  Create a GLCR-branded app icon for all required iPad sizes. Use the gold chip/star motif
  on a dark navy background. Export from the design system's brand assets.
- **AC:** App icon shows GLCR branding in all iPad sizes. No default Xcode placeholder icon.

---

## Roadmap — Innovation & Differentiation
*12 items · P3 · Q3–Q4 2026*

> These items require design exploration, backend changes, or native APIs that are
> not yet battle-tested on iOS 26. Plan each as a mini-project with its own spec.

---

### P3-01 — AI-Assisted Zone Suggestions
- **Concept:** Use on-device `MLModel` or a Supabase Edge Function to suggest optimal
  TM→zone assignments based on historical performance, skill scores, and request history.
- **Files:** New `Core/ML/ZoneSuggestionEngine.swift`
- **Notes:** Start with a simple scoring algorithm (skill + recency + preference).
  iOS 26 Foundation Models (on-device) could power natural-language "Who's best for Z9?"

---

### P3-02 — Live Activity / Dynamic Island for Active Breaks
- **Concept:** Show an ongoing break timer in Dynamic Island for each TM currently on break.
  Supervisor can glance at Dynamic Island to see break duration without opening the app.
- **Files:** New `Features/BreakTracker/BreakTrackerLiveActivity.swift`
- **Notes:** Requires `ActivityKit` + `WidgetKit`. Up to 4 concurrent Live Activities on
  iPad (verify with iOS 26 release notes).

---

### P3-03 — WatchOS Companion — Break Timer Glance
- **Concept:** watchOS app showing active breaks and allowing supervisors to start/stop
  breaks from the wrist via `WatchConnectivity`.
- **Files:** New watch target
- **Notes:** Low priority until BreakTracker core is solid (P0-08, P0-09).

---

### P3-04 — Collaborative Real-Time Multi-Supervisor Mode
- **Concept:** Two supervisors can have the app open simultaneously; assignments made by
  one update instantly on the other's canvas via existing Supabase Realtime.
- **Files:** `Features/ShiftPlanner/ShiftPlannerFeature.swift`, `Core/Services/RealtimeService.swift`
- **Notes:** Conflict resolution needed (last-write-wins vs. lock-based). Consider
  showing the other supervisor's cursor position on canvas.

---

### P3-05 — Offline-First with Conflict Resolution
- **Concept:** Full offline capability using SwiftData as a local cache. Sync to Supabase
  when reconnected with field-level conflict detection.
- **Files:** New `Core/Persistence/` module
- **Notes:** Significant backend schema change needed (vector clocks or `updated_at`
  timestamps on all rows).

---

### P3-06 — Apple Intelligence Integration
- **Concept:** Use iOS 26 Foundation Models for on-device natural-language queries:
  "Who's available for Zone 9 tonight?" — model reads current state and returns a ranked
  suggestion with reasoning.
- **Files:** New `Core/Intelligence/ShiftIntelligence.swift`
- **Notes:** Apple Foundation Models API is new in iOS 26; evaluate API stability before
  shipping.

---

### P3-07 — PDF Report with Historical Analytics
- **Concept:** Export a weekly/monthly shift report PDF with fill-rate trends,
  TM assignment frequency, and break pattern analysis.
- **Files:** New `Features/Reports/` module
- **Notes:** Requires Supabase analytics queries; consider a Supabase Edge Function
  that returns pre-aggregated JSON.

---

### P3-08 — Biometric Authentication Lock
- **Concept:** Require Face ID / Touch ID to unlock a locked night, preventing accidental
  or unauthorized changes.
- **Files:** `Core/Auth/BiometricLockService.swift`
- **Notes:** `LocalAuthentication` framework. Store lock policy in Keychain.

---

### P3-09 — TM Performance Heatmap View
- **Concept:** A calendar-style heatmap showing each TM's zone assignment history,
  highlighting overuse of high-difficulty zones (Z9) vs. rotation compliance.
- **Files:** New `Features/Analytics/TMHeatmapView.swift`
- **Notes:** Requires `zone_assignments` history data. Consider a pre-computed
  Supabase materialized view for performance.

---

### P3-10 — Interactive Zone Map (Floor Plan Overlay)
- **Concept:** Visual casino floor plan where supervisors tap a zone on the map to assign
  it, rather than using the card list.
- **Files:** New `Features/ShiftPlanner/FloorMapView.swift`
- **Notes:** Requires floor plan SVG asset. Touch targets must be WCAG-compliant size.

---

### P3-11 — Shift Handoff / Recap Generation
- **Concept:** Auto-generate a plain-English shift recap ("Zone 9 was short-staffed from
  0200–0400; Seth covered RR6 twice") from assignment history + break logs.
- **Files:** New `Features/Recap/ShiftRecapGenerator.swift`
- **Notes:** Could use Apple Foundation Models (on-device) or call the existing GLCR
  Supabase Edge Function that powers the web app recap.

---

### P3-12 — iPadOS 26 Liquid Glass Navigation Bar
- **Concept:** Replace the `NavigationStack` plain header with a full Liquid Glass navigation
  bar that floats above the canvas content, blending with zone cards beneath it.
- **Files:** `App/RootView.swift`, `Features/ShiftPlanner/ShiftPlannerView.swift`
- **Notes:** Requires iOS 26 `.navigationBarBackground(.glass)` (verify API name in beta).
  Test that gold accent colors remain legible through the glass material.

---

## Implementation Progress Tracker

| Sprint | Items | Done | Remaining |
|--------|-------|------|-----------|
| Sprint 0 (P0) | 9 | 0 | 9 |
| Sprint 1 (P1) | 25 | 0 | 25 |
| Sprint 2 (P2) | 12 | 0 | 12 |
| Sprint 3 (P2 cont.) | 12 | 0 | 12 |
| Roadmap (P3) | 12 | — | 12 |
| **TOTAL** | **70** | **0** | **70** |

---

## Cross-References

| Doc | Purpose |
|-----|---------|
| `opsApp/AGENTS.md` | Agent onboarding, engineering rules, file architecture |
| `opsApp_UIUX_Checklist.docx` | Full audit with Current State / Action Required columns |
| `opsApp/opsApp/opsApp/opsApp/Core/Models/SlotKey.swift` | `PLACEMENT_ORDER` — canonical slot ordering |
| `opsApp/opsApp/opsApp/opsApp/Features/ShiftPlanner/ShiftPlannerFeature.swift` | TCA reducer — all action cases |
| Supabase project: `glcr-ops` | Production DB — verify migrations before schema changes |

---

*Auto-generated 2026-05-25 by LiquidForge × Cowork · Update checkboxes as items land on `main`.*
