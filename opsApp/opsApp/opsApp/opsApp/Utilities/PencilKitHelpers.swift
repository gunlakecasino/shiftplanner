// PencilKitHelpers.swift — Foundation helpers for Pencil Pro 2 integration
// Phase 0: Stubs. Phase 1: Expanded for ShiftBuilder hover, pressure, squeeze.

import SwiftUI
import UIKit

// MARK: - Pencil Input Type

/// Distinguishes input type for consistent handling across the canvas.
enum PencilInputType {
    case finger
    case pencilTip
    case pencilHover    // Pencil Pro 2 hover (before touching)
    case pencilEraser
}

// MARK: - Hover State

/// Tracks Apple Pencil Pro 2 hover altitude/azimuth for predictive highlighting.
struct PencilHoverState: Equatable {
    var isHovering: Bool = false
    var location: CGPoint = .zero
    var altitude: CGFloat = 0     // 0 = parallel to surface, π/2 = perpendicular
    var azimuth: CGFloat = 0      // radians

    /// Approximate "distance above surface" in points (clamped 0–20).
    var approximateHeight: CGFloat {
        // Higher altitude angle → lower height
        let raw = (1.0 - (altitude / (.pi / 2))) * 20
        return max(0, min(20, raw))
    }
}

// MARK: - UIPencilInteraction convenience

extension UIView {
    /// Attach a UIPencilInteraction handler for squeeze events (Pencil Pro 2).
    func enablePencilInteraction(handler: @escaping (UIPencilInteraction) -> Void) {
        let interaction = UIPencilInteraction()
        interaction.isEnabled = true
        addInteraction(interaction)
        // Store handler via associated object — full implementation in Phase 1
        _ = handler // suppress unused warning during Phase 0
    }
}

// MARK: - CGPoint helpers

extension CGPoint {
    func distance(to other: CGPoint) -> CGFloat {
        sqrt(pow(x - other.x, 2) + pow(y - other.y, 2))
    }
}
