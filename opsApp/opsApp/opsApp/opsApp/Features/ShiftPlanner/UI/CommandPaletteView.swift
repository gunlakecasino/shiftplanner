// CommandPaletteView.swift — ⌘K command palette for the shift planner.
//
// Mirrors the webapp's CommandPalette.tsx behavior:
//   • Floating glass overlay, dimmed backdrop
//   • Search field (auto-focused on open)
//   • Category pills: ALL / ROSTER / ACTIONS / NAVIGATION
//   • Grouped results — Enter executes first match, Escape closes
//   • Context-aware: slot/TM commands surface only when relevant

import SwiftUI

// MARK: - Command Model

enum PaletteGroup: String, CaseIterable, Hashable {
    case roster     = "ROSTER"
    case actions    = "ACTIONS"
    case navigation = "NAVIGATION"

    var icon: String {
        switch self {
        case .roster:     return "person.2.fill"
        case .actions:    return "bolt.fill"
        case .navigation: return "calendar"
        }
    }
}

struct PaletteCommand: Identifiable {
    let id         = UUID()
    let label:     String
    let subtitle:  String?
    let keywords:  [String]
    let group:     PaletteGroup
    let icon:      String        // SF Symbol
    let iconColor: Color
    var isDestructive: Bool = false
    let handler: () -> Void
}

// MARK: - View

struct CommandPaletteView: View {

    // Passed-in context
    let state:      ShiftPlannerState
    var onDismiss:    () -> Void = {}
    var onAssignTM:   (String) -> Void = { _ in }
    var onClearSlot:  () -> Void = {}
    var onToggleLock: () -> Void = {}
    var onPrevDay:    () -> Void = {}
    var onNextDay:    () -> Void = {}
    var onTonight:    () -> Void = {}
    var onExport:     () -> Void = {}
    var onNotes:      () -> Void = {}
    var onBreaks:     () -> Void = {}
    var onRefresh:    () -> Void = {}
    var onSudo:       () -> Void = {}

    @State private var query         = ""
    @State private var activeGroup: PaletteGroup? = nil
    @FocusState private var searchFocused: Bool

    // MARK: - Command Registry

    private var allCommands: [PaletteCommand] {
        var cmds: [PaletteCommand] = []

        // ── ROSTER ────────────────────────────────────────────────────
        // When a slot is selected: show TMs to assign.
        // When no slot: show all scheduled TMs as an info list.
        let slotKey    = state.selectedSlotKey
        let isLocked   = slotKey.map { state.lockedSlotKeys.contains($0) } ?? false
        let slotIsFilled = slotKey.map { state.assignmentsBySlotKey[$0] != nil } ?? false

        for tm in state.rosterTeamMembers.sorted(by: { $0.name < $1.name }) {
            let assigned = state.assignmentsBySlotKey.values.contains(tm.tmId)
            let isCurrentSlot = slotKey.map { state.assignmentsBySlotKey[$0] == tm.tmId } ?? false

            let subtitle: String? = {
                if isCurrentSlot { return "Currently in selected slot" }
                if assigned      { return "Already assigned elsewhere" }
                return nil
            }()

            let canAssign = slotKey != nil && !isLocked
            cmds.append(PaletteCommand(
                label:    tm.name,
                subtitle: canAssign ? subtitle : (assigned ? "Assigned" : "Free"),
                keywords: [tm.name.lowercased(), tm.tmId, assigned ? "assigned" : "free"],
                group:    .roster,
                icon:     assigned ? "person.fill.checkmark" : "person.fill",
                iconColor: tm.isMale
                    ? Color(hex: "#1976D2")
                    : Color(hex: "#B7679A"),
                handler: {
                    guard canAssign else { return }
                    onAssignTM(tm.tmId)
                }
            ))
        }

        // ── ACTIONS ───────────────────────────────────────────────────
        // Slot-contextual actions first (only when a slot is selected)
        if let slot = slotKey {
            let slotDisplay = slot.replacingOccurrences(of: "_", with: " ").uppercased()
            if slotIsFilled {
                cmds.append(PaletteCommand(
                    label:    isLocked ? "Unlock Slot" : "Lock Slot",
                    subtitle: slotDisplay,
                    keywords: ["lock", "unlock", "slot", "toggle"],
                    group:    .actions,
                    icon:     isLocked ? "lock.open.fill" : "lock.fill",
                    iconColor: Color(hex: "#FFD700"),
                    handler:  onToggleLock
                ))
                if !isLocked {
                    cmds.append(PaletteCommand(
                        label:    "Clear Slot",
                        subtitle: "Remove TM from \(slotDisplay)",
                        keywords: ["clear", "remove", "unassign", "empty", "delete"],
                        group:    .actions,
                        icon:     "xmark.circle.fill",
                        iconColor: Color(red: 1, green: 0.38, blue: 0.38),
                        isDestructive: true,
                        handler:  onClearSlot
                    ))
                }
            }
        }

        // Always-available actions
        cmds.append(PaletteCommand(
            label:    "SUDO — Admin Mode",
            subtitle: "Team, tasks, engine config, DB explorer",
            keywords: ["sudo", "admin", "database", "db", "team", "config", "engine", "explorer", "tm", "settings"],
            group:    .actions,
            icon:     "terminal.fill",
            iconColor: Color(red: 1, green: 0.22, blue: 0.22),
            handler:  onSudo
        ))
        cmds.append(PaletteCommand(
            label:    "Export Deployment Book",
            subtitle: "Generate & share PDF",
            keywords: ["export", "pdf", "print", "deployment", "book", "share"],
            group:    .actions,
            icon:     "arrow.up.doc.fill",
            iconColor: .white.opacity(0.55),
            handler:  onExport
        ))
        cmds.append(PaletteCommand(
            label:    "Night Notes",
            subtitle: "Open notes editor",
            keywords: ["notes", "night", "write", "memo"],
            group:    .actions,
            icon:     "note.text",
            iconColor: .white.opacity(0.55),
            handler:  onNotes
        ))
        cmds.append(PaletteCommand(
            label:    "Break Tracker",
            subtitle: "Manage TM breaks",
            keywords: ["break", "tracker", "rest", "lunch"],
            group:    .actions,
            icon:     "cup.and.saucer.fill",
            iconColor: .white.opacity(0.55),
            handler:  onBreaks
        ))
        cmds.append(PaletteCommand(
            label:    "Refresh",
            subtitle: "Reload from Supabase",
            keywords: ["refresh", "reload", "sync", "update"],
            group:    .actions,
            icon:     "arrow.clockwise",
            iconColor: .white.opacity(0.55),
            handler:  onRefresh
        ))

        // ── NAVIGATION ────────────────────────────────────────────────
        cmds.append(PaletteCommand(
            label:    "Go to Tonight",
            subtitle: "Jump to current shift",
            keywords: ["tonight", "today", "now", "current", "home"],
            group:    .navigation,
            icon:     "moon.stars.fill",
            iconColor: Color(hex: "#FFD700"),
            handler:  onTonight
        ))
        cmds.append(PaletteCommand(
            label:    "Previous Night",
            subtitle: "← Go back one shift",
            keywords: ["previous", "prev", "back", "yesterday", "before"],
            group:    .navigation,
            icon:     "chevron.left.circle.fill",
            iconColor: .white.opacity(0.45),
            handler:  onPrevDay
        ))
        cmds.append(PaletteCommand(
            label:    "Next Night",
            subtitle: "→ Go forward one shift",
            keywords: ["next", "forward", "tomorrow", "after"],
            group:    .navigation,
            icon:     "chevron.right.circle.fill",
            iconColor: .white.opacity(0.45),
            handler:  onNextDay
        ))

        return cmds
    }

    private var filteredCommands: [PaletteCommand] {
        let base = activeGroup == nil ? allCommands : allCommands.filter { $0.group == activeGroup }
        guard !query.isEmpty else { return base }
        let q = query.lowercased()
        return base.filter {
            $0.label.lowercased().contains(q) ||
            ($0.subtitle?.lowercased().contains(q) ?? false) ||
            $0.keywords.contains(where: { $0.contains(q) })
        }
    }

    private var groupedResults: [(PaletteGroup, [PaletteCommand])] {
        let dict = Dictionary(grouping: filteredCommands, by: \.group)
        return PaletteGroup.allCases.compactMap { g in
            guard let cmds = dict[g], !cmds.isEmpty else { return nil }
            return (g, cmds)
        }
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            // ── Backdrop ──────────────────────────────────────────────
            Color.black.opacity(0.55)
                .ignoresSafeArea()
                .onTapGesture { onDismiss() }

            // ── Palette card ──────────────────────────────────────────
            VStack(spacing: 0) {

                // Search field
                HStack(spacing: 10) {
                    Image(systemName: query.isEmpty ? "magnifyingglass" : "command")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white.opacity(0.35))
                        .animation(.easeInOut(duration: 0.15), value: query.isEmpty)

                    TextField("Search commands, TMs, actions…", text: $query)
                        .font(.system(size: 15))
                        .foregroundStyle(.white)
                        .tint(Color(hex: "#FFD700"))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .focused($searchFocused)
                        .submitLabel(.go)
                        .onSubmit { executeFirst() }

                    if !query.isEmpty {
                        Button { query = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)

                Divider().background(Color.white.opacity(0.08))

                // Category pills
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        pill(label: "All",          group: nil)
                        ForEach(PaletteGroup.allCases, id: \.self) { g in
                            pill(label: g.rawValue, group: g)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                }

                Divider().background(Color.white.opacity(0.08))

                // Results list
                if groupedResults.isEmpty {
                    emptyState
                } else {
                    ScrollView(.vertical, showsIndicators: false) {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(groupedResults, id: \.0) { group, cmds in
                                groupHeader(group)
                                ForEach(cmds) { cmd in
                                    commandRow(cmd)
                                }
                            }
                        }
                        .padding(.bottom, 10)
                    }
                    .frame(maxHeight: 380)
                }
            }
            // Glass + dark tint background
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
            .background(
                Color(red: 0.09, green: 0.11, blue: 0.14).opacity(0.9)
                    .clipShape(RoundedRectangle(cornerRadius: 18))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.white.opacity(0.09), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.55), radius: 48, x: 0, y: 24)
            .frame(width: 500)
        }
        .onAppear { searchFocused = true }
        // ⌘K toggle + Escape are both handled by ShiftPlannerView shortcuts.
    }

    // MARK: - Sub-views

    private func pill(label: String, group: PaletteGroup?) -> some View {
        let active = activeGroup == group
        return Button {
            withAnimation(.spring(duration: 0.18, bounce: 0.1)) {
                activeGroup = active ? nil : group
            }
        } label: {
            Text(label)
                .font(.system(size: 10, weight: .bold))
                .kerning(0.8)
                .foregroundStyle(active ? Color(hex: "#FFD700") : .white.opacity(0.35))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(active
                              ? Color(hex: "#FFD700").opacity(0.14)
                              : Color.white.opacity(0.06))
                )
                .overlay(
                    Capsule()
                        .stroke(active
                                ? Color(hex: "#FFD700").opacity(0.35)
                                : Color.clear,
                                lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private func groupHeader(_ group: PaletteGroup) -> some View {
        HStack(spacing: 5) {
            Image(systemName: group.icon)
                .font(.system(size: 9))
            Text(group.rawValue)
                .font(.system(size: 9, weight: .bold))
                .kerning(1.4)
        }
        .foregroundStyle(.white.opacity(0.28))
        .padding(.horizontal, 18)
        .padding(.top, 14)
        .padding(.bottom, 5)
    }

    @ViewBuilder
    private func commandRow(_ cmd: PaletteCommand) -> some View {
        Button {
            cmd.handler()
            onDismiss()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: cmd.icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(cmd.isDestructive
                                     ? Color(red: 1, green: 0.38, blue: 0.38)
                                     : cmd.iconColor)
                    .frame(width: 22, alignment: .center)

                VStack(alignment: .leading, spacing: 2) {
                    Text(cmd.label)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(cmd.isDestructive
                                         ? Color(red: 1, green: 0.38, blue: 0.38)
                                         : .white)
                    if let sub = cmd.subtitle {
                        Text(sub)
                            .font(.system(size: 10))
                            .foregroundStyle(.white.opacity(0.32))
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 9)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .hoverEffect(.highlight)
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 22))
                .foregroundStyle(.white.opacity(0.12))
            Text(query.isEmpty ? "No commands available" : "No results for \"\(query)\"")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.22))
        }
        .frame(maxWidth: .infinity)
        .frame(height: 90)
    }

    // MARK: - Helpers

    private func executeFirst() {
        guard let first = filteredCommands.first else { return }
        first.handler()
        onDismiss()
    }
}
