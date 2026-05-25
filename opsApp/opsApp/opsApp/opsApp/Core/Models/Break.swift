// Break.swift — Represents a single TM break record for a shift night.
// Mirrors the `breaks` table in Supabase.
//
// A break goes through: nil startTime → startTime set → endTime set.
// Duration is derived on read (endTime - startTime).

import Foundation

struct Break: Identifiable, Codable, Equatable, Sendable {
    let id:        UUID
    var nightId:   UUID
    var tmId:      String
    var breakNum:  Int          // 1st break, 2nd break, etc.
    var startTime: Date?
    var endTime:   Date?
    var notes:     String?

    enum CodingKeys: String, CodingKey {
        case id
        case nightId   = "night_id"
        case tmId      = "tm_id"
        case breakNum  = "break_num"
        case startTime = "start_time"
        case endTime   = "end_time"
        case notes
    }

    // MARK: - Derived

    /// Duration in minutes, or nil if break hasn't ended.
    var durationMinutes: Int? {
        guard let start = startTime, let end = endTime else { return nil }
        return Int(end.timeIntervalSince(start) / 60)
    }

    /// True if the break has started but not yet ended.
    var isOnBreak: Bool { startTime != nil && endTime == nil }

    /// True if the break is fully completed.
    var isCompleted: Bool { startTime != nil && endTime != nil }
}
