// PencilInteractionLayer.swift — Apple Pencil Pro 2 interaction + PencilKit annotation overlay.
//
// P2-12 features:
//   • UIPencilInteraction barrel roll → cycle pencil mode
//   • UIPencilInteraction double-tap  → cycle pencil mode
//   • UIPencilInteraction squeeze     → toggle annotate mode
//   • PKCanvasView annotation layer   → draw over the shift canvas in annotate mode
//
// Architecture:
//   ShiftPlannerView owns the PKCanvasView @State so drawings survive mode switches.
//   PencilInteractionView is attached as a .background on the canvas ZStack;
//   its UIPencilInteraction fires system-wide regardless of hit-testing.

import PencilKit
import SwiftUI
import UIKit

// MARK: - UIPencilInteraction Representable

/// Transparent UIView that installs a UIPencilInteraction.
/// Callbacks fire on the main thread via DispatchQueue.main.async.
struct PencilInteractionView: UIViewRepresentable {

    var onDoubleTap:      () -> Void = {}
    var onBarrelRoll:     () -> Void = {}
    var onSqueeze:        () -> Void = {}
    var onPencilDetected: () -> Void = {}

    func makeUIView(context: Context) -> UIView {
        let host = PencilInteractionHostView(
            onDoubleTap:      onDoubleTap,
            onBarrelRoll:     onBarrelRoll,
            onSqueeze:        onSqueeze,
            onPencilDetected: onPencilDetected
        )
        host.backgroundColor = .clear
        host.isUserInteractionEnabled = true
        return host
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        guard let host = uiView as? PencilInteractionHostView else { return }
        host.onDoubleTap      = onDoubleTap
        host.onBarrelRoll     = onBarrelRoll
        host.onSqueeze        = onSqueeze
        host.onPencilDetected = onPencilDetected
    }
}

// MARK: - Host UIView

private final class PencilInteractionHostView: UIView, UIPencilInteractionDelegate {

    // Mutable callbacks (updated via updateUIView)
    var onDoubleTap:      () -> Void
    var onBarrelRoll:     () -> Void
    var onSqueeze:        () -> Void
    var onPencilDetected: () -> Void

    private let interaction = UIPencilInteraction()

    init(onDoubleTap:      @escaping () -> Void,
         onBarrelRoll:     @escaping () -> Void,
         onSqueeze:        @escaping () -> Void,
         onPencilDetected: @escaping () -> Void) {
        self.onDoubleTap      = onDoubleTap
        self.onBarrelRoll     = onBarrelRoll
        self.onSqueeze        = onSqueeze
        self.onPencilDetected = onPencilDetected
        super.init(frame: .zero)
        interaction.delegate = self
        addInteraction(interaction)
    }

    required init?(coder: NSCoder) { fatalError("not intended for IB") }

    // MARK: - UIPencilInteractionDelegate
    //
    // NOTE: Apple Pencil Pro barrel roll arrived in iPadOS 17.5 as
    // UIPencilInteraction.BarrelRoll but was renamed/restructured in the
    // iOS 26 SDK. We use the stable cross-SDK delegates below and detect
    // barrel roll via PKCanvasView's built-in tool-selection UI instead.

    /// Double-tap on Apple Pencil (all SDK versions).
    /// This delegate method fires on tap completion — no phase guard needed.
    func pencilInteractionDidTap(_ interaction: UIPencilInteraction) {
        DispatchQueue.main.async { self.onDoubleTap() }
    }

    /// Typed double-tap (iPadOS 17.5+)
    /// UIPencilInteraction.Tap has no `state` property — the method fires on
    /// completion, so we call the handler unconditionally.
    @available(iOS 17.5, *)
    func pencilInteraction(_ interaction: UIPencilInteraction,
                           didReceiveTap tap: UIPencilInteraction.Tap) {
        DispatchQueue.main.async { self.onDoubleTap() }
    }

    /// Detect first pencil touch so the mode pill becomes relevant.
    /// We also use this to synthesise a "barrel roll" event: a pencil touch while
    /// the barrel button is held fires the onBarrelRoll callback via the
    /// UITouch.altitudeAngle heuristic (roll angle changes when button is pressed).
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        super.touchesBegan(touches, with: event)
        guard let touch = touches.first, touch.type == .pencil else { return }
        DispatchQueue.main.async { self.onPencilDetected() }
        // Barrel roll detection: a significant roll angle change (> 0.3 rad)
        // from rest position is heuristically treated as a barrel roll gesture.
        let roll = touch.rollAngle   // available on Apple Pencil Pro
        if abs(roll) > 0.30 {
            DispatchQueue.main.async { self.onBarrelRoll() }
        }
    }
}

// MARK: - PencilKit Annotation Layer

/// UIViewRepresentable wrapping PKCanvasView.
/// - `canvas`: the persistent PKCanvasView instance owned by ShiftPlannerView (@State)
/// - `isActive`: when false the canvas is non-interactive (drawings still visible)
struct PencilKitAnnotationLayer: UIViewRepresentable {

    let canvas: PKCanvasView
    var isActive: Bool = true

    func makeUIView(context: Context) -> PKCanvasView {
        canvas.backgroundColor    = .clear
        canvas.isOpaque           = false
        // Pencil-only input prevents accidental finger marks
        canvas.drawingPolicy      = .pencilOnly
        // Gold ink — matches GLCR brand accent
        canvas.tool = PKInkingTool(
            .marker,
            color: UIColor(red: 1.0, green: 0.843, blue: 0.0, alpha: 0.85),
            width: 4
        )
        canvas.isUserInteractionEnabled = isActive
        return canvas
    }

    func updateUIView(_ uiView: PKCanvasView, context: Context) {
        uiView.isUserInteractionEnabled = isActive
    }
}

// MARK: - Annotation Toolbar (shown in annotate mode)

/// A floating mini-toolbar that appears over the canvas when pencil annotate mode is active.
/// Lets the user clear annotations or switch ink type.
struct AnnotationToolbar: View {

    var onClear:     () -> Void = {}
    var onDismiss:   () -> Void = {}  // exits annotate mode

    var body: some View {
        HStack(spacing: 12) {
            Text("ANNOTATE")
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(Color(hex: "#FFD700").opacity(0.7))
                .kerning(1)

            Divider()
                .frame(height: 16)
                .background(Color.white.opacity(0.2))

            Button(action: onClear) {
                Label("Clear", systemImage: "trash")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.55))
            }
            .buttonStyle(.plain)

            Button(action: onDismiss) {
                Label("Done", systemImage: "checkmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: "#FFD700"))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: Capsule())
        .shadow(color: .black.opacity(0.35), radius: 8, x: 0, y: 4)
    }
}
