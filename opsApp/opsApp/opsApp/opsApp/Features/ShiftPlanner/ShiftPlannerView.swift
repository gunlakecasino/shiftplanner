// ShiftPlannerView.swift — TCA-backed ShiftPlanner root.
//
// Owns the TCA Store for ShiftPlannerFeature and wires it to:
//   ShiftHeaderBar  — date nav, status, fill counter, action buttons
//   ShiftCanvasView — zone/RR/AUX/Overlap grids + roster rail
//
// Keyboard shortcuts: ⌘R refresh, ⌘← prev, ⌘→ next, Escape dismiss selection.

import ComposableArchitecture
import PencilKit
import SwiftUI
import UIKit

struct ShiftPlannerView: View {

    // MARK: - Stores

    @State var store = Store(initialState: ShiftPlannerState()) {
        ShiftPlannerFeature()
    }

    // P0-01 FIX: BreakTrackerStore lives here as @State so it is created once
    // and survives sheet dismiss/re-open. Creating it inside the .sheet closure
    // (as before) re-initialised the store on every render, leaking subscriptions
    // and losing in-progress break state.
    @State private var breakTrackerStore = Store(initialState: BreakTrackerState()) {
        BreakTrackerFeature()
    }

    // Night lock confirmation alert
    @State private var showLockConfirm = false

    // P2-12: PencilKit annotation canvas — kept alive across mode switches
    @State private var pencilAnnotationCanvas = PKCanvasView()

    // MARK: - Body

    var body: some View {
        // Fine-grained observation registrations — required so SwiftUI
        // re-renders when individual properties change through the store.
        let _ = store.selectedSlotKey
        let _ = store.hoveredSlotKey
        let _ = store.assignments
        let _ = store.teamMembers
        let _ = store.night
        let _ = store.selectedDate
        let _ = store.isLoading
        let _ = store.errorMessage
        let _ = store.showBreakTracker
        let _ = store.showNightNotes
        let _ = store.exportedPDFURL
        let _ = store.isExporting
        let _ = store.nightNotesSaved
        let _ = store.pencilMode
        let _ = store.isPencilActive
        let _ = store.isCommandPaletteOpen
        let _ = store.isSudoPanelOpen
        // Sprint 4
        let _ = store.breakGroupsByUiKey
        let _ = store.undoStack
        let _ = store.redoStack

        return VStack(spacing: 0) {

            // ── Header bar ────────────────────────────────────────────
            ShiftHeaderBar(
                state: store.state,
                onPrevDay:        { store.send(.prevDayTapped) },
                onNextDay:        { store.send(.nextDayTapped) },
                onRefresh:        { store.send(.refreshTapped) },
                onShowBreaks:     { store.send(.showBreakTrackerTapped) },
                onShowNightNotes: { store.send(.showNightNotesTapped) },
                onExport:         { store.send(.exportDeploymentBook) },
                onToggleNightLock: {
                    let isLocked = store.night?.isLocked ?? false
                    if isLocked {
                        store.send(.toggleNightLock)
                    } else {
                        showLockConfirm = true
                    }
                },
                onCyclePencilMode: { store.send(.pencilModeChanged(store.pencilMode.next)) },
                onCommandPalette:  { store.send(.commandPaletteToggled) },
                onDateSelected:   { date in store.send(.dateChanged(date)) }
            )

            // ── Canvas ────────────────────────────────────────────────
            // Sprint 3: artboard-canvas redesign matching ZDS Forge webapp.
            // ShiftCanvasView is preserved but replaced by ArtboardCanvasView.
            ZStack {
                ArtboardCanvasView(
                    state: store.state,
                    onHoverSlot:  { key in store.send(.pencilHoveredSlot(key)) },
                    onTapSlot:    { key in store.send(.slotTapped(key)) },
                    onAssignTM:   { tmId in
                        if let selectedKey = store.selectedSlotKey {
                            store.send(.assignSlot(slotKey: selectedKey, tmId: tmId))
                        }
                    },
                    onClearSlot:  {
                        if let selectedKey = store.selectedSlotKey {
                            store.send(.unassignSlot(slotKey: selectedKey))
                        }
                    },
                    onToggleLock: {
                        if let selectedKey = store.selectedSlotKey {
                            store.send(.toggleLock(slotKey: selectedKey))
                        }
                    },
                    onDismiss:          { store.send(.dismissSelection) },
                    onPrevDay:          { store.send(.prevDayTapped) },
                    onNextDay:          { store.send(.nextDayTapped) },
                    pencilMode:         store.pencilMode,
                    // Sprint 4: break badges
                    breakGroupsByUiKey: store.breakGroupsByUiKey,
                    onCycleBreak:       { key in store.send(.cycleBreak(slotKey: key)) },
                    // Sprint 4: undo / redo
                    canUndo:            store.canUndo,
                    canRedo:            store.canRedo,
                    onUndo:             { store.send(.undo) },
                    onRedo:             { store.send(.redo) }
                )

                // P2-12: PencilKit annotation layer — always in tree so drawings persist.
                // isActive = false makes it transparent to finger/touch events outside annotate mode.
                PencilKitAnnotationLayer(canvas: pencilAnnotationCanvas,
                                         isActive: store.pencilMode == .annotate)
                    .ignoresSafeArea()
                    .allowsHitTesting(store.pencilMode == .annotate)
                    .opacity(store.pencilMode == .annotate ? 1.0 : 0)
                    .animation(.easeInOut(duration: 0.2), value: store.pencilMode)

                // P2-12: Annotation toolbar — floats at top-center in annotate mode
                if store.pencilMode == .annotate {
                    VStack {
                        AnnotationToolbar(
                            onClear: {
                                pencilAnnotationCanvas.drawing = PKDrawing()
                            },
                            onDismiss: {
                                store.send(.pencilModeChanged(.assign))
                            }
                        )
                        .padding(.top, 12)
                        Spacer()
                    }
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                // Loading overlay (glass card)
                if store.isLoading { loadingOverlay }

                // Error banner
                if let msg = store.errorMessage { errorBanner(message: msg) }
            }
            .animation(.spring(duration: 0.25, bounce: 0.1), value: store.pencilMode)
            // P2-12: UIPencilInteraction detects barrel roll / double tap / squeeze
            .background(
                PencilInteractionView(
                    onDoubleTap:      { store.send(.pencilModeChanged(store.pencilMode.next)) },
                    onBarrelRoll:     { store.send(.pencilModeChanged(store.pencilMode.next)) },
                    onSqueeze:        {
                        let next: PencilMode = store.pencilMode == .annotate ? .assign : .annotate
                        store.send(.pencilModeChanged(next))
                    },
                    onPencilDetected: { store.send(.pencilActivityChanged(true)) }
                )
                .allowsHitTesting(false)
            )
        }
        .ignoresSafeArea(edges: .bottom)
        .navigationTitle("")
        .navigationBarHidden(true)
        .task { store.send(.onAppear) }

        // ── Keyboard shortcuts ────────────────────────────────────────
        // Hidden buttons with .keyboardShortcut — focusable at view level
        .overlay(alignment: .topLeading) {
            Group {
                Button("") { store.send(.refreshTapped) }
                    .keyboardShortcut("r", modifiers: .command)
                Button("") { store.send(.prevDayTapped) }
                    .keyboardShortcut(.leftArrow, modifiers: .command)
                Button("") { store.send(.nextDayTapped) }
                    .keyboardShortcut(.rightArrow, modifiers: .command)
                Button("") {
                    if store.isCommandPaletteOpen {
                        store.send(.commandPaletteDismissed)
                    } else {
                        store.send(.dismissSelection)
                    }
                }
                .keyboardShortcut(.escape, modifiers: [])
                // P2-07: Export PDF (⌘P), Toggle Night Lock (⌘L)
                Button("") { store.send(.exportDeploymentBook) }
                    .keyboardShortcut("p", modifiers: .command)
                Button("") {
                    let isLocked = store.night?.isLocked ?? false
                    if isLocked { store.send(.toggleNightLock) } else { showLockConfirm = true }
                }
                .keyboardShortcut("l", modifiers: .command)
                // Cycle pencil mode (⌘M)
                Button("") { store.send(.pencilModeChanged(store.pencilMode.next)) }
                    .keyboardShortcut("m", modifiers: .command)
                // Command Palette (⌘K)
                Button("") { store.send(.commandPaletteToggled) }
                    .keyboardShortcut("k", modifiers: .command)
                // Sprint 4: Undo (⌘Z) / Redo (⌘⇧Z)
                Button("") { store.send(.undo) }
                    .keyboardShortcut("z", modifiers: .command)
                Button("") { store.send(.redo) }
                    .keyboardShortcut("z", modifiers: [.command, .shift])
            }
            .frame(width: 0, height: 0)
            .opacity(0)
            .allowsHitTesting(false)
        }

        // ── Night lock confirmation ────────────────────────────────────
        .alert("Lock Night?", isPresented: $showLockConfirm) {
            Button("Lock", role: .destructive) { store.send(.toggleNightLock) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Locking the night prevents any further changes. You can unlock it again from the header.")
        }

        // ── Night Notes sheet ─────────────────────────────────────────
        .sheet(isPresented: Binding(
            get: { store.showNightNotes },
            set: { if !$0 { store.send(.dismissNightNotes) } }
        )) {
            NightNotesSheet(
                notes: store.night?.notes ?? "",
                isSaved: store.nightNotesSaved,
                onNotesChanged: { store.send(.nightNotesChanged($0)) },
                onSave:         { store.send(.saveNightNotes); store.send(.dismissNightNotes) },
                onDismiss:      { store.send(.dismissNightNotes) }
            )
        }

        // ── Break tracker sheet ───────────────────────────────────────
        // P0-01 FIX: pass the hoisted breakTrackerStore (not a new Store per render).
        // P0-09 FIX: filter teamMembers to only TMs assigned to this night so the
        //            break list doesn't show the full 30-person roster.
        .sheet(isPresented: Binding(
            get: { store.showBreakTracker },
            set: { if !$0 { store.send(.dismissBreakTracker) } }
        )) {
            let assignedTmIds = Set(store.assignments.compactMap { $0.tmId })
            let assignedTMs   = store.teamMembers.filter { assignedTmIds.contains($0.tmId) }
            BreakTrackerView(
                store:              breakTrackerStore,
                initialNightId:     store.night?.id,
                initialTeamMembers: assignedTMs,
                onDismiss:          { store.send(.dismissBreakTracker) }
            )
        }

        // ── PDF export share sheet ────────────────────────────────────
        .sheet(item: Binding(
            get: { store.exportedPDFURL.map { IdentifiableURL($0) } },
            set: { if $0 == nil { store.send(.dismissExport) } }
        )) { identifiable in
            ShareSheet(url: identifiable.url)
        }

        // ── Export loading overlay ────────────────────────────────────
        .overlay {
            if store.isExporting {
                ZStack {
                    Color.black.opacity(0.35).ignoresSafeArea()
                    VStack(spacing: 12) {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .tint(.white)
                        Text("Generating PDF…")
                            .font(.system(size: 13))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                    .padding(24)
                    .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 12))
                }
                .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.18), value: store.isExporting)

        // ── Command Palette (⌘K) ──────────────────────────────────────
        .overlay {
            if store.isCommandPaletteOpen {
                CommandPaletteView(
                    state:        store.state,
                    onDismiss:    { store.send(.commandPaletteDismissed) },
                    onAssignTM:   { tmId in
                        if let selectedKey = store.selectedSlotKey {
                            store.send(.assignSlot(slotKey: selectedKey, tmId: tmId))
                        }
                        store.send(.commandPaletteDismissed)
                    },
                    onClearSlot:  {
                        if let selectedKey = store.selectedSlotKey {
                            store.send(.unassignSlot(slotKey: selectedKey))
                        }
                        store.send(.commandPaletteDismissed)
                    },
                    onToggleLock: {
                        if let selectedKey = store.selectedSlotKey {
                            store.send(.toggleLock(slotKey: selectedKey))
                        }
                        store.send(.commandPaletteDismissed)
                    },
                    onPrevDay:    { store.send(.prevDayTapped);         store.send(.commandPaletteDismissed) },
                    onNextDay:    { store.send(.nextDayTapped);         store.send(.commandPaletteDismissed) },
                    onTonight:    { store.send(.goToTonight) },
                    onExport:     { store.send(.exportDeploymentBook);  store.send(.commandPaletteDismissed) },
                    onNotes:      { store.send(.showNightNotesTapped);  store.send(.commandPaletteDismissed) },
                    onBreaks:     { store.send(.showBreakTrackerTapped); store.send(.commandPaletteDismissed) },
                    onRefresh:    { store.send(.refreshTapped);         store.send(.commandPaletteDismissed) },
                    onSudo:       { store.send(.sudoPanelToggled);      store.send(.commandPaletteDismissed) }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.97, anchor: .center)))
            }
        }
        .animation(.spring(duration: 0.2, bounce: 0.05), value: store.isCommandPaletteOpen)

        // ── SUDO Admin Panel ──────────────────────────────────────────
        .fullScreenCover(isPresented: Binding(
            get: { store.isSudoPanelOpen },
            set: { if !$0 { store.send(.sudoPanelDismissed) } }
        )) {
            SudoPanelView(
                onClose: { store.send(.sudoPanelDismissed) },
                onDataChanged: { store.send(.refreshTapped) },
                currentNightId: store.night?.id
            )
        }
    }

    // MARK: - Loading Overlay

    private var loadingOverlay: some View {
        ZStack {
            Color.black.opacity(0.45).ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white)
                    .scaleEffect(1.5)
                Text("Loading shift data…")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.white.opacity(0.6))
            }
            .padding(32)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 14))
        }
        .transition(.opacity)
        .animation(.easeInOut(duration: 0.2), value: store.isLoading)
    }

    // MARK: - Error Banner

    private func errorBanner(message: String) -> some View {
        VStack {
            Spacer()
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color(red: 1.0, green: 0.78, blue: 0.25))
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.85))
                    .lineLimit(2)
                Spacer()
                Button { store.send(.refreshTapped) } label: {
                    Text("Retry")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color(red: 1.0, green: 0.78, blue: 0.25))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(red: 0.16, green: 0.08, blue: 0.08))
            .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.red.opacity(0.3)), alignment: .top)
        }
        .ignoresSafeArea(edges: .bottom)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.spring(duration: 0.3), value: store.errorMessage)
    }
}

// MARK: - Identifiable URL

private struct IdentifiableURL: Identifiable {
    let id = UUID()
    let url: URL
    init(_ url: URL) { self.url = url }
}

// MARK: - Share Sheet

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ uvc: UIActivityViewController, context: Context) {}
}

// MARK: - Night Notes Sheet

private struct NightNotesSheet: View {
    let notes: String
    var isSaved: Bool = false
    var onNotesChanged: (String) -> Void
    var onSave:    () -> Void
    var onDismiss: () -> Void

    @State private var text: String = ""

    var body: some View {
        NavigationStack {
            ZStack(alignment: .bottomTrailing) {
                TextEditor(text: $text)
                    .font(.system(size: 14))
                    .foregroundStyle(.white)
                    .scrollContentBackground(.hidden)
                    .padding()

                // "Saved" flash badge
                if isSaved {
                    HStack(spacing: 5) {
                        Image(systemName: "checkmark.circle.fill")
                        Text("Saved")
                    }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color(hex: "#4CAF50"))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color(hex: "#4CAF50").opacity(0.15)))
                    .padding(16)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
                }
            }
            .animation(.easeInOut(duration: 0.25), value: isSaved)
            .navigationTitle("Night Notes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onDismiss) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onNotesChanged(text); onSave() }.fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .onAppear { text = notes }
    }
}

// MARK: - Preview

#Preview {
    ShiftPlannerView(
        store: Store(
            initialState: {
                var s = ShiftPlannerState()
                s.teamMembers = TeamMember.mockRoster
                s.night = Night.mockTonight
                return s
            }()
        ) {
            ShiftPlannerFeature()
        }
    )
    .frame(width: 1194, height: 834)
}
