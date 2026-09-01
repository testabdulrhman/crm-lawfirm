import SwiftUI

// تبويب «المشاريع» (تسمية المستخدم 2026-09-02) — القضايا كلها بالبحث والحالة، وكل صف يفتح ملف القضية.
// أُضيف 2026-09-02 (ثلاثية المحكمة): التطبيق كان «متابعة» بلا ملف يُفتح.

struct CaseRoute: Identifiable, Hashable { let id: String }

struct CasesView: View {
    @EnvironmentObject private var sb: SB
    @ObservedObject private var router = PushRouter.shared

    @State private var rows: [CaseRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var search = ""
    @State private var status = "jarri"
    @State private var routed: CaseRoute?

    private var filtered: [CaseRow] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return rows.filter { r in
            (status == "all" || r.status == status)
                && (q.isEmpty
                    || (r.title ?? "").arContains(q)
                    || (r.office_num ?? "").contains(q)
                    || (r.court_num ?? "").contains(q)
                    || (r.contact?.name ?? "").arContains(q))
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ErrorBox(message: error) { Task { await load() } }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .padding(16)
                } else if !loaded {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    VStack(spacing: 0) {
                        Picker("الحالة", selection: $status) {
                            Text("جارية").tag("jarri")
                            Text("معلّقة").tag("muallaq")
                            Text("منتهية").tag("muntahia")
                            Text("الكل").tag("all")
                        }
                        .pickerStyle(.segmented)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)

                        if filtered.isEmpty {
                            EmptyBox(icon: "folder", text: "لا مشاريع هنا",
                                     subtext: search.isEmpty ? "غيّر الحالة" : "جرّب كلمة أخرى")
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                        } else {
                            List(filtered) { r in
                                NavigationLink {
                                    CaseDetailView(caseId: r.id)
                                } label: {
                                    CaseRowView(row: r)
                                }
                                .listRowBackground(Theme.card)
                            }
                            .listStyle(.plain)
                            .refreshable { await load() }
                        }
                    }
                    .searchable(text: $search, prompt: "اسم الموكّل، العنوان، رقم الملف أو القضية")
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("المشاريع")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { Usage.shared.screen("المشاريع") }
            .navigationDestination(item: $routed) { r in
                CaseDetailView(caseId: r.id)
            }
        }
        .task {
            await load()
            openFromPush()
        }
        .onChange(of: router.route) { _, _ in openFromPush() }
    }

    /// إشعار جلسة/ملخّص وصل؟ افتح ملفه مباشرة
    private func openFromPush() {
        guard let cid = router.caseId else { return }
        router.clear()
        routed = CaseRoute(id: cid)
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.cases()
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct CaseRowView: View {
    let row: CaseRow

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(row.title ?? "ملف")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    if let n = row.office_num, !n.isEmpty {
                        Text(n).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.goldDark)
                    }
                    if let c = row.contact?.name, !c.isEmpty {
                        Text("· \(c)").font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(1)
                    }
                }
                if let h = row.hearing_date, h >= Fmt.todayISO(), let rel = Fmt.relDays(h) {
                    Text("جلسة \(rel.text)")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(rel.text == "اليوم" ? Theme.danger : Theme.amber)
                }
            }
            Spacer(minLength: 4)
            StatusChip(status: row.status)
        }
        .padding(.vertical, 4)
    }
}

struct StatusChip: View {
    let status: String?
    var body: some View {
        Text(caseStatusLabel(status))
            .font(.system(size: 11, weight: .medium))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(bg).foregroundStyle(fg)
            .clipShape(Capsule())
    }
    private var bg: Color {
        switch status {
        case "jarri": return Theme.success.opacity(0.12)
        case "muallaq": return Theme.amber.opacity(0.14)
        default: return Theme.ivory
        }
    }
    private var fg: Color {
        switch status {
        case "jarri": return Theme.success
        case "muallaq": return Theme.amber
        default: return Theme.muted
        }
    }
}
