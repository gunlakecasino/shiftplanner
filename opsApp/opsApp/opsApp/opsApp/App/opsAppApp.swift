// opsApp — Native iPadOS GRAVE Operations App
// Phase 0: App entry point

import SwiftUI

@main
struct opsAppApp: App {

    init() {
        SupabaseManager.shared.configure()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
