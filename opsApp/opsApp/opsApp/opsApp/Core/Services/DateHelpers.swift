// DateHelpers.swift — Shift date utilities
// A "night" at GRAVE starts the evening of day D and ends the morning of D+1.
// The canonical date key is always the start-of-shift date (night_date column).

import Foundation

extension Date {
    /// Returns the start of day (midnight) in the current calendar.
    // nonisolated: Calendar + Date are value types — safe from any actor context.
    nonisolated var startOfDay: Date {
        Calendar.current.startOfDay(for: self)
    }

    /// String matching Supabase `night_date` column format: "yyyy-MM-dd"
    // Uses Calendar (value type) instead of DateFormatter (NSObject/@MainActor)
    // so this property is safe to call from any actor or background context.
    nonisolated var supabaseDateString: String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: self)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The canonical shift date for "tonight" based on current time.
    /// Grave shift runs ~10 PM → 8 AM. Any time before 8 AM belongs
    /// to the PREVIOUS calendar day's shift night.
    nonisolated static var tonightShiftDate: Date {
        var now = Date()
        let hour = Calendar.current.component(.hour, from: now)
        if hour < 8 {
            now = Calendar.current.date(byAdding: .day, value: -1, to: now) ?? now
        }
        return now.startOfDay
    }
}
