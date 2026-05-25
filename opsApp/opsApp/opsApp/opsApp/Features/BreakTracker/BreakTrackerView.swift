// BreakTrackerView.swift — Break tracking sheet.
//
// Shows each ASSIGNED TM with their break status.
// Tapping START logs the start time; END closes the break.
// Up to 3 breaks per TM are supported.
//
// P0-01 FIX: Store is now owned by ShiftPlannerView (@State) and passed in —
//            not created inside the sheet closure. This preserves state across
//            dismiss/re-open cycles.
// P0-08 FIX: Elapsed timer uses TimelineView(.periodic) so it updates live
//            instead of freezing at first-render time.
// P0-09 FIX: initialTeamMembers contains only assigned TMs (filtered by
//            ShiftPlannerView) — not the full 30-person roster.

import ComposableArchitecture
import SwiftUI

struct BreakTrackerView: View {

    @State var store: Store<BreakTrackerState, BreakTrackerAction>

    /// Night ID at the time the sheet was opened — passed directly so we
    /// don't depend on store.nightId being pre-seeded.
    let initialNightId: UUID?

    /// Only the TMs assigned to tonight's zones/RRs/AUX (pre-filtered by caller).
    let initialTeamMembers: [TeamMember]

    var onDismiss: () -> Void

    var body: some View {
        let _ = store.breaks
        let _ = store.teamMembers
        let _ = store.isLoading

        NavigationStack {
            ZStack {
                // No explicit background — iOS 26 glass sheet takes over.
                if store.teamMembers.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(store.teamMembers) { tm in
                            tmBreakRow(tm: tm)
                                .listRowBackground(Color(red: 0.12, green: 0.14, blue: 0.18))
                                .listRowSeparatorTint(Color.white.opacity(0.06))
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }

                if store.isLoading {
                    ProgressView()
                        .tint(.white)
                }

                if let error = store.errorMessage {
                    VStack {
                        Spacer()
                        Text(error)
                            .font(.system(size: 12))
                            .foregroundStyle(Color(red: 1.0, green: 0.38, blue: 0.38))
                            .padding()
                    }
                }
            }
            .navigationTitle("Break Tracker")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Refresh") { store.send(.refresh) }
                        .foregroundStyle(.white.opacity(0.5))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: onDismiss)
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
        // P1-04: Removed .preferredColorScheme(.dark) — app-wide dark mode is
        // set at the window/scene level; forcing it per-sheet prevents correct
        // light-mode preview and breaks future adaptive theming.
        // P0-01: use initialNightId + initialTeamMembers passed from parent,
        // not store.nightId which would be nil on a freshly-created store.
        .task {
            if let nightId = initialNightId {
                store.send(.onAppear(nightId: nightId, teamMembers: initialTeamMembers))
            }
        }
    }

    // MARK: - TM Break Row

    private func tmBreakRow(tm: TeamMember) -> some View {
        let s        = store.state
        let tmBreaks = s.breaks(for: tm.tmId)
        let active   = s.activeBreak(for: tm.tmId)
        let nextNum  = s.nextBreakNum(for: tm.tmId)
        let canStart = active == nil && nextNum <= 3

        return VStack(alignment: .leading, spacing: 8) {
            // TM name + break count header
            HStack {
                Circle()
                    .fill(tm.isMale ? Color(hex: "#1976D2") : Color(hex: "#B7679A"))
                    .frame(width: 6, height: 6)
                Text(tm.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Text("\(tmBreaks.count)/3 breaks")
                    .font(.system(size: 10))
                    .foregroundStyle(.white.opacity(0.3))
            }

            // Break chips
            if !tmBreaks.isEmpty {
                VStack(spacing: 4) {
                    ForEach(tmBreaks) { b in
                        breakChip(b: b)
                    }
                }
            }

            // Action button — END BREAK shows a live-updating timer (P0-08)
            if let active {
                // P0-08 FIX: TimelineView updates every 15 s so elapsed time
                // isn't frozen at the instant the row first rendered.
                TimelineView(.periodic(from: .now, by: 15)) { context in
                    Button {
                        store.send(.endBreakTapped(breakId: active.id))
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "stop.circle.fill")
                                .font(.system(size: 11))
                            Text("END BREAK \(active.breakNum)")
                                .font(.system(size: 10, weight: .bold))
                                .kerning(0.5)
                            Spacer()
                            Text(elapsedString(since: active.startTime, now: context.date))
                                .font(.system(size: 10).monospacedDigit())
                        }
                        .foregroundStyle(Color(red: 1.0, green: 0.78, blue: 0.25))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(RoundedRectangle(cornerRadius: 6)
                            .fill(Color(red: 1.0, green: 0.78, blue: 0.25).opacity(0.12)))
                    }
                    .buttonStyle(.plain)
                }
            } else if canStart {
                Button {
                    store.send(.startBreakTapped(tmId: tm.tmId))
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 11))
                        Text("START BREAK \(nextNum)")
                            .font(.system(size: 10, weight: .bold))
                            .kerning(0.5)
                    }
                    .foregroundStyle(.white.opacity(0.5))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 6)
                        .fill(Color.white.opacity(0.06)))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 6)
    }

    // MARK: - Break Chip

    private func breakChip(b: Break) -> some View {
        HStack(spacing: 8) {
            Text("Break \(b.breakNum)")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.4))
                .frame(width: 44, alignment: .leading)

            if b.isCompleted, let start = b.startTime, let end = b.endTime {
                Text(timeLabel(start))
                    .font(.system(size: 9).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.5))
                Text("→")
                    .font(.system(size: 8))
                    .foregroundStyle(.white.opacity(0.2))
                Text(timeLabel(end))
                    .font(.system(size: 9).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.5))
                if let mins = b.durationMinutes {
                    Text("(\(mins)m)")
                        .font(.system(size: 9))
                        .foregroundStyle(breakDurationColor(mins))
                }
            } else if b.isOnBreak, let start = b.startTime {
                Text(timeLabel(start))
                    .font(.system(size: 9).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.5))
                Text("→ ON BREAK")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(Color(red: 1.0, green: 0.78, blue: 0.25))
            }

            Spacer()

            // Delete chip (only if not currently on break)
            if !b.isOnBreak {
                Button {
                    store.send(.deleteBreakTapped(breakId: b.id))
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 8))
                        .foregroundStyle(.white.opacity(0.2))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(RoundedRectangle(cornerRadius: 4)
            .fill(Color.white.opacity(b.isOnBreak ? 0.06 : 0.03)))
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "cup.and.saucer")
                .font(.system(size: 40))
                .foregroundStyle(.white.opacity(0.15))
            Text("No TMs assigned tonight")
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.3))
        }
    }

    // MARK: - Helpers

    private func timeLabel(_ date: Date?) -> String {
        guard let date else { return "--:--" }
        let f = DateFormatter()
        f.dateFormat = "h:mm a"
        return f.string(from: date)
    }

    /// P0-08: accepts an explicit `now` so TimelineView can drive the update
    /// instead of freezing at the moment the view body first evaluates.
    private func elapsedString(since date: Date?, now: Date = .now) -> String {
        guard let date else { return "" }
        let mins = Int(now.timeIntervalSince(date) / 60)
        return "\(mins)m"
    }

    private func breakDurationColor(_ mins: Int) -> Color {
        if mins <= 20 { return Color(hex: "#4CAF50") }
        if mins <= 30 { return Color(hex: "#FFD700") }
        return Color(hex: "#EF5350")
    }
}

// MARK: - Preview

#Preview {
    BreakTrackerView(
        store: Store(
            initialState: {
                var s = BreakTrackerState()
                s.teamMembers = TeamMember.mockRoster
                s.nightId = UUID()
                return s
            }()
        ) {
            BreakTrackerFeature()
        },
        initialNightId:     UUID(),
        initialTeamMembers: TeamMember.mockRoster,
        onDismiss: {}
    )
}
