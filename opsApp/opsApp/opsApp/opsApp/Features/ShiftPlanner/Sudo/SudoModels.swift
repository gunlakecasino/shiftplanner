// SudoModels.swift — Domain models and data repository for the SUDO admin panel.
//
// Mirrors webapp's sudo tabs (SudoWindow.tsx / sudoActions.ts):
//   • Team       → tm_profiles + tm_preferences + tm_accommodations
//   • Tasks      → slot_task_catalog
//   • Reports    → zone_assignments aggregate
//   • Engine     → engine_config
//   • Explorer   → arbitrary table browse
//
// Security: uses the anon key (same as rest of app). Ensure RLS allows writes.

import Foundation
import Supabase

// MARK: - CatalogTask

/// Reusable task template from slot_task_catalog.
/// Unlike SlotTask (per-night), CatalogTask is a global template.
struct CatalogTask: Identifiable, Codable, Equatable, Sendable {
    let id:                  UUID
    var slotKey:             String   // "zone_1", "rr_1_2", "admin"
    var slotType:            String   // "zone" | "rr" | "aux" | "overlap"
    var rrSide:              String?  // "mens" | "womens" | nil
    var label:               String
    var sortOrder:           Int
    var isDefaultOnNewNight: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case slotKey             = "slot_key"
        case slotType            = "slot_type"
        case rrSide              = "rr_side"
        case label
        case sortOrder           = "sort_order"
        case isDefaultOnNewNight = "is_default_on_new_night"
    }
}

// MARK: - TMPreference

struct TMPreference: Identifiable, Codable, Equatable, Sendable {
    let id:        UUID
    var tmId:      String
    var stance:    String   // "prefer" | "avoid"
    var strength:  String   // "soft" | "hard"
    var target:    String   // slot key or tm_id
    var note:      String?
    var addedDate: String?  // ISO yyyy-MM-dd

    enum CodingKeys: String, CodingKey {
        case id
        case tmId      = "tm_id"
        case stance, strength, target, note
        case addedDate = "added_date"
    }
}

// MARK: - TMAccommodation

struct TMAccommodation: Identifiable, Codable, Equatable, Sendable {
    let id:        UUID
    var tmId:      String
    var type:      String    // "no_sweeper" | "restricted_zone" | "medical" | …
    var severity:  String    // "soft" | "hard"
    var target:    String?   // which slot (nil = all)
    var note:      String
    var addedDate: String
    var status:    String    // "active" | "inactive"

    enum CodingKeys: String, CodingKey {
        case id
        case tmId      = "tm_id"
        case type, severity, target, note
        case addedDate = "added_date"
        case status
    }
}

// MARK: - EngineConfigRecord

struct EngineConfigRecord: Identifiable, Codable, Equatable, Sendable {
    let id:                  UUID
    var isActive:            Bool
    var placementMethod:     String   // "weighted" | "grok-hybrid" | "greedy"
    var grokReasoningEffort: String   // "low" | "medium" | "high" | "none"
    var notes:               String?
    var updatedAt:           String?

    enum CodingKeys: String, CodingKey {
        case id
        case isActive            = "is_active"
        case placementMethod     = "placement_method"
        case grokReasoningEffort = "grok_reasoning_effort"
        case notes
        case updatedAt           = "updated_at"
    }
}

// MARK: - Zone Frequency (client-side aggregate)

struct ZoneFrequencyEntry: Identifiable, Sendable {
    var id: String { tmId }
    let tmId:       String
    let tmName:     String
    var zoneCounts: [String: Int]  // UI key "Z1" → count
    var lastDate:   String?
    var total:      Int { zoneCounts.values.reduce(0, +) }
}

// MARK: - SudoRepository

/// All privileged DB operations for the SUDO panel.
/// Uses the same anon Supabase client as the rest of the app.
actor SudoRepository {

    // Access the live client each time so we never capture the optional wrapper.
    // configure() is guaranteed to run before any SudoRepository call.
    private var client: SupabaseClient { SupabaseManager.shared.client }

    // MARK: - Team

    func fetchAllTMs() async throws -> [TeamMember] {
        try await client
            .from("tm_profiles")
            .select("*")
            .order("display_name", ascending: true)
            .execute()
            .value
    }

    func setTMActive(_ tmId: String, active: Bool) async throws {
        struct Patch: Encodable {
            let active: Bool
            let updated_at: String
        }
        try await client
            .from("tm_profiles")
            .update(Patch(active: active, updated_at: isoNow()))
            .eq("tm_id", value: tmId)
            .execute()
    }

    func updateTMFields(tmId: String,
                        displayName: String,
                        fullName: String?,
                        gravePool: String?,
                        primarySection: String?,
                        status: String?,
                        gender: String?) async throws {
        struct Patch: Encodable {
            let display_name: String
            let full_name: String?
            let grave_pool: String?
            let primary_section: String?
            let status: String?
            let gender: String?
            let updated_at: String

            func encode(to encoder: Encoder) throws {
                var c = encoder.container(keyedBy: CodingKeys.self)
                try c.encode(display_name,       forKey: .display_name)
                try c.encodeIfPresent(full_name,       forKey: .full_name)
                try c.encodeIfPresent(grave_pool,      forKey: .grave_pool)
                try c.encodeIfPresent(primary_section, forKey: .primary_section)
                try c.encodeIfPresent(status,          forKey: .status)
                try c.encodeIfPresent(gender,          forKey: .gender)
                try c.encode(updated_at,               forKey: .updated_at)
            }
            enum CodingKeys: String, CodingKey {
                case display_name, full_name, grave_pool, primary_section, status, gender, updated_at
            }
        }
        let patch = Patch(
            display_name:    displayName,
            full_name:       fullName,
            grave_pool:      gravePool,
            primary_section: primarySection,
            status:          status,
            gender:          gender,
            updated_at:      isoNow()
        )
        try await client
            .from("tm_profiles")
            .update(patch)
            .eq("tm_id", value: tmId)
            .execute()
    }

    // MARK: - Preferences

    func fetchPreferences(tmId: String) async throws -> [TMPreference] {
        try await client
            .from("tm_preferences")
            .select("*")
            .eq("tm_id", value: tmId)
            .execute()
            .value
    }

    // MARK: - Accommodations

    func fetchAccommodations(tmId: String) async throws -> [TMAccommodation] {
        try await client
            .from("tm_accommodations")
            .select("*")
            .eq("tm_id", value: tmId)
            .execute()
            .value
    }

    // MARK: - Catalog Tasks

    func fetchCatalogTasks() async throws -> [CatalogTask] {
        try await client
            .from("slot_task_catalog")
            .select("*")
            .order("sort_order", ascending: true)
            .execute()
            .value
    }

    struct CatalogInsert: Encodable {
        let slot_key: String
        let slot_type: String
        let rr_side: String?
        let label: String
        let sort_order: Int
        let is_default_on_new_night: Bool
    }

    func insertCatalogTask(slotKey: String, slotType: String, rrSide: String?,
                           label: String, sortOrder: Int, isDefault: Bool) async throws -> CatalogTask {
        let payload = CatalogInsert(
            slot_key: slotKey, slot_type: slotType, rr_side: rrSide,
            label: label, sort_order: sortOrder, is_default_on_new_night: isDefault
        )
        return try await client
            .from("slot_task_catalog")
            .insert(payload)
            .select("*")
            .single()
            .execute()
            .value
    }

    struct CatalogPatch: Encodable {
        let label: String
        let sort_order: Int
        let is_default_on_new_night: Bool
        let updated_at: String
    }

    func updateCatalogTask(id: UUID, label: String, sortOrder: Int, isDefault: Bool) async throws {
        let patch = CatalogPatch(label: label, sort_order: sortOrder,
                                 is_default_on_new_night: isDefault, updated_at: isoNow())
        try await client
            .from("slot_task_catalog")
            .update(patch)
            .eq("id", value: id.uuidString)
            .execute()
    }

    func deleteCatalogTask(id: UUID) async throws {
        try await client
            .from("slot_task_catalog")
            .delete()
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Zone Frequency

    private struct NightRef: Codable { let id: UUID }

    struct AssignRow: Codable {
        let tmId:    String
        let slotKey: String
        enum CodingKeys: String, CodingKey {
            case tmId = "tm_id"; case slotKey = "slot_key"
        }
    }

    /// Returns raw (tmId, slotKey) pairs for zone assignments in the last N days.
    func fetchZoneAssignmentsForFrequency(daysBack: Int) async throws -> [AssignRow] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -daysBack, to: Date()) ?? Date()
        let cutoffStr = isoDateStr(cutoff)

        let nights: [NightRef] = try await client
            .from("nights")
            .select("id")
            .gte("night_date", value: cutoffStr)
            .execute()
            .value

        guard !nights.isEmpty else { return [] }

        let nightIdStrings = nights.map { $0.id.uuidString }

        let rows: [AssignRow] = try await client
            .from("zone_assignments")
            .select("tm_id, slot_key")
            .eq("slot_type", value: "zone")
            .in("night_id", values: nightIdStrings)
            .execute()
            .value

        return rows.filter { !$0.tmId.isEmpty }
    }

    // MARK: - Engine Config

    func fetchActiveEngineConfig() async throws -> EngineConfigRecord? {
        let rows: [EngineConfigRecord] = try await client
            .from("engine_config")
            .select("id,is_active,placement_method,grok_reasoning_effort,notes,updated_at")
            .eq("is_active", value: "true")
            .order("created_at", ascending: false)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    struct EnginePatch: Encodable {
        let placement_method: String
        let grok_reasoning_effort: String
        let updated_at: String
    }

    func updateEngineConfig(id: UUID, placementMethod: String, grokEffort: String) async throws {
        let patch = EnginePatch(placement_method: placementMethod,
                                grok_reasoning_effort: grokEffort,
                                updated_at: isoNow())
        try await client
            .from("engine_config")
            .update(patch)
            .eq("id", value: id.uuidString)
            .execute()
    }

    // MARK: - Table Explorer

    let explorableTables: [String] = [
        "tm_profiles", "zone_assignments", "nights", "weeks",
        "slot_task_catalog", "night_slot_tasks", "break_assignments",
        "engine_config", "night_tm_status", "tm_preferences",
        "tm_accommodations", "tm_slot_skills", "slot_defaults",
        "slot_default_tasks", "call_offs", "overlap_assignments",
    ]

    func fetchTableData(tableName: String, limit: Int = 50, offset: Int = 0) async throws -> Data {
        let response = try await client
            .from(tableName)
            .select("*")
            .range(from: offset, to: offset + limit - 1)
            .execute()
        return response.data
    }

    // MARK: - Helpers

    private func isoNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }

    private func isoDateStr(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }
}
