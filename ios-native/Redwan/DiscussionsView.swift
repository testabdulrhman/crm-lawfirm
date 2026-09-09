import SwiftUI

// تبويب «النقاشات» — بديل مجموعات الواتساب.
//
// المشكلة بكلام المستخدم: «واحد يرسل بالخاص وواحد بالقروب، وملف هنا وملف
// هناك… أدوّر الملفات ما ألقاها». السبب أن العمل بلا عنوان ثابت.
//
// الشكل مقصود أن يشبه قائمة محادثات الواتساب — مرتّبة بالأحدث وعدّاد أحمر —
// لأن نقل العادة أسهل حين تجد اليد نفس الحركة. الفرق أن كل محادثة هنا لها
// عنوان دائم: قضيتها.

private let stampF: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ar_SA@numbers=latn")
    f.calendar = Calendar(identifier: .gregorian)
    return f
}()

/// طابع مختصر بأسلوب الواتساب: الساعة لليوم، «أمس»، ثم اسم اليوم، ثم التاريخ
func shortStamp(_ iso: String?) -> String {
    guard let iso, let d = ISO8601DateFormatter.flexible.date(from: iso) else { return "" }
    let cal = Calendar(identifier: .gregorian)
    if cal.isDateInToday(d) {
        stampF.dateFormat = "h:mm a"
        return stampF.string(from: d)
    }
    if cal.isDateInYesterday(d) { return "أمس" }
    if let days = cal.dateComponents([.day], from: d, to: Date()).day, days < 7 {
        stampF.dateFormat = "EEEE"
        return stampF.string(from: d)
    }
    stampF.dateFormat = "d MMM"
    return stampF.string(from: d)
}

extension ISO8601DateFormatter {
    /// طوابع Postgres قد تحمل كسور ثانية أو لا — صيغة واحدة لا تكفي
    static let flexible: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        if let d = flexible.date(from: s) { return d }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: s)
    }
}

struct DiscussionsView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [DiscussionRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var search = ""
    @State private var showNewDiscussion = false
    @State private var pickedMatter: MatterLite?
    @ObservedObject private var router = PushRouter.shared

    /// العامة مثبّتة أولاً دائماً — ثم البقية بالأحدث (ترتيب الدالة)
    private var filtered: [DiscussionRow] {
        let q = search.trimmingCharacters(in: .whitespaces)
        // arContains: غير حساس للهمزات والتاء المربوطة (محكمه = المحكمة)
        let base = q.isEmpty ? rows : rows.filter {
            ($0.case_title ?? "").arContains(q)
                || ($0.last_body ?? "").arContains(q)
        }
        return base.sorted { a, b in
            if a.isGeneral != b.isGeneral { return a.isGeneral }
            return false // استقرار: يبقي ترتيب الدالة
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
                } else if rows.isEmpty {
                    EmptyBox(
                        icon: "bubble.left.and.bubble.right",
                        text: "لا نقاشات بعد",
                        subtext: "افتح أي قضية وابدأ الكلام فيها — يبقى مربوطاً بها إلى الأبد"
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filtered) { row in
                        NavigationLink {
                            CaseStreamView(
                                caseId: row.case_id,
                                title: row.case_title ?? (row.isGeneral ? "عام — المكتب" : "قضية"),
                                matter: MatterDoor(caseId: row.case_id, officeNum: row.office_num, kind: row.kind)
                            )
                        } label: {
                            DiscussionRowView(row: row)
                        }
                        .listRowBackground(Theme.card)
                    }
                    .listStyle(.plain)
                    .searchable(text: $search, prompt: "ابحث في النقاشات")
                    .refreshable { await load() }
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("النقاشات")
            .onAppear { Usage.shared.screen("النقاشات") }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // نقاش جديد لملفٍ لم يبدأ نقاشه بعد (طلب المستخدم 2026-08-22)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showNewDiscussion = true
                    } label: {
                        Image(systemName: "square.and.pencil")
                            .foregroundStyle(Theme.goldDark)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        BookmarksView()
                    } label: {
                        Image(systemName: "bookmark")
                            .foregroundStyle(Theme.goldDark)
                    }
                }
            }
            .sheet(isPresented: $showNewDiscussion) {
                MatterPicker { m in
                    showNewDiscussion = false
                    pickedMatter = m
                }
            }
            .navigationDestination(item: $pickedMatter) { m in
                CaseStreamView(
                    caseId: m.id,
                    title: m.title ?? m.office_num ?? "ملف",
                    matter: MatterDoor(caseId: m.id, officeNum: m.office_num, kind: m.kind)
                )
            }
        }
        .task {
            await load()
            openFromPush()
        }
        .onChange(of: router.route) { _, _ in openFromPush() }
    }

    /// منشن وصل إشعاره؟ افتح نقاش قضيته مباشرة (بلاغ المستخدم 2026-08-30)
    private func openFromPush() {
        guard let cid = router.discussionCaseId else { return }
        router.clear()
        // النوع والرقم من الصف إن كان محمّلاً؛ وإلا تأتي الرقاقة من الجلب الاحتياطي في CaseStreamView
        let row = rows.first { $0.case_id == cid }
        pickedMatter = MatterLite(
            id: cid, title: row?.case_title ?? "ملف",
            office_num: row?.office_num, kind: row?.kind
        )
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.discussions()
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct DiscussionRowView: View {
    let row: DiscussionRow

    /// نقاش فيه ما لم يُقرأ — يُميَّز بالخط الغامق لا بالعدّاد وحده
    private var unread: Bool { (row.unread ?? 0) > 0 }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: row.isGeneral ? "megaphone.fill" : "building.columns.fill")
                .font(.system(size: 15))
                .foregroundStyle(row.isGeneral ? Theme.gold : Theme.goldDark)
                .frame(width: 38, height: 38)
                .background(row.isGeneral ? Theme.navy : Theme.goldPale)
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(row.case_title ?? "قضية")
                        .font(.system(size: 14, weight: unread ? .bold : .medium))
                        .foregroundStyle(Theme.navy)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Text(shortStamp(row.last_at))
                        .font(.system(size: 11, weight: unread ? .semibold : .regular))
                        .foregroundStyle(unread ? Theme.goldDark : Theme.muted)
                }

                HStack(spacing: 5) {
                    if row.has_file == true {
                        Image(systemName: "paperclip")
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.muted)
                    }
                    Text(preview)
                        .font(.system(size: 12, weight: unread ? .medium : .regular))
                        .foregroundStyle(unread ? Theme.navy : Theme.muted)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let n = row.unread, n > 0 {
                        Text("\(n)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Theme.danger)
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var preview: String {
        let who = row.last_author.map { "\($0): " } ?? ""
        let body = row.last_body ?? (row.has_file == true ? "مرفق" : "")
        return who + body
    }
}


// MARK: - اختيار ملف لبدء نقاشه

struct MatterPicker: View {
    let onPick: (MatterLite) -> Void

    @EnvironmentObject private var sb: SB
    @State private var matters: [MatterLite] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var search = ""

    private var filtered: [MatterLite] {
        let q = search.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return matters }
        return matters.filter {
            ($0.title ?? "").arContains(q) || ($0.office_num ?? "").arContains(q)
        }
    }

    private func kindLabel(_ k: String?) -> String {
        switch k {
        case "legal_service": return "استشارة / لائحة"
        case "property": return "توثيق عقاري"
        default: return "قضية"
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ErrorBox(message: error) { Task { await load() } }
                        .padding(16)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                } else if !loaded {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filtered) { m in
                        Button {
                            onPick(m)
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(m.title ?? "بلا عنوان")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundStyle(Theme.navy)
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    Text(kindLabel(m.kind))
                                        .font(.system(size: 11))
                                        .foregroundStyle(Theme.goldDark)
                                    if let num = m.office_num {
                                        Text(num)
                                            .font(.system(size: 11))
                                            .foregroundStyle(Theme.muted)
                                    }
                                }
                            }
                            .padding(.vertical, 2)
                        }
                        .listRowBackground(Theme.card)
                    }
                    .listStyle(.plain)
                    .searchable(text: $search, prompt: "ابحث باسم الملف أو رقمه")
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("نقاش جديد")
            .navigationBarTitleDisplayMode(.inline)
            .task { await load() }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func load() async {
        error = nil
        do {
            matters = try await sb.matters()
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}
