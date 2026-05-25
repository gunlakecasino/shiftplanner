// ShiftHeaderBar.swift — Top navigation/control bar for the ShiftPlanner.
//
// Layout (left → right):
//   [← Prev]  [Night date label — tap for picker]  [Next →]
//   [Status badge]  [Lock/Unlock night]  [X/30 FILLED]
//   |  [Notes]  [Breaks]  [Export]  |  [⟳ Refresh]

import SwiftUI

struct ShiftHeaderBar: View {

    // MARK: - Inputs

    let state: ShiftPlannerState
    var onPrevDay:         () -> Void = {}
    var onNextDay:         () -> Void = {}
    var onRefresh:         () -> Void = {}
    var onShowBreaks:      () -> Void = {}
    var onShowNightNotes:  () -> Void = {}
    var onExport:          () -> Void = {}
    var onToggleNightLock:  () -> Void = {}
    var onCyclePencilMode:    () -> Void = {}  // P2-12: tapping the mode pill cycles it
    var onCommandPalette:     () -> Void = {}  // ⌘K touch trigger

    // Date picker popover state
    @State private var showDatePicker = false
    @State private var pickerDate: Date = .tonightShiftDate

    // Action cluster collapse — start compact
    @State private var actionsExpanded = false

    // MARK: - Body

    var body: some View {
        HStack(spacing: 0) {

            // ── Date navigation cluster ───────────────────────────────
            HStack(spacing: 2) {
                navArrow(systemName: "chevron.left", action: onPrevDay)

                // Tappable date label → date picker popover
                Button {
                    pickerDate = state.selectedDate
                    showDatePicker = true
                } label: {
                    VStack(alignment: .center, spacing: 1) {
                        Text(nightDateLabel)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .monospacedDigit()
                        Text(dayOfWeekLabel)
                            .font(.system(size: 10))
                            .foregroundStyle(.white.opacity(0.4))
                            .kerning(0.5)
                    }
                    .frame(minWidth: 140)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showDatePicker, arrowEdge: .top) {
                    datePickerPopover
                }

                navArrow(systemName: "chevron.right", action: onNextDay)
            }

            Spacer()

            // ── Night status + lock ───────────────────────────────────
            if let night = state.night {
                // P0-05: night.isLocked is now Bool (non-optional) — no ?? false needed
                nightStatusBadge(status: night.status,
                                 isLocked: night.isLocked)

                // Lock / Unlock button — gold when locked, subdued when unlocked
                Button(action: onToggleNightLock) {
                    Image(systemName: night.isLocked ? "lock.open.fill" : "lock.fill")
                        .font(.system(size: 12))
                        .foregroundStyle(night.isLocked
                                         ? Color(hex: "#FFD700")
                                         : .white.opacity(0.35))
                        .frame(width: 32, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.trailing, 4)
            }

            // ── Fill counter ─────────────────────────────────────────
            fillCounter

            // P2-12: Pencil mode pill — shown when any pencil mode is active
            // (always visible so the user can tap to cycle modes even with finger)
            pencilModePill

            // ── Command Palette trigger ───────────────────────────────
            Button(action: onCommandPalette) {
                Image(systemName: "command")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.45))
                    .frame(width: 36, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Command Palette")

            // ── Action cluster (collapsible) ──────────────────────────
            if actionsExpanded {
                divider
                actionButton(label: "Notes",   systemName: "note.text",      action: onShowNightNotes)
                actionButton(label: "Breaks",  systemName: "cup.and.saucer", action: onShowBreaks)
                actionButton(label: "Export",  systemName: "arrow.down.doc", action: onExport)
                divider
            }

            // Expand / collapse toggle
            Button { withAnimation(.spring(duration: 0.22, bounce: 0.1)) { actionsExpanded.toggle() } } label: {
                Image(systemName: actionsExpanded ? "chevron.right" : "ellipsis")
                    .font(.system(size: actionsExpanded ? 10 : 12, weight: .medium))
                    .foregroundStyle(.white.opacity(actionsExpanded ? 0.2 : 0.45))
                    .frame(width: actionsExpanded ? 18 : 34, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, actionsExpanded ? 0 : 4)

            if !actionsExpanded { divider }

            // ── Refresh ───────────────────────────────────────────────
            Button(action: onRefresh) {
                Image(systemName: state.isLoading ? "arrow.triangle.2.circlepath" : "arrow.clockwise")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white.opacity(0.5))
                    .rotationEffect(.degrees(state.isLoading ? 360 : 0))
                    .animation(state.isLoading
                               ? .linear(duration: 1).repeatForever(autoreverses: false)
                               : .default,
                               value: state.isLoading)
            }
            .buttonStyle(.plain)
            .frame(width: 40, height: 44)
            .contentShape(Rectangle())
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
        .background(Color(red: 0.09, green: 0.11, blue: 0.14))
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(Color.white.opacity(0.07)),
            alignment: .bottom
        )
    }

    // MARK: - Date Picker Popover

    private var datePickerPopover: some View {
        VStack(spacing: 0) {
            DatePicker("", selection: $pickerDate, displayedComponents: .date)
                .datePickerStyle(.graphical)
                .tint(Color(hex: "#FFD700"))
                .colorScheme(.dark)
                .padding()
                .frame(width: 320)

            Divider().background(Color.white.opacity(0.1))

            HStack {
                Button("Today") {
                    pickerDate = .tonightShiftDate
                }
                .foregroundStyle(Color(hex: "#FFD700"))

                Spacer()

                // P1-05: Call onDateSelected before dismissing so the parent
                // always receives the selected date even when the user doesn't
                // change the value (onChange(of:) only fires on change).
                Button("Go to Date") {
                    onDateSelected?(pickerDate)
                    showDatePicker = false
                }
                .foregroundStyle(.white)
                .fontWeight(.semibold)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Color(red: 0.12, green: 0.14, blue: 0.18))
        }
        .background(Color(red: 0.12, green: 0.14, blue: 0.18))
        .onChange(of: pickerDate) { _, newDate in
            showDatePicker = false
            // Propagate to parent via action (parent needs an `onDateSelected` cb)
            onDateSelected?(newDate)
        }
    }

    // Optional callback — set by parent when it wants date-jump support
    var onDateSelected: ((Date) -> Void)? = nil

    // MARK: - Sub-views

    private func navArrow(systemName: String, action: @escaping () -> Void) -> some View {
        let isPrev = systemName == "chevron.left"
        return Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white.opacity(0.55))
                .frame(width: 36, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        // P1-01: VoiceOver labels for navigation arrows
        .accessibilityLabel(isPrev ? "Previous shift" : "Next shift")
    }

    private func nightStatusBadge(status: NightStatus, isLocked: Bool) -> some View {
        HStack(spacing: 4) {
            if isLocked {
                Image(systemName: "lock.fill")
                    .font(.system(size: 8))
            }
            Text(isLocked ? "LOCKED" : status.rawValue.uppercased())
                .font(.system(size: 9, weight: .bold))
                .kerning(0.8)
        }
        .foregroundStyle(isLocked ? Color(hex: "#FFD700") : statusColor(status))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill((isLocked ? Color(hex: "#FFD700") : statusColor(status)).opacity(0.12))
        )
        .padding(.trailing, 8)
    }

    private var fillCounter: some View {
        HStack(spacing: 4) {
            Text("\(state.filledCount)")
                .font(.system(size: 20, weight: .bold))
                .foregroundStyle(fillCounterColor)
                .monospacedDigit()
            Text("/ \(state.totalSlots)")
                .font(.system(size: 11))
                .foregroundStyle(.white.opacity(0.3))
                .monospacedDigit()
            // P2-08: status label uses NightFillStatus enum
            Text(fillStatusLabel)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.25))
                .kerning(0.5)
        }
        .padding(.trailing, 12)
    }

    // P2-12: Pencil mode pill — tappable to cycle mode
    private var pencilModePill: some View {
        let mode = state.pencilMode
        let isAnnotate = mode == .annotate
        return Button(action: onCyclePencilMode) {
            HStack(spacing: 4) {
                Image(systemName: mode.systemImage)
                    .font(.system(size: 9))
                Text(mode.rawValue.uppercased())
                    .font(.system(size: 9, weight: .bold))
                    .kerning(0.8)
            }
            .foregroundStyle(isAnnotate ? Color(hex: "#FFD700") : .white.opacity(0.55))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill((isAnnotate ? Color(hex: "#FFD700") : Color.white).opacity(0.10))
                    .overlay(
                        Capsule()
                            .stroke((isAnnotate ? Color(hex: "#FFD700") : Color.white).opacity(0.2),
                                    lineWidth: 0.5)
                    )
            )
        }
        .buttonStyle(.plain)
        .padding(.trailing, 8)
    }

    private func actionButton(label: String, systemName: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: systemName)
                    .font(.system(size: 12))
                Text(label)
                    .font(.system(size: 8, weight: .medium))
                    .kerning(0.3)
            }
            .foregroundStyle(.white.opacity(0.5))
            .frame(width: 52, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var divider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.07))
            .frame(width: 1, height: 28)
            .padding(.horizontal, 6)
    }

    // MARK: - Computed

    private var nightDateLabel: String {
        let f = DateFormatter()
        f.dateFormat = "MMM d, yyyy"
        return f.string(from: state.selectedDate)
    }

    private var dayOfWeekLabel: String {
        let f = DateFormatter()
        f.dateFormat = "EEEE"
        return f.string(from: state.selectedDate).uppercased()
    }

    // P2-08: fill counter color derived from NightFillStatus
    private var fillCounterColor: Color {
        switch state.fillStatus {
        case .full:       return Color(hex: "#4CAF50")
        case .almostFull: return Color(hex: "#FFD700")
        case .partial:    return .white
        case .empty:      return .white.opacity(0.4)
        }
    }

    private var fillStatusLabel: String {
        switch state.fillStatus {
        case .full:       return "FULL"
        case .almostFull: return "ALMOST"
        case .partial:    return "FILLED"
        case .empty:      return "EMPTY"
        }
    }

    // P1-23: exhaustive switch on NightStatus enum — no default needed
    private func statusColor(_ status: NightStatus) -> Color {
        switch status {
        case .active:   return Color(hex: "#4CAF50")
        case .draft:    return Color(hex: "#9E9E9E")
        case .complete: return Color(hex: "#2196F3")
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 0) {
        ShiftHeaderBar(
            state: {
                var s = ShiftPlannerState()
                s.teamMembers = TeamMember.mockRoster
                s.night = Night.mockTonight
                s.assignments = []
                return s
            }(),
            onDateSelected: { _ in }
        )
        Spacer()
    }
    .frame(width: 1194, height: 200)
    .background(Color(red: 0.09, green: 0.11, blue: 0.14))
}
