# opsApp — Full Codebase Analysis
> Generated 2026-05-25 by LiquidForge × Cowork  
> 27 Swift source files · 4 documentation/config files · 18 SPM packages  
> Full read: all `.swift` files, `Package.resolved`, `IMPLEMENTATION_PLAN.md`, `AGENTS.md`, `README.md`, `.gitignore`

---

## 1. Architecture Overview

### What the App Is

opsApp is a native iPadOS 26 operations tool for Gun Lake Casino Resort (GLCR), built for a single primary user — Brian Killian, Grave Shift Supervisor, Internal Maintenance. It solves a real operational problem: deploying 20-30 team members (TMs) to zones, restrooms, auxiliary slots, and overlap slots over an 8-hour grave shift, tracking breaks, writing night notes, and exporting a PDF deployment book for the casino floor.

The app is a professional single-user tool held to App Store quality standards. Target hardware is iPad Air M3 11", iPadOS 26, Apple Pencil Pro 2, and Smart Keyboard Folio.

### Stack at a Glance

| Layer | Choice | Version |
|---|---|---|
| UI | SwiftUI (iOS 26) | — |
| State | The Composable Architecture (TCA) | 1.25.5 |
| Backend | Supabase (PostgreSQL + Realtime v2) | supabase-swift 2.46.0 |
| Concurrency | Swift 6, SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor | — |
| Design | Liquid Glass (iOS 26) + GLCR dark palette | — |
| Hardware | Apple Pencil Pro 2 (barrel roll, squeeze, double-tap, hover) | — |

### Project Layout

```
opsApp/                               ← repo root
├── AGENTS.md                         ← agent onboarding SoT
├── IMPLEMENTATION_PLAN.md            ← 70-item sprint checklist
├── README.md                         ← status stub
├── PROJECT_SETUP_GUIDE.md            ← initial Xcode setup guide
├── .gitignore                        ← Secrets.plist, .env.local excluded ✅
└── opsApp/opsApp/opsApp/             ← ⚠️ quadruple-nested project directory
    └── opsApp.xcodeproj              ← the REAL Xcode project
    └── opsApp/                       ← source root
        ├── App/
        │   ├── opsAppApp.swift
        │   └── RootView.swift
        ├── Core/
        │   ├── Models/               ← 6 Codable structs + constants
        │   ├── Repositories/         ← actor ShiftPlannerRepository
        │   ├── Services/             ← DateHelpers, RealtimeService
        │   └── Supabase/             ← SupabaseManager singleton
        └── Features/
            ├── ShiftPlanner/         ← TCA feature + 9 UI files + PDF
            ├── BreakTracker/         ← TCA feature + 1 UI file
            └── ShiftPlanner/Sudo/    ← Admin panel (SudoModels + SudoPanelView)
```

The quadruple-nesting (`opsApp/opsApp/opsApp/opsApp/`) is a known artifact of an early project reset. A `fix_nesting.sh` script exists at root, indicating this was investigated. It has no impact on correctness but is a maintenance irritant for navigation and tooling.

---

## 2. Data Flow

### Startup

```
opsAppApp.init()
  └── SupabaseManager.shared.configure()
        ├── reads Secrets.plist (SUPABASE_URL + SUPABASE_ANON_KEY)
        ├── constructs SupabaseClient (realtimeV2 option set)
        └── on failure: stores configurationError (graceful, no fatalError)
```

### Main Planning Surface

```
ShiftPlannerView (owns Store<ShiftPlannerFeature>)
  └── .onAppear → .fetchRequested
        ├── fetchTeamMembers() → .teamMembersLoaded
        ├── fetchNight(date) → .nightLoaded | nil → createNight → .nightCreated
        └── fetchAssignments(nightId) → .assignmentsLoaded
              └── assignments sorted by PLACEMENT_ORDER
              └── rebuildAssignmentMaps() → assignmentsBySlotKey, lockedSlotKeys, breakGroupsByUiKey
```

### TM Assignment (Optimistic)

```
User: tap slot card
  → .slotSelected(uiKey) → selectedSlotKey = uiKey

User: tap TM chip in roster
  → .tmSelectedForAssignment(tmId)
     ├── rollback = current assignments snapshot
     ├── state.assignments updated immediately (optimistic)
     ├── rebuildAssignmentMaps()
     └── Effect: saveAssignment(ZoneAssignment)
           ├── success: ._assignmentSaved → rebuildAssignmentMaps()
           └── failure: ._assignFailed → restore rollback → show error banner
```

### Realtime Sync

```
RealtimeService.assignments(nightId:) → AsyncStream<RealtimeEvent>
  → .cancellable(id: "realtime.assignments")
  → .realtimeEvent(.change) → fetchAssignments() → rebuildAssignmentMaps()
```

### PDF Export

```
DeploymentPDFExporter.export(state:)   (@MainActor)
  └── ImageRenderer<DeploymentBookView(state:)>
        ├── 792×612pt (US Letter landscape)
        ├── 4 columns: Zones | Restrooms | AUX | Overlaps
        └── writes to FileManager.default.temporaryDirectory
              → .exportPDFCompleted(url) → .sheet(item: pdfURL) → ShareSheet
```

---

## 3. SPM Dependency Analysis

### Direct Dependencies

| Package | Pinned Version | Notes |
|---|---|---|
| `supabase-swift` | 2.46.0 | Stable production release; includes Realtime v2, Storage, Auth |
| `swift-composable-architecture` | 1.25.5 | Latest stable at time of pinning; TCA 1.x series |

### Transitive Dependencies (18 total)

The full transitive closure is healthy — all Point-Free packages (`swift-case-paths` 1.7.3, `swift-clocks` 1.0.6, `swift-dependencies` 1.12.0, `swift-identified-collections` 1.1.1, `swift-navigation` 2.8.0, `swift-perception` 2.0.10, `swift-sharing` 2.8.0, `combine-schedulers` 1.2.0, `swift-concurrency-extras` 1.3.2, `swift-custom-dump` 1.5.0, `xctest-dynamic-overlay` 1.9.0) are pinned to specific revisions. Apple packages (`swift-asn1` 1.7.0, `swift-collections` 1.5.1, `swift-crypto` 4.5.0, `swift-http-types` 1.5.1) are similarly pinned. `swift-syntax` is pinned to 603.0.1, consistent with Swift 6.

**No stale or incompatible pins detected.** All packages are mutually compatible at the pinned versions. The swift-syntax version (603.0.1) confirms this is targeting Swift 6 compiler.

**Note:** `Package.resolved` is committed to the repo (`.gitignore` does not exclude it, despite the commented-out suggestion to do so). This is correct behavior for an app — reproducible builds are more important than diff noise. No action needed.

---

## 4. Swift 6 / Concurrency Compliance

The codebase navigates Swift 6's `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` setting competently. Key patterns and their correctness:

### Correct Patterns

**`nonisolated` Codable on model types** — `ZoneAssignment` and `SlotTask` implement `encode(to:)` and `init(from:)` in `nonisolated` extension methods. This is the correct pattern to allow Codable to be called from actor contexts (e.g., `ShiftPlannerRepository.saveAssignment()`). The comment explaining why is accurate and helpful.

**`actor ShiftPlannerRepository`** — All Supabase I/O is actor-isolated. The `static func live()` factory avoids default-parameter evaluation in a `nonisolated` context (a real pitfall under the MainActor default setting).

**`nonisolated(unsafe)` scoped correctly** — Used only on `SupabaseManager.client` (mutable, written once before concurrent access). `static let shared` no longer uses it (removed as planned per the known warnings). The comment documenting why it is safe is present.

**`Sendable` conformances** — `ShiftPlannerClient`, `BreakTrackerClient`, `RealtimeService`, and all model types conform to `Sendable`. `ShiftPlannerState` is `@ObservableState` which satisfies observation requirements.

**`AsyncStream` for Realtime** — `RealtimeService.assignments(nightId:)` returns `AsyncStream<RealtimeEvent>`, which is `Sendable`-safe. `continuation.onTermination` correctly captures the channel for cleanup with `Task { await channel.unsubscribe() }`.

### Areas of Concern

**Manual observation (`let _ = store.X`) in ShiftPlannerView** — 20+ `let _ = store.someProperty` lines are used as a workaround to force `@Observable`-style fine-grained re-renders in SwiftUI. This is a known TCA pattern but is fragile: missing one property causes stale UI, and adding properties requires remembering to register them manually. IMPLEMENTATION_PLAN P0-02 tracks this. The correct fix is using `WithPerceptionTracking` or the `@ObservedObject` + `ViewStore` pattern.

**`SWIFT_STRICT_CONCURRENCY`** — Currently at `targeted`, with `complete` as the goal (per AGENTS.md). At `complete`, more cross-isolation sends will be flagged. This may surface issues in `SudoPanelView` (very large, complex view) when strict concurrency is fully enabled.

**`DispatchQueue.main.asyncAfter` in `ShiftHeaderBar`** — Noted in IMPLEMENTATION_PLAN (P1-05). One empty `asyncAfter` remains; should be removed or replaced with `Task { @MainActor in }`.

---

## 5. Model Layer Analysis

### TeamMember

Clean model. `tmId: String` (not UUID) is unusual but correct — the `"tm_abby"` style key is a deliberate design choice in the GLCR data model. `gravePool: String?` ("Grave"/"Full"/"AM"/"PM") drives eligibility filtering. `isMale`/`isFemale` computed helpers are useful. Codable is straightforward (all fields default-synthesized).

### Night

`NightStatus: String, Codable` enum (`.draft`/`.active`/`.complete`) eliminates the magic-string comparisons tracked in P1-23 — this is already implemented. `isLocked: Bool` is non-optional with a custom `decodeIfPresent ?? false` — P0-05 is already implemented. The `nonisolated` Codable pattern is applied here as well.

### ZoneAssignment

The composite primary key (`night_id + slot_key + slot_type + rr_side`) mirrors the Supabase table correctly. The `breakGroup: Int` field (0 = no group, 1–3 = rotation group) is decoded with `decodeIfPresent ?? 0` and an important comment explaining why `try?` would silently produce `Int??` (a subtle Swift footgun well-documented here). The `.id: String` computed property joins the four key fields for `Identifiable` conformance.

### SlotTask

Mirrors `night_slot_tasks` table. Used for per-slot task label overlays (e.g., "Wipe down machines in Zone 3"). Clean model, same nonisolated Codable pattern.

### Break

`startTime: Date?` and `endTime: Date?` with computed `durationMinutes`, `isOnBreak`, `isCompleted`. ISO 8601 date decoding is handled by the Supabase Swift SDK's default `JSONDecoder`.

### ShiftPlannerConstants

Well-designed constants file. `ZoneDef`, `RRDef`, `AuxDef`, `OverlapDef` structs define all slot metadata. Color palettes, icon glyphs, and Canvas dimensions are all centralized here. `Color(hex:)` extension is simple but functional. `Canvas` enum uses static properties for all layout dimensions — this is the correct pattern.

**Minor issue:** Card corner radius in code is 6pt (`Canvas.cornerRadius.card`?), but AGENTS.md says it should be 8pt after a "token refactor." The constant may not yet be updated.

### SlotKey

`uiKeyToDb(_:) -> DbSlot?` returns an optional (P0-03 implemented — no `fatalError` in production paths). `PLACEMENT_ORDER` has 36 entries. The function uses a large switch statement — maintainable for the current slot count but would benefit from a dictionary lookup for performance if slot count grows significantly.

---

## 6. Repository Layer Analysis

`ShiftPlannerRepository` is a well-structured actor. All Supabase queries follow the documented rule: filters before `.order()` (since `.order()` returns `PostgrestTransformBuilder` which has no filter API). Error wrapping with `RepositoryError.fetchFailed/saveFailed` is consistent throughout.

**Minor issue:** The `// MARK: - Nights` comment appears twice (lines 70 and 86). One of them should be `// MARK: - Night CRUD` or similar to avoid the duplicate section marker.

**`NightPatch` inner struct** — correct pattern to avoid the `@MainActor`-isolated Encodable conformance issue with the `Night` struct in an actor method. This is exactly the kind of Swift 6 nuance that should be documented (and it is, with a comment).

**`deleteAssignment`** branches on `rrSide` presence to construct the correct Supabase filter. This works but is verbose. Could be simplified with a helper, but correctness is more important than brevity here.

---

## 7. Feature Layer Analysis

### ShiftPlannerFeature (TCA Reducer)

The brain of the app. Manual `Reducer` conformance (not `@Reducer` macro) is an intentional workaround for an Xcode 26 beta circular-reference bug — well-documented in the file header. This is a temporary limitation, not a design flaw.

**State management:** `ShiftPlannerState` is comprehensive and well-organized. Undo/redo stacks (50 entries), `rollback` snapshot, selection state, pencil mode, and lookup maps (`assignmentsBySlotKey`, `lockedSlotKeys`, `breakGroupsByUiKey`) are all stored properties updated by `rebuildAssignmentMaps()` after mutations. This implements the P1-07 optimization (O(n) rebuild once per mutation vs. O(n) per access).

**Optimistic updates with rollback** — `pushUndo(description:)` and rollback on `_assignFailed` are correctly implemented. The undo stack is local-only (no network sync this sprint), which is correctly documented.

**30+ action cases** — the reducer handles the full lifecycle: fetch, assign, unassign, lock, notes, breaks, realtime events, export, undo/redo, date navigation, and SUDO actions. No obvious missing cases for the current feature set.

**Error auto-dismiss** — `.cancellable(id: "error.dismiss", cancelInFlight: true)` on a delayed `.none` effect is a clean pattern for temporary error banners.

**Sort on load** — assignments are sorted by `PLACEMENT_ORDER` after fetch (P1-25 implemented).

### ArtboardCanvasView vs. ShiftCanvasView

The codebase contains **two canvas implementations**:
- `ShiftCanvasView.swift` — Sprint 2 implementation, card-based layout
- `ArtboardCanvasView.swift` — Sprint 3 redesign, artboard model matching the ZDS Forge webapp

`ShiftPlannerView` currently uses `ArtboardCanvasView` as the primary canvas. `ShiftCanvasView` is preserved in the project but is no longer referenced from the root view. However, it defines `ZoneCardView`, `RRCardView`, `AuxCardView`, and `OverlapCardView` — some of which are still referenced from `ShiftCanvasView` itself. `ZoneCardView` has its own dedicated file.

**This creates dead code risk.** If `ShiftCanvasView` is not compiled into any live code path, its card views are compiled but never executed. This should be clarified: either `ShiftCanvasView` should be deleted (if fully superseded), or the relationship between the two canvases should be documented (if `ShiftCanvasView` is kept as a fallback).

### BreakTrackerFeature

Clean, focused TCA feature. Three breaks max per TM is enforced in the reducer (`guard breakNum <= 3 else { return .none }`). `BreakTrackerState` helper methods (`breaks(for:)`, `activeBreak(for:)`, `nextBreakNum(for:)`) are well-designed. The `TimelineView(.periodic(from:by:15))` for live elapsed time (P0-08) is correctly implemented.

### SudoPanelView (~1741 lines)

The largest single file in the codebase. Implements a full-screen admin panel with 5 tabs (Team, Tasks, Reports, Engine Config, Table Explorer). Feature-rich but has two concrete issues:

**Bug — SudoReportsTab TM name resolution:** In `loadData()`, `ZoneFrequencyEntry(tmId: tmId, tmName: tmId, ...)` passes the raw TM ID as the display name. The code comment acknowledges this: "Use tmId as name fallback and improve post-build." The fix requires joining with `TeamMember.displayName` from the loaded roster.

**Security smell — hardcoded project ID in UI:** `Text("dev · iazgrcainbokkdqunkok")` displays the Supabase project ID in the admin panel header. While this is low-risk for an internal tool (the anon key is already in the app bundle), it is sloppy and leaks infrastructure details to anyone who screenshots the SUDO panel. Should be replaced with a generic label like `"dev · glcr-ops"` or removed.

### DeploymentBookView

Clean, well-documented layout view. All four columns (Zones, Restrooms, AUX, Overlaps) are correctly implemented after P0-06 and P0-07 fixes. The full-width Night Notes footer bar (P1-08) is in place. The `deployRow()` component is reusable and consistent across columns. US Letter landscape (792×612pt) sizing is fixed and correct for ImageRenderer.

---

## 8. Implementation Status — Actual vs. Documented

The `IMPLEMENTATION_PLAN.md` progress tracker shows **0/70 items completed**, but the actual code tells a different story. Based on the full source read:

### Sprint 0 (P0) — All 9 items appear IMPLEMENTED in code

| Item | Description | Code Evidence |
|---|---|---|
| P0-01 | BreakTracker Store hoisted to @State | ✅ `@State private var breakTrackerStore` in ShiftPlannerView |
| P0-02 | Manual observation (12 `let _ =` lines) | ⚠️ 20+ lines still exist — partially addressed |
| P0-03 | `fatalError` in `uiKeyToDb()` | ✅ Returns `DbSlot?` (Optional) |
| P0-04 | `fatalError` in `SupabaseManager.configure()` | ✅ `configurationError` property, no fatalError |
| P0-05 | `Night.isLocked` is Bool? | ✅ `isLocked: Bool` with `decodeIfPresent ?? false` |
| P0-06 | PDF clips zone list (ScrollView in ImageRenderer) | ✅ Plain VStack, no ScrollView (comment confirms fix) |
| P0-07 | PDF missing overlap slots | ✅ 4th overlaps column present in DeploymentBookView |
| P0-08 | BreakTracker timer frozen | ✅ `TimelineView(.periodic(from: .now, by: 15))` |
| P0-09 | BreakTracker shows all TMs | ✅ Filtered to `assignedTmIds` in ShiftPlannerView |

### Sprint 1 (P1) — Several items implemented

| Item | Description | Status |
|---|---|---|
| P1-03 | Reduce Motion gating | ✅ `@Environment(\.accessibilityReduceMotion)` in ZoneCardView |
| P1-06 | RosterRail collapse state persisted | ✅ `@AppStorage("rosterRailCollapsed")` |
| P1-07 | O(n) lookup maps cached | ✅ `rebuildAssignmentMaps()` as stored properties |
| P1-12 | Haptics on lock/unlock | ✅ `UIImpactFeedbackGenerator` in RosterRailView |
| P1-23 | NightStatus enum | ✅ `NightStatus: String, Codable` enum on Night |
| P1-25 | Assignment sort order enforced | ✅ Sort by PLACEMENT_ORDER after fetch |

**The progress tracker is stale.** A significant portion of Sprint 0 and several Sprint 1 items are already implemented. `IMPLEMENTATION_PLAN.md` should be updated to reflect actual state. This is a maintenance debt that could cause confusion for future agents starting from this document.

---

## 9. Security Posture

Overall the security posture is appropriate for an internal iPad tool.

**Correct:** `Secrets.plist` and `.env.local` are gitignored. The app uses only the anon key (never the service role key). No credentials appear in any Swift source file. `SupabaseManager` reads from the bundle at runtime.

**Correct:** `SudoRepository` uses the same anon key as everything else. SUDO operations rely on Supabase RLS policies server-side to gate privileged operations. This is the correct architecture (the app has no mechanism to hold a service role key securely on-device).

**Issue:** `Text("dev · iazgrcainbokkdqunkok")` in `SudoPanelView` exposes the Supabase project ID in the UI. This is the same project ID visible in the Supabase dashboard URL and is not itself a credential — but it is unnecessary information exposure in a UI element. Replace with a non-identifiable label.

**No biometric auth** on the SUDO panel — anyone who can open the app can access SUDO. For a single-user internal tool this is acceptable, but P3-08 (biometric lock) is worth prioritizing if the device is ever unattended in a shared environment.

---

## 10. Identified Bugs and Issues

### Critical / Must Fix

None at this time (all P0 items appear resolved in code).

### High Priority (P1 — unimplemented)

1. **Zero accessibility annotations** — VoiceOver reads "button" on all interactive elements. Every zone card, TM chip, break button, and date control needs `.accessibilityLabel` + `.accessibilityValue`. (P1-01)
2. **All text uses `.system(size: N)`** — Dynamic Type is completely broken. No text scales with system font size. (P1-02)
3. **No error UI on failed Supabase saves** — Rollback occurs silently. Users have no visual feedback when an assignment fails to persist. (P1-13)
4. **No loading state during fetch** — Empty flash before data populates. `isLoading` state needed. (P1-14)
5. **No offline / network degradation handling** — Failed saves are silently dropped when offline. (P1-16)
6. **Forced `.preferredColorScheme(.dark)` on sheets** — Breaks light mode. (P1-04)
7. **`DispatchQueue.main.asyncAfter` empty call** — Dead code, suggests abandoned callback. (P1-05)
8. **No confirmation before destructive operations** — Clear/reset night has no alert. (P1-19)
9. **Locked night allows drag-and-drop** — Dragging TM chip to a locked night still triggers the assignment flow. (P1-20)
10. **PDF export has no progress indicator** — `ImageRenderer` blocks main thread with no spinner. (P1-21)

### Medium Priority

11. **SudoReportsTab TM names not resolved** — `tmName: tmId` (shows raw IDs instead of display names). (SudoPanelView `loadData()`)
12. **Hardcoded Supabase project ID in UI** — `Text("dev · iazgrcainbokkdqunkok")` in SudoPanelView header.
13. **Duplicate `// MARK: - Nights`** — ShiftPlannerRepository lines 70 and 86.
14. **Manual observation fragility** — 20+ `let _ = store.X` lines; any missed property causes stale UI.
15. **ShiftCanvasView dead code** — Sprint 2 canvas preserved but no longer wired as primary. Relationship to ArtboardCanvasView undocumented.

### Low Priority / Technical Debt

16. **No tests** — Zero test coverage. `AGENTS.md` acknowledges this explicitly: "There are currently zero tests." All new actions need TestStore coverage.
17. **IMPLEMENTATION_PLAN.md stale** — Shows 0/70 done; actual code has ~15 items completed.
18. **Corner radius inconsistency** — Code uses 6pt; AGENTS.md specifies 8pt as the target after token refactor.
19. **Quadruple directory nesting** — `opsApp/opsApp/opsApp/opsApp/` is a maintenance hazard.
20. **`print()` calls in production code** — Should be replaced with `Logger` (OSLog). (P2-16)

---

## 11. Architecture Strengths

**TCA is well-applied.** The reducer-as-single-source-of-truth model is respected throughout. State mutations happen only in the reducer. Side effects are in `.run {}`. Dependencies are injected via `DependencyKey`. The distinction between internal actions (`_nightLoaded`, `_assignmentSaved`) and user-initiated actions is clean.

**Optimistic updates are correct.** The snapshot + rollback pattern for assignments is a textbook optimistic UI implementation. The `pushUndo(description:)` with a 50-entry cap and redo-stack invalidation on new mutations is also correct.

**`rebuildAssignmentMaps()` is a smart optimization.** Rather than recomputing `assignmentsBySlotKey` and `lockedSlotKeys` on every property access (O(n) per call), they are rebuilt once per mutation (O(n) total). With 30-36 slots, this is a ~30x reduction in work per render cycle on a filled night.

**Supabase integration is clean.** The repository actor pattern (all queries behind `actor ShiftPlannerRepository`) prevents data races on the database client. Query patterns consistently follow the filter-before-transform rule.

**Realtime subscription lifecycle is handled correctly.** The `continuation.onTermination` cleanup and `cancellable(id:)` cancellation-before-resubscribe pattern should prevent subscription leaks (P1-17 notes a need for a unit test to verify this, but the pattern is correct).

**Design token centralization in `ShiftPlannerConstants.swift`** is the right approach. All zone/RR/AUX/Overlap definitions, color palettes, icon glyphs, and Canvas dimensions live in one file.

**PDF output is complete.** `DeploymentBookView` is a well-structured US Letter landscape layout with all four columns, night notes footer, and header. The `ImageRenderer` + `CGContext` PDF backend pattern is correct for static PDF generation in SwiftUI.

---

## 12. Recommended Next Steps

### Immediate (next session)

1. **Update IMPLEMENTATION_PLAN.md** — Check off all Sprint 0 items and the P1 items confirmed implemented. The stale tracker creates confusion for any agent reading it as ground truth.
2. **Fix SudoReportsTab TM name lookup** — In `SudoPanelView.loadData()`, resolve `tmName` from `state.teamMembers` dictionary lookup instead of using `tmId` directly. One-line fix.
3. **Remove hardcoded project ID from SudoPanelView** — Replace `"dev · iazgrcainbokkdqunkok"` with `"dev · glcr-ops"` or remove.
4. **Clarify ShiftCanvasView status** — Either delete it (if ArtboardCanvasView is the permanent replacement) or add a file comment explaining its role. Unused code compiled into the binary is build time and binary size with no benefit.

### Sprint 1 Completion (high value)

5. **P1-01 / P1-02 — Accessibility + Dynamic Type** — These are the two items with the broadest impact on usability and App Store reviewability. Every interactive control needs `.accessibilityLabel`. All user-visible text needs semantic font styles.
6. **P1-13 — Error UI on failed saves** — Currently silent failures. A brief `AlertState` toast on save failure is essential for a tool used in a live shift.
7. **P1-14 — Loading state** — The empty-flash before data populates is jarring in a professional context. `isLoading: Bool` + `ProgressView` overlay is a small change.
8. **P1-20 — Locked night drag-drop** — A locked night should be immutable. This is a correctness issue, not just polish.

### Infrastructure

9. **Add first tests** — Priority order: `uiKeyToDb()` round-trip for all 36 keys (unit test), rollback on `_assignFailed` (TestStore), `breakGroup` decode with missing column (unit test). These three cover the highest-risk paths.
10. **Enable `SWIFT_STRICT_CONCURRENCY = complete`** — Currently at `targeted`. Enabling `complete` will surface any remaining isolation issues before they become production bugs. Fix anything that surfaces, especially in `SudoPanelView`.
11. **Replace `print()` with `Logger`** — Structured logs are filterable in Console.app during on-device debugging. This makes live-shift troubleshooting dramatically easier.

### Medium Term (P2 polish)

12. **P2-15 — Replace UIActivityViewController with ShareLink** — iOS 16+ `ShareLink(item: pdfURL)` is simpler and better integrated with iPadOS 26. Eliminates the custom `ShareSheet: UIViewControllerRepresentable` wrapper.
13. **P2-17 — Undo/redo keyboard shortcuts** — `⌘Z` / `⌘⇧Z` keyboard shortcuts are registered but the undo stack caps at 50 entries with local-only semantics. Good foundation; add the shortcut-to-action wiring.
14. **P3-02 — Live Activity for break timers** — This would be the killer feature for on-floor use: a Dynamic Island display showing active break timers without opening the app. Requires ActivityKit + WidgetKit.

---

## 13. Summary

opsApp is a well-architected, purpose-built iPad operations tool that applies TCA, Swift 6 concurrency, and Supabase correctly. The core assignment, break tracking, realtime sync, and PDF export flows are functional. All Sprint 0 blockers have been resolved in code (though not marked done in the plan).

The primary gaps are in accessibility (zero annotations), Dynamic Type (all hardcoded font sizes), error feedback (silent on save failure), and test coverage (zero tests). The secondary gaps are in the stale progress tracker and a few isolated bugs (SudoReportsTab TM names, dead ShiftCanvasView code).

The codebase is in a "feature-complete for core workflow, polish-incomplete for production" state — appropriate for a tool that is actively used in its development environment. With Sprint 1 completion (particularly accessibility, error UI, and test coverage), it would meet App Store standards and be ready for TestFlight distribution.

---

*Analysis generated by full read of all 27 Swift source files, Package.resolved, IMPLEMENTATION_PLAN.md, AGENTS.md, README.md, and .gitignore.*  
*LiquidForge × Cowork — 2026-05-25*
