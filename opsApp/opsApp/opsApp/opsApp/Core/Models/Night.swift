// Night.swift — Represents a single grave shift night record.
// Mirrors the `nights` table in Supabase.
// Column name: night_date (not "date")
//
// isLocked is stored as non-optional Bool (default false) to eliminate the
// optional-chain fragility pattern `isLocked ?? false` at every call site.
// The custom Codable init handles null / absent values from Supabase safely.

import Foundation

// P1-23: Typed status enum — replaces the raw String? field.
// Unknown DB values (or null) fall back gracefully to .draft.
enum NightStatus: String, Codable, Equatable, Sendable {
    case draft   = "draft"
    case active  = "active"
    case complete = "complete"
}

struct Night: Identifiable, Codable, Equatable, Sendable {
    let id: UUID
    var nightDate: String       // "yyyy-MM-dd" string (Supabase date column)
    var weekId: UUID?
    var status: NightStatus     // never nil — absent/null from DB defaults to .draft
    var isLocked: Bool          // never nil — absent/null from DB defaults to false
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case id
        case nightDate  = "night_date"
        case weekId     = "week_id"
        case status
        case isLocked   = "is_locked"
        case notes
    }

    // Custom decode: treat null/absent `is_locked` as false so older DB rows
    // that pre-date the column don't fail to decode.
    init(from decoder: Decoder) throws {
        let c        = try decoder.container(keyedBy: CodingKeys.self)
        id           = try  c.decode(UUID.self,    forKey: .id)
        nightDate    = try  c.decode(String.self,  forKey: .nightDate)
        weekId       = try? c.decodeIfPresent(UUID.self,   forKey: .weekId) ?? nil
        // P1-23: decode as String first, map to NightStatus, fallback to .draft for
        // null/absent or any unrecognised value so old DB rows never fail to parse.
        let rawStatus = try c.decodeIfPresent(String.self, forKey: .status)
        status = rawStatus.flatMap(NightStatus.init) ?? .draft
        isLocked     = (try c.decodeIfPresent(Bool.self,   forKey: .isLocked)) ?? false
        notes        = try  c.decodeIfPresent(String.self, forKey: .notes)
    }

    // Memberwise init used by mock data and direct construction.
    init(id: UUID, nightDate: String, weekId: UUID? = nil,
         status: NightStatus = .draft, isLocked: Bool = false, notes: String? = nil) {
        self.id        = id
        self.nightDate = nightDate
        self.weekId    = weekId
        self.status    = status
        self.isLocked  = isLocked
        self.notes     = notes
    }
}
