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
    @State private var openedTask: TaskRow?
    @State private var openingId: String?

    var body: some View {
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
                    text: "لا إشعارات بعد",
                    subtext: "منشن أو مهمة أو اعتماد — كلها تصلك هنا"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(rows) { n in
                        row(n)
                            .listRowBackground(
                                n.is_read == false ? Theme.goldPale : Theme.card
                            )
                    }
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("الإشعارات")
        .onAppear { Usage.shared.screen("الإشعارات") }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    NotificationPrefsView()
                } label: {
                    Image(systemName: "gearshape").foregroundStyle(Theme.goldDark)
                }
            }
            if rows.contains(where: { $0.is_read == false }) {
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
        .task { await load() }
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
        default: return "bell"
        }
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.notifications()
            loaded = true
            await syncBadge()
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// شارة الأيقونة = غير المقروء الحالي
    private func syncBadge() async {
        let n = rows.filter { $0.is_read == false }.count
        try? await UNUserNotificationCenter.current().setBadgeCount(n)
    }

    /// فتح الإشعار: قراءة + انتقال لمهمته إن كانت له مهمة
    private func open(_ n: AppNotification) {
        Task {
            if n.is_read == false {
                try? await sb.markNotificationRead(id: n.id)
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
                // منشن في نقاش ملف — يقلب تبويب النقاشات ويفتح خيط الملف نفسه
                PushRouter.shared.route = "/discussions?case=\(caseId)"
            } else if let caseId = n.case_id {
                // تذكير جلسة / ملخّص ما قبل الجلسة / أي إشعار مربوط بملف —
                // يفتح ملف القضية (تبويب المشاريع) حيث الجلسات والملخّص
                PushRouter.shared.route = "/cases/\(caseId)"
            } else if n.type == "mention" || n.type == "birthday" {
                // منشن في القناة العامة (بلا ملف) — تبويب النقاشات يكفي
                PushRouter.shared.route = "/discussions"
            }
            await syncBadge()
        }
    }
}
