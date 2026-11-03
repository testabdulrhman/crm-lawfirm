import SwiftUI

// البحث الشامل في التطبيق (طلب المدير 2026-11-03: «نعم، اضفه للأيفون») — نظير خانة البحث في الويب، بالدالة نفسها
// global_search: الملفات والعملاء والوكالات والمستندات (حتى نصّها من document_texts) والمهام والصادر والأحكام
// والنقاشات. الصلاحيات من القاعدة: كلٌّ يرى ما يراه في الويب.

struct SearchHit: Codable, Identifiable {
    let kind: String
    let id: String
    let title: String?
    let subtitle: String?
    let status: String?
    let case_id: String?
    let url: String?
    let matter_kind: String?
}

extension SB {
    func globalSearch(_ q: String) async throws -> [SearchHit] {
        try await rpc("global_search", params: ["q": q])
    }
}

private struct SearchGroup {
    let kind: String
    let label: String
    let icon: String
}

private let SEARCH_GROUPS: [SearchGroup] = [
    .init(kind: "case", label: "المشاريع", icon: "folder.fill"),
    .init(kind: "document", label: "المستندات", icon: "doc.text.fill"),
    .init(kind: "task", label: "المهام", icon: "checklist"),
    .init(kind: "outgoing", label: "الصادر", icon: "paperplane.fill"),
    .init(kind: "ruling", label: "الأحكام", icon: "hammer.fill"),
    .init(kind: "discussion", label: "النقاشات", icon: "bubble.left.and.bubble.right.fill"),
    .init(kind: "contact", label: "العملاء", icon: "person.fill"),
    .init(kind: "poa", label: "الوكالات", icon: "signature"),
]

struct GlobalSearchView: View {
    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var hits: [SearchHit] = []
    @State private var searching = false
    @State private var searchedFor = ""
    @State private var error: String?
    @State private var preview: SearchHit?
    /// الحقل نشطٌ عند الفتح — تكتب مباشرة
    @State private var searchActive = false

    private var trimmed: String { query.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        List {
            if trimmed.count < 2 {
                Section {
                    VStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 30))
                            .foregroundStyle(Theme.goldDark.opacity(0.7))
                        Text("ابحث في كل شيء")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Theme.navy)
                        Text("المشاريع والمستندات — حتى ما بداخلها — والمهام والصادر والأحكام والنقاشات والعملاء")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 24)
                    .listRowBackground(Color.clear)
                }
            } else if let error {
                Section { Text(error).font(.system(size: 13)).foregroundStyle(Theme.danger) }
            } else if hits.isEmpty && !searching && searchedFor == trimmed {
                Section {
                    Text("لا نتائج لـ«\(trimmed)»")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                        .listRowBackground(Color.clear)
                }
            } else {
                ForEach(SEARCH_GROUPS, id: \.kind) { g in
                    let rows = hits.filter { $0.kind == g.kind }
                    if !rows.isEmpty {
                        Section("\(g.label) (\(rows.count))") {
                            ForEach(rows) { h in
                                Button { open(h) } label: { row(h, icon: g.icon) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ivory)
        .navigationTitle("البحث")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, isPresented: $searchActive,
                    placement: .navigationBarDrawer(displayMode: .always), prompt: "ابحث… حتى داخل المستندات")
        .overlay(alignment: .top) {
            if searching { ProgressView().padding(.top, 8) }
        }
        // مؤجَّل ٣٠٠ م.ث كالويب — كل حرف جديد يُلغي البحث السابق
        .task(id: trimmed) {
            guard trimmed.count >= 2 else { hits = []; searchedFor = ""; return }
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            searching = true
            defer { searching = false }
            do {
                let r = try await sb.globalSearch(trimmed)
                guard !Task.isCancelled else { return }
                hits = r
                error = nil
                searchedFor = trimmed
            } catch {
                if let t = uiErrorText(error) { self.error = t }
            }
        }
        .task {
            try? await Task.sleep(for: .milliseconds(350))
            searchActive = true
        }
        .sheet(item: $preview) { h in
            FilePreviewSheet(name: h.title ?? "مستند", url: h.url)
        }
    }

    private func row(_ h: SearchHit, icon: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(Theme.goldDark)
                .frame(width: 32, height: 32)
                .background(Theme.goldPale, in: RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 3) {
                Text(h.title ?? "—")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(2)
                if let s = h.subtitle, !s.isEmpty {
                    // كل جزء معزول اتجاهياً (FSI…PDI): الرقم اللاتيني بين جزأين عربيين كان يبعثر الفواصل؛
                    // وRLM في أوله يثبّت اتجاه السطر عربياً (المعزول لا يحدّده فيرتدّ السطر يساري الترتيب)
                    Text("\u{200F}" + s.components(separatedBy: " · ").map { "\u{2068}\($0)\u{2069}" }.joined(separator: " \u{200F}·\u{200F} "))
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(h.kind == "document" ? 3 : 2)
                }
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
    }

    /// وجهة كل نتيجة في التطبيق: الملف في «المشاريع»، والمهمة، والنقاش؛ والمستند والخطاب يُعاينان مكانهما
    private func open(_ h: SearchHit) {
        switch h.kind {
        case "document", "outgoing":
            if h.url != nil { preview = h; return }
            if let c = h.case_id { go("/cases/\(c)") }
        case "case":
            go("/cases/\(h.id)")
        case "ruling", "poa":
            if let c = h.case_id { go("/cases/\(c)") } else if h.url != nil { preview = h }
        case "task":
            go("/tasks/\(h.id)")
        case "discussion":
            go(h.case_id.map { "/discussions?case=\($0)" } ?? "/discussions")
        case "contact":
            // لا صفحة للعميل في التطبيق — الاتصال برقمه مباشرة
            if let phone = h.subtitle?.split(separator: "·").first?.trimmingCharacters(in: .whitespaces),
               let u = URL(string: "tel:\(phone.filter { $0.isNumber || $0 == "+" })") {
                UIApplication.shared.open(u)
            }
        default:
            break
        }
    }

    private func go(_ route: String) {
        dismiss()
        PushRouter.shared.route = route
    }
}
