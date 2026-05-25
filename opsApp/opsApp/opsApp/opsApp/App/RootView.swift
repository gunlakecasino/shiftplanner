// RootView.swift — Top-level navigation shell
// Phase 0: Connectivity verification screen

import SwiftUI

struct RootView: View {
    var body: some View {
        NavigationStack {
            ShiftPlannerView()
        }
    }
}

#Preview {
    RootView()
}
