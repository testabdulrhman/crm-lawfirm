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
    /// أُلغي الجلب السابق (اختفت الشاشة أثناءه) — يُعاد عند عودتها
    @State private var cancelled = false
    @State private var search = ""
    @State private var status = "jarri"
    /// النوع أولاً ثم الحالة — الافتراضي «قضية» فيبقى سلوك الشاشة كما اعتاده
    @State private var kind = "case"
    @State private var routed: CaseRoute?
    @State private var showScan = false

    /// الحالة تُطبَّق على الأنواع التي تشارك قاموس القضايا فقط — وإلا أخفى
    /// فلتر «جارية» كل الاستشارات والتوثيقات لأن حالاتها بمفردات أخرى.
    /// عدد كل نوع — يُعرض داخل شريحته كما في الويب
    private var kindCounts: [String: Int] {
        var m: [String: Int] = ["all": rows.count]
        for r in rows { m[r.kind ?? "case", default: 0] += 1 }
        return m
    }

    private var statusMenuLabel: String {
        status == "all" ? "كل الحالات" : caseStatusLabel(status)
    }

    private var showsStatusFilter: Bool { sharesCaseStatuses(kind == "all" ? nil : kind) && kind != "all" }

    private var filtered: [CaseRow] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return rows.filter { r in
            (kind == "all" || r.kind == kind)
                && (!showsStatusFilter || status == "all" || r.status == status)
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
                        // شريط شرائح أفقي بالعدّاد — خمسة خيارات عربية لا تتّسع
                        // في شريط مقسّم على عرض الجوال؛ والشرائح تنزلق وتتنفّس.
                        KindChips(kind: $kind, counts: kindCounts)

                        if filtered.isEmpty {
                            EmptyBox(icon: "folder", text: "لا مشاريع هنا",
                                     subtext: search.isEmpty ? "غيّر النوع أو الحالة" : "جرّب كلمة أخرى")
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showScan = true } label: {
                        Image(systemName: "camera.fill").foregroundStyle(Theme.goldDark)
                    }
                }
                // الحالة قائمةٌ في الشريط لا شريطاً مقسّماً ثانياً — توفّر صفاً
                // كاملاً من الارتفاع، وتظهر فقط للأنواع التي لها هذا القاموس.
                if showsStatusFilter {
                    ToolbarItem(placement: .topBarLeading) {
                        Menu {
                            Picker("الحالة", selection: $status) {
                                Text("جارية").tag("jarri")
                                Text("معلّقة").tag("muallaq")
                                Text("منتهية").tag("muntahia")
                                Text("الكل").tag("all")
                            }
                        } label: {
                            // أيقونة لا نصّ: شريط العنوان يضغط النص فينقطع
                            // («ج…»)؛ والنقطة الذهبية تُعلم أن تصفيةً مفعّلة.
                            Image(systemName: status == "jarri"
                                  ? "line.3.horizontal.decrease.circle"
                                  : "line.3.horizontal.decrease.circle.fill")
                                .foregroundStyle(Theme.goldDark)
                        }
                        .accessibilityLabel("تصفية الحالة: \(statusMenuLabel)")
                    }
                }
            }
            .sheet(isPresented: $showScan) {
                // بلا ملف مثبّت: الذكاء يقرأ المستند ويقترح ملفه
                ScanSheet(caseId: nil, caseTitle: nil) { Task { await load() } }
            }
        }
        .task {
            await load()
            openFromPush()
        }
        .retryIfCancelled($cancelled) { await load() }
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
            // الإلغاء ليس خطأً — تُعاد المحاولة صامتاً عند عودة الشاشة
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}

struct CaseRowView: View {
    let row: CaseRow

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(matterKindEmoji(row.kind)).font(.system(size: 14))
                    Text(row.title ?? "ملف")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.navy)
                        .lineLimit(2)
                }
                HStack(spacing: 6) {
                    // وسم النوع لغير القضايا — القائمة صارت مختلطة
                    if row.kind != "case", row.kind != nil {
                        Text(matterKindLabel(row.kind))
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Theme.gold.opacity(0.18), in: Capsule())
                            .foregroundStyle(Theme.goldDark)
                    }
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


/// شرائح النوع — أفقية منزلقة بالعدّاد، على نمط صفّ التصفية في الويب.
/// (كانت شريطاً مقسّماً بخمسة خيارات عربية فازدحم على عرض الجوال.)
private struct KindChips: View {
    @Binding var kind: String
    let counts: [String: Int]

    private let items: [(String, String)] = [
        ("all", "الكل"),
        ("case", "قضايا"),
        ("bankruptcy", "إفلاس"),
        ("legal_service", "استشارات"),
        ("property", "عقاري"),
    ]

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items, id: \.0) { value, label in
                    let on = kind == value
                    let n = counts[value] ?? 0
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { kind = value }
                    } label: {
                        HStack(spacing: 5) {
                            Text(label)
                                .font(.system(size: 13, weight: on ? .semibold : .regular))
                            Text("\(n)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(on ? Theme.gold.opacity(0.85) : Theme.muted.opacity(0.7))
                        }
                        .padding(.horizontal, 11)
                        .padding(.vertical, 6)
                        .background(on ? Theme.navy : Theme.card)
                        .foregroundStyle(on ? .white : Theme.navy)
                        .overlay(
                            Capsule().stroke(on ? Color.clear : Theme.line, lineWidth: 1)
                        )
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
    }
}
