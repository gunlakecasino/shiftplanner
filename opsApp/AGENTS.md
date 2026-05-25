# AGENTS.md — opsApp iOS Agent Context

> **Read this file first.** Every AI agent (Claude, Grok, Cursor, GPT, Gemini) working on
> the opsApp iOS codebase must read this document before touching a single line of code.
> It is the single source of truth for "what this app is, how it is built, what state it is
> in, and what the rules are."

---

## 0. Agentic Command Post Integration

This project uses the Agentic Command Post at the root level:

```
/Users/briankillian/oms_root/Agentic/
```

**Before any substantive work, you must:**
1. Read `Agentic/README.md`
2. Read `Agentic/THIS_IS_WHAT_WE_ARE_DOING.md`
3. Read the most recent 15–20 entries of `Agentic/AGENT_ACTIVITY_LOG.md`
4. Append a boot entry to `AGENT_ACTIVITY_LOG.md` before you begin

**After completing any meaningful milestone:**
- Append a structured entry to `AGENT_ACTIVITY_LOG.md`
- Update `THIS_IS_WHAT_WE_ARE_DOING.md` if the mission has shifted

---

## 1. What This App Is

**opsApp** is a native iPadOS 26 operations tool for **Gun Lake Casino Resort (GLCR)**, built for Brian Killian (Grave Shift Supervisor, Internal Maintenance). It is used during a live 8-hour grave shift to:

- **Deploy** team members (TMs) to zones, restrooms, auxiliary slots, and overlap slots
- **Track breaks** for each assigned TM (up to 3 breaks per TM per night)
- **Write night notes** attached to the shift record
- **Export** a deployment book PDF (US Letter landscape) for the casino floor

**This is an internal ops tool, not a consumer app.** There is exactly one primary user: Brian. However, it must meet App Store quality standards (accessibility, performance, Swift 6 safety) because it is a professional product and a portfolio piece.

**Target hardware:** iPad Air M3 (11"), iPadOS 26, Apple Pencil Pro 2, Smart Keyboard Folio.

---

## 2. Architecture Overview

```
opsApp
├── App/
│   ├── opsAppApp.swift          — @main entry point; calls SupabaseManager.shared.configure()
│   └── RootView.swift           — NavigationStack → ShiftPlannerView (only screen today)
│
├── Core/
│   ├── Models/
│   │   ├── TeamMember.swift     — Codable struct; mirrors tm_profiles Supabase table
│   │   ├── Night.swift          — Codable struct; mirrors nights table
│   │   ├── ZoneAssignment.swift — Codable struct; mirrors zone_assignments table
│   │   ├── Break.swift          — Codable struct; mirrors breaks table
│   │   ├── SlotTask.swift       — Codable struct for slot task records
│   │   ├── ShiftPlannerConstants.swift — Zone/RR/AUX/Overlap defs, colors, icons, Canvas dimensions
│   │   └── SlotKey.swift        — UI key ↔ DB key translation functions
│   │
│   ├── Repositories/
│   │   └── ShiftPlannerRepository.swift — All Supabase CRUD operations
│   │
│   ├── Services/
│   │   ├── DateHelpers.swift    — Date.tonightShiftDate extension and helpers
│   │   └── RealtimeService.swift — Supabase Realtime AsyncStream for zone_assignments
│   │
│   └── Supabase/
│       └── SupabaseManager.swift — Singleton SupabaseClient; reads Secrets.plist
│
└── Features/
    ├── ShiftPlanner/
    │   ├── ShiftPlannerFeature.swift   — TCA State/Action/Reducer for the main planning surface
    │   ├── ShiftPlannerView.swift      — Root view; owns the TCA Store; wires header + canvas + sheets
    │   ├── UI/
    │   │   ├── ShiftHeaderBar.swift   — Date nav, status badge, fill counter, action cluster
    │   │   ├── ShiftCanvasView.swift  — Bidirectional scroll canvas; all card grids; gesture handling
    │   │   ├── RosterRailView.swift   — Collapsible left TM list; assignment controls
    │   │   └── ZoneCardView.swift     — Individual zone card with hover/selected/locked states
    │   └── PDF/
    │       ├── DeploymentBookView.swift   — SwiftUI layout for the deployment book (792×612pt)
    │       └── DeploymentPDFExporter.swift — ImageRenderer wrapper that writes the PDF to disk
    │
    ├── BreakTracker/
    │   ├── BreakTrackerFeature.swift   — TCA State/Action/Reducer for break tracking
    │   └── BreakTrackerView.swift      — Sheet: shows all TMs with START/END break controls
    │
    └── (future)
        ├── TeamMemberProfiles/         — TM detail views, performance history
        └── ShiftHistory/               — Browse historical nights
```

---

## 3. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| UI | SwiftUI (iOS 26 SDK) | No UIKit except UIHoverGestureRecognizer bridge for Pencil hover |
| State Management | TCA (The Composable Architecture) | Manual `Reducer` conformance — `@Reducer` macro deferred (Xcode 26 beta bug, documented in ShiftPlannerFeature.swift) |
| Backend | Supabase (PostgreSQL + Realtime) | Project: glcr-ops. Credentials in `Resources/Secrets.plist` (gitignored) |
| Realtime | Supabase Realtime v2 | AsyncStream pattern in RealtimeService; cancel via TCA `.cancellable(id: "realtime.assignments")` |
| Dependency Injection | TCA `DependencyKey` pattern | `ShiftPlannerClient`, `BreakTrackerClient` — both have `.previewValue` for Xcode Previews |
| Design System | Liquid Glass (iOS 26) + custom dark palette | Gold: `#B89708`/`#FFD700`. Background: `#171C22`. Accent colors per zone (see `ShiftPlannerConstants.swift`) |
| Concurrency | Swift 6 strict concurrency | `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. All cross-actor types are `Sendable`. `nonisolated(unsafe)` only where write-once-before-concurrent-access is documented |

---

## 4. Database Schema (Supabase — `glcr-ops` project)

### Key Tables

| Table | Primary Key | Notes |
|---|---|---|
| `tm_profiles` | `tm_id` (String, e.g. `"tm_abby"`) | NOT a UUID. `grave_pool` column determines eligibility |
| `nights` | `id` (UUID) | One row per calendar date. `night_date` is a date string (`"yyyy-MM-dd"`) |
| `zone_assignments` | composite `(night_id, slot_key, slot_type, rr_side)` | `slot_type`: `"zone"` / `"rr"` / `"aux"` / `"overlap"` |
| `breaks` | `id` (UUID) | `break_num` is 1–3 per TM per night. `end_time` null = break in progress |

### Slot Key Convention

UI keys (used in Swift state) map to DB keys via `SlotKey.swift`:
- Zones: `Z1`–`Z10` → `zone_1`–`zone_10`
- RR: `MRR1`/`WRR1` → `slot_key: "rr_1_2"`, `rr_side: "mens"/"womens"`
- AUX: `Z9SR`/`ADM`/`TR1`/`TR2`/`SP1`/`SP2` → `z9_sr`/`admin`/`trash_1`/etc.
- Overlaps: `PM_OV1`/`PM_OV2`/`AM_OV1`/`AM_OV2` → `pm_overlap_1`/etc.

> ⚠️ **Never hard-code DB slot keys in new code.** Always go through `uiKeyToDb()` and `dbSlotToUiKey()` in `SlotKey.swift`.

---

## 5. Current State — What Works, What's Known-Broken

### ✅ Working (as of May 2026)
- Zone assignment: tap slot → tap TM → assigns and persists to Supabase
- Drag-and-drop TM chip → zone card
- Context menu (long-press): Reassign / Lock / Clear on filled slots
- Pencil Pro 2 hover highlight via `UIHoverGestureRecognizer`
- Keyboard shortcuts: ⌘R (refresh), ⌘← (prev day), ⌘→ (next day), Esc (dismiss selection)
- Night lock / unlock with confirmation alert
- Night notes sheet with save
- Break tracking: START / END / DELETE per TM (up to 3 breaks)
- PDF deployment book export (Zones + Restrooms + AUX columns)
- Supabase Realtime subscription for `zone_assignments` updates
- Optimistic UI updates with rollback on failure
- Date navigation with calendar picker popover

### ❌ Known Issues (must fix — P0/P1 from UI/UX Checklist)
- **Zero accessibility annotations** — VoiceOver reads "button" on everything
- **Frozen elapsed timer** in Break Tracker (time is computed once at render, not live)
- **"Go to Date" button does nothing** (empty closure in datePickerPopover)
- **Roster Rail starts collapsed** on every launch
- **Overlaps missing from PDF export** (DeploymentBookView renders 3 columns, no overlaps)
- **`fatalError()` in `uiKeyToDb()`** — crash risk on malformed DB data
- **`BreakTrackerStore` created inside a SwiftUI Binding getter** — fragile store lifecycle
- **All fonts use `.system(size:N)`** — Dynamic Type is completely broken
- **Manual observation registration** (12 `let _ = store.x` lines) — invisible stale-state risk
- **`Night.isLocked` is `Bool?`** — creates 12 optional-chain fragility sites

### 🔧 Deferred (documented, intentional)
- `@Reducer` macro not used — Xcode 26 beta circular-reference bug (see ShiftPlannerFeature.swift comment)
- `@unchecked Sendable` on SupabaseManager — safe because `client` is write-once before concurrent access

---

## 6. Non-Negotiable Engineering Rules for This Codebase

### Swift 6 / Concurrency
- All types crossing actor boundaries **must** conform to `Sendable`
- UI mutations **must** be `@MainActor`
- Never add `DispatchQueue.main.async` — use `Task { @MainActor in }` or `await MainActor.run { }`
- `nonisolated(unsafe)` is only acceptable on write-once-before-concurrent-access properties, and **must** be documented with a comment explaining why it is safe
- `SWIFT_STRICT_CONCURRENCY = complete` is the target (currently at `targeted`)

### TCA Patterns
- Never create a `Store` inside a SwiftUI `Binding` getter or inside `body` — always hoist to `@State` or scope from a parent store
- Child features use `store.scope(state:action:)` — never create a parallel independent Store for a child screen
- Side effects go in `.run { }` — never in `@Observable` setters or SwiftUI `onChange`
- Internal action completions are prefixed with `_` (e.g., `._nightLoaded`, `._assignmentSaved`)
- `.cancellable(id:)` IDs are string literals — name them `"domain.operation"` (e.g., `"realtime.assignments"`, `"notes.saved.flash"`)

### UI / Accessibility
- Every interactive view **must** have `.accessibilityLabel`, `.accessibilityHint`, and `.accessibilityValue` where applicable
- All text **must** use named Dynamic Type styles — never `.system(size:N)` for user-visible text
- All animations **must** be gated behind `@Environment(\.accessibilityReduceMotion)`
- Minimum touch target: 44×44pt via `.frame(minWidth: 44, minHeight: 44)` + `.contentShape(Rectangle())`
- Contrast ratio must meet WCAG AA: ≥ 4.5:1 for body text, ≥ 3:1 for large text

### Haptics
- Assignment / unassignment: `UIImpactFeedbackGenerator(.light)`
- Lock / unlock: `UIImpactFeedbackGenerator(.rigid)`
- Save success / error: `UINotificationFeedbackGenerator().notificationOccurred(.success/.error)`
- Never fire haptics without a paired visual state change

### No `fatalError` in Release Paths
- `uiKeyToDb()` must return an optional or throw — never `fatalError`
- `SupabaseManager.configure()` must set an error state and render a recovery screen — never `fatalError`

### Design Tokens
- Card corner radius: 8pt (not 6 — see `Canvas.cornerRadius.card` after token refactor)
- All colors via named constants in `ShiftPlannerConstants.swift` — never inline `Color(red:green:blue:)`
- Gold: `#FFD700` (display) / `#B89708` (subdued) — never approximate
- All layout dimensions via the `Canvas` enum

---

## 7. File Modification Rules

| File | Rule |
|---|---|
| `ShiftPlannerConstants.swift` | Single source of truth for all zone/RR/AUX/Overlap definitions, colors, icons, and Canvas dimensions. Never duplicate these values elsewhere. |
| `SlotKey.swift` | Owns all UI ↔ DB slot key translation. Never bypass `uiKeyToDb()` / `dbSlotToUiKey()`. |
| `ShiftPlannerFeature.swift` | The TCA reducer is the brain. State mutations happen ONLY here. Never mutate state from a view. |
| `SupabaseManager.swift` | Singleton. Touch only to add error handling or swap to actor isolation. |
| `RealtimeService.swift` | Never add logic here — it's a pure event emitter. Logic belongs in the TCA reducer. |
| `DeploymentBookView.swift` | Layout only. No data fetching, no business logic. All data comes from `ShiftPlannerState`. |

---

## 8. UI Architecture — The Canvas

The main planning surface is a bidirectional `ScrollView` containing four card grids:

```
┌─────────────────────────────────────────────────────────────────┐
│  ShiftHeaderBar (52pt, top, glass background)                   │
├────────┬────────────────────────────────────────────────────────┤
│        │  ← Horizontal scroll →                                 │
│ Roster │  ZONES (2 rows × 5 cols, ZoneCardView 168×108pt)       │
│  Rail  │  RESTROOMS (2 rows × 5 cols, RRCardView 220×108pt)     │
│ (200pt │  AUXILIARY (2 rows × 3 cols, AuxCardView 168×80pt)     │
│  or    │  OVERLAPS (2 rows × 2 cols, OverlapCardView 168×80pt)  │
│  40pt  │                                                         │
│  col.) │  ↑ Vertical scroll ↓                                   │
└────────┴────────────────────────────────────────────────────────┘
```

**Interaction model:**
1. Tap card → select slot (roster shows "TAP TO ASSIGN" banner)
2. Tap TM chip in roster → assigns TM to selected slot
3. Drag TM chip → drop on card → assigns directly
4. Long-press card → context menu (Reassign / Lock / Clear) — filled slots only
5. Tap canvas background → dismiss selection
6. Swipe left/right on canvas → next/prev day

---

## 9. Testing Requirements

> ⚠️ **There are currently zero tests.** Every new feature or bug fix must include tests.

**For TCA features, use TestStore:**
```swift
import ComposableArchitecture
import Testing

@Test func assignSlot_optimisticUpdate() async {
  let store = TestStore(initialState: ShiftPlannerState()) {
    ShiftPlannerFeature()
  } withDependencies: {
    $0.shiftPlannerClient = .previewValue
  }
  // ... assertions
}
```

**Minimum test coverage required for any PR:**
- All new `Action` cases in the reducer must have at least one `TestStore` assertion
- Rollback behavior on `_assignFailed` must be tested
- `uiKeyToDb()` and `dbSlotToUiKey()` round-trip for all 30 slot keys

---

## 10. Tools Available for This Codebase

| Tool | Purpose | When to Use |
|---|---|---|
| `XcodeBuildMCP` | Build, run, test, UI snapshot on real simulator | Before marking any PR complete |
| `LiquidForge` skill | iOS 26 / SwiftUI / TCA expert guidance | Architecture decisions, API questions |
| `glcr-design-system` skill | GLCR brand colors, typography, visual spec | Any UI change |
| `glcr-grave-deployment` skill | Zone deployment business logic | When implementing new slot types or rules |
| `glcr-tm-profiles` skill | TM data, history, zone skills | When working with TM-related features |

**Always call `session_show_defaults` before any `XcodeBuildMCP` build call to verify project/scheme/simulator.**

---

## 11. Implementation Checklist Reference

The full UI/UX audit checklist is at:
```
opsApp/IMPLEMENTATION_PLAN.md    — Sprint-by-sprint plan for all 70 items
oms_root/opsApp_UIUX_Checklist.docx — Full audit document with Current State + Action for each item
```

**Priority order:**
1. P0 (9 items) — Fix before any external demo. See Sprint 0 in IMPLEMENTATION_PLAN.md
2. P1 (25 items) — Sprint 1. Operational reliability.
3. P2 (24 items) — Sprint 2–3. Polish & platform alignment.
4. P3 (12 items) — Roadmap Q3–Q4 2026. Innovation & differentiation.

---

## 12. Session Boot Checklist for AI Agents

When you start a new session working on opsApp:

- [ ] Read `Agentic/THIS_IS_WHAT_WE_ARE_DOING.md`
- [ ] Read last 15 entries of `Agentic/AGENT_ACTIVITY_LOG.md`
- [ ] Read `opsApp/AGENTS.md` (this file) — full read, not a skim
- [ ] Read `opsApp/IMPLEMENTATION_PLAN.md` — at minimum, scan the Sprint 0 and active sprint sections
- [ ] Identify your specific task from the implementation plan
- [ ] Call `XcodeBuildMCP session_show_defaults` before any build
- [ ] Log your boot to `Agentic/AGENT_ACTIVITY_LOG.md`

When you complete work:
- [ ] Run `XcodeBuildMCP build_sim` and confirm zero errors, zero warnings
- [ ] Add tests for any new reducer actions
- [ ] Update the relevant checklist item in `IMPLEMENTATION_PLAN.md` to `[x]`
- [ ] Log completion to `Agentic/AGENT_ACTIVITY_LOG.md`
- [ ] Commit with conventional format: `fix(accessibility): add accessibilityLabel to ZoneCardView [2.01]`

---

## 13. Commit Message Convention

```
<type>(<scope>): <description> [<item-id>]

Types: feat | fix | perf | refactor | test | docs | style | chore
Scope: accessibility | interaction | data | platform | performance | pdf | architecture | design
Item ID: from IMPLEMENTATION_PLAN.md (e.g., [2.01], [4.01], [6.01])

Examples:
fix(accessibility): add accessibilityLabel to ZoneCardView and all card types [2.01-2.04]
feat(interaction): add undo/redo for slot assignment via UndoManager [3.06]
perf(data): cache assignmentsBySlotKey as stored state property [4.06]
fix(pdf): add overlaps section to DeploymentBookView [7.01]
refactor(architecture): replace fatalError in uiKeyToDb with Result type [4.01]
```

---

*Last updated: May 2026 — LiquidForge full codebase audit*
*Source: opsApp_UIUX_Checklist.docx (70 items, 8 domains)*
