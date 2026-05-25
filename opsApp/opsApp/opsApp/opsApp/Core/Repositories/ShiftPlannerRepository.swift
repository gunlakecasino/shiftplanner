// ShiftPlannerRepository.swift — Data access layer for the ShiftPlanner.
// All Supabase queries live here. ViewModels / TCA reducers call this.
// Table names verified against ops-agent-data-model.md and data.ts.
//
// Rule: filters (.eq, .neq, .not) must come BEFORE transforms (.order, .limit)
// because .order() returns PostgrestTransformBuilder which has no filter API.

import Foundation
import Supabase

// MARK: - Errors

enum RepositoryError: Error, LocalizedError {
    case fetchFailed(underlying: Error)
    case saveFailed(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .fetchFailed(let e): "Fetch failed: \(e.localizedDescription)"
        case .saveFailed(let e):  "Save failed: \(e.localizedDescription)"
        }
    }
}

// MARK: - Repository

actor ShiftPlannerRepository {

    private let db: SupabaseClient

    // Explicit init avoids nonisolated default-parameter evaluation issues
    // under SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor (Xcode 26 default).
    init(client: SupabaseClient) {
        self.db = client
    }

    /// Convenience factory — use this in Views / TCA effects.
    static func live() -> ShiftPlannerRepository {
        ShiftPlannerRepository(client: SupabaseManager.shared.client)
    }

    // MARK: - Team Members (tm_profiles)

    func fetchTeamMembers(gravePoolOnly: Bool = false) async throws -> [TeamMember] {
        do {
            // Fetch ALL active TMs without filtering in the query.
            // Using .neq to avoid Boolean literal type mismatch with some SDK versions.
            let members: [TeamMember] = try await db
                .from("tm_profiles")
                .select("tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender")
                .neq("active", value: false)
                .order("display_name")
                .execute()
                .value

            if gravePoolOnly {
                // Keep only Grave and Full pool TMs for the grave shift canvas
                return members.filter {
                    guard let pool = $0.gravePool else { return false }
                    return pool == "Grave" || pool == "Full"
                }
            }
            return members
        } catch {
            throw RepositoryError.fetchFailed(underlying: error)
        }
    }

    // MARK: - Nights

    func fetchNight(for date: Date) async throws -> Night? {
        do {
            let nights: [Night] = try await db
                .from("nights")
                .select()
                .eq("night_date", value: date.supabaseDateString)
                .limit(1)
                .execute()
                .value
            return nights.first
        } catch {
            throw RepositoryError.fetchFailed(underlying: error)
        }
    }

    // MARK: - Nights

    /// Creates a draft night record for the given date and returns it.
    func createNight(date: Date) async throws -> Night {
        do {
            let payload: [String: String] = [
                "night_date": date.supabaseDateString,
                "status": "draft"
            ]
            let nights: [Night] = try await db
                .from("nights")
                .insert(payload)
                .select()
                .execute()
                .value
            guard let night = nights.first else {
                throw RepositoryError.saveFailed(underlying:
                    NSError(domain: "opsApp", code: -2,
                            userInfo: [NSLocalizedDescriptionKey: "Night insert returned no rows"]))
            }
            return night
        } catch {
            throw RepositoryError.saveFailed(underlying: error)
        }
    }

    /// Lightweight update payload — avoids using Night's @MainActor-isolated Encodable
    /// conformance (synthesized under SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor) directly
    /// inside this actor, which would trigger a Swift 6 isolation warning.
    private struct NightPatch: Encodable, Sendable {
        let status:   String?
        let isLocked: Bool?
        let notes:    String?
        enum CodingKeys: String, CodingKey {
            case status
            case isLocked = "is_locked"
            case notes
        }
    }

    /// Updates night-level fields (status, notes, is_locked) and returns the saved row.
    func updateNight(_ night: Night) async throws -> Night {
        do {
            let patch = NightPatch(status: night.status.rawValue,  // P1-23: NightStatus → String
                                   isLocked: night.isLocked,
                                   notes: night.notes)
            let updated: [Night] = try await db
                .from("nights")
                .update(patch)
                .eq("id", value: night.id.uuidString)
                .select()
                .execute()
                .value
            guard let result = updated.first else {
                throw RepositoryError.saveFailed(underlying:
                    NSError(domain: "opsApp", code: -4,
                            userInfo: [NSLocalizedDescriptionKey: "Night update returned no rows"]))
            }
            return result
        } catch {
            throw RepositoryError.saveFailed(underlying: error)
        }
    }

    // MARK: - Zone Assignments (fetch)

    func fetchAssignments(nightId: UUID) async throws -> [ZoneAssignment] {
        do {
            let assignments: [ZoneAssignment] = try await db
                .from("zone_assignments")
                .select("night_id, slot_key, slot_type, tm_id, rr_side, is_locked, is_filled, sort_order, break_group")
                .eq("night_id", value: nightId.uuidString)
                .order("sort_order")
                .order("slot_key")
                .execute()
                .value
            return assignments
        } catch {
            throw RepositoryError.fetchFailed(underlying: error)
        }
    }

    // MARK: - Zone Assignments (write)

    /// Upserts a zone assignment. Conflict target: (night_id, slot_type, slot_key, rr_side).
    func saveAssignment(_ assignment: ZoneAssignment) async throws -> ZoneAssignment {
        do {
            let saved: [ZoneAssignment] = try await db
                .from("zone_assignments")
                .upsert(assignment, onConflict: "night_id,slot_type,slot_key,rr_side")
                .select("night_id, slot_key, slot_type, tm_id, rr_side, is_locked, is_filled, sort_order, break_group")
                .execute()
                .value
            guard let result = saved.first else {
                throw RepositoryError.saveFailed(underlying:
                    NSError(domain: "opsApp", code: -3,
                            userInfo: [NSLocalizedDescriptionKey: "Upsert returned no rows"]))
            }
            return result
        } catch {
            throw RepositoryError.saveFailed(underlying: error)
        }
    }

    // MARK: - Breaks

    /// Fetches all break records for the given night, ordered by TM then break number.
    func fetchBreaks(nightId: UUID) async throws -> [Break] {
        do {
            let breaks: [Break] = try await db
                .from("breaks")
                .select()
                .eq("night_id", value: nightId.uuidString)
                .order("tm_id")
                .order("break_num")
                .execute()
                .value
            return breaks
        } catch {
            throw RepositoryError.fetchFailed(underlying: error)
        }
    }

    /// Starts a new break for a TM (inserts a record with start_time = now).
    func startBreak(nightId: UUID, tmId: String, breakNum: Int) async throws -> Break {
        do {
            let payload: [String: String] = [
                "night_id":   nightId.uuidString,
                "tm_id":      tmId,
                "break_num":  String(breakNum),
                "start_time": ISO8601DateFormatter().string(from: Date())
            ]
            let breaks: [Break] = try await db
                .from("breaks")
                .insert(payload)
                .select()
                .execute()
                .value
            guard let result = breaks.first else {
                throw RepositoryError.saveFailed(underlying:
                    NSError(domain: "opsApp", code: -5,
                            userInfo: [NSLocalizedDescriptionKey: "Break insert returned no rows"]))
            }
            return result
        } catch {
            throw RepositoryError.saveFailed(underlying: error)
        }
    }

    /// Ends a break (sets end_time = now) and returns the updated record.
    func endBreak(breakId: UUID) async throws -> Break {
        do {
            let patch: [String: String] = [
                "end_time": ISO8601DateFormatter().string(from: Date())
            ]
            let breaks: [Break] = try await db
                .from("breaks")
                .update(patch)
                .eq("id", value: breakId.uuidString)
                .select()
                .execute()
                .value
            guard let result = breaks.first else {
                throw RepositoryError.saveFailed(underlying:
                    NSError(domain: "opsApp", code: -6,
                            userInfo: [NSLocalizedDescriptionKey: "Break end returned no rows"]))
            }
            return result
        } catch {
            throw RepositoryError.saveFailed(underlying: error)
        }
    }

    /// Deletes a break record (used to cancel an accidental start).
    func deleteBreak(breakId: UUID) async throws {
        do {
            try await db
                .from("breaks")
                .delete()
                .eq("id", value: breakId.uuidString)
                .execute()
        } catch {
            throw RepositoryError.saveFailed(underlying: error)
        }
    }

    // MARK: - Slot Tasks

    /// Fetches all task labels for the given night, ordered by sort_order.
    func fetchSlotTasks(nightId: UUID) async throws -> [SlotTask] {
        do {
            let tasks: [SlotTask] = try await db
                .from("night_slot_tasks")
                .select("id, night_id, slot_key, slot_type, rr_side, task_label, catalog_task_id, sort_order, color, is_coverage")
                .eq("night_id", value: nightId.uuidString)
                .order("sort_order")
                .execute()
                .value
            return tasks
        } catch {
            throw RepositoryError.fetchFailed(underlying: error)
        }
    }

    // MARK: - Zone Assignments (write)

    /// Deletes a zone assignment row (clears the slot).
    func deleteAssignment(nightId: UUID, dbSlot: DbSlot) async throws {
        do {
            if let rrSide = dbSlot.rrSide {
                try await db
                    .from("zone_assignments")
                    .delete()
                    .eq("night_id", value: nightId.uuidString)
                    .eq("slot_key", value: dbSlot.slotKey)
                    .eq("slot_type", value: dbSlot.slotType.rawValue)
                    .eq("rr_side", value: rrSide)
                    .execute()
            } else {
                try await db
                    .from("zone_assignments")
                    .delete()
                    .eq("night_id", value: nightId.uuidString)
                    .eq("slot_key", value: dbSlot.slotKey)
                    .eq("slot_type", value: dbSlot.slotType.rawValue)
                    .execute()
            }
        } catch {
            throw RepositoryError.saveFailed(underlying: error)
        }
    }
}
