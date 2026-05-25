// TeamMember.swift — Core domain model
// Mirrors the `tm_profiles` table in Supabase.
// Note: primary key is tm_id (String, e.g. "tm_abby"), NOT a UUID.

import Foundation

struct TeamMember: Identifiable, Codable, Hashable, Sendable {
    // MARK: - DB columns
    var tmId: String            // "tm_abby", "tm_seth", etc.
    var displayName: String
    var fullName: String?
    var status: String?         // "full_time", "part_time", etc.
    var primarySection: String?
    var active: Bool
    var gravePool: String?      // nil = not in a grave pool
    var gender: String?         // "male" | "female" | nil

    // MARK: - Identifiable
    var id: String { tmId }

    // MARK: - Convenience
    var name: String { displayName.isEmpty ? (fullName ?? tmId) : displayName }

    var isMale: Bool { gender?.lowercased() == "male" }
    var isFemale: Bool { gender?.lowercased() == "female" }

    // MARK: - Codable
    enum CodingKeys: String, CodingKey {
        case tmId           = "tm_id"
        case displayName    = "display_name"
        case fullName       = "full_name"
        case status
        case primarySection = "primary_section"
        case active
        case gravePool      = "grave_pool"
        case gender
    }
}
