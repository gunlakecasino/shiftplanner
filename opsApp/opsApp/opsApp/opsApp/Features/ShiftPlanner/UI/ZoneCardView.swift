// ZoneCardView.swift — Golden-spec zone card with Pencil hover state.
//
// Visual anatomy (from GOLDEN_VISUAL_SPEC.md):
//   • Accent color top bar (4pt)
//   • Left: icon glyph + "ZONE N" label, both in accent color
//   • TM name (bold) or "— Unfilled —" (muted)
//   • Location line(s) in muted gray
//   • Hover ring (Pencil Pro 2 approach)
//   • Locked badge
//
// Tap delivery: wrapped in Button(.plain) so taps register reliably inside
// a LazyHGrid / bidirectional ScrollView. Plain .onTapGesture loses the
// disambiguation race in that context on iPadOS.

import SwiftUI

struct ZoneCardView: View {

    let zoneDef: ZoneDef
    let tmName: String?         // nil = unfilled
    let isLocked: Bool
    let isHovered: Bool         // Pencil Pro 2 hover highlight
    let isSelected: Bool
    var isDropTargeted: Bool = false  // P1-11: drag-over highlight
    var tasks: [SlotTask] = []

    var onTap: () -> Void = {}

    // MARK: - Environment

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Derived

    private var accent: Color { zoneAccent(zoneDef.key) }
    private var icon: String   { zoneIcon(zoneDef.key) }
    private var isFilled: Bool { tmName != nil }

    // MARK: - Body

    var body: some View {
        Button(action: onTap) {
            cardContent
        }
        .buttonStyle(.plain)
        .opacity(isFilled || isHovered || isSelected ? 1.0 : 0.4)
        .animation(.easeInOut(duration: 0.2), value: isFilled)
        // P1-01: VoiceOver accessibility
        .accessibilityLabel(a11yLabel)
        .accessibilityValue(a11yValue)
        .accessibilityHint(isSelected ? "Double-tap to deselect" : "Double-tap to select for assignment")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var a11yLabel: String {
        "\(zoneDef.label), \(tmName ?? "Unfilled")"
    }

    private var a11yValue: String {
        if isLocked { return "Locked" }
        return isFilled ? "Filled" : "Empty"
    }

    // MARK: - Card Content

    @ViewBuilder private var cardContent: some View {
        VStack(alignment: .leading, spacing: 0) {

            // ── Accent top bar ──────────────────────────────────────────
            accent
                .frame(height: 4)

            // ── Card body ───────────────────────────────────────────────
            VStack(alignment: .leading, spacing: 4) {

                // Zone label row
                HStack(spacing: 4) {
                    Text(icon)
                        .font(.system(size: 11))
                        .foregroundStyle(accent)
                    Text(zoneDef.label)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(accent)
                        .kerning(0.5)
                    Spacer()
                    if isLocked {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 9))
                            .foregroundStyle(.white.opacity(0.5))
                    }
                }

                // TM name
                Text(tmName ?? "— Unfilled —")
                    .font(.system(size: 13, weight: isFilled ? .semibold : .regular))
                    .foregroundStyle(isFilled ? .white : .white.opacity(0.3))
                    .lineLimit(1)

                // Task labels from night_slot_tasks
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
        .frame(width: Canvas.zoneCardWidth, height: Canvas.zoneCardHeight, alignment: .topLeading)
        // P2-01: Liquid Glass replaces the flat dark card background.
        // Selection tint is applied as an overlay so the glass still shows through.
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 6))
        .overlay {
            if isSelected {
                RoundedRectangle(cornerRadius: 6)
                    .fill(accent.opacity(0.18))
            }
        }
        .overlay(hoverRing)
        .overlay(selectionRing)
        .overlay(dropTargetRing)            // P1-11: gold ring while TM chip is dragged over
        .contentShape(Rectangle())          // full frame is hittable
        .shadow(color: .black.opacity(0.25), radius: 3, x: 0, y: 2)
        // P1-03: respect Reduce Motion — skip scale transforms when enabled
        .scaleEffect(reduceMotion ? 1.0 : (isDropTargeted ? 1.02 : isHovered ? 1.015 : 1.0))
        .animation(reduceMotion ? .none : .easeOut(duration: 0.12), value: isHovered)
        .animation(reduceMotion ? .none : .spring(duration: 0.15, bounce: 0.25), value: isDropTargeted)
    }

    // MARK: - Sub-views

    @ViewBuilder
    private var hoverRing: some View {
        if isHovered {
            RoundedRectangle(cornerRadius: 6)
                .stroke(accent.opacity(0.8), lineWidth: 1.5)
        }
    }

    @ViewBuilder
    private var selectionRing: some View {
        if isSelected {
            RoundedRectangle(cornerRadius: 6)
                .stroke(accent, lineWidth: 2)
        }
    }

    // P1-11: gold pulsing ring shown when a TM chip is dragged over this card
    @ViewBuilder
    private var dropTargetRing: some View {
        if isDropTargeted {
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color(hex: "#FFD700"), lineWidth: 2)
                .opacity(0.9)
        }
    }
}

#Preview {
    HStack(spacing: 12) {
        ZoneCardView(
            zoneDef: ZONE_DEFS[0],
            tmName: "Joy",
            isLocked: false,
            isHovered: false,
            isSelected: false
        )
        ZoneCardView(
            zoneDef: ZONE_DEFS[8],  // Z9
            tmName: nil,
            isLocked: false,
            isHovered: true,
            isSelected: false
        )
        ZoneCardView(
            zoneDef: ZONE_DEFS[6],  // Z7
            tmName: "Seth",
            isLocked: true,
            isHovered: false,
            isSelected: true
        )
    }
    .padding(24)
    .background(Color(red: 0.11, green: 0.13, blue: 0.16))
}
