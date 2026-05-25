// SlotTask.swift — A task label attached to a slot for a given night.
// Mirrors `night_slot_tasks` table in Supabase.
//
// Tasks are secondary annotations on cards — e.g. "And Zone 6", "Hotel + CBK Offices".
// Multiple tasks can share the same slot_key (displayed as stacked lines on the card).
//
// slot_key / slot_type / rr_side follow the same DB conventions as zone_assignments.

import Foundation

struct SlotTask: Identifiable, Codable, Equatable, Sendable {
    let id:            UUID
    let nightId:       UUID
    let slotKey:       String       // e.g. "zone_1", "overlap_am_0", "rr_6"
    let slotType:      String       // "zone" | "rr" | "aux" | "overlap"
    let rrSide:        String?      // "mens" | "womens" | nil (RR tasks only)
    let taskLabel:     String       // display text, e.g. "And Zone 2"
    let catalogTaskId: UUID?
    let sortOrder:     Int
    let color:         String?      // optional hex color override
    let isCoverage:    Bool

    enum CodingKeys: String, CodingKey {
        case id
        case nightId       = "night_id"
        case slotKey       = "slot_key"
        case slotType      = "slot_type"
        case rrSide        = "rr_side"
        case taskLabel     = "task_label"
        case catalogTaskId = "catalog_task_id"
        case sortOrder     = "sort_order"
        case color
        case isCoverage    = "is_coverage"
    }
}

// Explicit nonisolated Codable — same pattern as ZoneAssignment.
// Required under SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor so the
// decode/encode is available from actor contexts (ShiftPlannerRepository).

extension SlotTask {
    nonisolated func encode(to encoder: any Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id,                   forKey: .id)
        try c.encode(nightId,              forKey: .nightId)
        try c.encode(slotKey,              forKey: .slotKey)
        try c.encode(slotType,             forKey: .slotType)
        try c.encodeIfPresent(rrSide,      forKey: .rrSide)
        try c.encode(taskLabel,            forKey: .taskLabel)
        try c.encodeIfPresent(catalogTaskId, forKey: .catalogTaskId)
        try c.encode(sortOrder,            forKey: .sortOrder)
        try c.encodeIfPresent(color,       forKey: .color)
        try c.encode(isCoverage,           forKey: .isCoverage)
    }

    nonisolated init(from decoder: any Decoder) throws {
        let c     = try decoder.container(keyedBy: CodingKeys.self)
        id            = try c.decode(UUID.self,    forKey: .id)
        nightId       = try c.decode(UUID.self,    forKey: .nightId)
        slotKey       = try c.decode(String.self,  forKey: .slotKey)
        slotType      = try c.decode(String.self,  forKey: .slotType)
        rrSide        = try c.decodeIfPresent(String.self, forKey: .rrSide)
        taskLabel     = try c.decode(String.self,  forKey: .taskLabel)
        catalogTaskId = try c.decodeIfPresent(UUID.self,   forKey: .catalogTaskId)
        sortOrder     = try c.decode(Int.self,     forKey: .sortOrder)
        color         = try c.decodeIfPresent(String.self, forKey: .color)
        isCoverage    = try c.decode(Bool.self,    forKey: .isCoverage)
    }
}
