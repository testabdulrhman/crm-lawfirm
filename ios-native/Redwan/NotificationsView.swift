import SwiftUI
import UserNotifications

// مركز الإشعارات (طلب المستخدم 2026-08-22: «ودي يكون يشوف وش الإشعارات
// اللي تخصه») — نفس جرس الويب: قائمة إشعاراتي، غير المقروء مميز،
// وإشعار المهمة يفتح غرفتها مباشرة.

struct NotificationsView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [AppNotification] = []
    @State private var loaded = false
    @State private var error: String?
    /// أُلغي الجلب السابق (اختفت الشاشة أثناءه) — يُعاد عند عودتها
    @State private var cancelled = false
    @State private var openedTask: TaskRow?
    @State private var openingId: String?
    // كل الإشعارات منذ البداية (2026-09-26 — «ابي أفتح كل الاشعارات اللي سبق وأن وصلتني»)
    @State private var filter: NotificationFilter = .all
    @State private var search = ""
    @State private var hasMore = true
    @State private var loadingMore = false
    @State private var unread = 0

    private static let page = 50

    var body: some View {
        VStack(spacing: 0) {
            filterBar
            Group {
                if let error {
                    ErrorBox(message: error) { Task { await load() } }
                        .padding(16)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                } else if !loaded {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if rows.isEmpty {
                    EmptyBox(
                        icon: "bell",
                        text: filter == .all && search.isEmpty ? "لا إشعارات بعد" : "لا إشعارات بهذا البحث",
                        subtext: filter == .all && search.isEmpty ? "منشن أو مهمة أو اعتماد — كلها تصلك هنا" : "جرّب كلمة أخرى أو تصنيفاً آخر"
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        ForEach(groups, id: \.label) { g in
                            Section {
                                ForEach(g.items) { n in
                                    row(n)
                                        .listRowBackground(n.is_read == false ? Theme.goldPale : Theme.card)
                                        .onAppear { if n.id == rows.last?.id { Task { await loadMore() } } }
                                }
                            } header: {
                                Text(g.label).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.muted)
                            }
                        }
                        Section {
                            HStack {
                                Spacer()
                                if loadingMore { ProgressView() }
                                else if !hasMore {
                                    Text("هذا كل ما وصلك").font(.system(size: 12)).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                            }
                            .listRowBackground(Color.clear)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await load() }
                }
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("الإشعارات")
        .onAppear { Usage.shared.screen("الإشعارات") }
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "ابحث في الإشعارات")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    NotificationPrefsView()
                } label: {
                    Image(systemName: "gearshape").foregroundStyle(Theme.goldDark)
                }
            }
            if unread > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("قراءة الكل") {
                        Task {
                            try? await sb.markAllNotificationsRead()
                            await load()
                            try? await UNUserNotificationCenter.current().setBadgeCount(0)
                        }
                    }
                    .font(.system(size: 13))
                }
            }
        }
        .navigationDestination(item: $openedTask) { t in
            TaskDetailView(task: t)
        }
        // البحث بعد توقف الكتابة ٣٠٠ ملّي ثانية، والتصنيف فوراً
        .task(id: "\(filter.rawValue)|\(search)") {
            if !search.isEmpty { try? await Task.sleep(for: .milliseconds(300)) }
            guard !Task.isCancelled else { return }
            await load()
        }
        .retryIfCancelled($cancelled) { await load() }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(NotificationFilter.allCases, id: \.self) { f in
                    Button { filter = f } label: {
                        Text(f.label)
                            .font(.system(size: 13, weight: filter == f ? .semibold : .regular))
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(filter == f ? Theme.navy : Theme.card, in: Capsule())
                            .foregroundStyle(filter == f ? .white : Theme.navy)
                            .overlay(Capsule().stroke(filter == f ? Color.clear : Theme.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
        }
        .background(Theme.ivory)
    }

    /// «اليوم» · «أمس» · التاريخ — بتوقيت الجهاز
    private var groups: [(label: String, items: [AppNotification])] {
        var out: [(label: String, items: [AppNotification])] = []
        for n in rows {
            let l = dayLabel(n.created_at)
            if let i = out.indices.last, out[i].label == l { out[i].items.append(n) }
            else { out.append((label: l, items: [n])) }
        }
        return out
    }

    private func dayLabel(_ iso: String?) -> String {
        guard let iso, let d = ISO8601DateFormatter.flexible(iso) else { return "—" }
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "اليوم" }
        if cal.isDateInYesterday(d) { return "أمس" }
        return Fmt.gregLong(Fmt.iso(d))
    }

    private func row(_ n: AppNotification) -> some View {
        Button {
            open(n)
        } label: {
            HStack(alignment: .top, spacing: 10) {
                ZStack {
                    Circle()
                        .fill(Theme.gold.opacity(0.15))
                        .frame(width: 34, height: 34)
                    if openingId == n.id {
                        ProgressView().scaleEffect(0.7)
                    } else {
                        Image(systemName: icon(n.type))
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.goldDark)
                    }
                }
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(n.title ?? "إشعار")
                            .font(.system(size: 14, weight: n.is_read == false ? .bold : .medium))
                            .foregroundStyle(Theme.navy)
                            .lineLimit(1)
                        Spacer()
                        if n.is_read == false {
                            Circle().fill(Theme.gold).frame(width: 8, height: 8)
                        }
                    }
                    if let msg = n.message, !msg.isEmpty {
                        Text(msg)
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(2)
                    }
                    Text(shortStamp(n.created_at))
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted.opacity(0.8))
                }
            }
            .padding(.vertical, 2)
        }
        .buttonStyle(.plain)
    }

    private func icon(_ type: String?) -> String {
        switch type ?? "" {
        case "mention": return "at"
        case "task_assigned", "task_due": return "checklist"
        case "task_comment": return "bubble.left"
        case "task_review", "approval_request": return "signature"
        case "task_approved", "approval_result": return "checkmark.seal"
        case "task_returned": return "arrow.uturn.right"
        case "session_soon": return "building.columns"
        case "incoming_message": return "envelope"
        case "office_doc_expiry": return "doc.badge.clock"
        case "change_request": return "lightbulb"
        case "hr_request", "hr_result": return "sun.max"
        case let t where t.hasPrefix("appointment"): return "calendar.badge.clock"
        case let t where t.hasPrefix("session"): return "building.columns"
        default: return "bell"
        }
    }

    private func load() async {
        error = nil
        do {
            let page = try await sb.notificationsPage(offset: 0, limit: Self.page, filter: filter, search: search)
            rows = page
            hasMore = page.count == Self.page
            loaded = true
            await syncBadge()
        } catch {
            // الإلغاء ليس خطأً — تُعاد المحاولة صامتاً عند عودة الشاشة
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }

    private func loadMore() async {
        guard hasMore, !loadingMore, loaded else { return }
        loadingMore = true
        defer { loadingMore = false }
        if let more = try? await sb.notificationsPage(offset: rows.count, limit: Self.page, filter: filter, search: search) {
            let seen = Set(rows.map(\.id))
            rows += more.filter { !seen.contains($0.id) }
            hasMore = more.count == Self.page
        }
    }

    /// شارة الأيقونة = غير المقروء الحالي
    private func syncBadge() async {
        let n = (try? await sb.unreadNotificationsCount()) ?? rows.filter { $0.is_read == false }.count
        unread = n
        try? await UNUserNotificationCenter.current().setBadgeCount(n)
    }

    /// فتح الإشعار: قراءة + انتقال لمهمته إن كانت له مهمة
    private func open(_ n: AppNotification) {
        Task {
            if n.is_read == false {
                try? await sb.markNotificationRead(id: n.id)
                unread = max(0, unread - 1)
                if let i = rows.firstIndex(where: { $0.id == n.id }) {
                    rows[i] = AppNotification(
                        id: n.id, type: n.type, title: n.title, message: n.message,
                        case_id: n.case_id, task_id: n.task_id,
                        is_read: true, created_at: n.created_at
                    )
                }
            }
            if let taskId = n.task_id {
                openingId = n.id
                openedTask = try? await sb.task(id: taskId)
                openingId = nil
            } else if let caseId = n.case_id, n.type == "mention" {
                // منشن في نقاش ملف — يقلب تبويب النقاشات ويفتح الرسالة نفسها (وخيطها إن كانت ردّاً)
                PushRouter.shared.pendingFocus = DiscussionFocus(at: n.created_at)
                PushRouter.shared.route = "/discussions?case=\(caseId)"
            } else if let caseId = n.case_id {
                // تذكير جلسة / ملخّص ما قبل الجلسة / أي إشعار مربوط بملف —
                // يفتح ملف القضية (تبويب المشاريع) حيث الجلسات والملخّص
                PushRouter.shared.route = "/cases/\(caseId)"
            } else if n.type == "hr_request" {
                // طلب إجازة/استئذان من موظف — كان النقر لا يفعل شيئاً
                PushRouter.shared.route = "/hr/approvals"
            } else if n.type == "hr_result" {
                PushRouter.shared.route = "/me"
            } else if (n.type ?? "").hasPrefix("appointment") {
                // حجوزات الموقع بلا case_id ولا task_id، فكان النقر لا يفعل شيئاً
                PushRouter.shared.route = "/appointments"
            } else if n.type == "mention" {
                // منشن في القناة العامة — يفتحها عند الرسالة نفسها
                PushRouter.shared.pendingFocus = DiscussionFocus(at: n.created_at)
                PushRouter.shared.route = "/discussions"
            } else if n.type == "office_doc_expiry" {
                // مستند للمكتب يقترب انتهاؤه — صفحة مستندات المكتب
                PushRouter.shared.route = "/office-documents"
            } else if n.type == "birthday" {
                // عيد ميلاد زميل — تُهنّئه في القناة العامة، فتبويب النقاشات يكفي
                PushRouter.shared.route = "/discussions"
            }
            await syncBadge()
        }
    }
}

/// تصنيفات «كل الإشعارات» — بادئة النوع كما في الويب وnotification_category في القاعدة
enum NotificationFilter: String, CaseIterable {
    case all, unread, mention, tasks, sessions, appointments, hr, other
    var label: String {
        switch self {
        case .all: return "الكل"
        case .unread: return "غير المقروءة"
        case .mention: return "المنشن"
        case .tasks: return "المهام والاعتمادات"
        case .sessions: return "الجلسات"
        case .appointments: return "المواعيد"
        case .hr: return "الإجازات"
        case .other: return "أخرى"
        }
    }
}

extension ISO8601DateFormatter {
    /// created_at من PostgREST بكسور الثانية أو بدونها
    static func flexible(_ s: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)
    }
}

extension SB {
    func notificationsPage(offset: Int, limit: Int, filter: NotificationFilter, search: String) async throws -> [AppNotification] {
        guard let me = member?.id else { return [] }
        var q: [(String, String)] = [
            ("select", "id,type,title,message,case_id,task_id,is_read,created_at"),
            ("recipient_id", "eq.\(me)"),
            ("order", "created_at.desc"),
            ("offset", "\(offset)"),
            ("limit", "\(limit)"),
        ]
        switch filter {
        case .all: break
        case .unread: q.append(("is_read", "eq.false"))
        case .mention: q.append(("type", "eq.mention"))
        case .tasks: q.append(("or", "(type.like.task*,type.like.approval*)"))
        case .sessions: q.append(("type", "like.session*"))
        case .appointments: q.append(("type", "like.appointment*"))
        case .hr: q.append(("type", "like.hr*"))
        case .other:
            q.append(("type", "not.in.(mention)"))
            q.append(("and", "(type.not.like.task*,type.not.like.approval*,type.not.like.session*,type.not.like.appointment*,type.not.like.hr*)"))
        }
        let term = search.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "[,()*%]", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        if !term.isEmpty { q.append(("or", "(title.ilike.*\(term)*,message.ilike.*\(term)*)")) }
        return try await get("notifications", query: q)
    }

    /// غير المقروء كله — لشارة الأيقونة، لا للصفحة المحمّلة وحدها
    func unreadNotificationsCount() async throws -> Int {
        guard let me = member?.id else { return 0 }
        struct R: Codable { let id: String }
        let r: [R] = try await get("notifications", query: [
            ("select", "id"), ("recipient_id", "eq.\(me)"), ("is_read", "eq.false"), ("limit", "1000")])
        return r.count
    }
}
