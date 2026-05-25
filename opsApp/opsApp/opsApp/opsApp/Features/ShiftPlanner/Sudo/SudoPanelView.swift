// SudoPanelView.swift — Native iOS port of SudoWindow.tsx
//
// Trigger: type "sudo" in the ⌘K command palette.
// Layout:  full-screen sheet, dark zinc background, red accent stripe.
//          Left nav rail (200pt) + content area.
//
// Tabs: Team | Tasks | Reports | Engine | Explorer
//
// Security note: no auth today (same as webapp). Uses the anon Supabase key.
// All writes are real — this panel lives at the same privilege level as the rest of the app.

import SwiftUI

// MARK: - Tab Definitions

enum SudoTab: String, CaseIterable, Identifiable {
    case team     = "Team"
    case tasks    = "Tasks"
    case reports  = "Reports"
    case engine   = "Engine Config"
    case explorer = "Table Explorer"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .team:     return "person.2.fill"
        case .tasks:    return "checklist"
        case .reports:  return "chart.bar.fill"
        case .engine:   return "cpu.fill"
        case .explorer: return "tablecells"
        }
    }
}

// MARK: - Panel Container

struct SudoPanelView: View {

    var onClose:       () -> Void = {}
    var onDataChanged: () -> Void = {}
    var currentNightId: UUID?

    @State private var activeTab: SudoTab = .team

    private let repo = SudoRepository()

    // MARK: Body

    var body: some View {
        ZStack {
            // Base
            Color(red: 0.06, green: 0.06, blue: 0.09).ignoresSafeArea()

            // Subtle grid backdrop (matches webapp's CSS grid)
            gridBackdrop

            VStack(spacing: 0) {

                // ── Red accent stripe ─────────────────────────────────
                LinearGradient(colors: [
                    Color.red.opacity(0.85),
                    Color(red: 1, green: 0.22, blue: 0.22).opacity(0.65),
                    Color.red.opacity(0.85),
                ], startPoint: .leading, endPoint: .trailing)
                .frame(height: 3)

                // ── Header ─────────────────────────────────────────────
                headerBar

                Divider().background(Color.white.opacity(0.08))

                // ── Body: nav rail + content ───────────────────────────
                HStack(spacing: 0) {
                    navRail
                    Divider().background(Color.white.opacity(0.07))
                    contentArea
                }

                Divider().background(Color.white.opacity(0.07))

                // ── Footer ─────────────────────────────────────────────
                footerBar
            }
        }
        // Escape closes
        .overlay(alignment: .topLeading) {
            Button("") { onClose() }
                .keyboardShortcut(.escape, modifiers: [])
                .frame(width: 0, height: 0)
                .opacity(0)
                .allowsHitTesting(false)
        }
    }

    // MARK: - Sub-views

    private var gridBackdrop: some View {
        GeometryReader { geo in
            Path { path in
                let size: CGFloat = 20
                var x: CGFloat = 0
                while x <= geo.size.width {
                    path.move(to: CGPoint(x: x, y: 0))
                    path.addLine(to: CGPoint(x: x, y: geo.size.height))
                    x += size
                }
                var y: CGFloat = 0
                while y <= geo.size.height {
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: geo.size.width, y: y))
                    y += size
                }
            }
            .stroke(Color.white.opacity(0.025), lineWidth: 0.5)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private var headerBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "terminal.fill")
                .font(.system(size: 13))
                .foregroundStyle(Color.red.opacity(0.8))

            Text("SUDO")
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundStyle(.white)
                .kerning(1.5)

            Text("·")
                .foregroundStyle(Color.white.opacity(0.2))

            Text("dev · iazgrcainbokkdqunkok")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.3))

            Spacer()

            Text("esc to close")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.25))

            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.45))
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(Color(red: 0.07, green: 0.07, blue: 0.1))
    }

    private var navRail: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(SudoTab.allCases) { tab in
                navButton(tab)
            }
            Spacer()
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .frame(width: 196)
        .background(Color(red: 0.07, green: 0.07, blue: 0.1).opacity(0.6))
    }

    private func navButton(_ tab: SudoTab) -> some View {
        let isActive = activeTab == tab
        return Button { activeTab = tab } label: {
            HStack(spacing: 9) {
                Image(systemName: tab.icon)
                    .font(.system(size: 13))
                    .foregroundStyle(isActive ? Color.red.opacity(0.85) : Color.white.opacity(0.35))
                    .frame(width: 18, alignment: .center)
                Text(tab.rawValue)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isActive ? Color(red: 1, green: 0.75, blue: 0.75) : Color.white.opacity(0.4))
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(isActive ? Color.red.opacity(0.12) : Color.clear)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(isActive ? Color.red.opacity(0.3) : Color.clear, lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var contentArea: some View {
        switch activeTab {
        case .team:
            SudoTeamTab(repo: repo, onDataChanged: onDataChanged)
        case .tasks:
            SudoTasksTab(repo: repo, onDataChanged: onDataChanged)
        case .reports:
            SudoReportsTab(repo: repo)
        case .engine:
            SudoEngineTab(repo: repo)
        case .explorer:
            SudoTableExplorerTab(repo: repo)
        }
    }

    private var footerBar: some View {
        HStack {
            Text("SUDO MODE · anon key · all writes are real")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.2))
            Spacer()
            Text("v1 · opsApp")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(Color.white.opacity(0.15))
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 7)
        .background(Color(red: 0.07, green: 0.07, blue: 0.1).opacity(0.6))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Tab Header Helper
// ─────────────────────────────────────────────────────────────────────────────

struct SudoTabHeader: View {
    let icon: String
    let title: String
    let subtitle: String
    var trailing: AnyView? = nil

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    Image(systemName: icon)
                        .font(.system(size: 13))
                        .foregroundStyle(Color.red.opacity(0.75))
                    Text(title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                }
                Text(subtitle)
                    .font(.system(size: 11))
                    .foregroundStyle(Color.white.opacity(0.35))
                    .lineLimit(2)
            }
            Spacer()
            trailing
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .background(Color(red: 0.07, green: 0.07, blue: 0.1).opacity(0.5))
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.07)), alignment: .bottom)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Toast Helper
// ─────────────────────────────────────────────────────────────────────────────

struct SudoToast: View {
    let kind: ToastKind
    let message: String

    enum ToastKind { case ok, error }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: kind == .ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .font(.system(size: 12))
                .foregroundStyle(kind == .ok ? Color.green.opacity(0.8) : Color.red.opacity(0.8))
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(2)
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 9)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(kind == .ok
                      ? Color.green.opacity(0.1)
                      : Color.red.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(kind == .ok
                                ? Color.green.opacity(0.25)
                                : Color.red.opacity(0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 20)
        .padding(.top, 10)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Pool Badge Helper
// ─────────────────────────────────────────────────────────────────────────────

struct PoolBadge: View {
    let pool: String?

    var body: some View {
        let (label, color) = poolStyle(pool)
        Text(label)
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .kerning(0.6)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Capsule().fill(color.opacity(0.14)))
            .overlay(Capsule().stroke(color.opacity(0.3), lineWidth: 0.5))
    }

    private func poolStyle(_ pool: String?) -> (String, Color) {
        switch pool {
        case "Grave": return ("GRAVE",  Color(hex: "#4CAF50"))
        case "Full":  return ("FULL",   Color(hex: "#2196F3"))
        case "AM":    return ("AM",     Color(hex: "#FF9800"))
        case "PM":    return ("PM",     Color(hex: "#9C27B0"))
        default:      return ("—",      Color.white.opacity(0.25))
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Team Tab
// ─────────────────────────────────────────────────────────────────────────────

struct SudoTeamTab: View {

    let repo: SudoRepository
    var onDataChanged: () -> Void = {}

    @State private var tms:           [TeamMember] = []
    @State private var loading  = true
    @State private var error:    String? = nil
    @State private var toast:    (SudoToast.ToastKind, String)? = nil
    @State private var query     = ""
    @State private var showInactive = false
    @State private var editing:  TeamMember? = nil

    var body: some View {
        VStack(spacing: 0) {
            SudoTabHeader(
                icon: "person.2.fill",
                title: "Team",
                subtitle: "Manage tm_profiles. Tap a row to edit. Toggle active/inactive with the archive button.",
                trailing: AnyView(refreshButton)
            )

            if let (kind, msg) = toast { SudoToast(kind: kind, message: msg) }

            // Search + filter bar
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.3))
                TextField("Search TMs…", text: $query)
                    .font(.system(size: 13))
                    .foregroundStyle(.white)
                    .tint(Color.red.opacity(0.8))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                Spacer()
                Toggle("", isOn: $showInactive)
                    .labelsHidden()
                    .tint(Color.red.opacity(0.7))
                    .scaleEffect(0.8)
                Text("Show inactive")
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.35))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.03))
            .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.06)), alignment: .bottom)

            if loading {
                ProgressView().tint(.white).padding(40)
            } else if let err = error {
                Text(err).font(.system(size: 12)).foregroundStyle(.red.opacity(0.7)).padding(20)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredTMs) { tm in
                            tmRow(tm)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .sheet(item: $editing) { tm in
            TMEditSheet(tm: tm, repo: repo) { updated in
                if let idx = tms.firstIndex(where: { $0.tmId == updated.tmId }) {
                    tms[idx] = updated
                }
                onDataChanged()
                flash(.ok, "Saved \(updated.name).")
            }
        }
        .task { await loadTMs() }
    }

    private var filteredTMs: [TeamMember] {
        let q = query.lowercased()
        return tms.filter { tm in
            let matchActive = showInactive || tm.active
            guard matchActive else { return false }
            guard !q.isEmpty else { return true }
            return tm.displayName.lowercased().contains(q)
                || (tm.fullName?.lowercased().contains(q) ?? false)
                || (tm.gravePool?.lowercased().contains(q) ?? false)
                || tm.tmId.lowercased().contains(q)
        }
    }

    private func tmRow(_ tm: TeamMember) -> some View {
        HStack(spacing: 12) {
            // Gender color bar
            RoundedRectangle(cornerRadius: 2)
                .fill(tm.isMale ? Color(hex: "#1976D2") : Color(hex: "#B7679A"))
                .frame(width: 3, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(tm.displayName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(tm.active ? .white : .white.opacity(0.35))
                    if !tm.active {
                        Text("INACTIVE")
                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.3))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.white.opacity(0.07)))
                    }
                }
                if let full = tm.fullName, !full.isEmpty, full != tm.displayName {
                    Text(full)
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.28))
                }
            }

            Spacer()

            PoolBadge(pool: tm.gravePool)

            Text(tm.tmId)
                .font(.system(size: 9, design: .monospaced))
                .foregroundStyle(.white.opacity(0.2))
                .frame(width: 100, alignment: .trailing)

            // Archive / restore toggle
            Button {
                Task { await toggleActive(tm) }
            } label: {
                Image(systemName: tm.active ? "archivebox" : "arrow.uturn.left")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.3))
                    .frame(width: 30, height: 30)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .contentShape(Rectangle())
        .onTapGesture { editing = tm }
        .background(Color.white.opacity(0.0))
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.04)), alignment: .bottom)
    }

    private var refreshButton: some View {
        Button {
            Task { await loadTMs() }
        } label: {
            Image(systemName: "arrow.clockwise")
                .font(.system(size: 12))
                .foregroundStyle(.white.opacity(0.35))
        }
        .buttonStyle(.plain)
    }

    private func loadTMs() async {
        loading = true; error = nil
        do {
            tms = try await repo.fetchAllTMs()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    private func toggleActive(_ tm: TeamMember) async {
        do {
            try await repo.setTMActive(tm.tmId, active: !tm.active)
            if let idx = tms.firstIndex(where: { $0.tmId == tm.tmId }) {
                tms[idx].active = !tm.active
            }
            onDataChanged()
            flash(.ok, "\(tm.name) marked \(tm.active ? "inactive" : "active").")
        } catch {
            flash(.error, error.localizedDescription)
        }
    }

    private func flash(_ kind: SudoToast.ToastKind, _ msg: String) {
        toast = (kind, msg)
        Task { try? await Task.sleep(for: .seconds(4)); toast = nil }
    }
}

// MARK: TM Edit Sheet

private struct TMEditSheet: View {

    let tm:            TeamMember
    let repo:          SudoRepository
    var onSave:        (TeamMember) -> Void = { _ in }

    @State private var displayName:     String
    @State private var fullName:        String
    @State private var gravePool:       String
    @State private var primarySection:  String
    @State private var status:          String
    @State private var gender:          String
    @State private var saving = false
    @State private var error: String? = nil
    @State private var prefs:  [TMPreference]    = []
    @State private var accs:   [TMAccommodation] = []
    @State private var activeSubtab = 0

    @Environment(\.dismiss) private var dismiss

    init(tm: TeamMember, repo: SudoRepository, onSave: @escaping (TeamMember) -> Void) {
        self.tm = tm
        self.repo = repo
        self.onSave = onSave
        _displayName    = State(initialValue: tm.displayName)
        _fullName       = State(initialValue: tm.fullName ?? "")
        _gravePool      = State(initialValue: tm.gravePool ?? "")
        _primarySection = State(initialValue: tm.primarySection ?? "")
        _status         = State(initialValue: tm.status ?? "active")
        _gender         = State(initialValue: tm.gender ?? "")
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.08, green: 0.08, blue: 0.11).ignoresSafeArea()

                VStack(spacing: 0) {
                    // Sub-tab picker
                    Picker("", selection: $activeSubtab) {
                        Text("Identity").tag(0)
                        Text("Pool / Status").tag(1)
                        Text("Prefs").tag(2)
                        Text("Accoms").tag(3)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)

                    if let err = error {
                        SudoToast(kind: .error, message: err)
                    }

                    ScrollView(.vertical, showsIndicators: false) {
                        VStack(spacing: 0) {
                            switch activeSubtab {
                            case 0: identityFields
                            case 1: poolFields
                            case 2: prefsView
                            case 3: accomsView
                            default: EmptyView()
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                        .padding(.bottom, 40)
                    }
                }
            }
            .navigationTitle(tm.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.foregroundStyle(.white.opacity(0.6))
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView().tint(.white)
                    } else {
                        Button("Save") { Task { await save() } }
                            .fontWeight(.semibold)
                            .foregroundStyle(Color.red.opacity(0.85))
                    }
                }
            }
        }
        .presentationDetents([.large])
        .task { await loadDetail() }
    }

    private var identityFields: some View {
        VStack(spacing: 14) {
            sudoField("Display Name", text: $displayName, hint: "Short name shown on cards")
            sudoField("Full Name", text: $fullName, hint: "ADP payroll name (used for schedule matching)")
            sudoField("TM ID", text: .constant(tm.tmId), hint: "Primary key — not editable")
                .disabled(true)
                .opacity(0.5)
        }
        .padding(.top, 12)
    }

    private var poolFields: some View {
        VStack(spacing: 14) {
            sudoPicker("Grave Pool", value: $gravePool,
                       options: ["Grave", "Full", "AM", "PM", ""],
                       labels: ["Grave", "Full", "AM Overlap", "PM Overlap", "None"])
            sudoPicker("Gender", value: $gender,
                       options: ["male", "female", ""],
                       labels: ["Male", "Female", "Unset"])
            sudoPicker("Status", value: $status,
                       options: ["active", "LOA", "transferred", "separated", "other"],
                       labels: ["Active", "LOA", "Transferred", "Separated", "Other"])
            sudoField("Primary Section", text: $primarySection, hint: "e.g. grave, swing")
        }
        .padding(.top, 12)
    }

    private var prefsView: some View {
        Group {
            if prefs.isEmpty {
                Text("No preferences on file.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.3))
                    .padding(.top, 20)
            } else {
                VStack(spacing: 6) {
                    ForEach(prefs) { pref in
                        HStack(spacing: 10) {
                            Text(pref.stance == "prefer" ? "▲" : "▼")
                                .foregroundStyle(pref.stance == "prefer"
                                                 ? Color.green.opacity(0.7) : Color.red.opacity(0.7))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(pref.target)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(.white)
                                Text("\(pref.stance) · \(pref.strength)")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(.white.opacity(0.35))
                            }
                            Spacer()
                            if let note = pref.note {
                                Text(note)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.white.opacity(0.3))
                                    .lineLimit(1)
                            }
                        }
                        .padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.04)))
                    }
                }
                .padding(.top, 12)
            }
        }
    }

    private var accomsView: some View {
        Group {
            if accs.isEmpty {
                Text("No accommodations on file.")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.3))
                    .padding(.top, 20)
            } else {
                VStack(spacing: 6) {
                    ForEach(accs) { acc in
                        HStack(spacing: 10) {
                            Text(acc.severity == "hard" ? "●" : "◐")
                                .foregroundStyle(acc.severity == "hard"
                                                 ? Color.red.opacity(0.8) : Color.orange.opacity(0.7))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(acc.type)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(.white)
                                Text(acc.note)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.white.opacity(0.35))
                                    .lineLimit(2)
                            }
                            Spacer()
                            Text(acc.status)
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(acc.status == "active"
                                                 ? Color.green.opacity(0.7) : .white.opacity(0.3))
                        }
                        .padding(10)
                        .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.04)))
                    }
                }
                .padding(.top, 12)
            }
        }
    }

    private func sudoField(_ label: String, text: Binding<String>, hint: String = "") -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.3))
                .kerning(0.8)
            TextField(hint, text: text)
                .font(.system(size: 13))
                .foregroundStyle(.white)
                .tint(Color.red.opacity(0.8))
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.09), lineWidth: 1))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
        }
    }

    private func sudoPicker(_ label: String, value: Binding<String>,
                            options: [String], labels: [String]) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.3))
                .kerning(0.8)
            Picker("", selection: value) {
                ForEach(Array(zip(options, labels)), id: \.0) { opt, lbl in
                    Text(lbl.isEmpty ? "None" : lbl).tag(opt)
                }
            }
            .pickerStyle(.menu)
            .tint(.white.opacity(0.8))
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.06)))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color.white.opacity(0.09), lineWidth: 1))
        }
    }

    private func loadDetail() async {
        async let p = repo.fetchPreferences(tmId: tm.tmId)
        async let a = repo.fetchAccommodations(tmId: tm.tmId)
        prefs = (try? await p) ?? []
        accs  = (try? await a) ?? []
    }

    private func save() async {
        saving = true; error = nil
        do {
            try await repo.updateTMFields(
                tmId:           tm.tmId,
                displayName:    displayName,
                fullName:       fullName.isEmpty ? nil : fullName,
                gravePool:      gravePool.isEmpty ? nil : gravePool,
                primarySection: primarySection.isEmpty ? nil : primarySection,
                status:         status.isEmpty ? nil : status,
                gender:         gender.isEmpty ? nil : gender
            )
            var updated = tm
            updated.displayName    = displayName
            updated.fullName       = fullName.isEmpty ? nil : fullName
            updated.gravePool      = gravePool.isEmpty ? nil : gravePool
            updated.primarySection = primarySection.isEmpty ? nil : primarySection
            updated.status         = status.isEmpty ? nil : status
            updated.gender         = gender.isEmpty ? nil : gender
            onSave(updated)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
        saving = false
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Tasks Tab
// ─────────────────────────────────────────────────────────────────────────────

struct SudoTasksTab: View {

    let repo: SudoRepository
    var onDataChanged: () -> Void = {}

    @State private var tasks:    [CatalogTask] = []
    @State private var loading   = true
    @State private var error:    String? = nil
    @State private var toast:    (SudoToast.ToastKind, String)? = nil
    @State private var activeType: String = "all"
    @State private var showAdd   = false
    @State private var editing:  CatalogTask? = nil

    // Add form
    @State private var newSlotKey  = ""
    @State private var newSlotType = "zone"
    @State private var newLabel    = ""
    @State private var newIsDefault = false

    private let typeOptions = ["all", "zone", "rr", "aux", "overlap"]

    var body: some View {
        VStack(spacing: 0) {
            SudoTabHeader(
                icon: "checklist",
                title: "Tasks",
                subtitle: "Manage slot_task_catalog — the global pool of reusable task labels.",
                trailing: AnyView(
                    HStack(spacing: 8) {
                        Button { Task { await loadTasks() } } label: {
                            Image(systemName: "arrow.clockwise").font(.system(size: 12))
                                .foregroundStyle(.white.opacity(0.35))
                        }.buttonStyle(.plain)
                        Button { showAdd.toggle() } label: {
                            Image(systemName: showAdd ? "xmark" : "plus").font(.system(size: 12))
                                .foregroundStyle(Color.red.opacity(0.8))
                        }.buttonStyle(.plain)
                    }
                )
            )

            if let (kind, msg) = toast { SudoToast(kind: kind, message: msg) }

            // Add form
            if showAdd {
                addForm
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .background(Color.white.opacity(0.03))
                    .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.06)), alignment: .bottom)
            }

            // Type filter pills
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(typeOptions, id: \.self) { t in
                        typePill(t)
                    }
                }
                .padding(.horizontal, 20).padding(.vertical, 8)
            }
            .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.06)), alignment: .bottom)

            if loading {
                ProgressView().tint(.white).padding(40)
            } else if let err = error {
                Text(err).font(.system(size: 12)).foregroundStyle(.red.opacity(0.7)).padding(20)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredTasks) { task in
                            taskRow(task)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .sheet(item: $editing) { task in
            TaskEditSheet(task: task, repo: repo) { updated in
                if let idx = tasks.firstIndex(where: { $0.id == updated.id }) {
                    tasks[idx] = updated
                }
                flash(.ok, "Saved '\(updated.label)'.")
            }
        }
        .task { await loadTasks() }
    }

    private var filteredTasks: [CatalogTask] {
        guard activeType != "all" else { return tasks }
        return tasks.filter { $0.slotType == activeType }
    }

    private func typePill(_ type: String) -> some View {
        let isActive = activeType == type
        let label = type == "all" ? "ALL" : type.uppercased()
        return Button { activeType = type } label: {
            Text(label)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .kerning(0.6)
                .foregroundStyle(isActive ? Color.red.opacity(0.9) : .white.opacity(0.35))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(isActive ? Color.red.opacity(0.12) : Color.white.opacity(0.05)))
                .overlay(Capsule().stroke(isActive ? Color.red.opacity(0.3) : Color.clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var addForm: some View {
        VStack(spacing: 10) {
            Text("ADD CATALOG TASK")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(.white.opacity(0.3))
                .kerning(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 10) {
                Picker("", selection: $newSlotType) {
                    ForEach(["zone", "rr", "aux", "overlap"], id: \.self) { t in
                        Text(t).tag(t)
                    }
                }
                .pickerStyle(.menu)
                .tint(.white.opacity(0.7))
                .frame(width: 100)
                .padding(.horizontal, 8).padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06)))

                TextField("slot_key (e.g. zone_1)", text: $newSlotKey)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.white)
                    .tint(Color.red.opacity(0.8))
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06)))
                    .frame(width: 160)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                TextField("Label (e.g. And Zone 6)", text: $newLabel)
                    .font(.system(size: 12))
                    .foregroundStyle(.white)
                    .tint(Color.red.opacity(0.8))
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.white.opacity(0.06)))
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                Toggle("Default", isOn: $newIsDefault)
                    .font(.system(size: 11))
                    .foregroundStyle(.white.opacity(0.5))
                    .tint(Color.red.opacity(0.7))

                Button("Add") { Task { await addTask() } }
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(newLabel.isEmpty ? .white.opacity(0.3) : Color.red.opacity(0.9))
                    .disabled(newLabel.isEmpty)
            }
        }
    }

    private func taskRow(_ task: CatalogTask) -> some View {
        HStack(spacing: 12) {
            typeTag(task.slotType)
            VStack(alignment: .leading, spacing: 2) {
                Text(task.label)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.white)
                Text(task.slotKey + (task.rrSide.map { " · \($0)" } ?? ""))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.3))
            }
            Spacer()
            if task.isDefaultOnNewNight {
                Text("DEFAULT")
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundStyle(Color.green.opacity(0.6))
                    .padding(.horizontal, 5).padding(.vertical, 2)
                    .background(Capsule().fill(Color.green.opacity(0.1)))
            }
            Text("#\(task.sortOrder)")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.white.opacity(0.2))
                .frame(width: 36, alignment: .trailing)
            Button { editing = task } label: {
                Image(systemName: "pencil").font(.system(size: 11)).foregroundStyle(.white.opacity(0.3))
            }.buttonStyle(.plain)
            Button { Task { await deleteTask(task) } } label: {
                Image(systemName: "trash").font(.system(size: 11)).foregroundStyle(.red.opacity(0.4))
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 20).padding(.vertical, 10)
        .contentShape(Rectangle())
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.04)), alignment: .bottom)
    }

    private func typeTag(_ type: String) -> some View {
        let (label, color) = typeStyle(type)
        return Text(label)
            .font(.system(size: 8, weight: .bold, design: .monospaced))
            .foregroundStyle(color)
            .padding(.horizontal, 5).padding(.vertical, 2)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    private func typeStyle(_ type: String) -> (String, Color) {
        switch type {
        case "zone":    return ("ZONE",    Color.green.opacity(0.8))
        case "rr":      return ("RR",      Color.orange.opacity(0.8))
        case "overlap": return ("OVERLAP", Color.purple.opacity(0.8))
        case "aux":     return ("AUX",     Color.blue.opacity(0.8))
        default:        return (type.uppercased(), Color.white.opacity(0.5))
        }
    }

    private func loadTasks() async {
        loading = true; error = nil
        do { tasks = try await repo.fetchCatalogTasks() }
        catch { self.error = error.localizedDescription }
        loading = false
    }

    private func addTask() async {
        let sortOrder = (tasks.map(\.sortOrder).max() ?? 0) + 1
        do {
            let created = try await repo.insertCatalogTask(
                slotKey: newSlotKey.isEmpty ? newSlotType + "_" : newSlotKey,
                slotType: newSlotType,
                rrSide: nil,
                label: newLabel,
                sortOrder: sortOrder,
                isDefault: newIsDefault
            )
            tasks.append(created)
            newLabel = ""; newSlotKey = ""
            showAdd = false
            flash(.ok, "Added '\(created.label)'.")
        } catch {
            flash(.error, error.localizedDescription)
        }
    }

    private func deleteTask(_ task: CatalogTask) async {
        do {
            try await repo.deleteCatalogTask(id: task.id)
            tasks.removeAll { $0.id == task.id }
            flash(.ok, "Deleted '\(task.label)'.")
        } catch {
            flash(.error, error.localizedDescription)
        }
    }

    private func flash(_ kind: SudoToast.ToastKind, _ msg: String) {
        toast = (kind, msg)
        Task { try? await Task.sleep(for: .seconds(4)); toast = nil }
    }
}

private struct TaskEditSheet: View {
    let task: CatalogTask
    let repo: SudoRepository
    var onSave: (CatalogTask) -> Void = { _ in }

    @State private var label:     String
    @State private var sortOrder: Int
    @State private var isDefault: Bool
    @State private var saving = false
    @State private var error: String? = nil
    @Environment(\.dismiss) private var dismiss

    init(task: CatalogTask, repo: SudoRepository, onSave: @escaping (CatalogTask) -> Void) {
        self.task = task; self.repo = repo; self.onSave = onSave
        _label     = State(initialValue: task.label)
        _sortOrder = State(initialValue: task.sortOrder)
        _isDefault = State(initialValue: task.isDefaultOnNewNight)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.08, green: 0.08, blue: 0.11).ignoresSafeArea()
                VStack(spacing: 16) {
                    if let err = error { SudoToast(kind: .error, message: err) }
                    VStack(alignment: .leading, spacing: 5) {
                        Text("LABEL").font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.3)).kerning(0.8)
                        TextField("e.g. And Zone 6", text: $label)
                            .font(.system(size: 14)).foregroundStyle(.white).tint(Color.red.opacity(0.8))
                            .padding(12)
                            .background(RoundedRectangle(cornerRadius: 8).fill(Color.white.opacity(0.07)))
                            .autocorrectionDisabled()
                    }
                    Stepper("Sort order: \(sortOrder)", value: $sortOrder, in: 0...999)
                        .font(.system(size: 13)).foregroundStyle(.white.opacity(0.75))
                    Toggle("Apply to new nights by default", isOn: $isDefault)
                        .font(.system(size: 13)).foregroundStyle(.white.opacity(0.75))
                        .tint(Color.red.opacity(0.75))
                    Spacer()
                }
                .padding(.horizontal, 20).padding(.top, 20)
            }
            .navigationTitle(task.slotKey)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.foregroundStyle(.white.opacity(0.6))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .fontWeight(.semibold).foregroundStyle(Color.red.opacity(0.85))
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() async {
        saving = true; error = nil
        do {
            try await repo.updateCatalogTask(id: task.id, label: label, sortOrder: sortOrder, isDefault: isDefault)
            var updated = task; updated.label = label; updated.sortOrder = sortOrder; updated.isDefaultOnNewNight = isDefault
            onSave(updated); dismiss()
        } catch { self.error = error.localizedDescription }
        saving = false
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Reports Tab
// ─────────────────────────────────────────────────────────────────────────────

struct SudoReportsTab: View {

    let repo: SudoRepository

    @State private var entries:   [ZoneFrequencyEntry] = []
    @State private var loading    = true
    @State private var error:     String? = nil
    @State private var daysBack   = 30
    @State private var viewMode   = 0   // 0 = By TM, 1 = By Zone
    @State private var expanded:  String? = nil  // tmId or zoneKey

    private let daysOptions = [7, 14, 30, 60, 90]

    var body: some View {
        VStack(spacing: 0) {
            SudoTabHeader(
                icon: "chart.bar.fill",
                title: "Reports",
                subtitle: "Zone placement frequency from zone_assignments history.",
                trailing: AnyView(refreshButton)
            )

            // Controls
            HStack(spacing: 14) {
                Picker("", selection: $daysBack) {
                    ForEach(daysOptions, id: \.self) { d in Text("Last \(d)d").tag(d) }
                }
                .pickerStyle(.segmented).frame(maxWidth: 300)
                .onChange(of: daysBack) { _, _ in Task { await loadData() } }

                Spacer()

                Picker("", selection: $viewMode) {
                    Text("By TM").tag(0)
                    Text("By Zone").tag(1)
                }
                .pickerStyle(.segmented).frame(width: 160)
            }
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(Color.white.opacity(0.03))
            .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.06)), alignment: .bottom)

            if loading {
                ProgressView().tint(.white).padding(40)
            } else if let err = error {
                Text(err).font(.system(size: 12)).foregroundStyle(.red.opacity(0.7)).padding(20)
            } else if viewMode == 0 {
                byTMView
            } else {
                byZoneView
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .task { await loadData() }
    }

    private var byTMView: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(entries.sorted(by: { $0.total > $1.total })) { entry in
                    tmFrequencyRow(entry)
                }
            }
        }
    }

    private var byZoneView: some View {
        ScrollView(.vertical, showsIndicators: false) {
            LazyVStack(spacing: 0) {
                ForEach(ZONE_DEFS, id: \.key) { def in
                    zoneFrequencyRow(def.key, label: def.label)
                }
            }
        }
    }

    private func tmFrequencyRow(_ entry: ZoneFrequencyEntry) -> some View {
        let isExpanded = expanded == entry.tmId
        return VStack(spacing: 0) {
            Button { withAnimation(.easeInOut(duration: 0.18)) {
                expanded = isExpanded ? nil : entry.tmId
            }} label: {
                HStack(spacing: 12) {
                    Text(entry.tmName)
                        .font(.system(size: 13, weight: .medium)).foregroundStyle(.white)
                    Spacer()
                    Text("\(entry.total) assignments")
                        .font(.system(size: 11, design: .monospaced)).foregroundStyle(.white.opacity(0.35))
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10)).foregroundStyle(.white.opacity(0.25))
                }
                .padding(.horizontal, 20).padding(.vertical, 11)
            }
            .buttonStyle(.plain)

            if isExpanded {
                freqBarChart(entry.zoneCounts)
                    .padding(.horizontal, 20).padding(.bottom, 10)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.04)), alignment: .bottom)
    }

    private func zoneFrequencyRow(_ zoneKey: String, label: String) -> some View {
        let counts: [(String, Int)] = entries.compactMap { entry in
            guard let c = entry.zoneCounts[zoneKey], c > 0 else { return nil }
            return (entry.tmName, c)
        }.sorted { $0.1 > $1.1 }

        let isExpanded = expanded == zoneKey
        return VStack(spacing: 0) {
            Button { withAnimation(.easeInOut(duration: 0.18)) {
                expanded = isExpanded ? nil : zoneKey
            }} label: {
                HStack(spacing: 10) {
                    Text(zoneIcon(zoneKey))
                        .font(.system(size: 11))
                        .foregroundStyle(zoneAccent(zoneKey))
                    Text(label)
                        .font(.system(size: 13, weight: .medium)).foregroundStyle(.white)
                    Spacer()
                    Text("\(counts.count) TMs · \(counts.map(\.1).reduce(0,+)) total")
                        .font(.system(size: 11, design: .monospaced)).foregroundStyle(.white.opacity(0.3))
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10)).foregroundStyle(.white.opacity(0.25))
                }
                .padding(.horizontal, 20).padding(.vertical, 11)
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(spacing: 4) {
                    ForEach(counts.prefix(10), id: \.0) { (name, count) in
                        HStack(spacing: 8) {
                            Text(name).font(.system(size: 12)).foregroundStyle(.white.opacity(0.8)).frame(width: 120, alignment: .leading)
                            GeometryReader { geo in
                                let maxVal = counts.first?.1 ?? 1
                                let w = geo.size.width * CGFloat(count) / CGFloat(maxVal)
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(zoneAccent(zoneKey).opacity(0.6))
                                    .frame(width: max(4, w), height: 14)
                            }
                            .frame(height: 14)
                            Text("\(count)").font(.system(size: 10, design: .monospaced)).foregroundStyle(.white.opacity(0.4)).frame(width: 28, alignment: .trailing)
                        }
                    }
                }
                .padding(.horizontal, 20).padding(.bottom, 12)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.04)), alignment: .bottom)
    }

    private func freqBarChart(_ zoneCounts: [String: Int]) -> some View {
        let maxCount = zoneCounts.values.max() ?? 1
        let sorted = ZONE_DEFS.compactMap { def -> (String, String, Int)? in
            guard let c = zoneCounts[def.key], c > 0 else { return nil }
            return (def.key, def.label, c)
        }
        return VStack(spacing: 4) {
            ForEach(sorted, id: \.0) { (key, label, count) in
                HStack(spacing: 8) {
                    Text(label).font(.system(size: 10)).foregroundStyle(.white.opacity(0.5)).frame(width: 60, alignment: .leading)
                    GeometryReader { geo in
                        let w = geo.size.width * CGFloat(count) / CGFloat(maxCount)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(zoneAccent(key).opacity(0.7))
                            .frame(width: max(4, w), height: 14)
                    }
                    .frame(height: 14)
                    Text("\(count)").font(.system(size: 9, design: .monospaced)).foregroundStyle(.white.opacity(0.4))
                }
            }
        }
    }

    private var refreshButton: some View {
        Button { Task { await loadData() } } label: {
            Image(systemName: "arrow.clockwise").font(.system(size: 12)).foregroundStyle(.white.opacity(0.35))
        }.buttonStyle(.plain)
    }

    private func loadData() async {
        loading = true; error = nil
        do {
            let rows = try await repo.fetchZoneAssignmentsForFrequency(daysBack: daysBack)
            // Build frequency map
            var byTm: [String: [String: Int]] = [:]
            for row in rows {
                let uiKey = dbSlotKeyToUI(row.slotKey)
                byTm[row.tmId, default: [:]][uiKey, default: 0] += 1
            }
            // We need display names - fetch all TMs for name lookup
            // Use a simple approach: the names are already in the assignments table indirectly
            // For now we'll use the tmId as name fallback and improve post-build
            entries = byTm.map { (tmId, counts) in
                ZoneFrequencyEntry(tmId: tmId, tmName: tmId, zoneCounts: counts)
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    /// Convert DB slot key (e.g. "zone_1") to UI key (e.g. "Z1")
    private func dbSlotKeyToUI(_ slotKey: String) -> String {
        if slotKey.hasPrefix("zone_") {
            let n = slotKey.dropFirst(5)
            return "Z\(n)"
        }
        return slotKey.uppercased()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Engine Config Tab
// ─────────────────────────────────────────────────────────────────────────────

struct SudoEngineTab: View {

    let repo: SudoRepository

    @State private var config:          EngineConfigRecord? = nil
    @State private var loading   = true
    @State private var saving    = false
    @State private var error:    String? = nil
    @State private var toast:    (SudoToast.ToastKind, String)? = nil

    @State private var placementMethod:     String = "weighted"
    @State private var grokReasoningEffort: String = "medium"

    private let placementOptions: [(String, String, String)] = [
        ("weighted",    "Weighted (Default)",  "Deterministic scoring with tunable weights. Fast and fully predictable."),
        ("grok-hybrid", "Grok-Hybrid",         "Deterministic Top-K + Grok AI judgment layer. Best quality when context matters."),
        ("greedy",      "Greedy",              "Highest-score-first. Good for testing or very small crews."),
    ]

    private let effortOptions: [(String, String, String, String)] = [
        ("low",    "Low",    "Minimal reasoning. Fastest, lowest token cost.",       "Fast"),
        ("medium", "Medium", "Recommended. Strong judgment with good speed/quality.", "Balanced"),
        ("high",   "High",   "Maximum chain-of-thought. Highest quality, higher cost.", "Deep"),
        ("none",   "None",   "Disable reasoning entirely. Pure model output.",        "Raw"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            SudoTabHeader(
                icon: "cpu.fill",
                title: "Engine Config",
                subtitle: "Configure the placement algorithm and Grok reasoning depth.",
                trailing: AnyView(refreshButton)
            )

            if let (kind, msg) = toast { SudoToast(kind: kind, message: msg) }

            if loading {
                ProgressView().tint(.white).padding(40)
            } else {
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 24) {

                        if let err = error {
                            Text(err).font(.system(size: 12)).foregroundStyle(.red.opacity(0.7))
                        }

                        if config == nil {
                            Text("No active engine config found in DB.")
                                .font(.system(size: 12)).foregroundStyle(.white.opacity(0.4))
                        }

                        // Placement method
                        VStack(alignment: .leading, spacing: 10) {
                            sectionLabel("PLACEMENT METHOD")
                            ForEach(placementOptions, id: \.0) { (value, label, desc) in
                                optionCard(value: value, label: label, desc: desc,
                                           isSelected: placementMethod == value) {
                                    placementMethod = value
                                }
                            }
                        }

                        // Grok reasoning
                        VStack(alignment: .leading, spacing: 10) {
                            sectionLabel("GROK REASONING EFFORT")
                            ForEach(effortOptions, id: \.0) { (value, label, desc, badge) in
                                effortCard(value: value, label: label, desc: desc, badge: badge,
                                           isSelected: grokReasoningEffort == value) {
                                    grokReasoningEffort = value
                                }
                            }
                        }

                        // Save
                        if let cfg = config {
                            Button {
                                Task { await saveConfig(id: cfg.id) }
                            } label: {
                                HStack(spacing: 8) {
                                    if saving { ProgressView().tint(.white).scaleEffect(0.8) }
                                    Text(saving ? "Saving…" : "Save Changes")
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(.white)
                                }
                                .frame(height: 40)
                                .frame(maxWidth: .infinity)
                                .background(RoundedRectangle(cornerRadius: 10).fill(Color.red.opacity(0.75)))
                            }
                            .buttonStyle(.plain)
                            .disabled(saving)
                        }
                    }
                    .padding(20)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .task { await loadConfig() }
    }

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .bold, design: .monospaced))
            .foregroundStyle(.white.opacity(0.3))
            .kerning(1.2)
    }

    private func optionCard(value: String, label: String, desc: String,
                            isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 16))
                    .foregroundStyle(isSelected ? Color.red.opacity(0.85) : .white.opacity(0.25))
                VStack(alignment: .leading, spacing: 3) {
                    Text(label).font(.system(size: 13, weight: .medium))
                        .foregroundStyle(isSelected ? .white : .white.opacity(0.65))
                    Text(desc).font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.35))
                        .lineLimit(2)
                }
                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? Color.red.opacity(0.1) : Color.white.opacity(0.04))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(isSelected ? Color.red.opacity(0.3) : Color.white.opacity(0.07), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private func effortCard(value: String, label: String, desc: String, badge: String,
                            isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 16))
                    .foregroundStyle(isSelected ? Color.red.opacity(0.85) : .white.opacity(0.25))
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(label).font(.system(size: 13, weight: .medium))
                            .foregroundStyle(isSelected ? .white : .white.opacity(0.65))
                        Text(badge)
                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color.red.opacity(0.7))
                            .padding(.horizontal, 5).padding(.vertical, 2)
                            .background(Capsule().fill(Color.red.opacity(0.1)))
                    }
                    Text(desc).font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.35))
                }
                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? Color.red.opacity(0.1) : Color.white.opacity(0.04))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(isSelected ? Color.red.opacity(0.3) : Color.white.opacity(0.07), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    private var refreshButton: some View {
        Button { Task { await loadConfig() } } label: {
            Image(systemName: "arrow.clockwise").font(.system(size: 12)).foregroundStyle(.white.opacity(0.35))
        }.buttonStyle(.plain)
    }

    private func loadConfig() async {
        loading = true; error = nil
        do {
            if let cfg = try await repo.fetchActiveEngineConfig() {
                config = cfg
                placementMethod     = cfg.placementMethod
                grokReasoningEffort = cfg.grokReasoningEffort
            }
        } catch { self.error = error.localizedDescription }
        loading = false
    }

    private func saveConfig(id: UUID) async {
        saving = true
        do {
            try await repo.updateEngineConfig(id: id, placementMethod: placementMethod, grokEffort: grokReasoningEffort)
            config?.placementMethod     = placementMethod
            config?.grokReasoningEffort = grokReasoningEffort
            flash(.ok, "Engine config updated.")
        } catch {
            flash(.error, error.localizedDescription)
        }
        saving = false
    }

    private func flash(_ kind: SudoToast.ToastKind, _ msg: String) {
        toast = (kind, msg)
        Task { try? await Task.sleep(for: .seconds(4)); toast = nil }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK: - Table Explorer Tab
// ─────────────────────────────────────────────────────────────────────────────

struct SudoTableExplorerTab: View {

    let repo: SudoRepository

    @State private var selectedTable: String? = nil
    @State private var rowData:       [[String: String]] = []
    @State private var columns:       [String] = []
    @State private var loading        = false
    @State private var error:         String? = nil
    @State private var offset         = 0
    private let limit = 50

    var body: some View {
        HStack(spacing: 0) {
            // Table list
            VStack(alignment: .leading, spacing: 2) {
                Text("TABLES")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(.white.opacity(0.25))
                    .kerning(1.2)
                    .padding(.horizontal, 14)
                    .padding(.top, 14)
                    .padding(.bottom, 6)

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(repo.explorableTables, id: \.self) { tableName in
                            tableListRow(tableName)
                        }
                    }
                    .padding(.bottom, 10)
                }
            }
            .frame(width: 200)
            .background(Color(red: 0.07, green: 0.07, blue: 0.1).opacity(0.5))
            .overlay(Rectangle().frame(width: 1).foregroundStyle(Color.white.opacity(0.06)), alignment: .trailing)

            // Data panel
            VStack(spacing: 0) {
                if let table = selectedTable {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(table)
                                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                .foregroundStyle(.white)
                            Text("rows \(offset + 1)–\(offset + rowData.count) · showing \(limit) per page")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.3))
                        }
                        Spacer()
                        HStack(spacing: 8) {
                            Button { if offset > 0 { offset -= limit; Task { await loadTable(table) } } } label: {
                                Image(systemName: "chevron.left").font(.system(size: 12))
                                    .foregroundStyle(offset > 0 ? .white.opacity(0.6) : .white.opacity(0.2))
                            }.buttonStyle(.plain).disabled(offset == 0)
                            Button { offset += limit; Task { await loadTable(table) } } label: {
                                Image(systemName: "chevron.right").font(.system(size: 12))
                                    .foregroundStyle(rowData.count == limit ? .white.opacity(0.6) : .white.opacity(0.2))
                            }.buttonStyle(.plain).disabled(rowData.count < limit)
                        }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Color(red: 0.07, green: 0.07, blue: 0.1).opacity(0.6))
                    .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.06)), alignment: .bottom)

                    if loading {
                        ProgressView().tint(.white).padding(40)
                    } else if let err = error {
                        Text(err).font(.system(size: 12)).foregroundStyle(.red.opacity(0.7)).padding(20)
                    } else if rowData.isEmpty {
                        Text("No rows.").font(.system(size: 12)).foregroundStyle(.white.opacity(0.3)).padding(20)
                    } else {
                        dataGrid
                    }
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: "tablecells")
                            .font(.system(size: 28)).foregroundStyle(.white.opacity(0.1))
                        Text("Select a table to browse its rows")
                            .font(.system(size: 13)).foregroundStyle(.white.opacity(0.25))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func tableListRow(_ tableName: String) -> some View {
        let isSelected = selectedTable == tableName
        return Button {
            selectedTable = tableName; offset = 0
            Task { await loadTable(tableName) }
        } label: {
            Text(tableName)
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(isSelected ? Color.red.opacity(0.9) : .white.opacity(0.45))
                .padding(.horizontal, 14).padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(isSelected ? Color.red.opacity(0.1) : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private var dataGrid: some View {
        ScrollView([.horizontal, .vertical], showsIndicators: true) {
            VStack(alignment: .leading, spacing: 0) {
                // Header
                HStack(spacing: 0) {
                    ForEach(columns, id: \.self) { col in
                        Text(col)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.4))
                            .kerning(0.5)
                            .frame(width: columnWidth(col), alignment: .leading)
                            .padding(.horizontal, 8).padding(.vertical, 7)
                            .background(Color(red: 0.07, green: 0.07, blue: 0.1))
                            .overlay(Rectangle().frame(width: 1).foregroundStyle(Color.white.opacity(0.06)), alignment: .trailing)
                    }
                }
                .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.08)), alignment: .bottom)

                // Rows
                ForEach(Array(rowData.enumerated()), id: \.offset) { (idx, row) in
                    HStack(spacing: 0) {
                        ForEach(columns, id: \.self) { col in
                            Text(row[col] ?? "")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.white.opacity(0.65))
                                .lineLimit(1)
                                .frame(width: columnWidth(col), alignment: .leading)
                                .padding(.horizontal, 8).padding(.vertical, 6)
                                .overlay(Rectangle().frame(width: 1).foregroundStyle(Color.white.opacity(0.04)), alignment: .trailing)
                        }
                    }
                    .background(idx % 2 == 0 ? Color.white.opacity(0.0) : Color.white.opacity(0.02))
                    .overlay(Rectangle().frame(height: 1).foregroundStyle(Color.white.opacity(0.04)), alignment: .bottom)
                }
            }
        }
    }

    private func columnWidth(_ col: String) -> CGFloat {
        // Widen known large-value columns
        switch col {
        case "id", "night_id", "tm_id", "week_id": return 240
        case "created_at", "updated_at": return 180
        case "notes", "note", "label", "display_name", "full_name": return 220
        default: return 140
        }
    }

    private func loadTable(_ tableName: String) async {
        loading = true; error = nil
        do {
            let data = try await repo.fetchTableData(tableName: tableName, limit: limit, offset: offset)
            let json = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []

            if let first = json.first {
                columns = first.keys.sorted()
            } else {
                columns = []
            }

            rowData = json.map { row in
                Dictionary(uniqueKeysWithValues: row.map { (k, v) in
                    (k, String(describing: v))
                })
            }
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }
}
