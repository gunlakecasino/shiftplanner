// ShiftCanvasView.swift — The main planning canvas.
//
// Layout:
//   Left rail: Roster (Canvas.rosterWidth = 200pt)
//   Main area: Zone grid → RR section → AUX section → Overlaps section
//
// Interaction model:
//   • Tap card           → select slot (shows roster assign controls)
//   • Tap canvas BG      → dismiss selection (tap-outside)
//   • Swipe left/right   → next/prev day
//   • Long-press card    → context menu (Reassign / Lock / Clear)
//   • Drag TM chip → drop on card → assign
//   • Pencil Pro 2 hover → hover highlight via UIHoverGestureRecognizer

import SwiftUI
import UIKit

struct ShiftCanvasView: View {

    let state: ShiftPlannerState
    var onHoverSlot:    (String?) -> Void = { _ in }
    var onTapSlot:      (String) -> Void  = { _ in }
    var onAssignTM:     (String) -> Void  = { _ in }
    var onClearSlot:    () -> Void        = { }
    var onToggleLock:   () -> Void        = { }
    var onDismiss:      () -> Void        = { }
    var onPrevDay:      () -> Void        = { }
    var onNextDay:      () -> Void        = { }

    // P2-12: pencil mode affects canvas interaction
    var pencilMode: PencilMode = .assign

    // Swipe gesture state
    @State private var dragTranslation: CGFloat = 0

    // P1-11: tracks which slot key a TM chip is currently hovering over during drag
    @State private var dropTargetedSlotKey: String? = nil

    // MARK: - Body

    var body: some View {
        HStack(spacing: 0) {
            // Left: Roster rail
            RosterRailView(
                teamMembers: state.rosterTeamMembers,
                assignmentsBySlotKey: state.assignmentsBySlotKey,
                lockedSlotKeys: state.lockedSlotKeys,
                selectedSlotKey: state.selectedSlotKey,
                onAssignTM:   onAssignTM,
                onClearSlot:  onClearSlot,
                onToggleLock: onToggleLock
            )

            Divider()
                .background(Color.white.opacity(0.08))

            // Right: Canvas — P1-15: empty state when no TMs are loaded
            // P1-02: cap Dynamic Type so the fixed-dimension card grid doesn't overflow
            // (shown over the scroll area; canvas is still behind it so layout
            //  doesn't collapse during the initial data fetch transition)
            if state.teamMembers.isEmpty && !state.isLoading {
                canvasEmptyState
            } else {
            ScrollView([.horizontal, .vertical], showsIndicators: false) {
                canvasContent
                    .padding(Canvas.sectionSpacing)
                    // Tap-outside-to-dismiss
                    .background(
                        Color(red: 0.11, green: 0.13, blue: 0.16)
                            .contentShape(Rectangle())
                            .onTapGesture { onDismiss() }
                    )
                    // Swipe left/right to change date
                    .gesture(
                        DragGesture(minimumDistance: 40, coordinateSpace: .local)
                            .onChanged { v in dragTranslation = v.translation.width }
                            .onEnded { v in
                                let w = v.translation.width
                                if abs(w) > 80 && abs(v.translation.height) < abs(w) {
                                    if w < 0 { onNextDay() } else { onPrevDay() }
                                }
                                dragTranslation = 0
                            }
                    )
            }
            // P2-06: Edge chevron affordances — fade in as the user swipes
            .overlay(alignment: .leading) {
                swipeChevron(systemName: "chevron.left",
                             opacity: dragTranslation > 30
                                ? min(0.85, (dragTranslation - 30) / 60)
                                : 0)
            }
            .overlay(alignment: .trailing) {
                swipeChevron(systemName: "chevron.right",
                             opacity: dragTranslation < -30
                                ? min(0.85, (-dragTranslation - 30) / 60)
                                : 0)
            }
            .background(Color(red: 0.11, green: 0.13, blue: 0.16))
            .dynamicTypeSize(.xSmall ... .xxLarge)  // P1-02: guard fixed-width card grid
            } // end else (team members not empty)
        }
    }

    // MARK: - Canvas Empty State (P1-15)

    private var canvasEmptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 44))
                .foregroundStyle(.white.opacity(0.12))
            Text("No TMs loaded for tonight")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.white.opacity(0.3))
            Text("Tap ↻ to refresh")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.18))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.11, green: 0.13, blue: 0.16))
    }

    // MARK: - Canvas Content

    private var canvasContent: some View {
        VStack(alignment: .leading, spacing: Canvas.sectionSpacing) {

            // ── ZONES ────────────────────────────────────────────────────
            sectionHeader(title: "ZONES", filled: filledZoneCount, total: ZONE_DEFS.count)
            zoneGrid

            // ── RESTROOMS ────────────────────────────────────────────────
            sectionHeader(title: "RESTROOMS", filled: filledRRCount, total: RR_DEFS.count * 2)
            rrGrid

            // ── AUXILIARY ────────────────────────────────────────────────
            sectionHeader(title: "AUXILIARY", filled: filledAuxCount, total: DEFAULT_AUX_DEFS.count)
            auxGrid

            // ── OVERLAPS ─────────────────────────────────────────────────
            sectionHeader(title: "OVERLAPS", filled: filledOverlapCount, total: DEFAULT_OVERLAP_DEFS.count)
            overlapGrid
        }
    }

    // MARK: - Zone Grid (2 rows × 5 cols)

    private var zoneGrid: some View {
        let rows = [GridItem(.fixed(Canvas.zoneCardHeight), spacing: Canvas.cardSpacing),
                    GridItem(.fixed(Canvas.zoneCardHeight), spacing: Canvas.cardSpacing)]
        return LazyHGrid(rows: rows, spacing: Canvas.cardSpacing) {
            ForEach(ZONE_DEFS) { def in
                let filled = state.tmName(for: def.key) != nil
                let locked = state.lockedSlotKeys.contains(def.key)
                ZoneCardView(
                    zoneDef: def,
                    tmName: state.tmName(for: def.key),
                    isLocked: locked,
                    isHovered: state.hoveredSlotKey == def.key,
                    isSelected: state.selectedSlotKey == def.key,
                    isDropTargeted: dropTargetedSlotKey == def.key,
                    tasks: state.slotTasksByUiKey[def.key] ?? [],
                    onTap: { onTapSlot(def.key) }
                )
                .pencilHoverable(slotKey: def.key, onHover: onHoverSlot)
                // Drag-drop target — P1-11: wire isTargeted for gold highlight
                //                   P1-20: guard against night-level lock
                .dropDestination(for: String.self) { tmIds, _ in
                    guard let tmId = tmIds.first, !locked,
                          state.night?.isLocked != true else { return false }
                    onTapSlot(def.key)
                    onAssignTM(tmId)
                    return true
                } isTargeted: { targeted in
                    dropTargetedSlotKey = targeted ? def.key : nil
                }
                // Long-press context menu (filled slots only)
                .contextMenu(filled ? ContextMenu {
                    Button { onTapSlot(def.key) } label: {
                        Label("Reassign", systemImage: "person.badge.plus")
                    }
                    Button { onTapSlot(def.key); onToggleLock() } label: {
                        Label(locked ? "Unlock" : "Lock", systemImage: locked ? "lock.open" : "lock")
                    }
                    Divider()
                    Button(role: .destructive) { onTapSlot(def.key); onClearSlot() } label: {
                        Label("Clear", systemImage: "xmark.circle")
                    }
                } : nil)
            }
        }
    }

    // MARK: - RR Grid

    private var rrGrid: some View {
        let rows = [GridItem(.fixed(Canvas.zoneCardHeight), spacing: Canvas.cardSpacing),
                    GridItem(.fixed(Canvas.zoneCardHeight), spacing: Canvas.cardSpacing)]
        return LazyHGrid(rows: rows, spacing: Canvas.cardSpacing) {
            ForEach(RR_DEFS) { def in
                RRCardView(
                    rrDef: def,
                    mensTmName: state.tmName(for: def.mensKey),
                    womensTmName: state.tmName(for: def.womensKey),
                    mensHovered: state.hoveredSlotKey == def.mensKey,
                    womensHovered: state.hoveredSlotKey == def.womensKey,
                    isMensSelected: state.selectedSlotKey == def.mensKey,
                    isWomensSelected: state.selectedSlotKey == def.womensKey,
                    onTapMens: { onTapSlot(def.mensKey) },
                    onTapWomens: { onTapSlot(def.womensKey) },
                    onAssignMens: { tmId in onTapSlot(def.mensKey); onAssignTM(tmId) },
                    onAssignWomens: { tmId in onTapSlot(def.womensKey); onAssignTM(tmId) },
                    onClearMens: { onTapSlot(def.mensKey); onClearSlot() },
                    onClearWomens: { onTapSlot(def.womensKey); onClearSlot() },
                    onToggleLockMens: { onTapSlot(def.mensKey); onToggleLock() },
                    onToggleLockWomens: { onTapSlot(def.womensKey); onToggleLock() },
                    isMensLocked: state.lockedSlotKeys.contains(def.mensKey),
                    isWomensLocked: state.lockedSlotKeys.contains(def.womensKey),
                    mensTasks: state.slotTasksByUiKey[def.mensKey] ?? [],
                    womensTasks: state.slotTasksByUiKey[def.womensKey] ?? []
                )
            }
        }
    }

    // MARK: - AUX Grid

    private var auxGrid: some View {
        let rows = [GridItem(.fixed(Canvas.auxCardHeight), spacing: Canvas.cardSpacing),
                    GridItem(.fixed(Canvas.auxCardHeight), spacing: Canvas.cardSpacing)]
        return LazyHGrid(rows: rows, spacing: Canvas.cardSpacing) {
            ForEach(DEFAULT_AUX_DEFS) { def in
                let filled = state.tmName(for: def.key) != nil
                let locked = state.lockedSlotKeys.contains(def.key)
                AuxCardView(
                    auxDef: def,
                    tmName: state.tmName(for: def.key),
                    isHovered: state.hoveredSlotKey == def.key,
                    isSelected: state.selectedSlotKey == def.key,
                    isDropTargeted: dropTargetedSlotKey == def.key,
                    tasks: state.slotTasksByUiKey[def.key] ?? [],
                    onTap: { onTapSlot(def.key) }
                )
                .pencilHoverable(slotKey: def.key, onHover: onHoverSlot)
                .dropDestination(for: String.self) { tmIds, _ in
                    guard let tmId = tmIds.first, !locked,
                          state.night?.isLocked != true else { return false }
                    onTapSlot(def.key)
                    onAssignTM(tmId)
                    return true
                } isTargeted: { targeted in
                    dropTargetedSlotKey = targeted ? def.key : nil
                }
                .contextMenu(filled ? ContextMenu {
                    Button { onTapSlot(def.key) } label: {
                        Label("Reassign", systemImage: "person.badge.plus")
                    }
                    Button { onTapSlot(def.key); onToggleLock() } label: {
                        Label(locked ? "Unlock" : "Lock", systemImage: locked ? "lock.open" : "lock")
                    }
                    Divider()
                    Button(role: .destructive) { onTapSlot(def.key); onClearSlot() } label: {
                        Label("Clear", systemImage: "xmark.circle")
                    }
                } : nil)
            }
        }
    }

    // MARK: - Overlap Grid

    private var overlapGrid: some View {
        let rows = [GridItem(.fixed(Canvas.overlapCardHeight), spacing: Canvas.cardSpacing),
                    GridItem(.fixed(Canvas.overlapCardHeight), spacing: Canvas.cardSpacing)]
        return LazyHGrid(rows: rows, spacing: Canvas.cardSpacing) {
            ForEach(DEFAULT_OVERLAP_DEFS) { def in
                let filled = state.tmName(for: def.key) != nil
                let locked = state.lockedSlotKeys.contains(def.key)
                OverlapCardView(
                    overlapDef: def,
                    tmName: state.tmName(for: def.key),
                    isHovered: state.hoveredSlotKey == def.key,
                    isSelected: state.selectedSlotKey == def.key,
                    isLocked: locked,
                    isDropTargeted: dropTargetedSlotKey == def.key,
                    tasks: state.slotTasksByUiKey[def.key] ?? [],
                    onTap: { onTapSlot(def.key) }
                )
                .pencilHoverable(slotKey: def.key, onHover: onHoverSlot)
                .dropDestination(for: String.self) { tmIds, _ in
                    guard let tmId = tmIds.first, !locked,
                          state.night?.isLocked != true else { return false }
                    onTapSlot(def.key)
                    onAssignTM(tmId)
                    return true
                } isTargeted: { targeted in
                    dropTargetedSlotKey = targeted ? def.key : nil
                }
                .contextMenu(filled ? ContextMenu {
                    Button { onTapSlot(def.key) } label: {
                        Label("Reassign", systemImage: "person.badge.plus")
                    }
                    Button { onTapSlot(def.key); onToggleLock() } label: {
                        Label(locked ? "Unlock" : "Lock", systemImage: locked ? "lock.open" : "lock")
                    }
                    Divider()
                    Button(role: .destructive) { onTapSlot(def.key); onClearSlot() } label: {
                        Label("Clear", systemImage: "xmark.circle")
                    }
                } : nil)
            }
        }
    }

    // MARK: - Swipe Chevron (P2-06)

    private func swipeChevron(systemName: String, opacity: Double) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 28, weight: .semibold))
            .foregroundStyle(.white.opacity(opacity * 0.8))
            .shadow(color: .black.opacity(0.6), radius: 6)
            .frame(width: 48, height: 100)
            .allowsHitTesting(false)
            .animation(.easeOut(duration: 0.1), value: opacity)
    }

    // MARK: - Section Header

    private func sectionHeader(title: String, filled: Int, total: Int) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(.white.opacity(0.4))
                .kerning(2)
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: 1)
            Text("\(filled) / \(total) FILLED")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.white.opacity(0.25))
        }
    }

    // MARK: - Computed

    private var filledZoneCount: Int {
        ZONE_DEFS.filter { state.tmName(for: $0.key) != nil }.count
    }

    private var filledRRCount: Int {
        RR_DEFS.flatMap { [$0.mensKey, $0.womensKey] }
               .filter { state.tmName(for: $0) != nil }.count
    }

    private var filledAuxCount: Int {
        DEFAULT_AUX_DEFS.filter { state.tmName(for: $0.key) != nil }.count
    }

    private var filledOverlapCount: Int {
        DEFAULT_OVERLAP_DEFS.filter { state.tmName(for: $0.key) != nil }.count
    }
}

// MARK: - Overlap Card

struct OverlapCardView: View {
    let overlapDef: OverlapDef
    let tmName: String?
    let isHovered: Bool
    var isSelected:     Bool = false
    var isLocked:       Bool = false
    var isDropTargeted: Bool = false  // P1-11
    var tasks: [SlotTask] = []
    var onTap: () -> Void = {}

    @Environment(\.accessibilityReduceMotion) private var reduceMotion  // P1-03

    private var accent: Color { overlapAccent(overlapDef.key) }
    private var isFilled: Bool { tmName != nil }

    var body: some View {
        Button(action: onTap) { cardContent }
            .buttonStyle(.plain)
            .opacity(isFilled || isHovered || isSelected ? 1.0 : 0.4)
            .animation(.easeInOut(duration: 0.2), value: isFilled)
    }

    @ViewBuilder private var cardContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            accent.frame(height: 4)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(overlapIcon(overlapDef.key))
                        .font(.system(size: 9))
                        .foregroundStyle(accent)
                    Text(overlapDef.period)
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(accent.opacity(0.7))
                        .kerning(0.5)
                    Spacer()
                    if isLocked {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 8))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                }
                Text(overlapDef.label)
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(accent.opacity(0.8))
                    .kerning(0.3)
                Text(tmName ?? "— Unfilled —")
                    .font(.system(size: 12, weight: isFilled ? .semibold : .regular))
                    .foregroundStyle(isFilled ? .white : .white.opacity(0.3))
                    .lineLimit(1)
                if !tasks.isEmpty {
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(tasks) { task in
                            Text(task.taskLabel)
                                .font(.system(size: 8, weight: .medium))
                                .foregroundStyle(accent.opacity(0.7))
                                .lineLimit(1)
                        }
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
        .frame(width: Canvas.overlapCardWidth, height: Canvas.overlapCardHeight, alignment: .topLeading)
        // P2-01: Liquid Glass
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 6))
        .overlay {
            if isSelected { RoundedRectangle(cornerRadius: 6).fill(accent.opacity(0.18)) }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(accent.opacity((isHovered || isSelected) ? 0.8 : 0),
                        lineWidth: isSelected ? 2 : 1.5)
        )
        // P1-11: gold ring + scale while drag target
        .overlay(
            Group {
                if isDropTargeted {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(hex: "#FFD700"), lineWidth: 2)
                        .opacity(0.9)
                }
            }
        )
        .contentShape(Rectangle())
        .shadow(color: .black.opacity(0.2), radius: 2, x: 0, y: 1)
        .scaleEffect(reduceMotion ? 1.0 : (isDropTargeted ? 1.02 : 1.0))  // P1-03
        .animation(reduceMotion ? .none : .spring(duration: 0.15, bounce: 0.25), value: isDropTargeted)
    }
}

// MARK: - RR Card (updated with drag-drop + context menu)

struct RRCardView: View {
    let rrDef: RRDef
    let mensTmName: String?
    let womensTmName: String?
    let mensHovered: Bool
    let womensHovered: Bool
    let isMensSelected: Bool
    let isWomensSelected: Bool
    var onTapMens: () -> Void = {}
    var onTapWomens: () -> Void = {}
    var onAssignMens: (String) -> Void = { _ in }
    var onAssignWomens: (String) -> Void = { _ in }
    var onClearMens: () -> Void = {}
    var onClearWomens: () -> Void = {}
    var onToggleLockMens: () -> Void = {}
    var onToggleLockWomens: () -> Void = {}
    var isMensLocked: Bool = false
    var isWomensLocked: Bool = false
    var mensTasks: [SlotTask] = []
    var womensTasks: [SlotTask] = []

    private var accent: Color { rrAccent(rrDef.num) }
    private var isAnyFilled: Bool { mensTmName != nil || womensTmName != nil }
    private var isAnyActive: Bool { isMensSelected || isWomensSelected || mensHovered || womensHovered }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            accent.frame(height: 4)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 4) {
                    Text(rrIcon(rrDef.num))
                        .font(.system(size: 10))
                        .foregroundStyle(accent)
                    Text(rrDef.label)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(accent)
                        .kerning(0.5)
                }

                HStack(spacing: 4) {
                    // Men's side
                    Button(action: onTapMens) {
                        sideContent(label: "M", name: mensTmName, isLocked: isMensLocked, tasks: mensTasks)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4).padding(.horizontal, 4)
                            .background(isMensSelected ? accent.opacity(0.20) : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .dropDestination(for: String.self) { tmIds, _ in
                        guard let tmId = tmIds.first, !isMensLocked else { return false }
                        onAssignMens(tmId); return true
                    } isTargeted: { _ in }
                    .contextMenu(mensTmName != nil ? ContextMenu {
                        Button { onTapMens() } label: { Label("Reassign", systemImage: "person.badge.plus") }
                        Button { onToggleLockMens() } label: {
                            Label(isMensLocked ? "Unlock" : "Lock", systemImage: isMensLocked ? "lock.open" : "lock")
                        }
                        Divider()
                        Button(role: .destructive) { onClearMens() } label: { Label("Clear", systemImage: "xmark.circle") }
                    } : nil)

                    Divider().frame(height: 34).background(Color.white.opacity(0.1))

                    // Women's side
                    Button(action: onTapWomens) {
                        sideContent(label: "W", name: womensTmName, isLocked: isWomensLocked, tasks: womensTasks)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 4).padding(.horizontal, 4)
                            .background(isWomensSelected ? accent.opacity(0.20) : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .dropDestination(for: String.self) { tmIds, _ in
                        guard let tmId = tmIds.first, !isWomensLocked else { return false }
                        onAssignWomens(tmId); return true
                    } isTargeted: { _ in }
                    .contextMenu(womensTmName != nil ? ContextMenu {
                        Button { onTapWomens() } label: { Label("Reassign", systemImage: "person.badge.plus") }
                        Button { onToggleLockWomens() } label: {
                            Label(isWomensLocked ? "Unlock" : "Lock", systemImage: isWomensLocked ? "lock.open" : "lock")
                        }
                        Divider()
                        Button(role: .destructive) { onClearWomens() } label: { Label("Clear", systemImage: "xmark.circle") }
                    } : nil)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
        .frame(width: Canvas.rrCardWidth, height: Canvas.zoneCardHeight, alignment: .topLeading)
        // P2-01: Liquid Glass
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(accent.opacity(
                    (mensHovered || womensHovered || isMensSelected || isWomensSelected) ? 0.8 : 0
                ), lineWidth: 1.5)
        )
        .shadow(color: .black.opacity(0.25), radius: 3, x: 0, y: 2)
        .opacity(isAnyFilled || isAnyActive ? 1.0 : 0.4)
        .animation(.easeInOut(duration: 0.2), value: isAnyFilled)
    }

    private func sideContent(label: String, name: String?, isLocked: Bool, tasks: [SlotTask] = []) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 3) {
                Text(label)
                    .font(.system(size: 8, weight: .bold))
                    .foregroundStyle(.white.opacity(0.3))
                if isLocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 7))
                        .foregroundStyle(.white.opacity(0.3))
                }
            }
            Text(name ?? "—")
                .font(.system(size: 11, weight: name != nil ? .semibold : .regular))
                .foregroundStyle(name != nil ? .white : .white.opacity(0.25))
                .lineLimit(1)
            if !tasks.isEmpty {
                ForEach(tasks) { task in
                    Text(task.taskLabel)
                        .font(.system(size: 7, weight: .medium))
                        .foregroundStyle(accent.opacity(0.65))
                        .lineLimit(1)
                }
            }
        }
    }
}

// MARK: - AUX Card

struct AuxCardView: View {
    let auxDef: AuxDef
    let tmName: String?
    let isHovered: Bool
    var isSelected:     Bool = false
    var isDropTargeted: Bool = false  // P1-11
    var tasks: [SlotTask] = []
    var onTap: () -> Void = {}

    @Environment(\.accessibilityReduceMotion) private var reduceMotion  // P1-03

    private var accent: Color { auxAccent(auxDef.key) }
    private var isFilled: Bool { tmName != nil }

    var body: some View {
        Button(action: onTap) { cardContent }
            .buttonStyle(.plain)
            .opacity(isFilled || isHovered || isSelected ? 1.0 : 0.4)
            .animation(.easeInOut(duration: 0.2), value: isFilled)
    }

    @ViewBuilder private var cardContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            accent.frame(height: 4)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(auxIcon(auxDef.key))
                        .font(.system(size: 10))
                        .foregroundStyle(accent)
                    Text(auxDef.label)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(accent)
                        .kerning(0.5)
                }
                Text(tmName ?? "— Unfilled —")
                    .font(.system(size: 12, weight: isFilled ? .semibold : .regular))
                    .foregroundStyle(isFilled ? .white : .white.opacity(0.3))
                    .lineLimit(1)
                if !tasks.isEmpty {
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(tasks) { task in
                            Text(task.taskLabel)
                                .font(.system(size: 8, weight: .medium))
                                .foregroundStyle(accent.opacity(0.7))
                                .lineLimit(1)
                        }
                    }
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
        }
        .frame(width: Canvas.auxCardWidth, height: Canvas.auxCardHeight, alignment: .topLeading)
        // P2-01: Liquid Glass
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 6))
        .overlay {
            if isSelected { RoundedRectangle(cornerRadius: 6).fill(accent.opacity(0.18)) }
        }
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(accent.opacity((isHovered || isSelected) ? 0.8 : 0),
                        lineWidth: isSelected ? 2 : 1.5)
        )
        // P1-11: gold ring + scale while drag target
        .overlay(
            Group {
                if isDropTargeted {
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(hex: "#FFD700"), lineWidth: 2)
                        .opacity(0.9)
                }
            }
        )
        .contentShape(Rectangle())
        .shadow(color: .black.opacity(0.2), radius: 2, x: 0, y: 1)
        .scaleEffect(reduceMotion ? 1.0 : (isDropTargeted ? 1.02 : 1.0))  // P1-03
        .animation(reduceMotion ? .none : .spring(duration: 0.15, bounce: 0.25), value: isDropTargeted)
    }
}

// MARK: - Pencil Hover Modifier

struct PencilHoverModifier: ViewModifier {
    let slotKey: String
    var onHover: (String?) -> Void

    func body(content: Content) -> some View {
        content.background(
            PencilHoverRepresentable(slotKey: slotKey, onHover: onHover)
        )
    }
}

extension View {
    func pencilHoverable(slotKey: String, onHover: @escaping (String?) -> Void) -> some View {
        modifier(PencilHoverModifier(slotKey: slotKey, onHover: onHover))
    }
}

struct PencilHoverRepresentable: UIViewRepresentable {
    let slotKey: String
    var onHover: (String?) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let hover = UIHoverGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleHover(_:))
        )
        view.addGestureRecognizer(hover)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.slotKey = slotKey
        context.coordinator.onHover = onHover
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(slotKey: slotKey, onHover: onHover)
    }

    class Coordinator: NSObject {
        var slotKey: String
        var onHover: (String?) -> Void

        init(slotKey: String, onHover: @escaping (String?) -> Void) {
            self.slotKey = slotKey
            self.onHover = onHover
        }

        @objc func handleHover(_ recognizer: UIHoverGestureRecognizer) {
            switch recognizer.state {
            case .began, .changed: onHover(slotKey)
            case .ended, .cancelled, .failed: onHover(nil)
            default: break
            }
        }
    }
}

#Preview {
    ShiftCanvasView(
        state: {
            var s = ShiftPlannerState()
            s.teamMembers = TeamMember.mockRoster
            s.hoveredSlotKey = "Z3"
            return s
        }()
    )
    .frame(width: 1100, height: 800)
}
