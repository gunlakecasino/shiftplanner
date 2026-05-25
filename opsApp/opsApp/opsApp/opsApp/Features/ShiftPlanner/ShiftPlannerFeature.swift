// ShiftPlannerFeature.swift — TCA Reducer for the core planning surface.
//
// Note: @Reducer macro is intentionally NOT used here. Xcode 26 beta / Swift 6
// has a known circular-reference issue with the macro's `body` expansion.
// Instead we conform to `Reducer` manually via `reduce(into:action:)`, which
// is fully equivalent for a flat (non-nested) reducer.

import ComposableArchitecture
import Foundation

// MARK: - Pencil Mode (P2-12)

/// Cycles via barrel roll, double-tap, or squeeze on Apple Pencil Pro.
enum PencilMode: String, Equatable, CaseIterable, Sendable {
    case assign   = "Assign"
    case lock     = "Lock"
    case annotate = "Annotate"

    var systemImage: String {
        switch self {
        case .assign:   return "hand.tap"
        case .lock:     return "lock.fill"
        case .annotate: return "pencil.tip"
        }
    }

    var next: PencilMode {
        let all = PencilMode.allCases
        guard let idx = all.firstIndex(of: self) else { return .assign }
        return all[(idx + 1) % all.count]
    }
}

// MARK: - Night Fill Status (P2-08)

enum NightFillStatus: Equatable {
    case empty       // 0 filled
    case partial     // 1–74%
    case almostFull  // 75–99%
    case full        // 100%
}

// MARK: - Dependency Client

/// Injectable interface for the data layer. Thin wrapper over ShiftPlannerRepository.
struct ShiftPlannerClient: Sendable {
    var fetchTeamMembers:  @Sendable () async throws -> [TeamMember]
    var fetchNight:        @Sendable (Date) async throws -> Night?
    var fetchAssignments:  @Sendable (UUID) async throws -> [ZoneAssignment]
    var fetchSlotTasks:    @Sendable (UUID) async throws -> [SlotTask]
    var saveAssignment:    @Sendable (ZoneAssignment) async throws -> ZoneAssignment
    var deleteAssignment:  @Sendable (UUID, DbSlot) async throws -> Void
    var createNight:       @Sendable (Date) async throws -> Night
    var updateNight:       @Sendable (Night) async throws -> Night
}

extension ShiftPlannerClient: DependencyKey {
    /// Live implementation wired to the real Supabase backend.
    static let liveValue = ShiftPlannerClient(
        fetchTeamMembers: {
            // Fetch all active TMs — includes Grave/Full for zone assignment
            // AND AM/PM overlap workers so tmName(for:) resolves for all slots.
            try await ShiftPlannerRepository.live().fetchTeamMembers(gravePoolOnly: false)
        },
        fetchNight: { date in
            try await ShiftPlannerRepository.live().fetchNight(for: date)
        },
        fetchAssignments: { nightId in
            try await ShiftPlannerRepository.live().fetchAssignments(nightId: nightId)
        },
        fetchSlotTasks: { nightId in
            try await ShiftPlannerRepository.live().fetchSlotTasks(nightId: nightId)
        },
        saveAssignment: { assignment in
            try await ShiftPlannerRepository.live().saveAssignment(assignment)
        },
        deleteAssignment: { nightId, dbSlot in
            try await ShiftPlannerRepository.live().deleteAssignment(nightId: nightId, dbSlot: dbSlot)
        },
        createNight: { date in
            try await ShiftPlannerRepository.live().createNight(date: date)
        },
        updateNight: { night in
            try await ShiftPlannerRepository.live().updateNight(night)
        }
    )

    /// Preview / test implementation with mock data.
    static let previewValue = ShiftPlannerClient(
        fetchTeamMembers: { TeamMember.mockRoster },
        fetchNight:       { _ in Night.mockTonight },
        fetchAssignments: { _ in [] },
        fetchSlotTasks:   { _ in [] },
        saveAssignment:   { $0 },
        deleteAssignment: { _, _ in },
        createNight:      { _ in Night.mockTonight },
        updateNight:      { $0 }
    )
}

extension DependencyValues {
    var shiftPlannerClient: ShiftPlannerClient {
        get { self[ShiftPlannerClient.self] }
        set { self[ShiftPlannerClient.self] = newValue }
    }
}

// MARK: - Assignment Snapshot (Sprint 4 — Undo/Redo)

/// Lightweight snapshot used for undo/redo history.
/// Break groups are NOT snapshotted — they're cheap to cycle and don't touch the DB.
struct AssignmentSnapshot: Equatable, Sendable {
    let assignments:  [ZoneAssignment]
    let description:  String   // e.g. "Assign Joy to Z1", "Clear Z3"
}

// MARK: - State

/// Observable state for the ShiftPlanner surface.
/// Stored properties only — computed helpers live in the extension below.
@ObservableState
struct ShiftPlannerState: Equatable {
    var teamMembers:  [TeamMember]  = []
    var assignments:  [ZoneAssignment] = []
    var slotTasks:    [SlotTask]   = []
    var night:        Night?        = nil
    var selectedDate: Date          = .tonightShiftDate

    var isLoading:       Bool    = false
    var errorMessage:    String? = nil
    var hoveredSlotKey:  String? = nil    // Pencil Pro 2 hover target
    var selectedSlotKey: String? = nil    // tapped/assigned slot

    // Sheet presentation
    var showBreakTracker: Bool = false
    var showNightNotes:   Bool = false

    // PDF export
    var exportedPDFURL: URL? = nil
    var isExporting:    Bool = false

    // Realtime
    var isRealtimeSubscribed: Bool = false

    // Night notes save confirmation
    var nightNotesSaved: Bool = false

    // P2-08: Fill status enum
    // (computed via extension — no stored property needed)

    // P2-12: Apple Pencil Pro mode
    var pencilMode:     PencilMode = .assign
    var isPencilActive: Bool       = false  // set true on first pencil touch

    // Command Palette (⌘K)
    var isCommandPaletteOpen: Bool = false

    // SUDO Admin Panel
    var isSudoPanelOpen: Bool = false

    // MARK: - Sprint 4 helpers

    /// Push the current assignments onto the undo stack before a mutation.
    /// Clears the redo stack — new action invalidates forward history.
    mutating func pushUndo(description: String) {
        undoStack.append(AssignmentSnapshot(assignments: assignments, description: description))
        if undoStack.count > 50 { undoStack.removeFirst() }
        redoStack = []
    }

    // P1-07: Stored lookup maps — rebuilt by rebuildAssignmentMaps() after every
    // mutation to assignments. Avoids O(n) recomputation on every SwiftUI render.
    var assignmentsBySlotKey: [String: String] = [:]
    var lockedSlotKeys:       Set<String>       = []

    // Sprint 4: Break badge map — rebuilt by rebuildAssignmentMaps() alongside
    // assignmentsBySlotKey. Derived from zone_assignments.break_group (Supabase).
    // Key = UI slot key (e.g. "Z1", "MRR6"). Value = 1 | 2 | 3 (0 omitted).
    var breakGroupsByUiKey: [String: Int] = [:]

    // Sprint 4: Undo / Redo stacks — snapshot-based, max 50 entries each.
    var undoStack: [AssignmentSnapshot] = []
    var redoStack: [AssignmentSnapshot] = []

    mutating func rebuildAssignmentMaps() {
        var byKey: [String: String] = [:]
        var locked: Set<String> = []
        var breaks: [String: Int] = [:]
        for a in assignments {
            let uiKey = dbSlotToUiKey(slotKey: a.slotKey, slotType: a.slotType, rrSide: a.rrSide)
            if let tmId = a.tmId { byKey[uiKey] = tmId }
            if a.isLocked { locked.insert(uiKey) }
            if a.breakGroup > 0 { breaks[uiKey] = a.breakGroup }
        }
        assignmentsBySlotKey = byKey
        lockedSlotKeys       = locked
        breakGroupsByUiKey   = breaks
    }
}

// MARK: - Action

enum ShiftPlannerAction {
    case onAppear
    case refreshTapped
    case dateChanged(Date)
    case prevDayTapped
    case nextDayTapped

    // Internal async completions
    case _teamMembersLoaded([TeamMember])
    case _nightLoaded(Night?)
    case _assignmentsLoaded([ZoneAssignment])
    case _tasksLoaded([SlotTask])
    case _loadFailed(String)
    case _nightUpdated(Night)

    // Pencil / interaction
    case pencilHoveredSlot(String?)
    case slotTapped(String)
    case dismissSelection

    // P2-12: Pencil mode
    case pencilModeChanged(PencilMode)
    case pencilActivityChanged(Bool)

    // Assignment
    case assignSlot(slotKey: String, tmId: String)
    case unassignSlot(slotKey: String)
    case _assignmentSaved(ZoneAssignment)
    case _unassignmentSaved(String)
    case _assignFailed(String, rollback: [ZoneAssignment])

    // Lock / unlock
    case toggleLock(slotKey: String)
    case _lockSaved(ZoneAssignment)

    // Night notes
    case nightNotesChanged(String)
    case saveNightNotes
    case showNightNotesTapped
    case dismissNightNotes

    // Sheets
    case showBreakTrackerTapped
    case dismissBreakTracker

    // Night lock
    case toggleNightLock

    // Export
    case exportDeploymentBook
    case _exportCompleted(URL)
    case dismissExport

    // Realtime
    case _subscribeRealtime(nightId: UUID)
    case _realtimeChange

    // P1-13: auto-clear error banner after display timeout
    case clearErrorMessage

    // Command Palette
    case commandPaletteToggled
    case commandPaletteDismissed
    case goToTonight

    // SUDO Admin Panel
    case sudoPanelToggled
    case sudoPanelDismissed

    // Sprint 4: Break badges
    case cycleBreak(slotKey: String)
    case _breakGroupSaved(ZoneAssignment)

    // Sprint 4: Undo / Redo
    case undo
    case redo
}

// MARK: - Reducer

struct ShiftPlannerFeature: Reducer {

    typealias State  = ShiftPlannerState
    typealias Action = ShiftPlannerAction

    @Dependency(\.shiftPlannerClient) var client

    func reduce(into state: inout State, action: Action) -> Effect<Action> {
        switch action {

        // MARK: Load

        case .onAppear, .refreshTapped:
            state.isLoading    = true
            state.errorMessage = nil
            let date = state.selectedDate
            return .run { send in
                do {
                    let members = try await client.fetchTeamMembers()
                    await send(._teamMembersLoaded(members))
                    let night = try await client.fetchNight(date)
                    await send(._nightLoaded(night))
                    if let nightId = night?.id {
                        async let assignments = client.fetchAssignments(nightId)
                        async let tasks       = client.fetchSlotTasks(nightId)
                        await send(._assignmentsLoaded(try assignments))
                        await send(._tasksLoaded(try tasks))
                    }
                } catch {
                    await send(._loadFailed(error.localizedDescription))
                }
            }

        case .dateChanged(let date):
            state.selectedDate          = date
            state.assignments           = []
            state.slotTasks             = []
            state.night                 = nil
            state.selectedSlotKey       = nil
            state.isRealtimeSubscribed  = false
            return .merge(
                .cancel(id: "realtime.assignments"),
                .send(.refreshTapped)
            )

        case .prevDayTapped:
            let prev = Calendar.current.date(byAdding: .day, value: -1, to: state.selectedDate) ?? state.selectedDate
            return .send(.dateChanged(prev))

        case .nextDayTapped:
            let next = Calendar.current.date(byAdding: .day, value: 1, to: state.selectedDate) ?? state.selectedDate
            return .send(.dateChanged(next))

        case ._teamMembersLoaded(let members):
            state.teamMembers = members
            state.isLoading   = false
            return .none

        case ._nightLoaded(let night):
            if let night {
                state.night = night
            } else {
                let date = state.selectedDate
                return .run { send in
                    do {
                        let created = try await client.createNight(date)
                        await send(._nightLoaded(created))
                    } catch {
                        await send(._loadFailed(error.localizedDescription))
                    }
                }
            }
            return .none

        case ._assignmentsLoaded(let assignments):
            // P1-25: sort by PLACEMENT_ORDER so zones/RRs/AUX/Overlaps always
            // render in canonical grave-shift order regardless of DB return order.
            state.assignments = assignments.sorted { a, b in
                let uiA  = dbSlotToUiKey(slotKey: a.slotKey, slotType: a.slotType, rrSide: a.rrSide)
                let uiB  = dbSlotToUiKey(slotKey: b.slotKey, slotType: b.slotType, rrSide: b.rrSide)
                let idxA = PLACEMENT_ORDER.firstIndex(of: uiA) ?? Int.max
                let idxB = PLACEMENT_ORDER.firstIndex(of: uiB) ?? Int.max
                return idxA < idxB
            }
            state.rebuildAssignmentMaps()  // P1-07
            // Only start realtime subscription on the INITIAL load, not on
            // reconciliation re-fetches triggered by realtime events themselves.
            if !state.isRealtimeSubscribed, let nightId = state.night?.id {
                state.isRealtimeSubscribed = true
                return .send(._subscribeRealtime(nightId: nightId))
            }
            return .none

        case ._tasksLoaded(let tasks):
            state.slotTasks = tasks
            return .none

        case ._loadFailed(let message):
            state.isLoading    = false
            state.errorMessage = message
            // P1-13: auto-dismiss load errors too after 6 seconds
            return .run { send in
                try? await Task.sleep(for: .seconds(6))
                await send(.clearErrorMessage)
            }
            .cancellable(id: "error.dismiss", cancelInFlight: true)

        // MARK: Interaction

        // P2-12
        case .pencilModeChanged(let mode):
            state.pencilMode = mode
            return .none

        case .pencilActivityChanged(let active):
            state.isPencilActive = active
            return .none

        case .pencilHoveredSlot(let key):
            state.hoveredSlotKey = key
            return .none

        case .slotTapped(let key):
            state.selectedSlotKey = (state.selectedSlotKey == key) ? nil : key
            return .none

        case .dismissSelection:
            state.selectedSlotKey = nil
            return .none

        // MARK: Assignment

        case .assignSlot(let uiKey, let tmId):
            guard let nightId = state.night?.id else { return .none }
            // P1-20: Night-level lock blocks all assignment changes
            if state.night?.isLocked == true { return .none }
            // Locked slots cannot be reassigned
            if state.lockedSlotKeys.contains(uiKey) { return .none }
            // Sprint 4: snapshot BEFORE mutation for undo history
            state.pushUndo(description: "Assign to \(uiKey)")
            let snapshot  = state.assignments   // also used for network rollback
            // P0-03: uiKeyToDb returns Optional — guard against unknown keys gracefully
            guard let dbSlot = uiKeyToDb(uiKey) else { return .none }
            let sortOrder = PLACEMENT_ORDER.firstIndex(of: uiKey) ?? 0
            // Preserve existing break group if the slot was already assigned
            let existingBreakGroup = state.assignments.first(where: {
                $0.slotKey  == dbSlot.slotKey &&
                $0.slotType == dbSlot.slotType.rawValue &&
                $0.rrSide   == dbSlot.rrSide
            })?.breakGroup ?? 0
            let newAssignment = ZoneAssignment(
                nightId:    nightId,
                slotKey:    dbSlot.slotKey,
                slotType:   dbSlot.slotType.rawValue,
                tmId:       tmId,
                rrSide:     dbSlot.rrSide,
                isLocked:   false,
                isFilled:   true,
                sortOrder:  sortOrder,
                breakGroup: existingBreakGroup
            )
            if let idx = state.assignments.firstIndex(where: {
                $0.slotKey  == dbSlot.slotKey &&
                $0.slotType == dbSlot.slotType.rawValue &&
                $0.rrSide   == dbSlot.rrSide
            }) {
                state.assignments[idx] = newAssignment
            } else {
                state.assignments.append(newAssignment)
            }
            state.rebuildAssignmentMaps()  // P1-07
            state.selectedSlotKey = nil
            return .run { send in
                do {
                    let saved = try await client.saveAssignment(newAssignment)
                    await send(._assignmentSaved(saved))
                } catch {
                    await send(._assignFailed(error.localizedDescription, rollback: snapshot))
                }
            }

        case .unassignSlot(let uiKey):
            guard let nightId = state.night?.id else { return .none }
            // P1-20: Night-level lock blocks all assignment changes
            if state.night?.isLocked == true { return .none }
            if state.lockedSlotKeys.contains(uiKey) { return .none }
            // Sprint 4: snapshot BEFORE mutation for undo history
            state.pushUndo(description: "Clear \(uiKey)")
            let snapshot = state.assignments   // also used for network rollback
            guard let dbSlot = uiKeyToDb(uiKey) else { return .none }
            state.assignments.removeAll {
                $0.slotKey  == dbSlot.slotKey &&
                $0.slotType == dbSlot.slotType.rawValue &&
                $0.rrSide   == dbSlot.rrSide
            }
            state.rebuildAssignmentMaps()  // P1-07
            state.selectedSlotKey = nil
            let capturedNightId = nightId
            return .run { send in
                do {
                    try await client.deleteAssignment(capturedNightId, dbSlot)
                    await send(._unassignmentSaved(uiKey))
                } catch {
                    await send(._assignFailed(error.localizedDescription, rollback: snapshot))
                }
            }

        case ._assignmentSaved:
            return .none

        case ._unassignmentSaved:
            return .none

        case ._assignFailed(let message, let rollback):
            state.assignments  = rollback
            state.rebuildAssignmentMaps()  // P1-07: keep maps in sync after rollback
            // Sprint 4: remove the undo entry we pushed — the action never completed
            if !state.undoStack.isEmpty { state.undoStack.removeLast() }
            state.errorMessage = message
            // P1-13: auto-dismiss the error banner after 5 seconds
            return .run { send in
                try? await Task.sleep(for: .seconds(5))
                await send(.clearErrorMessage)
            }
            .cancellable(id: "error.dismiss", cancelInFlight: true)

        case .clearErrorMessage:
            state.errorMessage = nil
            return .none

        // MARK: Lock / Unlock

        case .toggleLock(let uiKey):
            guard let dbSlot = uiKeyToDb(uiKey) else { return .none }
            guard let idx = state.assignments.firstIndex(where: {
                $0.slotKey  == dbSlot.slotKey &&
                $0.slotType == dbSlot.slotType.rawValue &&
                $0.rrSide   == dbSlot.rrSide
            }) else { return .none }
            state.assignments[idx].isLocked = !state.assignments[idx].isLocked
            state.rebuildAssignmentMaps()  // P1-07
            state.selectedSlotKey = nil
            let assignment = state.assignments[idx]
            return .run { send in
                do {
                    let saved = try await client.saveAssignment(assignment)
                    await send(._lockSaved(saved))
                } catch {
                    // Revert the toggle on failure
                    var reverted = assignment
                    reverted.isLocked = !assignment.isLocked
                    await send(._lockSaved(reverted))
                }
            }

        case ._lockSaved(let updated):
            // P0-03: avoid the uiKeyToDb → dbSlotToUiKey round-trip.
            // Match directly on the DB-side fields which are already known.
            if let idx = state.assignments.firstIndex(where: {
                $0.slotKey  == updated.slotKey &&
                $0.slotType == updated.slotType &&
                $0.rrSide   == updated.rrSide
            }) {
                state.assignments[idx] = updated
                state.rebuildAssignmentMaps()  // P1-07: server confirmation may differ from optimistic
            }
            return .none

        // MARK: Night Notes

        case .nightNotesChanged(let text):
            state.night?.notes    = text
            state.nightNotesSaved = false
            return .none

        case .saveNightNotes:
            guard let night = state.night else { return .none }
            return .run { send in
                do {
                    let saved = try await client.updateNight(night)
                    await send(._nightUpdated(saved))
                } catch {
                    await send(._loadFailed(error.localizedDescription))
                }
            }

        case .showNightNotesTapped:
            state.showNightNotes = true
            return .none

        case .dismissNightNotes:
            state.showNightNotes = false
            return .none

        case ._nightUpdated(let night):
            state.night           = night
            state.nightNotesSaved = true
            // Clear the "Saved" indicator after 2 seconds
            return .run { send in
                try? await Task.sleep(for: .seconds(2))
                await send(.nightNotesChanged(night.notes ?? "")) // no-op, just clears flag
            }
            .cancellable(id: "notes.saved.flash", cancelInFlight: true)

        // MARK: Sheets

        case .showBreakTrackerTapped:
            state.showBreakTracker = true
            return .none

        case .dismissBreakTracker:
            state.showBreakTracker = false
            return .none

        // MARK: Night Lock

        case .toggleNightLock:
            guard var night = state.night else { return .none }
            // P0-05: isLocked is now non-optional — no ?? false needed
            night.isLocked = !night.isLocked
            state.night = night
            let nightCopy = night   // immutable copy for capture in @Sendable closure
            return .run { send in
                do {
                    let saved = try await client.updateNight(nightCopy)
                    await send(._nightUpdated(saved))
                } catch {
                    await send(._loadFailed(error.localizedDescription))
                }
            }

        // MARK: Export

        case .exportDeploymentBook:
            guard !state.isExporting else { return .none }
            state.isExporting = true
            let snapshot = state   // capture full state for rendering on MainActor
            return .run { send in
                do {
                    let url = try await MainActor.run {
                        try DeploymentPDFExporter.export(state: snapshot)
                    }
                    await send(._exportCompleted(url))
                } catch {
                    await send(._loadFailed(error.localizedDescription))
                }
            }

        case ._exportCompleted(let url):
            state.isExporting    = false
            state.exportedPDFURL = url
            return .none

        case .dismissExport:
            state.exportedPDFURL = nil
            return .none

        // MARK: Realtime

        case ._subscribeRealtime(let nightId):
            // Cancel any existing subscription before starting a new one
            return .merge(
                .cancel(id: "realtime.assignments"),
                .run { send in
                    for await _ in RealtimeService.shared.assignments(nightId: nightId) {
                        await send(._realtimeChange)
                    }
                }
                .cancellable(id: "realtime.assignments", cancelInFlight: true)
            )

        case ._realtimeChange:
            // Re-fetch assignments on any realtime event.
            // Debounced by network round-trip; optimistic local state
            // is already applied so this is a reconciliation fetch.
            guard let nightId = state.night?.id else { return .none }
            let capturedNightId = nightId
            return .run { send in
                do {
                    let assignments = try await ShiftPlannerRepository.live()
                        .fetchAssignments(nightId: capturedNightId)
                    await send(._assignmentsLoaded(assignments))
                } catch {
                    // Silently fail on realtime reconciliation — the
                    // optimistic state is still valid.
                    return
                }
            }

        // MARK: Command Palette

        case .commandPaletteToggled:
            state.isCommandPaletteOpen.toggle()
            return .none

        case .commandPaletteDismissed:
            state.isCommandPaletteOpen = false
            return .none

        case .goToTonight:
            state.isCommandPaletteOpen = false
            return .send(.dateChanged(.tonightShiftDate))

        // MARK: SUDO Admin Panel

        case .sudoPanelToggled:
            state.isSudoPanelOpen.toggle()
            return .none

        case .sudoPanelDismissed:
            state.isSudoPanelOpen = false
            return .none

        // MARK: Sprint 4 — Break Badges

        case .cycleBreak(let uiKey):
            // Only cycle break groups on filled slots (assignment must exist).
            guard let dbSlot = uiKeyToDb(uiKey) else { return .none }
            guard let idx = state.assignments.firstIndex(where: {
                $0.slotKey  == dbSlot.slotKey &&
                $0.slotType == dbSlot.slotType.rawValue &&
                $0.rrSide   == dbSlot.rrSide
            }) else { return .none }

            let next = (state.assignments[idx].breakGroup + 1) % 4
            state.assignments[idx].breakGroup = next
            state.rebuildAssignmentMaps()

            // Persist optimistically — ignore network errors (break group is non-critical)
            let assignment = state.assignments[idx]
            return .run { send in
                if let saved = try? await client.saveAssignment(assignment) {
                    await send(._breakGroupSaved(saved))
                }
            }

        case ._breakGroupSaved(let updated):
            // Reconcile server confirmation — break_group is the only field that
            // differs from what we already wrote optimistically.
            if let idx = state.assignments.firstIndex(where: {
                $0.slotKey  == updated.slotKey &&
                $0.slotType == updated.slotType &&
                $0.rrSide   == updated.rrSide
            }) {
                state.assignments[idx].breakGroup = updated.breakGroup
                state.rebuildAssignmentMaps()
            }
            return .none

        // MARK: Sprint 4 — Undo / Redo

        case .undo:
            guard let snapshot = state.undoStack.last else { return .none }
            state.undoStack.removeLast()
            // Push current state onto redo before restoring snapshot
            state.redoStack.append(
                AssignmentSnapshot(assignments: state.assignments, description: snapshot.description)
            )
            if state.redoStack.count > 50 { state.redoStack.removeFirst() }
            state.assignments = snapshot.assignments
            state.rebuildAssignmentMaps()
            // Note: undo is local-only this sprint (matches webapp behaviour).
            // The realtime subscription will reconcile when the user next refreshes.
            return .none

        case .redo:
            guard let snapshot = state.redoStack.last else { return .none }
            state.redoStack.removeLast()
            // Push current state back onto undo
            state.undoStack.append(
                AssignmentSnapshot(assignments: state.assignments, description: snapshot.description)
            )
            if state.undoStack.count > 50 { state.undoStack.removeFirst() }
            state.assignments = snapshot.assignments
            state.rebuildAssignmentMaps()
            return .none
        }
    }
}

// MARK: - State Computed Helpers

extension ShiftPlannerState {

    // Sprint 4: Undo / Redo availability
    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    /// TMs shown in the roster rail:
    ///   - Grave / Full pool TMs are always included (core grave shift workers)
    ///   - AM / PM pool TMs only if they have an overlap assignment for this night
    ///     (they're scheduled as overlaps, so Brian needs to see them to reassign/clear)
    var rosterTeamMembers: [TeamMember] {
        let scheduledOverlapIds = Set(assignments.compactMap { $0.tmId })
        return teamMembers.filter { tm in
            switch tm.gravePool {
            case "Grave", "Full": return true
            case "AM", "PM":     return scheduledOverlapIds.contains(tm.tmId)
            default:             return false
            }
        }
    }

    /// Tasks keyed by UI slot key — e.g. "Z1" → ["And Zone 2"], "MRR6" → ["And Zone 6"]
    var slotTasksByUiKey: [String: [SlotTask]] {
        var map: [String: [SlotTask]] = [:]
        for task in slotTasks {
            let uiKey = dbSlotToUiKey(slotKey: task.slotKey, slotType: task.slotType, rrSide: task.rrSide)
            map[uiKey, default: []].append(task)
        }
        return map
    }

    /// Total assignable slots across zones + RR sides + AUX + Overlaps.
    var totalSlots: Int { ZONE_DEFS.count + RR_DEFS.count * 2 + DEFAULT_AUX_DEFS.count + DEFAULT_OVERLAP_DEFS.count }

    /// Number of slots that currently have a TM assigned.
    var filledCount: Int { assignmentsBySlotKey.count }

    /// P2-08: Fill status based on filled/total ratio thresholds.
    var fillStatus: NightFillStatus {
        guard totalSlots > 0 else { return .empty }
        let ratio = Double(filledCount) / Double(totalSlots)
        switch ratio {
        case 1.0:     return .full
        case 0.75...: return .almostFull
        case 0.0:     return .empty
        default:      return .partial
        }
    }

    /// Display name of the TM assigned to a slot, or nil if unfilled.
    func tmName(for slotKey: String) -> String? {
        guard let tmId = assignmentsBySlotKey[slotKey] else { return nil }
        return teamMembers.first(where: { $0.tmId == tmId })?.name
    }
}

// MARK: - Mock Data

extension TeamMember {
    nonisolated(unsafe) static let mockRoster: [TeamMember] = [
        TeamMember(tmId: "tm_joy",    displayName: "Joy",     fullName: "Joy Smith",    status: "full_time", primarySection: "grave", active: true, gravePool: "Grave", gender: "female"),
        TeamMember(tmId: "tm_seth",   displayName: "Seth",    fullName: "Seth Jones",   status: "full_time", primarySection: "grave", active: true, gravePool: "Grave", gender: "male"),
        TeamMember(tmId: "tm_cookie", displayName: "Cookie",  fullName: "Cookie Brown", status: "full_time", primarySection: "grave", active: true, gravePool: "Grave", gender: "female"),
        TeamMember(tmId: "tm_sheri",  displayName: "Sheri O", fullName: "Sheri O",      status: "full_time", primarySection: "grave", active: true, gravePool: "Grave", gender: "female"),
        TeamMember(tmId: "tm_daryl",  displayName: "Daryl",   fullName: "Daryl Davis",  status: "full_time", primarySection: "grave", active: true, gravePool: "Grave", gender: "male"),
        TeamMember(tmId: "tm_mel",    displayName: "Mel",     fullName: "Melissa T",    status: "full_time", primarySection: "grave", active: true, gravePool: "Grave", gender: "female"),
    ]
}

extension Night {
    nonisolated(unsafe) static let mockTonight = Night(
        id:        UUID(),
        nightDate: Date.tonightShiftDate.supabaseDateString,
        weekId:    nil,
        status:    .draft,   // P1-23: NightStatus enum
        isLocked:  false,
        notes:     nil
    )
}
