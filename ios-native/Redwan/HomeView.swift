import SwiftUI
import UserNotifications

// تبويب «الرئيسية»: نظرة سريعة على اليوم — إحصاءات، جدول اليوم، ووكالات قاربت على الانتهاء
struct HomeView: View {
    @EnvironmentObject private var sb: SB

    // النطاق يخص المدير فقط؛ غير المدير يبقى على "mine" دائماً ولا يرى المبدّل
    @State private var scope = "mine"
    @State private var overview: DashboardOverview?
    @State private var errorMessage: String?
    @State private var unreadCount = 0

    var body: some View {
        NavigationStack {
            Group {
                if let message = errorMessage {
                    ErrorBox(message: message) {
                        Task { await load() }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                } else if let ov = overview {
                    content(ov)
                } else {
                    // هيكل تحميل يظهر أول مرة فقط؛ التحديثات اللاحقة تمر عبر السحب للتحديث
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("الرئيسية")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // جرس الإشعارات — يشوف الموظف كل ما يخصه (طلب 2026-08-22)
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink {
                        NotificationsView()
                    } label: {
                        ZStack(alignment: .topLeading) {
                            Image(systemName: "bell")
                                .font(.system(size: 16))
                                .foregroundStyle(Theme.navy)
                            if unreadCount > 0 {
                                Text("\(min(unreadCount, 99))")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(.white)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Theme.danger)
                                    .clipShape(Capsule())
                                    .offset(x: -8, y: -6)
                            }
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        if let name = sb.member?.name {
                            // سطر تعريفي فقط — معطّل حتى لا يوحي بأنه إجراء
                            Button(name) {}
                                .disabled(true)
                        }
                        Button("تسجيل الخروج", role: .destructive) {
                            sb.logout()
                        }
                    } label: {
                        AvatarCircle(member: sb.member, size: 30)
                    }
                }
            }
        }
        .task { await load() }
    }

    // MARK: - المحتوى

    private func content(_ ov: DashboardOverview) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if sb.member?.is_director == true {
                    Picker("النطاق", selection: $scope) {
                        Text("لوحتي").tag("mine")
                        Text("لوحة المكتب").tag("all")
                    }
                    .pickerStyle(.segmented)
                }

                statsGrid(ov.stats)

                todayCard

                if let poas = ov.expiring_poas, !poas.isEmpty {
                    poaCard(poas)
                }
            }
            .padding(16)
        }
        .refreshable { await load() }
        .onChange(of: scope) {
            Task { await load() }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("مرحباً، \(sb.member?.short_name ?? sb.member?.name ?? "بك")")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Theme.navy)
            Text(Fmt.gregLong(Fmt.todayISO()))
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
            Text(Fmt.hijriLong(Fmt.todayISO()))
                .font(.system(size: 12))
                .foregroundStyle(Theme.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func statsGrid(_ stats: DashStats) -> some View {
        let openTasks = stats.open_tasks ?? 0
        return LazyVGrid(
            columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
            spacing: 12
        ) {
            StatCard(label: "جلسات قادمة", value: stats.upcoming_sessions ?? 0)
            StatCard(
                label: "مهام متأخرة",
                value: stats.overdue_tasks ?? 0,
                tone: .danger,
                note: openTasks > 0 ? "من \(openTasks) مفتوحة" : nil
            )
            StatCard(label: "مهام مفتوحة", value: openTasks)
            StatCard(label: "قضايا جارية", value: stats.cases_active ?? 0)
        }
    }

    // MARK: - جدول اليوم

    private var todayCard: some View {
        SectionCard(title: "جدول اليوم", icon: "sun.max.fill") {
            let items = todayItems
            if items.isEmpty {
                EmptyBox(icon: "sun.max", text: "لا شيء مجدول اليوم")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        todayRow(item)
                        if index < items.count - 1 {
                            Divider().overlay(Theme.line)
                        }
                    }
                }
            }
        }
    }

    // دمج جلسات ومواعيد ومهام اليوم في قائمة واحدة موحّدة قابلة للترتيب بالوقت
    private var todayItems: [CalItem] {
        guard let ov = overview else { return [] }
        let today = Fmt.todayISO()
        var items: [CalItem] = []

        for session in ov.upcoming_sessions ?? [] where session.session_date == today {
            items.append(CalItem(
                id: "session-\(session.id)",
                kind: .session,
                date: today,
                time: normTime(session.session_time),
                title: session.title ?? session.case_title ?? "جلسة",
                subtitle: session.court ?? session.case_title
            ))
        }
        for appointment in ov.appointments ?? []
        where appointment.appointment_date == today && appointment.status != "cancelled" {
            items.append(CalItem(
                id: "appointment-\(appointment.id)",
                kind: .appointment,
                date: today,
                time: normTime(appointment.appointment_time),
                title: appointment.client_name ?? "موعد",
                subtitle: CalKind.appointment.label
            ))
        }
        for task in ov.tasks ?? [] where task.due_date == today {
            items.append(CalItem(
                id: "task-\(task.id)",
                kind: .task,
                date: today,
                time: nil,
                title: task.title ?? "مهمة",
                subtitle: task.case_title
            ))
        }

        // الترتيب بالوقت تصاعدياً، وما لا وقت له يوضع آخراً
        return items.sorted { lhs, rhs in
            switch (lhs.time, rhs.time) {
            case let (l?, r?): return l < r
            case (nil, .some): return false
            case (.some, nil): return true
            default: return false
            }
        }
    }

    private func todayRow(_ item: CalItem) -> some View {
        HStack(alignment: .center, spacing: 10) {
            // عمود وقت ثابت العرض حتى تصطف الصفوف بصرياً
            Group {
                if let time = item.time {
                    Text(Fmt.time(time))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.navy)
                } else {
                    Text("اليوم")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                }
            }
            .frame(width: 62, alignment: .center)

            Image(systemName: kindIcon(item.kind))
                .font(.system(size: 13))
                .foregroundStyle(kindColor(item.kind))
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(1)
                if let subtitle = item.subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 0)
        }
        .padding(.vertical, 9)
    }

    // MARK: - الوكالات المنتهية قريباً

    private func poaCard(_ poas: [DashPOA]) -> some View {
        SectionCard(title: "وكالات تنتهي قريباً", icon: "doc.text.fill") {
            VStack(spacing: 0) {
                ForEach(Array(poas.enumerated()), id: \.element.id) { index, poa in
                    HStack(alignment: .center, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(poa.client_name ?? "بدون اسم")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Theme.navy)
                                .lineLimit(1)
                            if let number = poa.poa_number, !number.isEmpty {
                                Text("وكالة رقم \(number)")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.muted)
                            }
                        }

                        Spacer(minLength: 8)

                        if let days = poa.days_left {
                            // أسبوع أو أقل يُعد وشيكاً فيأخذ لون الخطر
                            Text(expiryText(days))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(days <= 7 ? Theme.danger : Theme.amber)
                        }
                    }
                    .padding(.vertical, 9)

                    if index < poas.count - 1 {
                        Divider().overlay(Theme.line)
                    }
                }
            }
        }
    }

    private func expiryText(_ days: Int) -> String {
        if days <= 0 { return "تنتهي اليوم" }
        if days == 1 { return "تنتهي غداً" }
        return "تنتهي بعد \(days) يوم"
    }

    // MARK: - أدوات مساعدة

    // بعض السجلات تأتي بوقت فارغ؛ نعامله كأنه بلا وقت حتى لا يُعرض نص فارغ
    private func normTime(_ time: String?) -> String? {
        guard let time, !time.isEmpty else { return nil }
        return time
    }

    private func load() async {
        do {
            // غير المدير لا يملك نطاق المكتب مهما كانت قيمة الحالة
            let effectiveScope = sb.member?.is_director == true ? scope : "mine"
            overview = try await sb.dashboard(scope: effectiveScope)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
        // عدّاد الجرس — ثانوي، لا يفشل الشاشة. شارة الأيقونة تتبعه
        // حتى لا يعلق رقم على الأيقونة بعد قراءة كل شيء
        if let list = try? await sb.notifications(limit: 50) {
            unreadCount = list.filter { $0.is_read == false }.count
            try? await UNUserNotificationCenter.current().setBadgeCount(unreadCount)
        }
    }
}
