// ShiftPlannerConstants.swift
// Ported from src/lib/shiftbuilder/constants.ts
// Single source of truth for zone/RR/AUX definitions, colors, and icons.

import SwiftUI

// MARK: - Zone Definitions

struct ZoneDef: Identifiable, Sendable {
    let key: String          // "Z1" … "Z10"
    let label: String        // "ZONE 1" … "ZONE 10"
    let locations: [String]  // location lines shown on card
    var id: String { key }
}

let ZONE_DEFS: [ZoneDef] = [
    ZoneDef(key: "Z1",  label: "ZONE 1",  locations: ["Main Entry North"]),
    ZoneDef(key: "Z2",  label: "ZONE 2",  locations: ["Main Entry South"]),
    ZoneDef(key: "Z3",  label: "ZONE 3",  locations: ["Food Court North"]),
    ZoneDef(key: "Z4",  label: "ZONE 4",  locations: ["Food Court South"]),
    ZoneDef(key: "Z5",  label: "ZONE 5",  locations: ["Slots West"]),
    ZoneDef(key: "Z6",  label: "ZONE 6",  locations: ["Slots East"]),
    ZoneDef(key: "Z7",  label: "ZONE 7",  locations: ["High Limit"]),
    ZoneDef(key: "Z8",  label: "ZONE 8",  locations: ["Table Games North"]),
    ZoneDef(key: "Z9",  label: "ZONE 9",  locations: ["Table Games South"]),
    ZoneDef(key: "Z10", label: "ZONE 10", locations: ["Poker"]),
]

// MARK: - RR Definitions

struct RRDef: Identifiable, Sendable {
    let num: Int
    let label: String
    let mensLoc: String
    let womensLoc: String
    var id: Int { num }
    var mensKey: String   { "MRR\(num)" }
    var womensKey: String { "WRR\(num)" }
}

let RR_DEFS: [RRDef] = [
    RRDef(num: 1,  label: "RR 1+2", mensLoc: "Main Entry",  womensLoc: "Main Entry"),
    RRDef(num: 6,  label: "RR 6",   mensLoc: "Slots",       womensLoc: "Slots"),
    RRDef(num: 7,  label: "RR 7",   mensLoc: "High Limit",  womensLoc: "High Limit"),
    RRDef(num: 8,  label: "RR 8",   mensLoc: "Table Games", womensLoc: "Table Games"),
    RRDef(num: 10, label: "RR 10",  mensLoc: "Poker",       womensLoc: "Poker"),
]

// MARK: - AUX Definitions

struct AuxDef: Identifiable, Sendable {
    let key: String
    let label: String
    let locations: [String]
    var id: String { key }
}

let DEFAULT_AUX_DEFS: [AuxDef] = [
    AuxDef(key: "Z9SR", label: "Z9 SR",     locations: ["Z9 Smoking Room"]),
    AuxDef(key: "ADM",  label: "ADMIN",     locations: ["Floor Admin"]),
    AuxDef(key: "TR1",  label: "TRASH 1",   locations: ["West Trash Run"]),
    AuxDef(key: "TR2",  label: "TRASH 2",   locations: ["East Trash Run"]),
    AuxDef(key: "SP1",  label: "SUPPORT 1", locations: ["Float Support"]),
    AuxDef(key: "SP2",  label: "SUPPORT 2", locations: ["Float Support"]),
]

// MARK: - Zone Accent Colors (Golden palette, from constants.ts)

let ZONE_COLORS: [String: Color] = [
    "Z1":  Color(hex: "#B89708"), // gold
    "Z2":  Color(hex: "#B89708"), // gold
    "Z3":  Color(hex: "#E53935"), // red
    "Z4":  Color(hex: "#E53935"), // red
    "Z5":  Color(hex: "#E53935"), // red
    "Z6":  Color(hex: "#B7679A"), // magenta
    "Z7":  Color(hex: "#1976D2"), // blue
    "Z8":  Color(hex: "#6B5346"), // brown
    "Z9":  Color(hex: "#E53935"), // red
    "Z10": Color(hex: "#43A047"), // green
]

let RR_COLORS: [Int: Color] = [
    1:  Color(hex: "#B89708"),
    6:  Color(hex: "#B7679A"),
    7:  Color(hex: "#1976D2"),
    8:  Color(hex: "#6B5346"),
    10: Color(hex: "#43A047"),
]

let AUX_COLORS: [String: Color] = [
    "Z9SR": Color(hex: "#E53935"),
    "ADM":  Color(hex: "#B7679A"),
    "TR1":  Color(hex: "#FB8C00"),
    "TR2":  Color(hex: "#FB8C00"),
    "SP1":  Color(hex: "#1976D2"),
    "SP2":  Color(hex: "#1976D2"),
]

func zoneAccent(_ key: String) -> Color {
    ZONE_COLORS[key] ?? Color(hex: "#6B7280")
}

func rrAccent(_ num: Int) -> Color {
    RR_COLORS[num] ?? Color(hex: "#6B7280")
}

func auxAccent(_ key: String) -> Color {
    AUX_COLORS[key] ?? Color(hex: "#6B7280")
}

// MARK: - Overlap Definitions

struct OverlapDef: Identifiable, Sendable {
    let key: String       // "PM_OV1", "PM_OV2", "AM_OV1", "AM_OV2"
    let label: String
    let period: String    // "PM OVERLAP" | "AM OVERLAP"
    let location: String
    var id: String { key }
}

let DEFAULT_OVERLAP_DEFS: [OverlapDef] = [
    // PM overlaps (4) — start-of-shift crew coming on
    OverlapDef(key: "PM_OV1", label: "PM OVL 1", period: "PM OVERLAP", location: "Start of Shift"),
    OverlapDef(key: "PM_OV2", label: "PM OVL 2", period: "PM OVERLAP", location: "Start of Shift"),
    OverlapDef(key: "PM_OV3", label: "PM OVL 3", period: "PM OVERLAP", location: "Start of Shift"),
    OverlapDef(key: "PM_OV4", label: "PM OVL 4", period: "PM OVERLAP", location: "Start of Shift"),
    // AM overlaps (6) — end-of-shift crew going off
    OverlapDef(key: "AM_OV1", label: "AM OVL 1", period: "AM OVERLAP", location: "End of Shift"),
    OverlapDef(key: "AM_OV2", label: "AM OVL 2", period: "AM OVERLAP", location: "End of Shift"),
    OverlapDef(key: "AM_OV3", label: "AM OVL 3", period: "AM OVERLAP", location: "End of Shift"),
    OverlapDef(key: "AM_OV4", label: "AM OVL 4", period: "AM OVERLAP", location: "End of Shift"),
    OverlapDef(key: "AM_OV5", label: "AM OVL 5", period: "AM OVERLAP", location: "End of Shift"),
    OverlapDef(key: "AM_OV6", label: "AM OVL 6", period: "AM OVERLAP", location: "End of Shift"),
]

let OVERLAP_COLORS: [String: Color] = [
    // PM — orange
    "PM_OV1": Color(hex: "#FB8C00"),
    "PM_OV2": Color(hex: "#FB8C00"),
    "PM_OV3": Color(hex: "#FB8C00"),
    "PM_OV4": Color(hex: "#FB8C00"),
    // AM — teal
    "AM_OV1": Color(hex: "#00ACC1"),
    "AM_OV2": Color(hex: "#00ACC1"),
    "AM_OV3": Color(hex: "#00ACC1"),
    "AM_OV4": Color(hex: "#00ACC1"),
    "AM_OV5": Color(hex: "#00ACC1"),
    "AM_OV6": Color(hex: "#00ACC1"),
]

let OVERLAP_ICONS: [String: String] = [
    "PM_OV1": "◑", "PM_OV2": "◑", "PM_OV3": "◑", "PM_OV4": "◑",
    "AM_OV1": "◐", "AM_OV2": "◐", "AM_OV3": "◐", "AM_OV4": "◐", "AM_OV5": "◐", "AM_OV6": "◐",
]

func overlapAccent(_ key: String) -> Color { OVERLAP_COLORS[key] ?? Color(hex: "#6B7280") }
func overlapIcon(_ key: String)   -> String { OVERLAP_ICONS[key] ?? "◆" }

// MARK: - Zone Icons (from constants.ts, matching Golden glyphs)

let ZONE_ICONS: [String: String] = [
    "Z1": "★", "Z2": "◆", "Z3": "▲", "Z4": "■", "Z5": "⬟",
    "Z6": "♥", "Z7": "●", "Z8": "◐", "Z9": "☾", "Z10": "✚",
]

let RR_ICONS: [Int: String] = [
    1: "★", 6: "♥", 7: "●", 8: "◐", 10: "✚",
]

let AUX_ICONS: [String: String] = [
    "Z9SR": "☾", "ADM": "❖", "TR1": "✖", "TR2": "✖", "SP1": "✦", "SP2": "✦",
]

func zoneIcon(_ key: String) -> String  { ZONE_ICONS[key] ?? "◆" }
func rrIcon(_ num: Int) -> String       { RR_ICONS[num] ?? "◆" }
func auxIcon(_ key: String) -> String   { AUX_ICONS[key] ?? "✦" }

// MARK: - Canvas Dimensions

/// The Golden artboard reference size. Cards are sized relative to this.
enum Canvas {
    static let width:  CGFloat = 1056
    static let height: CGFloat = 816

    /// Zone card dimensions
    static let zoneCardWidth:  CGFloat = 168
    static let zoneCardHeight: CGFloat = 108

    /// RR card dimensions (wider to contain M/W split)
    static let rrCardWidth:  CGFloat = 220
    static let rrCardHeight: CGFloat = 108

    /// AUX card dimensions
    static let auxCardWidth:  CGFloat = 168
    static let auxCardHeight: CGFloat = 80

    /// Overlap card dimensions (same as AUX)
    static let overlapCardWidth:  CGFloat = 168
    static let overlapCardHeight: CGFloat = 80

    /// Roster rail width
    static let rosterWidth: CGFloat = 200

    /// Inter-card spacing
    static let cardSpacing: CGFloat = 8
    static let sectionSpacing: CGFloat = 16
}

// MARK: - Color(hex:) initializer

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: Double
        switch hex.count {
        case 6:
            r = Double((int >> 16) & 0xFF) / 255
            g = Double((int >> 8)  & 0xFF) / 255
            b = Double(int         & 0xFF) / 255
        default:
            r = 0; g = 0; b = 0
        }
        self.init(red: r, green: g, blue: b)
    }
}
