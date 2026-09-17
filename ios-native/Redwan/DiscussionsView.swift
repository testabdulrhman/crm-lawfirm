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

/// وقت الرسالة داخل الفقاعة — الساعة دائماً، ومعها اليوم إن لم تكن من اليوم
/// (طلب المدير 2026-09-14: كانت الساعة تظهر لرسائل اليوم وحدها، كالويب قبل إصلاحه).
/// قائمة النقاشات تبقى على shortStamp المختصر كالواتساب.
func msgStamp(_ iso: String?) -> String {
    guard let d = ISO8601DateFormatter.parse(iso) else { return "" }
    let cal = Calendar(identifier: .gregorian)
    stampF.dateFormat = "h:mm a"
    let time = stampF.string(from: d)
    if cal.isDateInToday(d) { return time }
    if cal.isDateInYesterday(d) { return "أمس · \(time)" }
    if let days = cal.dateComponents([.day], from: cal.startOfDay(for: d), to: cal.startOfDay(for: Date())).day,
       days < 7 {
        stampF.dateFormat = "EEEE"
        return "\(stampF.string(from: d)) · \(time)"
    }
    let sameYear = cal.component(.year, from: d) == cal.component(.year, from: Date())
    stampF.dateFormat = sameYear ? "d MMMM" : "d MMMM yyyy"
    return "\(stampF.string(from: d)) · \(time)"
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
    /// وقت النسخة المعروضة — من الذاكرة المحلية أو آخر جلب ناجح
    @State private var savedAt: Date?
    /// تعذّر آخر تحديث والمعروض نسخة محفوظة — شريط لا شاشة خطأ
    @State private var stale = false
    @State private var loaded = false
    @State private var error: String?
    /// أُلغي الجلب السابق (اختفت الشاشة أثناءه) — يُعاد عند عودتها
    @State private var cancelled = false
    @State private var search = ""
    @State private var showNewDiscussion = false
    @State private var pickedMatter: MatterLite?
    /// نقاش مُسمّى جديد (للمدير) — يُفتح بعد انغلاق الورقة لا أثناءه
    @State private var showNewChannel = false
    @State private var createdChannel: MatterLite?
    /// الرسالة المقصودة في النقاش الذي يُفتح (منشن أو «في النقاش» من الملفات والروابط)
    @State private var pickedFocus: DiscussionFocus?
    /// القناة العامة مفتوحةً عند رسالة (لا MatterLite لها)
    @State private var generalFocus: DiscussionFocus?
    @State private var showMedia = false
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
                    VStack(spacing: 0) {
                        if stale {
                            SavedCopyBanner(savedAt: savedAt) { Task { await load() } }
                        }
                        List(filtered) { row in
                            NavigationLink {
                                CaseStreamView(
                                    caseId: row.case_id,
                                    title: row.case_title ?? (row.isGeneral ? "عام — المكتب" : "قضية"),
                                    matter: MatterDoor(caseId: row.case_id, officeNum: row.office_num, kind: row.kind),
                                    isChannel: row.kind == "channel"
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
            }
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("النقاشات")
            .onAppear { Usage.shared.screen("النقاشات") }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // نقاش جديد لملفٍ لم يبدأ نقاشه بعد (طلب المستخدم 2026-08-22)
                ToolbarItem(placement: .topBarTrailing) {
                    // المدير: نقاش باسم وأعضاء، أو نقاش على ملف (طلبه 2026-09-13).
                    // غيره يبقى على نقاش الملف وحده — إدارة الأعضاء للمدير في القاعدة
                    if sb.member?.is_director == true {
                        Menu {
                            Button { showNewChannel = true } label: {
                                Label("نقاش جديد باسم وأعضاء", systemImage: "bubble.left.and.bubble.right")
                            }
                            Button { showNewDiscussion = true } label: {
                                Label("نقاش على ملف", systemImage: "folder")
                            }
                        } label: {
                            Image(systemName: "square.and.pencil")
                                .foregroundStyle(Theme.goldDark)
                        }
                        .accessibilityLabel("نقاش جديد")
                    } else {
                        Button {
                            showNewDiscussion = true
                        } label: {
                            Image(systemName: "square.and.pencil")
                                .foregroundStyle(Theme.goldDark)
                        }
                    }
                }
                // كل مرفق ورابط في النقاشات (مرآة الويب 2026-09-17)
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showMedia = true } label: {
                        Image(systemName: "paperclip")
                            .foregroundStyle(Theme.goldDark)
                    }
                    .accessibilityLabel("الملفات والروابط")
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
            .sheet(isPresented: $showNewChannel, onDismiss: {
                // الانتقال بعد انغلاق الورقة: الدفع أثناء حركة الإغلاق يضيع بصمت
                if let c = createdChannel { createdChannel = nil; pickedMatter = c }
                Task { await load() }
            }) {
                NewChannelSheet { id, title in
                    createdChannel = MatterLite(id: id, title: title, office_num: nil, kind: "channel")
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
                    matter: MatterDoor(caseId: m.id, officeNum: m.office_num, kind: m.kind),
                    isChannel: m.kind == "channel",
                    focus: pickedFocus
                )
            }
            .navigationDestination(item: $generalFocus) { f in
                CaseStreamView(caseId: nil, title: "عام — المكتب", focus: f)
            }
            .sheet(isPresented: $showMedia) {
                DiscussionMediaSheet(caseId: nil, fromDiscussion: false) { m in
                    // بعد انغلاق الورقة — الدفع أثناء حركة الإغلاق يضيع بصمت
                    Task {
                        try? await Task.sleep(for: .milliseconds(450))
                        PushRouter.shared.pendingFocus = DiscussionFocus(messageId: m.id, parentId: m.parent_id)
                        PushRouter.shared.route = m.case_id.map { "/discussions?case=\($0)" } ?? "/discussions"
                    }
                }
            }
        }
        .task {
            // آخر نسخة محفوظة تظهر فوراً — ثم الجديد متى وصل (طلب المدير 2026-09-14)
            if !loaded, let c = DiscussionCache.load(
                [DiscussionRow].self, key: DiscussionCache.listKey, account: DiscussionCache.account(sb)
            ) {
                rows = c.value
                savedAt = c.savedAt
                loaded = true
            }
            await load()
            openFromPush()
        }
        .retryIfCancelled($cancelled) { await load() }
        .onChange(of: router.route) { _, _ in openFromPush() }
    }

    /// منشن وصل إشعاره؟ افتح نقاش قضيته مباشرة (بلاغ المستخدم 2026-08-30)،
    /// وعند الرسالة نفسها وخيطها إن كانت ردّاً (مرآة الويب 2026-09-17)
    private func openFromPush() {
        guard let route = router.route, route.hasPrefix("/discussions") else { return }
        let focus = router.pendingFocus
        // «/discussions» وحده (عيد ميلاد مثلاً) يقلب التبويب فقط؛ ومع رسالة مقصودة يفتح العامة
        guard let cid = router.discussionCaseId else {
            router.clear()
            if let focus { generalFocus = focus }
            return
        }
        router.clear()
        pickedFocus = focus
        // النوع والرقم من الصف إن كان محمّلاً؛ وإلا تأتي الرقاقة من الجلب الاحتياطي في CaseStreamView
        let row = rows.first { $0.case_id == cid }
        let target = MatterLite(
            id: cid, title: row?.case_title ?? "ملف",
            office_num: row?.office_num, kind: row?.kind
        )
        // القيمة نفسها لا تُعيد الدفع — أغلق الوجهة المفتوحة ثم افتحها من جديد عند الرسالة
        if pickedMatter == target {
            pickedMatter = nil
            Task { try? await Task.sleep(for: .milliseconds(450)); pickedMatter = target }
        } else {
            pickedMatter = target
        }
    }

    private func load() async {
        error = nil
        do {
            let latest = try await sb.discussions()
            rows = latest
            loaded = true
            stale = false
            savedAt = Date()
            DiscussionCache.save(latest, key: DiscussionCache.listKey, account: DiscussionCache.account(sb))
        } catch {
            // الإلغاء ليس خطأً — تُعاد المحاولة صامتاً عند عودة الشاشة
            guard let t = uiErrorText(error) else { cancelled = true; return }
            // المعروض (محفوظاً أو من جلب سابق) يبقى مقروءاً مع شريط — لا تمحوه شاشة خطأ
            if loaded { stale = true } else { self.error = t }
        }
    }
}

private struct DiscussionRowView: View {
    let row: DiscussionRow

    /// نقاش فيه ما لم يُقرأ — يُميَّز بالخط الغامق لا بالعدّاد وحده
    private var unread: Bool { (row.unread ?? 0) > 0 }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Group {
                if row.isGeneral || row.kind == "channel" {
                    Image(systemName: row.isGeneral ? "megaphone.fill" : "building.columns.fill")
                        .font(.system(size: 15)).foregroundStyle(Theme.gold)
                } else {
                    Text(matterKindEmoji(row.kind)).font(.system(size: 18))
                }
            }
            .frame(width: 38, height: 38)
            .background(row.isGeneral || row.kind == "channel" ? Theme.navy : Theme.goldPale)
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
    /// أُلغي الجلب السابق (اختفت الشاشة أثناءه) — يُعاد عند عودتها
    @State private var cancelled = false
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
            .retryIfCancelled($cancelled) { await load() }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func load() async {
        error = nil
        do {
            matters = try await sb.matters()
            loaded = true
        } catch {
            // الإلغاء ليس خطأً — تُعاد المحاولة صامتاً عند عودة الشاشة
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}
