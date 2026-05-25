// RosterRailView.swift — Left roster rail: team member chips.
//
// Displays active TMs. Collapses to a 40pt count-chip strip.
// In selection mode (selectedSlotKey != nil):
//   - Gold "TAP TO ASSIGN" banner (slot is empty) or "TAP TO REASSIGN" (slot filled)
//   - Red "CLEAR SLOT" button when the selected slot is already filled
//   - Yellow "LOCK" / "UNLOCK" button when the selected slot is filled
//   - Arrow icon on available TM chips

import SwiftUI
import UIKit

struct RosterRailView: View {

    let teamMembers:          [TeamMember]
    let assignmentsBySlotKey: [String: String]   // slotKey → tmId
    var lockedSlotKeys:       Set<String> = []
    var selectedSlotKey:      String?     = nil
    var onAssignTM:           ((String) -> Void)? = nil
    var onClearSlot:          (() -> Void)?       = nil
    var onToggleLock:         (() -> Void)?       = nil

    // Start collapsed — persisted across launches via AppStorage
    @AppStorage("rosterRailCollapsed") var isCollapsed = true
    // Unassigned TMs are hidden by default; expand to see/pick from them
    @State private var showUnassigned = false
    // P2-05: Inline search query — filters both scheduled and unscheduled lists
    @State private var searchQuery: String = ""

    // P1-03: respect system-wide Reduce Motion preference
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    // P2-10: auto-collapse in compact horizontal size class (multitasking)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    // MARK: - Computed

    private var assignedTmIds: Set<String> {
        Set(assignmentsBySlotKey.values)
    }

    private var scheduledTMs: [TeamMember] {
        teamMembers.filter { assignedTmIds.contains($0.tmId) }
                   .sorted { $0.name < $1.name }
    }

    private var unscheduledTMs: [TeamMember] {
        teamMembers.filter { !assignedTmIds.contains($0.tmId) }
                   .sorted { $0.name < $1.name }
    }

    private var unassignedCount: Int { unscheduledTMs.count }

    // P2-05: search-filtered lists
    private var filteredScheduledTMs: [TeamMember] {
        searchQuery.isEmpty
            ? scheduledTMs
            : scheduledTMs.filter { $0.name.localizedCaseInsensitiveContains(searchQuery) }
    }

    private var filteredUnscheduledTMs: [TeamMember] {
        searchQuery.isEmpty
            ? unscheduledTMs
            : unscheduledTMs.filter { $0.name.localizedCaseInsensitiveContains(searchQuery) }
    }

    private var isSelectionMode: Bool { selectedSlotKey != nil }

    private var selectedSlotIsFilled: Bool {
        guard let key = selectedSlotKey else { return false }
        return assignmentsBySlotKey[key] != nil
    }

    private var selectedSlotIsLocked: Bool {
        guard let key = selectedSlotKey else { return false }
        return lockedSlotKeys.contains(key)
    }

    // MARK: - Body
    //
    // Use a persistent ZStack overlay so SwiftUI can animate the
    // outer .frame(width:) smoothly — if/else swaps break identity.

    var body: some View {
        ZStack(alignment: .topLeading) {

            // ── Collapsed chip (always in tree) ───────────────────────
            collapsedChip
                .opacity(isCollapsed ? 1 : 0)

            // ── Expanded rail (always in tree) ────────────────────────
            expandedRail
                .opacity(isCollapsed ? 0 : 1)
        }
        // Single frame width — this is what spring-animates
        .frame(width: isCollapsed ? 40 : Canvas.rosterWidth, alignment: .leading)
        .clipped()
        // P2-02: Liquid Glass on the roster panel
        .glassEffect(.regular, in: Rectangle())
        // P1-03: spring → instant when Reduce Motion is on
        .animation(reduceMotion ? .none : .spring(duration: 0.28, bounce: 0.10), value: isCollapsed)
        // Auto-expand when a slot is selected so assign controls are reachable
        .onChange(of: isSelectionMode) { _, entering in
            if entering && isCollapsed {
                if reduceMotion {
                    isCollapsed = false
                } else {
                    withAnimation(.spring(duration: 0.28, bounce: 0.10)) { isCollapsed = false }
                }
            }
        }
        // P2-10: auto-collapse when entering compact horizontal size class (multitasking)
        .onChange(of: horizontalSizeClass) { _, newClass in
            if newClass == .compact && !isCollapsed {
                if reduceMotion { isCollapsed = true }
                else { withAnimation(.spring(duration: 0.28, bounce: 0.10)) { isCollapsed = true } }
            }
        }
        // Also animate inner state changes
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15), value: isSelectionMode)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15), value: selectedSlotIsFilled)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15), value: selectedSlotIsLocked)
    }

    // MARK: - Collapsed Chip

    private var collapsedChip: some View {
        VStack(spacing: 0) {
            // Expand button
            Button {
                withAnimation(.spring(duration: 0.28, bounce: 0.10)) { isCollapsed = false }
            } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.35))
                    .frame(width: 40, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer()

            // Count badge
            if unassignedCount > 0 {
                VStack(spacing: 3) {
                    Text("\(unassignedCount)")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Color(hex: "#FFD700"))
                        .monospacedDigit()
                    Text("FREE")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(Color(hex: "#FFD700").opacity(0.5))
                        .kerning(0.8)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 4)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(hex: "#FFD700").opacity(0.08))
                )
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 20))
                    .foregroundStyle(Color(hex: "#4CAF50").opacity(0.7))
            }

            Spacer()

            // Total TM count dim
            Text("\(teamMembers.count)")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.white.opacity(0.15))
                .monospacedDigit()
                .padding(.bottom, 14)
        }
        .frame(width: 40)
        .frame(maxHeight: .infinity)
    }

    // MARK: - Expanded Rail

    private var expandedRail: some View {
        VStack(alignment: .leading, spacing: 0) {

            // Header
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ROSTER")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white.opacity(0.4))
                        .kerning(1.5)
                    HStack(spacing: 6) {
                        Text("\(teamMembers.count) TMs")
                            .font(.system(size: 11))
                            .foregroundStyle(.white.opacity(0.3))
                        if unassignedCount > 0 {
                            Text("· \(unassignedCount) free")
                                .font(.system(size: 10))
                                .foregroundStyle(Color(hex: "#FFD700").opacity(0.5))
                        }
                    }
                }
                Spacer()
                // Collapse button
                Button {
                    withAnimation(.spring(duration: 0.28, bounce: 0.10)) { isCollapsed = true }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.25))
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 12)
            .padding(.trailing, 6)
            .padding(.top, 16)
            .padding(.bottom, 8)

            // P2-05: Inline search field — filters both scheduled and unscheduled lists
            if !teamMembers.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.3))
                    TextField("Filter TMs…", text: $searchQuery)
                        .font(.system(size: 12))
                        .foregroundStyle(.white)
                        .tint(Color(hex: "#FFD700"))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !searchQuery.isEmpty {
                        Button { searchQuery = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.35))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(
                    RoundedRectangle(cornerRadius: 7)
                        .fill(Color.white.opacity(0.06))
                )
                .padding(.horizontal, 8)
                .padding(.bottom, 4)
            }

            // Selection mode controls
            if isSelectionMode {
                selectionControls
            }

            Divider()
                .background(Color.white.opacity(0.08))

            // TM list — scheduled on top, unscheduled collapsible
            if teamMembers.isEmpty {
                emptyState
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 0) {

                        // ── Scheduled / assigned TMs ──────────────────────
                        if !filteredScheduledTMs.isEmpty {
                            sectionLabel("SCHEDULED — \(filteredScheduledTMs.count)")
                            LazyVStack(spacing: 3) {
                                ForEach(filteredScheduledTMs) { tm in
                                    tmChip(tm)
                                }
                            }
                            .padding(.horizontal, 8)
                            .padding(.bottom, 6)
                        }

                        // ── Unscheduled / free TMs (collapsible) ──────────
                        if !filteredUnscheduledTMs.isEmpty {
                            Button {
                                withAnimation(.spring(duration: 0.22, bounce: 0.1)) {
                                    showUnassigned.toggle()
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Text("NOT SCHEDULED — \(filteredUnscheduledTMs.count)")
                                        .font(.system(size: 8, weight: .bold))
                                        .foregroundStyle(.white.opacity(0.25))
                                        .kerning(1.2)
                                    Spacer()
                                    Image(systemName: showUnassigned ? "chevron.up" : "chevron.down")
                                        .font(.system(size: 8, weight: .semibold))
                                        .foregroundStyle(.white.opacity(0.2))
                                }
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)

                            if showUnassigned || !searchQuery.isEmpty {
                                LazyVStack(spacing: 3) {
                                    ForEach(filteredUnscheduledTMs) { tm in
                                        tmChip(tm)
                                    }
                                }
                                .padding(.horizontal, 8)
                                .padding(.bottom, 6)
                                .transition(.opacity.combined(with: .move(edge: .top)))
                            }
                        }

                        // ── No results state ──────────────────────────────
                        if !searchQuery.isEmpty &&
                           filteredScheduledTMs.isEmpty &&
                           filteredUnscheduledTMs.isEmpty {
                            Text("No TMs match \"\(searchQuery)\"")
                                .font(.system(size: 11))
                                .foregroundStyle(.white.opacity(0.25))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 20)
                        }
                    }
                    .padding(.top, 8)
                }
            }
        }
        .frame(width: Canvas.rosterWidth)
    }

    // MARK: - Selection Controls

    @ViewBuilder private var selectionControls: some View {
        VStack(spacing: 4) {

            // Assign / Reassign / Locked status banner
            HStack(spacing: 6) {
                Image(systemName: selectedSlotIsLocked ? "lock.fill" : "hand.tap.fill")
                    .font(.system(size: 9))
                Text(bannerLabel)
                    .font(.system(size: 9, weight: .bold))
                    .kerning(1)
            }
            .foregroundStyle(selectedSlotIsLocked
                             ? Color(hex: "#FFD700").opacity(0.6)
                             : Color(hex: "#FFD700"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 5)
            .background(Color(hex: "#FFD700").opacity(selectedSlotIsLocked ? 0.05 : 0.10))

            if selectedSlotIsFilled {
                // Lock / Unlock toggle — glass button with gold tint
                // P1-12: haptic feedback distinguishes lock (.rigid) from unlock (.light)
                Button(action: {
                    let style: UIImpactFeedbackGenerator.FeedbackStyle =
                        selectedSlotIsLocked ? .light : .rigid
                    UIImpactFeedbackGenerator(style: style).impactOccurred()
                    onToggleLock?()
                }) {
                    HStack(spacing: 5) {
                        Image(systemName: selectedSlotIsLocked ? "lock.open.fill" : "lock.fill")
                            .font(.system(size: 9))
                        Text(selectedSlotIsLocked ? "UNLOCK SLOT" : "LOCK SLOT")
                            .font(.system(size: 9, weight: .bold))
                            .kerning(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 5)
                }
                .buttonStyle(.glass)
                .tint(Color(hex: "#FFD700"))
                .controlSize(.small)
                .buttonBorderShape(.roundedRectangle(radius: 4))
                .padding(.horizontal, 6)
                .transition(.opacity.combined(with: .move(edge: .top)))

                // Clear slot — only when NOT locked — red tint glass
                if !selectedSlotIsLocked {
                    Button(action: { onClearSlot?() }) {
                        HStack(spacing: 5) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 9))
                            Text("CLEAR SLOT")
                                .font(.system(size: 9, weight: .bold))
                                .kerning(1)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 5)
                    }
                    .buttonStyle(.glass)
                    .tint(Color(red: 1.0, green: 0.38, blue: 0.38))
                    .controlSize(.small)
                    .buttonBorderShape(.roundedRectangle(radius: 4))
                    .padding(.horizontal, 6)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .padding(.vertical, 4)
        .transition(.opacity)
    }

    private var bannerLabel: String {
        if selectedSlotIsLocked { return "SLOT LOCKED" }
        return selectedSlotIsFilled ? "TAP TO REASSIGN" : "TAP TO ASSIGN"
    }

    // MARK: - Helpers

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(.white.opacity(0.25))
            .kerning(1.2)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .padding(.bottom, 4)
    }

    @ViewBuilder
    private func tmChip(_ tm: TeamMember) -> some View {
        TMChipView(
            tm: tm,
            isAssigned: assignedTmIds.contains(tm.tmId),
            isSelectionMode: isSelectionMode && !selectedSlotIsLocked
        )
        .draggable(tm.tmId)
        .onTapGesture {
            if isSelectionMode && !selectedSlotIsLocked {
                onAssignTM?(tm.tmId)
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 24))
                .foregroundStyle(.white.opacity(0.2))
            Text("No TMs loaded")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.25))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 40)
    }
}

// MARK: - TM Chip

struct TMChipView: View {

    let tm: TeamMember
    let isAssigned: Bool
    var isSelectionMode: Bool = false

    private var isAvailable: Bool { isSelectionMode && !isAssigned }

    var body: some View {
        HStack(spacing: 8) {
            // Gender indicator dot
            Circle()
                .fill(tm.isMale
                      ? Color(hex: "#1976D2")
                      : Color(hex: "#B7679A"))
                .frame(width: 5, height: 5)

            Text(tm.name)
                .font(.system(size: 12, weight: isAssigned ? .medium : .regular))
                .foregroundStyle(
                    isAvailable ? .white :
                    isAssigned  ? .white.opacity(0.35) :
                                  .white.opacity(0.85)
                )
                .lineLimit(1)

            Spacer()

            // Assigned badge or pick arrow in selection mode
            if isAssigned {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.25))
            } else if isSelectionMode {
                Image(systemName: "arrow.right.circle")
                    .font(.system(size: 11))
                    .foregroundStyle(Color(hex: "#FFD700").opacity(0.7))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        // P2-02: Liquid Glass on chips + availability tint overlay
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 5))
        .overlay {
            RoundedRectangle(cornerRadius: 5)
                .fill(isAvailable
                      ? Color(hex: "#FFD700").opacity(0.10)
                      : Color.clear)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 5)
                .stroke(Color(hex: "#FFD700").opacity(isAvailable ? 0.35 : 0), lineWidth: 1)
        )
        // P1-01: VoiceOver
        .accessibilityLabel(tm.name)
        .accessibilityValue(isAssigned ? "Assigned" : "Available")
        .accessibilityHint(isAvailable ? "Double-tap to assign to selected slot" : "")
        .accessibilityAddTraits(isAssigned ? .isSelected : [])
    }
}

#Preview {
    HStack(spacing: 0) {
        RosterRailView(
            teamMembers: TeamMember.mockRoster,
            assignmentsBySlotKey: ["Z1": "tm_joy", "Z9": "tm_seth"],
            lockedSlotKeys: ["Z9"],
            selectedSlotKey: nil
        )
        Color(red: 0.11, green: 0.13, blue: 0.16)
    }
    .frame(height: 600)
}
