// RealtimeService.swift — Supabase Realtime subscription for the ShiftPlanner.
//
// Subscribes to INSERT/UPDATE/DELETE on zone_assignments filtered by night_id.
// Delivers an AsyncStream<RealtimeEvent> that the TCA reducer can consume via .run.
//
// Cancel ID: use the plain String "realtime.assignments" with TCA's .cancellable().

import Foundation
import Supabase

// MARK: - Event Type

enum RealtimeEvent: Sendable {
    case change   // any INSERT/UPDATE/DELETE — caller re-fetches full list
}

// MARK: - Service

final class RealtimeService: Sendable {

    // nonisolated(unsafe): written once at first access before any concurrent work;
    // safe despite the mutable reference under SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor.
    nonisolated(unsafe) static let shared = RealtimeService()
    private init() {}

    /// Returns an AsyncStream that emits one `.change` event per realtime
    /// INSERT/UPDATE/DELETE on zone_assignments for the given nightId.
    /// The stream never ends — cancel via `.cancellable(id: "realtime.assignments")`.
    nonisolated func assignments(nightId: UUID) -> AsyncStream<RealtimeEvent> {
        AsyncStream { continuation in
            let channelName = "zone_assignments:\(nightId.uuidString)"
            let channel = SupabaseManager.shared.client.realtimeV2
                .channel(channelName)

            // New filter syntax (replaces deprecated postgresChange(_:schema:table:filter:))
            let changes = channel.postgresChange(
                AnyAction.self,
                schema: "public",
                table:  "zone_assignments",
                filter: "night_id=eq.\(nightId.uuidString)"
            )

            Task {
                for await _ in changes {
                    continuation.yield(.change)
                }
            }

            // subscribeWithError replaces deprecated subscribe()
            Task {
                try? await channel.subscribeWithError()
            }

            continuation.onTermination = { _ in
                Task { await channel.unsubscribe() }
            }
        }
    }
}
