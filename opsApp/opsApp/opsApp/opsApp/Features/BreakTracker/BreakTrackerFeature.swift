// BreakTrackerFeature.swift — TCA Reducer for the Break Tracker sheet.
//
// Displays all TMs on shift, lets Brian tap START / END break per TM.
// Breaks are persisted to the `breaks` Supabase table.
// The feature is a child of ShiftPlannerFeature only via the sheet presentation;
// it owns its own Store created in BreakTrackerView.

import ComposableArchitecture
import Foundation

// MARK: - Dependency Client

struct BreakTrackerClient: Sendable {
    var fetchBreaks:  @Sendable (UUID) async throws -> [Break]
    var startBreak:   @Sendable (UUID, String, Int) async throws -> Break
    var endBreak:     @Sendable (UUID) async throws -> Break
    var deleteBreak:  @Sendable (UUID) async throws -> Void
}

extension BreakTrackerClient: DependencyKey {
    static let liveValue = BreakTrackerClient(
        fetchBreaks:  { nightId in
            try await ShiftPlannerRepository.live().fetchBreaks(nightId: nightId)
        },
        startBreak:   { nightId, tmId, num in
            try await ShiftPlannerRepository.live().startBreak(nightId: nightId, tmId: tmId, breakNum: num)
        },
        endBreak:     { breakId in
            try await ShiftPlannerRepository.live().endBreak(breakId: breakId)
        },
        deleteBreak:  { breakId in
            try await ShiftPlannerRepository.live().deleteBreak(breakId: breakId)
        }
    )

    static let previewValue = BreakTrackerClient(
        fetchBreaks:  { _ in [] },
        startBreak:   { _, _, _ in Break(id: UUID(), nightId: UUID(), tmId: "tm_joy", breakNum: 1, startTime: Date(), endTime: nil, notes: nil) },
        endBreak:     { _ in Break(id: UUID(), nightId: UUID(), tmId: "tm_joy", breakNum: 1, startTime: Date(), endTime: Date(), notes: nil) },
        deleteBreak:  { _ in }
    )
}

extension DependencyValues {
    var breakTrackerClient: BreakTrackerClient {
        get { self[BreakTrackerClient.self] }
        set { self[BreakTrackerClient.self] = newValue }
    }
}

// MARK: - State

@ObservableState
struct BreakTrackerState: Equatable {
    var nightId:     UUID?
    var teamMembers: [TeamMember] = []
    var breaks:      [Break]     = []
    var isLoading:   Bool        = false
    var errorMessage: String?    = nil

    /// All breaks for a given TM, sorted by break number.
    func breaks(for tmId: String) -> [Break] {
        breaks.filter { $0.tmId == tmId }
              .sorted { $0.breakNum < $1.breakNum }
    }

    /// The active (started but not ended) break for a TM, if any.
    func activeBreak(for tmId: String) -> Break? {
        breaks(for: tmId).first { $0.isOnBreak }
    }

    /// Next break number for a TM (1-indexed, max 3).
    func nextBreakNum(for tmId: String) -> Int {
        (breaks(for: tmId).map { $0.breakNum }.max() ?? 0) + 1
    }
}

// MARK: - Action

enum BreakTrackerAction {
    case onAppear(nightId: UUID, teamMembers: [TeamMember])
    case refresh

    // Internal completions
    case _breaksLoaded([Break])
    case _breakStarted(Break)
    case _breakEnded(Break)
    case _breakDeleted(UUID)
    case _failed(String)

    // User actions
    case startBreakTapped(tmId: String)
    case endBreakTapped(breakId: UUID)
    case deleteBreakTapped(breakId: UUID)
}

// MARK: - Reducer

struct BreakTrackerFeature: Reducer {

    typealias State  = BreakTrackerState
    typealias Action = BreakTrackerAction

    @Dependency(\.breakTrackerClient) var client

    func reduce(into state: inout State, action: Action) -> Effect<Action> {
        switch action {

        case .onAppear(let nightId, let teamMembers):
            state.nightId     = nightId
            state.teamMembers = teamMembers
            state.isLoading   = true
            return .run { send in
                do {
                    let breaks = try await client.fetchBreaks(nightId)
                    await send(._breaksLoaded(breaks))
                } catch {
                    await send(._failed(error.localizedDescription))
                }
            }

        case .refresh:
            guard let nightId = state.nightId else { return .none }
            state.isLoading = true
            return .run { send in
                do {
                    let breaks = try await client.fetchBreaks(nightId)
                    await send(._breaksLoaded(breaks))
                } catch {
                    await send(._failed(error.localizedDescription))
                }
            }

        case ._breaksLoaded(let breaks):
            state.breaks    = breaks
            state.isLoading = false
            return .none

        case .startBreakTapped(let tmId):
            guard let nightId = state.nightId else { return .none }
            let breakNum = state.nextBreakNum(for: tmId)
            guard breakNum <= 3 else { return .none }  // cap at 3 breaks per TM
            return .run { send in
                do {
                    let b = try await client.startBreak(nightId, tmId, breakNum)
                    await send(._breakStarted(b))
                } catch {
                    await send(._failed(error.localizedDescription))
                }
            }

        case ._breakStarted(let b):
            if let idx = state.breaks.firstIndex(where: { $0.id == b.id }) {
                state.breaks[idx] = b
            } else {
                state.breaks.append(b)
            }
            return .none

        case .endBreakTapped(let breakId):
            return .run { send in
                do {
                    let b = try await client.endBreak(breakId)
                    await send(._breakEnded(b))
                } catch {
                    await send(._failed(error.localizedDescription))
                }
            }

        case ._breakEnded(let b):
            if let idx = state.breaks.firstIndex(where: { $0.id == b.id }) {
                state.breaks[idx] = b
            }
            return .none

        case .deleteBreakTapped(let breakId):
            return .run { send in
                do {
                    try await client.deleteBreak(breakId)
                    await send(._breakDeleted(breakId))
                } catch {
                    await send(._failed(error.localizedDescription))
                }
            }

        case ._breakDeleted(let breakId):
            state.breaks.removeAll { $0.id == breakId }
            return .none

        case ._failed(let message):
            state.isLoading   = false
            state.errorMessage = message
            return .none
        }
    }
}
