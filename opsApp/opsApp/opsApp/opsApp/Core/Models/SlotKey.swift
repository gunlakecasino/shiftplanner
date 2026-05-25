// SlotKey.swift
// Ported from src/lib/shiftbuilder/slot-keys.ts
//
// UI key (Golden convention) ↔ DB shape (zone_assignments table).
//
// UI keys:
//   Z1…Z10            zone slots
//   MRR1/WRR1, etc.   restroom slots, mens/womens split
//   Z9SR, ADM, TR1…   AUX slots
//
// DB shape:
//   slot_key: "zone_1", "rr_1_2", "admin", etc.
//   slot_type: "zone" | "rr" | "aux"
//   rr_side:  "mens" | "womens" | nil

import Foundation

// MARK: - Types

enum SlotType: String, Codable, Sendable {
    case zone, rr, aux, overlap
}

struct DbSlot: Equatable, Sendable {
    let slotKey: String
    let slotType: SlotType
    let rrSide: String?   // "mens" | "womens" | nil
}

// MARK: - Lookup tables

private let RR_NUM_TO_DB: [Int: String] = [
    1: "rr_1_2", 6: "rr_6", 7: "rr_7", 8: "rr_8", 10: "rr_10",
]

private let RR_DB_TO_NUM: [String: Int] = [
    "rr_1_2": 1, "rr_6": 6, "rr_7": 7, "rr_8": 8, "rr_10": 10,
]

private let AUX_UI_TO_DB: [String: String] = [
    "Z9SR": "z9_sr", "ADM": "admin",
    "TR1": "trash_1", "TR2": "trash_2",
    "SP1": "support_1", "SP2": "support_2",
]

private let AUX_DB_TO_UI: [String: String] = [
    "z9_sr": "Z9SR", "admin": "ADM",
    "trash_1": "TR1", "trash_2": "TR2",
    "support_1": "SP1", "support_2": "SP2",
]

// DB convention: overlap_{period}_{0-based-index}
// e.g. PM_OV1 ↔ overlap_pm_0, AM_OV6 ↔ overlap_am_5

private let OVERLAP_UI_TO_DB: [String: String] = [
    "PM_OV1": "overlap_pm_0", "PM_OV2": "overlap_pm_1",
    "PM_OV3": "overlap_pm_2", "PM_OV4": "overlap_pm_3",
    "AM_OV1": "overlap_am_0", "AM_OV2": "overlap_am_1",
    "AM_OV3": "overlap_am_2", "AM_OV4": "overlap_am_3",
    "AM_OV5": "overlap_am_4", "AM_OV6": "overlap_am_5",
]

private let OVERLAP_DB_TO_UI: [String: String] = [
    "overlap_pm_0": "PM_OV1", "overlap_pm_1": "PM_OV2",
    "overlap_pm_2": "PM_OV3", "overlap_pm_3": "PM_OV4",
    "overlap_am_0": "AM_OV1", "overlap_am_1": "AM_OV2",
    "overlap_am_2": "AM_OV3", "overlap_am_3": "AM_OV4",
    "overlap_am_4": "AM_OV5", "overlap_am_5": "AM_OV6",
]

// MARK: - Translation

/// UI slot key → DB shape.
/// Returns `nil` for unrecognised keys — callers must guard against nil
/// rather than letting unknown keys crash in production.
func uiKeyToDb(_ uiKey: String) -> DbSlot? {
    // Zones: Z1 … Z10
    if let match = uiKey.firstMatch(of: /^Z(\d+)$/),
       let _ = Int(match.1) {
        return DbSlot(slotKey: "zone_\(match.1)", slotType: .zone, rrSide: nil)
    }

    // RR: MRR1 / WRR1, etc.
    if let match = uiKey.firstMatch(of: /^([MW])RR(\d+)$/),
       let num = Int(match.2),
       let dbKey = RR_NUM_TO_DB[num] {
        let side = match.1 == "M" ? "mens" : "womens"
        return DbSlot(slotKey: dbKey, slotType: .rr, rrSide: side)
    }

    // AUX known keys
    if let dbKey = AUX_UI_TO_DB[uiKey] {
        return DbSlot(slotKey: dbKey, slotType: .aux, rrSide: nil)
    }

    // Operator-added AUX: AUX6 → aux_6
    if let match = uiKey.firstMatch(of: /^AUX(\d+)$/), let n = Int(match.1) {
        return DbSlot(slotKey: "aux_\(n)", slotType: .aux, rrSide: nil)
    }

    // Overlap slots
    if let dbKey = OVERLAP_UI_TO_DB[uiKey] {
        return DbSlot(slotKey: dbKey, slotType: .overlap, rrSide: nil)
    }

    // Unknown key — return nil instead of crashing. This should never happen
    // with known slot keys, but protects production builds from novel input.
    assertionFailure("[SlotKey] Unmappable UI key: \(uiKey) — add it to the lookup tables.")
    return nil
}

/// DB shape → UI key.
func dbSlotToUiKey(slotKey: String, slotType: String, rrSide: String?) -> String {
    switch slotType {
    case "zone":
        let num = slotKey.replacingOccurrences(of: "zone_", with: "")
        return "Z\(num)"

    case "rr":
        guard let num = RR_DB_TO_NUM[slotKey] else { return slotKey }
        let prefix = (rrSide == "mens") ? "M" : "W"
        return "\(prefix)RR\(num)"

    case "aux":
        if let uiKey = AUX_DB_TO_UI[slotKey] { return uiKey }
        // Operator-added: aux_6 → AUX6
        let num = slotKey.replacingOccurrences(of: "aux_", with: "")
        return "AUX\(num)"

    case "overlap":
        if let uiKey = OVERLAP_DB_TO_UI[slotKey] { return uiKey }
        return slotKey

    default:
        return slotKey
    }
}

// MARK: - Ordered placement list (mirrors PLACEMENT_ORDER from placement.ts)
// This is the canonical order zones appear in the UI — do not reorder.

let PLACEMENT_ORDER: [String] = [
    // Zones
    "Z1", "Z2", "Z3", "Z4", "Z5", "Z6", "Z7", "Z8", "Z9", "Z10",
    // Restrooms (mens, then womens interleaved per the Golden)
    "MRR1", "WRR1", "MRR6", "WRR6", "MRR7", "WRR7", "MRR8", "WRR8", "MRR10", "WRR10",
    // AUX
    "Z9SR", "ADM", "TR1", "TR2", "SP1", "SP2",
    // Overlaps — 4 PM + 6 AM
    "PM_OV1", "PM_OV2", "PM_OV3", "PM_OV4",
    "AM_OV1", "AM_OV2", "AM_OV3", "AM_OV4", "AM_OV5", "AM_OV6",
]
