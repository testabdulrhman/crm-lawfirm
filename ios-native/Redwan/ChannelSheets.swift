import SwiftUI

// نقاش جديد مُسمّى بأعضاء (طلب المدير 2026-09-13: «ودي أفتح نقاش جديد وأقدر أسميّه،
// وأضيف فيه الناس»). النقاش المُسمّى = قناة بعضوية: يراها أعضاؤها والمدير فقط،
// ولا يُربط بملف. الإنشاء ذرّي في القاعدة (create_channel)، وكل إضافة تُشعر العضو
// من القاعدة أيضاً — فالشاشتان هنا واجهة لا منطق.

/// من يصلح أن يُضاف: النشطون (staff يستثني الموقوفين) بلا حساب مراجعة أبل المعزول —
/// وهو ممنوع في القاعدة أيضاً — ولا المنشئ نفسه (عضو دائماً).
private func eligibleMembers(_ staff: [TeamMember], excluding me: String?) -> [TeamMember] {
    staff.filter { $0.is_reviewer != true && $0.id != me }
}

private struct MemberToggleRow: View {
    let member: TeamMember
    let on: Bool

    var body: some View {
        HStack(spacing: 10) {
            AvatarCircle(member: member, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(member.name ?? member.short_name ?? "—")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.navy)
                if member.is_director == true {
                    Text("مدير").font(.system(size: 11)).foregroundStyle(Theme.goldDark)
                }
            }
            Spacer(minLength: 8)
            Image(systemName: on ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 22))
                .foregroundStyle(on ? Theme.goldDark : Theme.line)
        }
        .contentShape(Rectangle())
    }
}

// MARK: - الإنشاء

struct NewChannelSheet: View {
    let onCreated: (_ id: String, _ title: String) -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var staff: [TeamMember] = []
    @State private var picked: Set<String> = []
    @State private var search = ""
    @State private var loaded = false
    @State private var loadError: String?
    @State private var busy = false
    @State private var alertText: String?
    @FocusState private var nameFocused: Bool

    private var trimmed: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var candidates: [TeamMember] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return eligibleMembers(staff, excluding: sb.member?.id).filter {
            q.isEmpty || ($0.name ?? "").arContains(q) || ($0.short_name ?? "").arContains(q)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("مثال: قضايا الإفلاس — متابعة أسبوعية", text: $title)
                        .focused($nameFocused)
                        .submitLabel(.done)
                } header: {
                    Text("اسم النقاش")
                } footer: {
                    Text("يراه أعضاؤه وأنت فقط، ولا يُربط بملف.")
                }

                Section {
                    if let loadError {
                        Button { Task { await loadStaff() } } label: {
                            Label(loadError, systemImage: "arrow.clockwise")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.danger)
                        }
                    } else if !loaded {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else if candidates.isEmpty {
                        Text(search.isEmpty ? "لا زملاء لإضافتهم" : "لا أحد بهذا الاسم")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    } else {
                        ForEach(candidates) { m in
                            Button { toggle(m.id) } label: {
                                MemberToggleRow(member: m, on: picked.contains(m.id))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                } header: {
                    HStack {
                        Text("الأعضاء")
                        Spacer()
                        if !picked.isEmpty {
                            Text("\(picked.count) مختار").foregroundStyle(Theme.goldDark)
                        }
                    }
                } footer: {
                    Text("يصل كلَّ من تضيفه إشعارٌ بأنك أضفته.")
                }
            }
            .searchable(text: $search, prompt: "ابحث عن زميل")
            .navigationTitle("نقاش جديد")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView().tint(Theme.goldDark)
                    } else {
                        Button("إنشاء") { Task { await create() } }
                            .fontWeight(.semibold)
                            .disabled(trimmed.isEmpty)
                    }
                }
            }
            .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
                Button("حسناً", role: .cancel) { alertText = nil }
            } message: {
                Text(alertText ?? "")
            }
            .task {
                nameFocused = true
                await loadStaff()
            }
        }
    }

    private func loadStaff() async {
        loadError = nil
        do {
            staff = try await sb.staff()
            loaded = true
        } catch {
            if let t = uiErrorText(error) { loadError = t }
        }
    }

    private func toggle(_ id: String) {
        if picked.contains(id) { picked.remove(id) } else { picked.insert(id) }
    }

    private func create() async {
        guard !busy, !trimmed.isEmpty else { return }
        busy = true
        defer { busy = false }
        do {
            let id = try await sb.createChannel(title: trimmed, memberIds: Array(picked))
            Usage.shared.action("نقاش جديد مُسمّى")
            onCreated(id, trimmed)
            dismiss()
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}

// MARK: - الإدارة (الاسم والأعضاء)

struct ChannelMembersSheet: View {
    let channelId: String
    let currentTitle: String
    let onRenamed: (String) -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var staff: [TeamMember] = []
    @State private var members: Set<String> = []
    @State private var pending: Set<String> = []
    @State private var loaded = false
    @State private var loadError: String?
    @State private var alertText: String?
    @State private var savingTitle = false
    @State private var savedTitle: String?

    private var trimmed: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var titleChanged: Bool { !trimmed.isEmpty && trimmed != (savedTitle ?? currentTitle) }

    var body: some View {
        NavigationStack {
            Form {
                Section("اسم النقاش") {
                    HStack(spacing: 8) {
                        TextField("اسم النقاش", text: $title)
                        if titleChanged {
                            if savingTitle {
                                ProgressView()
                            } else {
                                Button("حفظ") { Task { await saveTitle() } }
                                    .fontWeight(.semibold)
                                    .foregroundStyle(Theme.goldDark)
                                    .buttonStyle(.borderless)
                            }
                        }
                    }
                }

                Section {
                    if let loadError {
                        Button { Task { await load() } } label: {
                            Label(loadError, systemImage: "arrow.clockwise")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.danger)
                        }
                    } else if !loaded {
                        HStack { Spacer(); ProgressView(); Spacer() }
                    } else {
                        ForEach(eligibleMembers(staff, excluding: sb.member?.id)) { m in
                            Button { Task { await toggle(m) } } label: {
                                MemberToggleRow(member: m, on: members.contains(m.id))
                                    .opacity(pending.contains(m.id) ? 0.45 : 1)
                            }
                            .buttonStyle(.plain)
                            .disabled(pending.contains(m.id))
                        }
                    }
                } header: {
                    HStack {
                        Text("الأعضاء")
                        Spacer()
                        if loaded {
                            // المدير نفسه عضو دائماً فلا يُعدّ في القائمة
                            Text("\(members.subtracting([sb.member?.id ?? ""]).count) عضو")
                                .foregroundStyle(Theme.goldDark)
                        }
                    }
                } footer: {
                    Text("العضو يرى النقاش ورسائله وملفاته، ويصله إشعار عند إضافته. ومن تُزيله يختفي عنه النقاش فوراً.")
                }
            }
            .navigationTitle("إدارة النقاش")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("تمّ") { dismiss() }.fontWeight(.semibold)
                }
            }
            .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
                Button("حسناً", role: .cancel) { alertText = nil }
            } message: {
                Text(alertText ?? "")
            }
            .task {
                title = currentTitle
                await load()
            }
        }
    }

    private func load() async {
        loadError = nil
        do {
            async let s = sb.staff()
            async let m = sb.channelMemberIds(channelId)
            staff = try await s
            members = try await m
            loaded = true
        } catch {
            if let t = uiErrorText(error) { loadError = t }
        }
    }

    /// متفائل: العلامة تتبدّل فوراً، وتعود إن رفضت القاعدة
    private func toggle(_ m: TeamMember) async {
        guard !pending.contains(m.id) else { return }
        let adding = !members.contains(m.id)
        pending.insert(m.id)
        defer { pending.remove(m.id) }
        if adding { members.insert(m.id) } else { members.remove(m.id) }
        do {
            if adding {
                try await sb.addChannelMember(channelId, memberId: m.id)
            } else {
                try await sb.removeChannelMember(channelId, memberId: m.id)
            }
        } catch {
            if adding { members.remove(m.id) } else { members.insert(m.id) }
            if let t = uiErrorText(error) { alertText = t }
        }
    }

    private func saveTitle() async {
        guard !savingTitle, titleChanged else { return }
        savingTitle = true
        defer { savingTitle = false }
        do {
            try await sb.renameChannel(channelId, title: trimmed)
            savedTitle = trimmed
            onRenamed(trimmed)
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}
