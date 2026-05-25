// DeploymentBookView.swift — SwiftUI layout for the Deployment Book PDF.
//
// Rendered to PDF via ImageRenderer in DeploymentPDFExporter.
// Sized for US Letter landscape (792 × 612 pt).
// Keep all layout logic here; the exporter just wraps this view.
//
// P0-06 FIX: Removed ScrollView from zonesColumn — ImageRenderer only renders
//            the visible viewport of a ScrollView, clipping zones beyond it.
//            A plain VStack renders all 10 zones into the fixed-height canvas.
// P0-07 FIX: Added 4th column (Overlaps) so PM/AM overlap assignments are
//            visible in the printed book. Night Notes moved to full-width footer bar.

import SwiftUI

struct DeploymentBookView: View {

    let state: ShiftPlannerState

    // Letter landscape: 792 × 612 pt
    static let pageWidth:  CGFloat = 792
    static let pageHeight: CGFloat = 612

    // 4 columns + 3 dividers (1 pt each) = 3 pt total divider space
    // Per-column width = (792 - 3) / 4 = 197.25 pt
    private var colWidth: CGFloat { (Self.pageWidth - 3) / 4 }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
                .background(Color(hex: "#FFD700").opacity(0.6))
                .frame(height: 1)

            HStack(alignment: .top, spacing: 0) {
                zonesColumn
                Divider().background(Color.white.opacity(0.1))
                rrColumn
                Divider().background(Color.white.opacity(0.1))
                auxColumn
                Divider().background(Color.white.opacity(0.1))
                overlapsColumn
            }
            .frame(maxHeight: .infinity)

            // P0-07: Night notes full-width bar (was buried inside auxColumn)
            if let notes = state.night?.notes, !notes.isEmpty {
                nightNotesBar(notes: notes)
            }

            footer
        }
        .frame(width: Self.pageWidth, height: Self.pageHeight)
        .background(Color(red: 0.09, green: 0.11, blue: 0.14))
        .foregroundStyle(.white)
    }

    // MARK: - Header

    private var header: some View {
        HStack(alignment: .center, spacing: 0) {
            // Brand
            VStack(alignment: .leading, spacing: 2) {
                Text("GUN LAKE CASINO RESORT")
                    .font(.system(size: 9, weight: .black))
                    .foregroundStyle(Color(hex: "#FFD700"))
                    .kerning(2)
                Text("GRAVE SHIFT — ZONE DEPLOYMENT BOOK")
                    .font(.system(size: 7, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.4))
                    .kerning(1.5)
            }

            Spacer()

            // Night info
            VStack(alignment: .trailing, spacing: 2) {
                Text(nightDateLabel)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                HStack(spacing: 8) {
                    nightStatusBadge
                    Text("\(state.filledCount) / \(state.totalSlots) FILLED")
                        .font(.system(size: 8, weight: .medium))
                        .foregroundStyle(.white.opacity(0.4))
                        .kerning(0.5)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Zones Column
    // P0-06: plain VStack — no ScrollView — so ImageRenderer captures all 10 rows.

    private var zonesColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            columnHeader(title: "ZONES", icon: "star.fill")
            VStack(spacing: 0) {
                ForEach(ZONE_DEFS) { def in
                    deployRow(
                        accent:   zoneAccent(def.key),
                        icon:     zoneIcon(def.key),
                        label:    def.label,
                        location: def.locations.first ?? "",
                        tmName:   state.tmName(for: def.key),
                        isLocked: state.lockedSlotKeys.contains(def.key)
                    )
                }
            }
            Spacer()
        }
        .frame(width: colWidth)
    }

    // MARK: - Restrooms Column

    private var rrColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            columnHeader(title: "RESTROOMS", icon: "drop.fill")
            VStack(spacing: 0) {
                ForEach(RR_DEFS) { def in
                    VStack(spacing: 0) {
                        // RR header row
                        HStack(spacing: 4) {
                            Text(rrIcon(def.num))
                                .font(.system(size: 8))
                                .foregroundStyle(rrAccent(def.num))
                            Text(def.label)
                                .font(.system(size: 8, weight: .bold))
                                .foregroundStyle(rrAccent(def.num))
                                .kerning(0.5)
                            Spacer()
                        }
                        .padding(.horizontal, 10)
                        .padding(.top, 5)
                        .padding(.bottom, 2)

                        // Men's side
                        deployRow(
                            accent:   rrAccent(def.num),
                            icon:     "M",
                            label:    "MEN'S",
                            location: def.mensLoc,
                            tmName:   state.tmName(for: def.mensKey),
                            isLocked: state.lockedSlotKeys.contains(def.mensKey),
                            indented: true
                        )

                        // Women's side
                        deployRow(
                            accent:   rrAccent(def.num),
                            icon:     "W",
                            label:    "WOMEN'S",
                            location: def.womensLoc,
                            tmName:   state.tmName(for: def.womensKey),
                            isLocked: state.lockedSlotKeys.contains(def.womensKey),
                            indented: true
                        )
                    }
                }
                Spacer()
            }
        }
        .frame(width: colWidth)
    }

    // MARK: - AUX Column

    private var auxColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            columnHeader(title: "AUXILIARY", icon: "star.circle.fill")
            VStack(spacing: 0) {
                ForEach(DEFAULT_AUX_DEFS) { def in
                    deployRow(
                        accent:   auxAccent(def.key),
                        icon:     auxIcon(def.key),
                        label:    def.label,
                        location: def.locations.first ?? "",
                        tmName:   state.tmName(for: def.key),
                        isLocked: state.lockedSlotKeys.contains(def.key)
                    )
                }
                Spacer()
            }
        }
        .frame(width: colWidth)
    }

    // MARK: - Overlaps Column (P0-07: new — was completely absent from the PDF)

    private var overlapsColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            columnHeader(title: "OVERLAPS", icon: "arrow.left.arrow.right")
            VStack(spacing: 0) {
                // P2-09: PM Overlaps — amber #FFA726 with sunset icon
                overlapSectionHeader(title: "PM OVERLAP",
                                     icon: "sun.haze.fill",
                                     accent: Color(hex: "#FFA726"))
                ForEach(DEFAULT_OVERLAP_DEFS.filter { $0.period == "PM OVERLAP" }) { def in
                    deployRow(
                        accent:   Color(hex: "#FFA726"),
                        icon:     overlapIcon(def.key),
                        label:    def.label,
                        location: def.location,
                        tmName:   state.tmName(for: def.key),
                        isLocked: state.lockedSlotKeys.contains(def.key)
                    )
                }

                // P2-09: AM Overlaps — blue #42A5F5 with sunrise icon
                overlapSectionHeader(title: "AM OVERLAP",
                                     icon: "sunrise.fill",
                                     accent: Color(hex: "#42A5F5"))
                ForEach(DEFAULT_OVERLAP_DEFS.filter { $0.period == "AM OVERLAP" }) { def in
                    deployRow(
                        accent:   Color(hex: "#42A5F5"),
                        icon:     overlapIcon(def.key),
                        label:    def.label,
                        location: def.location,
                        tmName:   state.tmName(for: def.key),
                        isLocked: state.lockedSlotKeys.contains(def.key)
                    )
                }
                Spacer()
            }
        }
        .frame(width: colWidth)
    }

    // MARK: - Night Notes Bar (full-width, below the column grid)

    private func nightNotesBar(notes: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text("NIGHT NOTES")
                .font(.system(size: 6, weight: .bold))
                .foregroundStyle(.white.opacity(0.3))
                .kerning(1)
                .frame(width: 60, alignment: .leading)
            Text(notes)
                .font(.system(size: 8))
                .foregroundStyle(.white.opacity(0.55))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 5)
        .background(Color.white.opacity(0.03))
        .overlay(
            Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.06)),
            alignment: .top
        )
    }

    // MARK: - Footer

    private var footer: some View {
        HStack {
            Text("Printed \(printTimestamp)")
                .font(.system(size: 7))
                .foregroundStyle(.white.opacity(0.2))
            Spacer()
            Text("Gun Lake Casino Resort · Internal Use Only")
                .font(.system(size: 7))
                .foregroundStyle(.white.opacity(0.2))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
        .background(Color.black.opacity(0.2))
    }

    // MARK: - Reusable Row

    private func deployRow(
        accent: Color,
        icon: String,
        label: String,
        location: String,
        tmName: String?,
        isLocked: Bool,
        indented: Bool = false
    ) -> some View {
        HStack(spacing: 5) {
            // Accent bar
            accent.frame(width: 2)

            if indented {
                Color.clear.frame(width: 8)
            }

            // Icon
            Text(icon)
                .font(.system(size: 8))
                .foregroundStyle(accent.opacity(0.7))
                .frame(width: 12, alignment: .center)

            // Label + location
            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.system(size: 7, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.5))
                    .kerning(0.3)
                Text(location)
                    .font(.system(size: 6))
                    .foregroundStyle(.white.opacity(0.25))
            }
            .frame(width: indented ? 48 : 56, alignment: .leading)

            Spacer()

            // TM name
            Text(tmName ?? "—")
                .font(.system(size: 10, weight: tmName != nil ? .semibold : .regular))
                .foregroundStyle(tmName != nil ? .white : .white.opacity(0.2))
                .lineLimit(1)

            // Lock indicator
            if isLocked {
                Image(systemName: "lock.fill")
                    .font(.system(size: 7))
                    .foregroundStyle(Color(hex: "#FFD700").opacity(0.6))
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Rectangle()
                .fill(Color.white.opacity(tmName == nil ? 0 : 0.03))
        )
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(Color.white.opacity(0.05)),
            alignment: .bottom
        )
    }

    // MARK: - Column Header

    private func columnHeader(title: String, icon: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 7))
                .foregroundStyle(.white.opacity(0.3))
            Text(title)
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.white.opacity(0.3))
                .kerning(1.5)
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(Color.white.opacity(0.04))
    }

    // MARK: - Overlap Section Sub-Header

    // P2-09: icon param defaults to nil for backwards compatibility
    private func overlapSectionHeader(title: String,
                                       icon: String? = nil,
                                       accent: Color) -> some View {
        HStack(spacing: 4) {
            if let icon {
                Image(systemName: icon)
                    .font(.system(size: 7))
                    .foregroundStyle(accent)
            }
            Text(title)
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(accent)
                .kerning(0.5)
            Spacer()
        }
        .padding(.horizontal, 10)
        .padding(.top, 5)
        .padding(.bottom, 2)
    }

    // MARK: - Status Badge

    private var nightStatusBadge: some View {
        // P1-23: state.night is Night? so status is NightStatus? — default to .draft
        let status = state.night?.status ?? .draft
        let locked = state.night?.isLocked ?? false
        let label  = locked ? "LOCKED" : status.rawValue.uppercased()
        let color  = locked ? Color(hex: "#FFD700") : statusColor(status)

        return Text(label)
            .font(.system(size: 7, weight: .bold))
            .kerning(0.8)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 3).fill(color.opacity(0.15)))
    }

    // MARK: - Helpers

    private var nightDateLabel: String {
        let f = DateFormatter()
        f.dateFormat = "EEEE, MMMM d, yyyy"
        return f.string(from: state.selectedDate)
    }

    private var printTimestamp: String {
        let f = DateFormatter()
        f.dateFormat = "MMM d, yyyy 'at' h:mm a"
        return f.string(from: Date())
    }

    // P1-23: exhaustive switch — no default needed
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
    DeploymentBookView(
        state: {
            var s = ShiftPlannerState()
            s.teamMembers = TeamMember.mockRoster
            s.night = Night.mockTonight
            s.assignments = [
                ZoneAssignment(nightId: Night.mockTonight.id,
                               slotKey: "zone_1", slotType: "zone",
                               tmId: "tm_joy", rrSide: nil,
                               isLocked: false, isFilled: true, sortOrder: 0,
                               breakGroup: 0),
                ZoneAssignment(nightId: Night.mockTonight.id,
                               slotKey: "zone_9", slotType: "zone",
                               tmId: "tm_seth", rrSide: nil,
                               isLocked: true, isFilled: true, sortOrder: 8,
                               breakGroup: 0),
                ZoneAssignment(nightId: Night.mockTonight.id,
                               slotKey: "overlap_pm_0", slotType: "overlap",
                               tmId: "tm_cookie", rrSide: nil,
                               isLocked: false, isFilled: true, sortOrder: 26,
                               breakGroup: 0),
                ZoneAssignment(nightId: Night.mockTonight.id,
                               slotKey: "overlap_am_0", slotType: "overlap",
                               tmId: "tm_daryl", rrSide: nil,
                               isLocked: false, isFilled: true, sortOrder: 30,
                               breakGroup: 0),
            ]
            return s
        }()
    )
}
