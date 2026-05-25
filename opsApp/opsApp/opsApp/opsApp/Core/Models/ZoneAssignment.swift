// ZoneAssignment.swift — A TM assigned to a slot for a given night.
// Mirrors the `zone_assignments` table in Supabase.
//
// Slot key conventions (from data.ts):
//   Zones:    "zone_1" ... "zone_10"        (slot_type: "zone")
//   RR:       "rr_1_2", "rr_6"             (slot_type: "rr", rr_side: "mens"|"womens")
//   Aux:      "admin", "z9_sr", "trash_1"   (slot_type: "aux")

import Foundation

struct ZoneAssignment: Codable, Hashable, Sendable, Identifiable {
    // MARK: - DB columns
    var nightId: UUID
    var slotKey: String         // e.g. "zone_1", "rr_1_2", "admin"
    var slotType: String        // "zone" | "rr" | "aux"
    var tmId: String?           // nil = empty slot
    var rrSide: String?         // "mens" | "womens" (RR slots only)
    var isLocked: Bool
    var isFilled: Bool
    var sortOrder: Int?
    var breakGroup: Int         // 0 = no group; 1–3 = break rotation group

    // MARK: - Identifiable — composite key
    var id: String { "\(nightId.uuidString)_\(slotKey)_\(rrSide ?? "none")" }

    // MARK: - Convenience

    enum SlotType {
        case zone(number: Int)
        case rr(side: String)
        case aux(key: String)
        case unknown
    }

    var parsedSlotType: SlotType {
        switch slotType {
        case "zone":
            let num = slotKey.replacingOccurrences(of: "zone_", with: "")
            return .zone(number: Int(num) ?? 0)
        case "rr":
            return .rr(side: rrSide ?? "unknown")
        case "aux":
            return .aux(key: slotKey)
        default:
            return .unknown
        }
    }

    // MARK: - CodingKeys
    enum CodingKeys: String, CodingKey {
        case nightId    = "night_id"
        case slotKey    = "slot_key"
        case slotType   = "slot_type"
        case tmId       = "tm_id"
        case rrSide     = "rr_side"
        case isLocked   = "is_locked"
        case isFilled   = "is_filled"
        case sortOrder  = "sort_order"
        case breakGroup = "break_group"
    }
}

// MARK: - Codable (extension preserves memberwise init)
//
// Explicit nonisolated implementations so the Codable conformance can be used
// from any actor context (e.g. ShiftPlannerRepository calling .upsert()).
// SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor would make synthesized Codable
// @MainActor-only, which causes errors when encoding inside actor methods.
// Moving impls to an extension keeps the auto-synthesized memberwise init.

extension ZoneAssignment {
    nonisolated func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(nightId,              forKey: .nightId)
        try c.encode(slotKey,              forKey: .slotKey)
        try c.encode(slotType,             forKey: .slotType)
        try c.encodeIfPresent(tmId,        forKey: .tmId)
        try c.encodeIfPresent(rrSide,      forKey: .rrSide)
        try c.encode(isLocked,             forKey: .isLocked)
        try c.encode(isFilled,             forKey: .isFilled)
        try c.encodeIfPresent(sortOrder,   forKey: .sortOrder)
        try c.encode(breakGroup,           forKey: .breakGroup)
    }

    nonisolated init(from decoder: any Decoder) throws {
        let c  = try decoder.container(keyedBy: CodingKeys.self)
        nightId    = try c.decode(UUID.self,    forKey: .nightId)
        slotKey    = try c.decode(String.self,  forKey: .slotKey)
        slotType   = try c.decode(String.self,  forKey: .slotType)
        tmId       = try c.decodeIfPresent(String.self, forKey: .tmId)
        rrSide     = try c.decodeIfPresent(String.self, forKey: .rrSide)
        isLocked   = try c.decode(Bool.self,    forKey: .isLocked)
        isFilled   = try c.decode(Bool.self,    forKey: .isFilled)
        sortOrder  = try c.decodeIfPresent(Int.self, forKey: .sortOrder)
        // Default 0 for rows inserted before this column was added.
        // NOTE: must NOT wrap in try? — decodeIfPresent returns Int? and try? gives Int??
        // which coerces the inner value away. Plain try + ?? 0 is the correct form.
        breakGroup = try c.decodeIfPresent(Int.self, forKey: .breakGroup) ?? 0
    }
}
