// ArtboardCanvasView.swift — Sprint 3 artboard-canvas redesign.
//
// Matches the ZDS Forge webapp (zds.glcrops.cloud) layout:
//   • Gray infinite canvas (two-axis ScrollView)
//   • Centered 900pt artboard "document" with drop shadow
//   • Pinch-to-zoom (MagnificationGesture) + zoom control overlay (−/100%/+)
//   • Sections: date header ▸ zones (5×2) ▸ restrooms (5×1 split) ▸
//               auxiliary (6×1) ▸ overlaps (PM 4-col + AM 6-col) ▸ notes
//   • Left-border accent cards (webapp style) — no top bar
//   • TM picker: sheet appears when tapping an empty slot
//   • Drag-drop from roster still supported via `onAssignTM`
//   • Swipe left/right for day navigation (same gesture as ShiftCanvasView)
//
// The existing ShiftCanvasView + RosterRailView are preserved but no longer
// shown — this view replaces them in ShiftPlannerView.

import SwiftUI
import UIKit

// MARK: - ArtboardCanvasView

struct ArtboardCanvasView: View {

    let state: ShiftPlannerState
    var onHoverSlot:        (String?) -> Void = { _ in }
    var onTapSlot:          (String) -> Void  = { _ in }
    var onAssignTM:         (String) -> Void  = { _ in }
    var onClearSlot:        () -> Void        = {}
    var onToggleLock:       () -> Void        = {}
    var onDismiss:          () -> Void        = {}
    var onPrevDay:          () -> Void        = {}
    var onNextDay:          () -> Void        = {}
    var pencilMode:         PencilMode        = .assign

    // Sprint 4: Break badges — passed from parent so the reducer owns truth
    var breakGroupsByUiKey: [String: Int]     = [:]
    var onCycleBreak:       (String) -> Void  = { _ in }

    // Sprint 4: Undo / Redo
    var canUndo:            Bool              = false
    var canRedo:            Bool              = false
    var onUndo:             () -> Void        = {}
    var onRedo:             () -> Void        = {}

    // MARK: - Local State

    @State private var zoomScale: CGFloat = 1.0
    @GestureState private var liveScale: CGFloat = 1.0

    /// TM picker — wraps slotKey in an Identifiable so .sheet(item:) guarantees
    /// the correct key is visible when the sheet opens (avoids the SwiftUI
    /// isPresented race where slotKey can lag one render behind visible = true).
    private struct TMPickerTarget: Identifiable {
        let slotKey: String
        var id: String { slotKey }
    }
    @State private var tmPickerTarget: TMPickerTarget? = nil

    /// Swipe gesture for day navigation
    @State private var dragTranslation: CGFloat = 0

    /// Drag-drop hover tracking
    @State private var dropTargetedSlotKey: String? = nil

    @Environment(\.colorScheme) private var colorScheme

    // MARK: - Artboard Dimensions
    //
    // Target: iPad Pro 13" — 1024pt portrait / 1366pt landscape.
    // At 1150pt wide the artboard fills portrait comfortably and
    // sits spaciously in landscape, matching the ZDS Forge webapp feel.

    private let artboardWidth: CGFloat = 960   // fits 1024pt portrait with canvas margins
    private let padH: CGFloat = 28    // horizontal inset inside artboard
    private let padV: CGFloat = 32    // vertical inset inside artboard
    private let gap:  CGFloat = 10    // inter-card spacing

    private var totalZoom: CGFloat {
        max(0.35, min(3.0, zoomScale * liveScale))
    }

    /// Fixed artboard height computed from section content.
    private var artboardHeight: CGFloat {
        let docHeader:  CGFloat = 96
        let sectionLbl: CGFloat = 34   // label row + top padding
        let zoneRow:    CGFloat = 112  // one zone card row (increased)
        let rrRow:      CGFloat = 104  // split RR card (two halves)
        let auxRow:     CGFloat = 78
        let ovRow:      CGFloat = 78
        let notesBox:   CGFloat = 88
        let secPad:     CGFloat = 28   // top+bottom per section (14+14)
        let divider:    CGFloat = 1

        let zones    = sectionLbl + zoneRow + gap + zoneRow + secPad
        let rrooms   = sectionLbl + rrRow   + secPad
        let aux      = sectionLbl + auxRow  + secPad
        // overlaps: label + PM sublabel + PM row + spacing + AM sublabel + AM row
        let ovlps    = sectionLbl + 22 + ovRow + gap + 22 + ovRow + secPad
        let notes    = sectionLbl + notesBox + secPad

        return docHeader + padV
             + (divider + zones)
             + (divider + rrooms)
             + (divider + aux)
             + (divider + ovlps)
             + (divider + notes)
             + padV
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            // ── Infinite canvas ───────────────────────────────────────
            // GeometryReader lets the clear spacer fill the full container
            // so the artboard stays perfectly centered when it fits in view.
            GeometryReader { geo in
                ScrollView([.horizontal, .vertical], showsIndicators: false) {
                    Color.clear
                        .frame(
                            // Always at least as large as the container so
                            // the overlay (artboard) renders centered.
                            width:  max(artboardWidth  * totalZoom + 160, geo.size.width),
                            height: max(artboardHeight * totalZoom + 160, geo.size.height)
                        )
                        .overlay {
                            artboardDocument
                                .frame(width: artboardWidth, height: artboardHeight)
                                .shadow(
                                    color: colorScheme == .dark
                                        ? .black.opacity(0.65)
                                        : .black.opacity(0.13),
                                    radius: 40, x: 0, y: 16
                                )
                                .scaleEffect(totalZoom, anchor: .center)
                        }
                }
                .background(canvasBackground)
                .contentShape(Rectangle())
                .onTapGesture { onDismiss() }
                // Pinch-to-zoom
                .gesture(
                    MagnificationGesture()
                        .updating($liveScale) { val, st, _ in st = val }
                        .onEnded { val in
                            let proposed = zoomScale * val
                            zoomScale = max(0.35, min(3.0, proposed))
                        }
                )
                // Swipe left/right for day navigation
                .gesture(
                    DragGesture(minimumDistance: 40, coordinateSpace: .local)
                        .onChanged { v in dragTranslation = v.translation.width }
                        .onEnded { v in
                            let w = v.translation.width
                            if abs(w) > 80 && abs(v.translation.height) < abs(w) {
                                if w < 0 { onNextDay() } else { onPrevDay() }
                            }
                            withAnimation { dragTranslation = 0 }
                        }
                )
                .overlay(alignment: .leading) {
                    swipeChevron("chevron.left",
                        opacity: dragTranslation > 30 ? min(0.85, (dragTranslation - 30) / 60) : 0)
                }
                .overlay(alignment: .trailing) {
                    swipeChevron("chevron.right",
                        opacity: dragTranslation < -30 ? min(0.85, (-dragTranslation - 30) / 60) : 0)
                }
                .dynamicTypeSize(.xSmall ... .xxLarge)
            }

            // ── Bottom controls row ───────────────────────────────────
            // Undo/redo at bottom-left, zoom at bottom-right.
            VStack {
                Spacer()
                HStack(alignment: .bottom) {
                    undoRedoControl
                        .padding(.leading, 20)
                        .padding(.bottom, 20)
                    Spacer()
                    zoomControl
                        .padding(.trailing, 20)
                        .padding(.bottom, 20)
                }
            }
            .allowsHitTesting(true)
        }
        // TM picker sheet — .sheet(item:) guarantees slotKey is correct when sheet opens.
        .sheet(item: $tmPickerTarget) { target in
            TMPickerSheet(
                state:    state,
                slotKey:  target.slotKey,
                onSelect: { tmId in
                    onTapSlot(target.slotKey)
                    onAssignTM(tmId)
                    tmPickerTarget = nil
                },
                onDismiss: { tmPickerTarget = nil }
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Artboard Document

    @ViewBuilder
    private var artboardDocument: some View {
        VStack(alignment: .leading, spacing: 0) {
            documentHeader

            artboardSection("ZONES", fillLabel: zoneFillLabel) { zonesGrid }
                .artboardDivider(colorScheme: colorScheme, above: true)

            artboardSection("RESTROOMS", fillLabel: rrFillLabel) { rrGrid }
                .artboardDivider(colorScheme: colorScheme, above: true)

            artboardSection("AUXILIARY", fillLabel: auxFillLabel) { auxGrid }
                .artboardDivider(colorScheme: colorScheme, above: true)

            artboardSection("OVERLAPS", fillLabel: overlapFillLabel) { overlapsGrid }
                .artboardDivider(colorScheme: colorScheme, above: true)

            artboardSection("NOTES & SIDE TASKS", fillLabel: nil) { notesArea }
        }
        .frame(width: artboardWidth, height: artboardHeight, alignment: .top)
        .background(artboardBg)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    // MARK: - Document Header

    private var documentHeader: some View {
        HStack(alignment: .center, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.selectedDate.formatted(.dateTime.weekday(.wide)).uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
                    .kerning(1.4)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(state.selectedDate.formatted(.dateTime.day()))
                        .font(.system(size: 34, weight: .bold))
                        .foregroundStyle(textPrimary)
                    Text(state.selectedDate.formatted(.dateTime.month(.wide).year()))
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            // Night lock badge
            if state.night?.isLocked == true {
                HStack(spacing: 5) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 10))
                    Text("LOCKED")
                        .font(.system(size: 9, weight: .bold))
                        .kerning(1.0)
                }
                .foregroundStyle(Color(hex: "#FFD700"))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color(hex: "#FFD700").opacity(0.12))
                .clipShape(Capsule())
            }
        }
        .padding(.horizontal, padH)
        .padding(.top, padV)
        .padding(.bottom, 14)
    }

    // MARK: - Section Wrapper

    @ViewBuilder
    private func artboardSection<Content: View>(
        _ title: String,
        fillLabel: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 7) {
                Text(title)
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.secondary)
                    .kerning(1.8)
                if let fill = fillLabel {
                    Text("·")
                        .foregroundStyle(.quaternary)
                    Text(fill)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, padH)
            .padding(.top, 14)

            content()
                .padding(.horizontal, padH)
                .padding(.bottom, 14)
        }
    }

    // MARK: - Zones Grid (5 × 2)

    private var zonesGrid: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: gap), count: 5)
        return LazyVGrid(columns: cols, spacing: gap) {
            ForEach(ZONE_DEFS) { def in
                let tmName      = state.tmName(for: def.key)
                let isLocked    = state.lockedSlotKeys.contains(def.key)
                let isSel       = state.selectedSlotKey == def.key
                let breakGroup  = breakGroupsByUiKey[def.key] ?? 0
                ABZoneCard(
                    def:            def,
                    tmName:         tmName,
                    isSelected:     isSel,
                    isLocked:       isLocked,
                    isDropTargeted: dropTargetedSlotKey == def.key,
                    tasks:          state.slotTasksByUiKey[def.key] ?? [],
                    colorScheme:    colorScheme,
                    breakGroup:     breakGroup,
                    onCycleBreak:   { onCycleBreak(def.key) }
                ) {
                    onTapSlot(def.key)
                    if tmName == nil { openPicker(for: def.key) }
                }
                .pencilHoverable(slotKey: def.key, onHover: onHoverSlot)
                .dropDestination(for: String.self) { tmIds, _ in
                    guard let tmId = tmIds.first, !isLocked,
                          state.night?.isLocked != true else { return false }
                    onTapSlot(def.key); onAssignTM(tmId); return true
                } isTargeted: { t in dropTargetedSlotKey = t ? def.key : nil }
                .contextMenu(tmName != nil ? ContextMenu {
                    Button { openPicker(for: def.key) } label: {
                        Label("Reassign", systemImage: "person.badge.plus")
                    }
                    Button { onTapSlot(def.key); onToggleLock() } label: {
                        Label(isLocked ? "Unlock" : "Lock",
                              systemImage: isLocked ? "lock.open" : "lock")
                    }
                    let bg = breakGroup
                    Button { onCycleBreak(def.key) } label: {
                        Label(bg == 0 ? "Set Break Group" : "Break \(bg) → \((bg % 3) + 1)",
                              systemImage: "arrow.triangle.2.circlepath")
                    }
                    Divider()
                    Button(role: .destructive) { onTapSlot(def.key); onClearSlot() } label: {
                        Label("Clear Slot", systemImage: "xmark.circle")
                    }
                } : nil)
            }
        }
    }

    // MARK: - RR Grid (5 × 1 — each card shows men's + women's split)

    private var rrGrid: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: gap), count: 5)
        return LazyVGrid(columns: cols, spacing: gap) {
            ForEach(RR_DEFS) { def in
                ABRRCard(
                    def:                  def,
                    mensTm:               state.tmName(for: def.mensKey),
                    womensTm:             state.tmName(for: def.womensKey),
                    isMensSelected:       state.selectedSlotKey == def.mensKey,
                    isWomensSelected:     state.selectedSlotKey == def.womensKey,
                    isMensLocked:         state.lockedSlotKeys.contains(def.mensKey),
                    isWomensLocked:       state.lockedSlotKeys.contains(def.womensKey),
                    colorScheme:          colorScheme,
                    mensBreakGroup:       breakGroupsByUiKey[def.mensKey] ?? 0,
                    womensBreakGroup:     breakGroupsByUiKey[def.womensKey] ?? 0,
                    onCycleMensBreak:     { onCycleBreak(def.mensKey) },
                    onCycleWomensBreak:   { onCycleBreak(def.womensKey) },
                    onTapMens: {
                        onTapSlot(def.mensKey)
                        if state.tmName(for: def.mensKey) == nil { openPicker(for: def.mensKey) }
                    },
                    onTapWomens: {
                        onTapSlot(def.womensKey)
                        if state.tmName(for: def.womensKey) == nil { openPicker(for: def.womensKey) }
                    },
                    onClearMens:        { onTapSlot(def.mensKey);   onClearSlot() },
                    onClearWomens:      { onTapSlot(def.womensKey); onClearSlot() },
                    onToggleLockMens:   { onTapSlot(def.mensKey);   onToggleLock() },
                    onToggleLockWomens: { onTapSlot(def.womensKey); onToggleLock() },
                    onReassignMens:     { openPicker(for: def.mensKey) },
                    onReassignWomens:   { openPicker(for: def.womensKey) }
                )
                // Men's side drop
                .dropDestination(for: String.self) { tmIds, _ in
                    guard let tmId = tmIds.first,
                          !state.lockedSlotKeys.contains(def.mensKey),
                          state.night?.isLocked != true else { return false }
                    onTapSlot(def.mensKey); onAssignTM(tmId); return true
                } isTargeted: { _ in }
            }
        }
    }

    // MARK: - AUX Grid (6 × 1)

    private var auxGrid: some View {
        let cols = Array(repeating: GridItem(.flexible(), spacing: gap), count: 6)
        return LazyVGrid(columns: cols, spacing: gap) {
            ForEach(DEFAULT_AUX_DEFS) { def in
                let tmName   = state.tmName(for: def.key)
                let isLocked = state.lockedSlotKeys.contains(def.key)
                ABSmallCard(
                    key:          def.key,
                    label:        def.label,
                    icon:         auxIcon(def.key),
                    accent:       auxAccent(def.key),
                    tmName:       tmName,
                    isSelected:   state.selectedSlotKey == def.key,
                    isLocked:     isLocked,
                    colorScheme:  colorScheme,
                    breakGroup:   breakGroupsByUiKey[def.key] ?? 0,
                    onCycleBreak: { onCycleBreak(def.key) }
                ) {
                    onTapSlot(def.key)
                    if tmName == nil { openPicker(for: def.key) }
                }
                .pencilHoverable(slotKey: def.key, onHover: onHoverSlot)
                .dropDestination(for: String.self) { tmIds, _ in
                    guard let tmId = tmIds.first, !isLocked,
                          state.night?.isLocked != true else { return false }
                    onTapSlot(def.key); onAssignTM(tmId); return true
                } isTargeted: { t in dropTargetedSlotKey = t ? def.key : nil }
                .contextMenu(tmName != nil ? ContextMenu {
                    Button { openPicker(for: def.key) } label: {
                        Label("Reassign", systemImage: "person.badge.plus")
                    }
                    Button { onTapSlot(def.key); onToggleLock() } label: {
                        Label(isLocked ? "Unlock" : "Lock",
                              systemImage: isLocked ? "lock.open" : "lock")
                    }
                    let bg = breakGroupsByUiKey[def.key] ?? 0
                    Button { onCycleBreak(def.key) } label: {
                        Label(bg == 0 ? "Set Break Group" : "Break \(bg) → \((bg % 3) + 1)",
                              systemImage: "arrow.triangle.2.circlepath")
                    }
                    Divider()
                    Button(role: .destructive) { onTapSlot(def.key); onClearSlot() } label: {
                        Label("Clear", systemImage: "xmark.circle")
                    }
                } : nil)
            }
        }
    }

    // MARK: - Overlaps (PM 4-col + AM 6-col)

    private var overlapsGrid: some View {
        let pmDefs = DEFAULT_OVERLAP_DEFS.filter { $0.key.hasPrefix("PM") }
        let amDefs = DEFAULT_OVERLAP_DEFS.filter { $0.key.hasPrefix("AM") }
        let pmCols = Array(repeating: GridItem(.flexible(), spacing: gap), count: 4)
        let amCols = Array(repeating: GridItem(.flexible(), spacing: gap), count: 6)

        return VStack(alignment: .leading, spacing: gap) {
            // PM sub-label
            HStack(spacing: 6) {
                Image(systemName: "sun.haze.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(Color(hex: "#FFA726"))
                Text("PM OVERLAP")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(Color(hex: "#FFA726"))
                    .kerning(1.2)
            }
            LazyVGrid(columns: pmCols, spacing: gap) {
                ForEach(pmDefs) { def in overlapCard(def) }
            }

            // AM sub-label
            HStack(spacing: 6) {
                Image(systemName: "sunrise.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(Color(hex: "#42A5F5"))
                Text("AM OVERLAP")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(Color(hex: "#42A5F5"))
                    .kerning(1.2)
            }
            LazyVGrid(columns: amCols, spacing: gap) {
                ForEach(amDefs) { def in overlapCard(def) }
            }
        }
    }

    @ViewBuilder
    private func overlapCard(_ def: OverlapDef) -> some View {
        let tmName   = state.tmName(for: def.key)
        let isLocked = state.lockedSlotKeys.contains(def.key)
        ABSmallCard(
            key:          def.key,
            label:        def.label,
            icon:         overlapIcon(def.key),
            accent:       overlapAccent(def.key),
            tmName:       tmName,
            isSelected:   state.selectedSlotKey == def.key,
            isLocked:     isLocked,
            colorScheme:  colorScheme,
            breakGroup:   breakGroupsByUiKey[def.key] ?? 0,
            onCycleBreak: { onCycleBreak(def.key) }
        ) {
            onTapSlot(def.key)
            if tmName == nil { openPicker(for: def.key) }
        }
        .pencilHoverable(slotKey: def.key, onHover: onHoverSlot)
        .dropDestination(for: String.self) { tmIds, _ in
            guard let tmId = tmIds.first, !isLocked,
                  state.night?.isLocked != true else { return false }
            onTapSlot(def.key); onAssignTM(tmId); return true
        } isTargeted: { t in dropTargetedSlotKey = t ? def.key : nil }
        .contextMenu(tmName != nil ? ContextMenu {
            Button { openPicker(for: def.key) } label: {
                Label("Reassign", systemImage: "person.badge.plus")
            }
            Button { onTapSlot(def.key); onToggleLock() } label: {
                Label(isLocked ? "Unlock" : "Lock",
                      systemImage: isLocked ? "lock.open" : "lock")
            }
            let bg = breakGroupsByUiKey[def.key] ?? 0
            Button { onCycleBreak(def.key) } label: {
                Label(bg == 0 ? "Set Break Group" : "Break \(bg) → \((bg % 3) + 1)",
                      systemImage: "arrow.triangle.2.circlepath")
            }
            Divider()
            Button(role: .destructive) { onTapSlot(def.key); onClearSlot() } label: {
                Label("Clear", systemImage: "xmark.circle")
            }
        } : nil)
    }

    // MARK: - Notes Area

    private var notesArea: some View {
        let text = state.night?.notes ?? ""
        return ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(divColor, lineWidth: 1)
                .frame(maxWidth: .infinity)
                .frame(height: 88)
            Text(text.isEmpty ? "Night notes…" : text)
                .font(.system(size: 13))
                .foregroundStyle(text.isEmpty ? Color.secondary.opacity(0.4) : textPrimary)
                .padding(12)
                .allowsHitTesting(false)
        }
    }

    // MARK: - Zoom Control

    private var zoomControl: some View {
        HStack(spacing: 0) {
            Button {
                withAnimation(.spring(duration: 0.2)) {
                    zoomScale = max(0.35, zoomScale - 0.25)
                }
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)

            Button {
                withAnimation(.spring(duration: 0.2)) { zoomScale = 1.0 }
            } label: {
                Text("\(Int(totalZoom * 100))%")
                    .font(.system(size: 10, weight: .semibold))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 32)
            }
            .buttonStyle(.plain)

            Button {
                withAnimation(.spring(duration: 0.2)) {
                    zoomScale = min(3.0, zoomScale + 0.25)
                }
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
        }
        .glassEffect(.regular, in: Capsule())
    }

    // MARK: - Undo/Redo Control

    private var undoRedoControl: some View {
        HStack(spacing: 0) {
            Button(action: onUndo) {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(canUndo ? Color.secondary : Color.secondary.opacity(0.28))
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .disabled(!canUndo)
            .accessibilityLabel("Undo")

            Color.secondary.opacity(0.25).frame(width: 1, height: 16)

            Button(action: onRedo) {
                Image(systemName: "arrow.uturn.forward")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(canRedo ? Color.secondary : Color.secondary.opacity(0.28))
                    .frame(width: 32, height: 32)
            }
            .buttonStyle(.plain)
            .disabled(!canRedo)
            .accessibilityLabel("Redo")
        }
        .glassEffect(.regular, in: Capsule())
    }

    // MARK: - Swipe Chevrons

    private func swipeChevron(_ name: String, opacity: Double) -> some View {
        Image(systemName: name)
            .font(.system(size: 28, weight: .semibold))
            .foregroundStyle(.secondary.opacity(opacity * 0.8))
            .shadow(color: .black.opacity(0.4), radius: 6)
            .frame(width: 48, height: 100)
            .allowsHitTesting(false)
            .animation(.easeOut(duration: 0.1), value: opacity)
    }

    // MARK: - Helpers

    private func openPicker(for slotKey: String) {
        tmPickerTarget = TMPickerTarget(slotKey: slotKey)
    }

    @ViewBuilder
    private var canvasBackground: some View {
        if colorScheme == .dark {
            Color(red: 0.07, green: 0.08, blue: 0.10)
        } else {
            Color(hex: "#E2E2E2")
        }
    }

    @ViewBuilder
    private var artboardBg: some View {
        if colorScheme == .dark {
            Color(red: 0.13, green: 0.15, blue: 0.18)
        } else {
            Color.white
        }
    }

    private var textPrimary: Color {
        colorScheme == .dark ? .white : Color(red: 0.08, green: 0.08, blue: 0.10)
    }

    private var divColor: Color {
        colorScheme == .dark ? Color.white.opacity(0.07) : Color.black.opacity(0.07)
    }

    // Fill labels
    private var zoneFillLabel: String {
        let n = ZONE_DEFS.filter { state.tmName(for: $0.key) != nil }.count
        return "\(n)/\(ZONE_DEFS.count) FILLED"
    }
    private var rrFillLabel: String {
        let keys = RR_DEFS.flatMap { [$0.mensKey, $0.womensKey] }
        let n = keys.filter { state.tmName(for: $0) != nil }.count
        return "\(n)/\(keys.count) FILLED"
    }
    private var auxFillLabel: String {
        let n = DEFAULT_AUX_DEFS.filter { state.tmName(for: $0.key) != nil }.count
        return "\(n)/\(DEFAULT_AUX_DEFS.count) FILLED"
    }
    private var overlapFillLabel: String {
        let n = DEFAULT_OVERLAP_DEFS.filter { state.tmName(for: $0.key) != nil }.count
        return "\(n)/\(DEFAULT_OVERLAP_DEFS.count) FILLED"
    }
}

// MARK: - Artboard Divider Modifier

private extension View {
    @ViewBuilder
    func artboardDivider(colorScheme: ColorScheme, above: Bool) -> some View {
        let div = Divider()
            .background(colorScheme == .dark
                        ? Color.white.opacity(0.07)
                        : Color.black.opacity(0.07))
        if above {
            VStack(spacing: 0) {
                div
                self
            }
        } else {
            VStack(spacing: 0) {
                self
                div
            }
        }
    }
}

// MARK: - ABZoneCard (left-border accent, artboard style)

private struct ABZoneCard: View {
    let def:            ZoneDef
    let tmName:         String?
    var isSelected:     Bool = false
    var isLocked:       Bool = false
    var isDropTargeted: Bool = false
    var tasks:          [SlotTask] = []
    let colorScheme:    ColorScheme
    var breakGroup:     Int          = 0
    var onCycleBreak:   () -> Void   = {}
    var onTap:          () -> Void   = {}

    private var accent:   Color  { zoneAccent(def.key) }
    private var icon:     String { zoneIcon(def.key) }
    private var isFilled: Bool   { tmName != nil }

    var body: some View {
        Button(action: onTap) {
            cardLabel
        }
        .buttonStyle(.plain)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 5))
        .overlay { cardBorder }
        .opacity(isFilled || isSelected ? 1.0 : 0.55)
        .animation(.easeInOut(duration: 0.15), value: isFilled)
        .accessibilityLabel("\(def.label), \(tmName ?? "Unfilled")")
        .accessibilityValue(isLocked ? "Locked" : (isFilled ? "Filled" : "Empty"))
        .accessibilityHint("Double-tap to \(isFilled ? "manage" : "assign a team member")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var cardLabel: some View {
        HStack(spacing: 0) {
            // Left accent bar
            accent.frame(width: 5)
            // Body
            VStack(alignment: .leading, spacing: 5) {
                // Zone label row
                HStack(spacing: 4) {
                    Text(icon)
                        .font(.system(size: 10))
                        .foregroundStyle(accent)
                    Text(def.label)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(accent)
                        .kerning(0.7)
                    Spacer()
                    if isLocked {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                    }
                    // Break badge — only when an active group is set (1–3)
                    if breakGroup > 0 {
                        BreakBadge(group: breakGroup, onCycle: onCycleBreak)
                    }
                }
                // TM name — the hero text, large and readable
                Text(tmName ?? "—")
                    .font(.system(size: 16, weight: isFilled ? .semibold : .regular))
                    .foregroundStyle(isFilled ? textColor : Color.secondary.opacity(0.4))
                    .lineLimit(1)
                // Slot tasks (accent tinted)
                ForEach(tasks) { task in
                    Text(task.taskLabel)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(accent.opacity(0.75))
                        .lineLimit(1)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var cardBorder: some View {
        let strokeColor: Color = isDropTargeted ? Color(hex: "#FFD700")
                                : isSelected    ? accent.opacity(0.55)
                                : isFilled      ? .clear
                                :                 Color.secondary.opacity(0.15)
        let strokeStyle: StrokeStyle = isFilled && !isSelected && !isDropTargeted
            ? StrokeStyle(lineWidth: 1)
            : isSelected || isDropTargeted
                ? StrokeStyle(lineWidth: 2)
                : StrokeStyle(lineWidth: 1, dash: [5, 3])
        return RoundedRectangle(cornerRadius: 5)
            .strokeBorder(strokeColor, style: strokeStyle)
    }

    private var textColor: Color {
        colorScheme == .dark ? .white : Color(red: 0.08, green: 0.08, blue: 0.10)
    }
    private var cardBg: Color {
        if colorScheme == .dark {
            return isSelected
                ? Color(red: 0.19, green: 0.21, blue: 0.27)
                : Color(red: 0.16, green: 0.18, blue: 0.22)
        } else {
            return isSelected
                ? Color(red: 0.92, green: 0.95, blue: 1.0)
                : Color(red: 0.97, green: 0.97, blue: 0.98)
        }
    }
}

// MARK: - ABRRCard (split men's / women's, left-border per half)

private struct ABRRCard: View {
    let def:                  RRDef
    let mensTm:               String?
    let womensTm:             String?
    var isMensSelected:       Bool = false
    var isWomensSelected:     Bool = false
    var isMensLocked:         Bool = false
    var isWomensLocked:       Bool = false
    let colorScheme:          ColorScheme
    var mensBreakGroup:       Int          = 0
    var womensBreakGroup:     Int          = 0
    var onCycleMensBreak:     () -> Void   = {}
    var onCycleWomensBreak:   () -> Void   = {}
    var onTapMens:            () -> Void = {}
    var onTapWomens:          () -> Void = {}
    var onClearMens:          () -> Void = {}
    var onClearWomens:        () -> Void = {}
    var onToggleLockMens:     () -> Void = {}
    var onToggleLockWomens:   () -> Void = {}
    var onReassignMens:       () -> Void = {}
    var onReassignWomens:     () -> Void = {}

    private let mensAccent:   Color = Color(hex: "#1976D2")
    private let womensAccent: Color = Color(hex: "#B7679A")
    private var divColor: Color {
        colorScheme == .dark ? Color.white.opacity(0.07) : Color.black.opacity(0.07)
    }

    var body: some View {
        VStack(spacing: 0) {
            rrHalf(
                label:        "MEN'S",
                tmName:       mensTm,
                isSelected:   isMensSelected,
                isLocked:     isMensLocked,
                accent:       mensAccent,
                breakGroup:   mensBreakGroup,
                onCycleBreak: onCycleMensBreak,
                onTap:        onTapMens
            )
            .contextMenu(mensTm != nil ? ContextMenu {
                Button(action: onReassignMens)   { Label("Reassign", systemImage: "person.badge.plus") }
                Button(action: onToggleLockMens) { Label(isMensLocked ? "Unlock" : "Lock", systemImage: isMensLocked ? "lock.open" : "lock") }
                Button(action: onCycleMensBreak) {
                    Label(mensBreakGroup == 0 ? "Set Break Group" : "Break \(mensBreakGroup) → \((mensBreakGroup % 3) + 1)",
                          systemImage: "arrow.triangle.2.circlepath")
                }
                Divider()
                Button(role: .destructive, action: onClearMens) { Label("Clear", systemImage: "xmark.circle") }
            } : nil)

            Divider().background(divColor)

            rrHalf(
                label:        "WOMEN'S",
                tmName:       womensTm,
                isSelected:   isWomensSelected,
                isLocked:     isWomensLocked,
                accent:       womensAccent,
                breakGroup:   womensBreakGroup,
                onCycleBreak: onCycleWomensBreak,
                onTap:        onTapWomens
            )
            .contextMenu(womensTm != nil ? ContextMenu {
                Button(action: onReassignWomens)   { Label("Reassign", systemImage: "person.badge.plus") }
                Button(action: onToggleLockWomens) { Label(isWomensLocked ? "Unlock" : "Lock", systemImage: isWomensLocked ? "lock.open" : "lock") }
                Button(action: onCycleWomensBreak) {
                    Label(womensBreakGroup == 0 ? "Set Break Group" : "Break \(womensBreakGroup) → \((womensBreakGroup % 3) + 1)",
                          systemImage: "arrow.triangle.2.circlepath")
                }
                Divider()
                Button(role: .destructive, action: onClearWomens) { Label("Clear", systemImage: "xmark.circle") }
            } : nil)
        }
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 5))
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .strokeBorder(Color.secondary.opacity(0.12), lineWidth: 1)
        )
        // RR number badge (top-right)
        .overlay(alignment: .topTrailing) {
            Text(def.label)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.secondary)
                .kerning(0.5)
                .padding(.horizontal, 5)
                .padding(.vertical, 3)
                .background(Color.secondary.opacity(0.09))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .padding(5)
        }
    }

    private func rrHalf(
        label: String,
        tmName: String?,
        isSelected: Bool,
        isLocked: Bool,
        accent: Color,
        breakGroup: Int = 0,
        onCycleBreak: @escaping () -> Void = {},
        onTap: @escaping () -> Void
    ) -> some View {
        let filled = tmName != nil
        return Button(action: onTap) {
            HStack(spacing: 0) {
                accent.frame(width: 4)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 4) {
                        Text(label)
                            .font(.system(size: 7, weight: .bold))
                            .foregroundStyle(accent)
                            .kerning(0.8)
                        Spacer()
                        if isLocked {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 7))
                                .foregroundStyle(.secondary)
                        }
                        // Break badge — only when an active group is set (1–3)
                        if breakGroup > 0 {
                            BreakBadge(group: breakGroup, onCycle: onCycleBreak)
                        }
                    }
                    Text(tmName ?? "—")
                        .font(.system(size: 13, weight: filled ? .semibold : .regular))
                        .foregroundStyle(filled ? textColor : Color.secondary.opacity(0.4))
                        .lineLimit(1)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(isSelected ? accent.opacity(0.09) : Color.clear)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label), \(tmName ?? "Unfilled")")
    }

    private var textColor: Color {
        colorScheme == .dark ? .white : Color(red: 0.08, green: 0.08, blue: 0.10)
    }
    private var cardBg: Color {
        colorScheme == .dark
            ? Color(red: 0.16, green: 0.18, blue: 0.22)
            : Color(red: 0.97, green: 0.97, blue: 0.98)
    }
}

// MARK: - ABSmallCard (AUX / Overlap — compact left-border)

private struct ABSmallCard: View {
    let key:          String
    let label:        String
    let icon:         String
    let accent:       Color
    let tmName:       String?
    var isSelected:   Bool       = false
    var isLocked:     Bool       = false
    let colorScheme:  ColorScheme
    var breakGroup:   Int        = 0
    var onCycleBreak: () -> Void = {}
    var onTap:        () -> Void = {}

    private var isFilled: Bool { tmName != nil }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 0) {
                accent.frame(width: 4)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        Text(icon)
                            .font(.system(size: 9))
                            .foregroundStyle(accent)
                        Text(label)
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(accent)
                            .kerning(0.7)
                        Spacer()
                        if isLocked {
                            Image(systemName: "lock.fill")
                                .font(.system(size: 8))
                                .foregroundStyle(.secondary)
                        }
                        // Break badge — only when an active group is set (1–3)
                        if breakGroup > 0 {
                            BreakBadge(group: breakGroup, onCycle: onCycleBreak)
                        }
                    }
                    Text(tmName ?? "—")
                        .font(.system(size: 12, weight: isFilled ? .semibold : .regular))
                        .foregroundStyle(isFilled ? textColor : Color.secondary.opacity(0.4))
                        .lineLimit(1)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .background(cardBg)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay {
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(
                    isSelected ? accent.opacity(0.55) :
                    isFilled   ? Color.clear :
                    Color.secondary.opacity(0.15),
                    style: isFilled && !isSelected
                        ? StrokeStyle(lineWidth: 1)
                        : isSelected
                            ? StrokeStyle(lineWidth: 2)
                            : StrokeStyle(lineWidth: 1, dash: [4, 3])
                )
        }
        .opacity(isFilled || isSelected ? 1.0 : 0.55)
        .animation(.easeInOut(duration: 0.15), value: isFilled)
        .accessibilityLabel("\(label), \(tmName ?? "Unfilled")")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var textColor: Color {
        colorScheme == .dark ? .white : Color(red: 0.08, green: 0.08, blue: 0.10)
    }
    private var cardBg: Color {
        if colorScheme == .dark {
            return isSelected
                ? Color(red: 0.19, green: 0.21, blue: 0.27)
                : Color(red: 0.16, green: 0.18, blue: 0.22)
        } else {
            return isSelected
                ? Color(red: 0.92, green: 0.95, blue: 1.0)
                : Color(red: 0.97, green: 0.97, blue: 0.98)
        }
    }
}

// MARK: - BreakBadge (Sprint 4)
//
// Tappable chip that cycles a slot through break groups 0–3.
// Group 0 = no break assigned (shows "–", grey).
// Groups 1–3 = break group number (shows "1"/"2"/"3", dark bg).
// The badge sits in the top-right corner of each card's label row.

private struct BreakBadge: View {
    let group:   Int           // 0 = off, 1–3 = group
    var onCycle: () -> Void = {}

    var body: some View {
        Button(action: onCycle) {
            Text(group == 0 ? "–" : "\(group)")
                .font(.system(size: 8, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(group == 0 ? Color.secondary.opacity(0.5) : .white)
                .frame(width: 16, height: 12)
                .background(
                    RoundedRectangle(cornerRadius: 3)
                        .fill(group == 0
                              ? Color(hex: "#9CA3AF").opacity(0.22)
                              : Color(hex: "#1C1C1E"))
                )
        }
        .buttonStyle(.plain)
        // Expanded hit area without changing visible size
        .padding(.horizontal, 5)
        .padding(.vertical, 5)
        .contentShape(Rectangle())
        .accessibilityLabel(group == 0 ? "No break group" : "Break group \(group)")
        .accessibilityHint("Tap to cycle break group")
        .animation(.easeInOut(duration: 0.12), value: group)
    }
}

// MARK: - TMPickerSheet

private struct TMPickerSheet: View {
    let state:     ShiftPlannerState
    let slotKey:   String
    var onSelect:  (String) -> Void = { _ in }
    var onDismiss: () -> Void       = {}

    @State  private var query: String = ""
    @FocusState private var focused: Bool

    // Sprint 4: Eligibility filtering — mirrors webapp's isEligibleForSlot().
    // Only TMs who can legitimately work this slot type are shown.
    private func isEligible(_ tm: TeamMember, for key: String) -> Bool {
        let k = key.uppercased()
        // AM/PM overlaps: matched by gravePool
        if k.hasPrefix("AM_OV") || k.hasPrefix("AM") {
            return tm.gravePool == "AM" || tm.gravePool == "Full"
        }
        if k.hasPrefix("PM_OV") || k.hasPrefix("PM") {
            return tm.gravePool == "PM" || tm.gravePool == "Full"
        }
        // Grave-eligible base: pool must be "Grave" or "Full"
        let isGrave = tm.gravePool == "Grave" || tm.gravePool == "Full"
        guard isGrave else { return false }
        // Men's restrooms: male or gender unknown
        if k.hasPrefix("MRR") { return tm.isMale || tm.gender == nil }
        // Women's restrooms: must be female
        if k.hasPrefix("WRR") { return tm.isFemale }
        // Zones, AUX (admin, trash, z9_sr, sweeper) — any grave-eligible TM
        return true
    }

    private var sortedTMs: [TeamMember] {
        state.rosterTeamMembers
            .filter { isEligible($0, for: slotKey) }
            .sorted { $0.name < $1.name }
    }
    private var filtered: [TeamMember] {
        query.isEmpty ? sortedTMs
                      : sortedTMs.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Search bar
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    TextField("Search team members…", text: $query)
                        .focused($focused)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !query.isEmpty {
                        Button { query = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.secondary.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

                Divider()

                if filtered.isEmpty {
                    Spacer()
                    Text("No team members match \"\(query)\"")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                    Spacer()
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {
                            ForEach(filtered) { tm in
                                tmRow(tm)
                                Divider().padding(.leading, 68)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Assign Team Member")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel", action: onDismiss)
                }
            }
        }
        .onAppear { focused = true }
    }

    // Extracted to avoid "unable to type-check" timeout on complex body
    @ViewBuilder
    private func tmRow(_ tm: TeamMember) -> some View {
        let isAssigned = state.assignmentsBySlotKey.values.contains(tm.tmId)
        let accent = tm.isMale ? Color(hex: "#1976D2") : Color(hex: "#B7679A")
        Button { onSelect(tm.tmId) } label: {
            HStack(spacing: 14) {
                Circle()
                    .fill(accent.opacity(0.14))
                    .frame(width: 38, height: 38)
                    .overlay {
                        Text(String(tm.name.prefix(1)))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(accent)
                    }
                VStack(alignment: .leading, spacing: 2) {
                    Text(tm.name)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(isAssigned ? Color.secondary : Color.primary)
                    if isAssigned {
                        Text("Already assigned elsewhere")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if isAssigned {
                    Image(systemName: "person.fill.checkmark")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
