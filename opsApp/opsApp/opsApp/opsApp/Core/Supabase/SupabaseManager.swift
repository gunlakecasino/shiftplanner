// SupabaseManager.swift — Singleton Supabase client
// Reads credentials from Secrets.plist (gitignored).
//
// `nonisolated(unsafe)` is used on `client` (a mutable var) so it can be
// accessed from actors and non-MainActor contexts. Safe because `client` is
// written exactly once in `configure()`, called synchronously at app launch
// before any concurrent work begins.
// Note: `static let shared` does NOT need nonisolated(unsafe) — Swift 6 treats
// static let as implicitly nonisolated for Sendable types.
//
// P0-04 FIX: configure() no longer calls fatalError in release builds.
// Instead it stores a ConfigurationError and sets isConfigured = false.
// DEBUG builds still assertionFailure loudly. RootView should check
// `configurationError` and present a blocking error screen before any
// Supabase operation is attempted.

import Foundation
import Supabase

// MARK: - Configuration Error

enum SupabaseConfigError: Error, LocalizedError, Sendable {
    case missingSecretsFile
    case malformedCredentials

    var errorDescription: String? {
        switch self {
        case .missingSecretsFile:
            return "Secrets.plist not found. Copy Secrets.plist.example → Secrets.plist and add your Supabase credentials."
        case .malformedCredentials:
            return "Secrets.plist is missing SUPABASE_URL or SUPABASE_ANON_KEY."
        }
    }
}

// MARK: - Manager

final class SupabaseManager: @unchecked Sendable {

    nonisolated(unsafe) static let shared = SupabaseManager()

    /// The live Supabase client. Only valid after configure() succeeds.
    /// Check `isConfigured` before use; a nil force-unwrap crash here means
    /// configure() was not called or failed — see `configurationError`.
    nonisolated(unsafe) private(set) var client: SupabaseClient!

    /// Non-nil when configure() could not load valid credentials.
    /// RootView should present a blocking error screen when this is set.
    nonisolated(unsafe) private(set) var configurationError: SupabaseConfigError?

    /// True only after configure() succeeds and client is fully initialised.
    var isConfigured: Bool { client != nil }

    private init() {}

    /// Call once at app launch (in opsAppApp.init), before any async work.
    /// DEBUG: assertionFailure so developers catch missing Secrets.plist immediately.
    /// RELEASE: sets configurationError and returns gracefully — no crash.
    func configure() {
        guard let path = Bundle.main.path(forResource: "Secrets", ofType: "plist") else {
            configurationError = .missingSecretsFile
            assertionFailure("""
            [SupabaseManager] Secrets.plist not found.
            Copy Resources/Secrets.plist.example → Secrets.plist and fill in your credentials.
            """)
            return
        }

        guard
            let secrets = NSDictionary(contentsOfFile: path),
            let urlStr  = secrets["SUPABASE_URL"]      as? String,
            let anonKey = secrets["SUPABASE_ANON_KEY"] as? String,
            let url     = URL(string: urlStr)
        else {
            configurationError = .malformedCredentials
            assertionFailure("""
            [SupabaseManager] Secrets.plist is missing SUPABASE_URL or SUPABASE_ANON_KEY.
            """)
            return
        }

        client = SupabaseClient(supabaseURL: url, supabaseKey: anonKey)
        print("[SupabaseManager] Ready — \(urlStr)")
    }
}
