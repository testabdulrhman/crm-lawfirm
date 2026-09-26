import SwiftUI
import UserNotifications

// تبويب «الرئيسية» — تصميم المدير «liquid-glass-home» (Figma، 2026-09-17):
// بداية هادئة: تحية وسؤال «كيف حالك اليوم؟» ثم ما أُنجز بجانب ما ينتظر،
// والموعد القادم، ومهام اليوم. زجاج iOS 26 على خلفية باستيل؛ وما قبل iOS 26 مادة شفافة.
struct HomeView: View {
    /// «رؤية الكل» تقلب إلى تبويب المهام
    var openTasksTab: () -> Void = {}

    @EnvironmentObject private var sb: SB

    // النطاق يخص المدير فقط؛ غير المدير يبقى على "mine" دائماً ولا يرى المبدّل
    @State private var scope = "mine"
    @State private var overview: DashboardOverview?
    @State private var errorMessage: String?
    /// أُلغي الجلب السابق (اختفت الشاشة أثناءه) — يُعاد عند عودتها
    @State private var cancelled = false
    @State private var unreadCount = 0
    @State private var doneToday = 0
    // ثلاثية المحكمة: الجلسات المنعقدة بلا نتيجة مسجّلة — تُغلق من هنا مباشرة
    @State private var needClosure: [SessionNeedingClosure] = []
    @State private var closing: CloseTarget?
    @State private var showPrefs = false
    /// «صفحتي» والاعتمادات — الخدمة الذاتية للموظف (2026-09-13)
    @State private var showMyPage = false
    @State private var showApprovals = false
    @State private var showNotifications = false
    @State private var showOfficeDocs = false
    @State private var pendingHr = 0
    @State private var openedTask: TaskRow?
    @State private var openingTaskId: String?
    @ObservedObject private var router = PushRouter.shared

    /// المزاج يبقى على الجهاز فقط. يُسأل مرة في اليوم: بعد الإجابة يختفي السؤال
    /// ولا يعود إلا صباح الغد (طلب المدير 2026-09-19)
    @AppStorage("home.mood.day") private var moodDay = ""
    @AppStorage("home.mood.value") private var moodValue = ""
    /// لحظة الوداع بعد الاختيار: يبقى السؤال ثانيتين يعرض ردّه ثم ينطوي
    @State private var moodFarewell = false
    /// يُحدِّث العدّ التنازلي للموعد القادم كل دقيقة
    @State private var now = Date()
    /// النطاق الذي تعرضه الشاشة الآن (لتظهر نسخة النطاق المحفوظة فور تبديله)
    @State private var shownScope: String?
    /// آخر جلب — الرجوع للتبويب يحدّث بصمت إن مضت نصف دقيقة
    @State private var lastLoad = Date.distantPast

    var body: some View {
        NavigationStack {
            ZStack {
                HomeBackdrop()
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
                StatusBarFade()
            }
            .toolbar(.hidden, for: .navigationBar)
            .onAppear {
                Usage.shared.screen("الرئيسية")
                openFromPush()
                now = Date()
                // عودة إلى التبويب: تحديث صامت خلف المعروض، لا دائرة تحميل
                if overview != nil, Date().timeIntervalSince(lastLoad) > 30 {
                    Task { await load() }
                }
            }
            .navigationDestination(isPresented: $showPrefs) { NotificationPrefsView() }
            .navigationDestination(isPresented: $showMyPage) { MyPageView() }
            .navigationDestination(isPresented: $showApprovals) { HrApprovalsView() }
            .navigationDestination(isPresented: $showNotifications) { NotificationsView() }
            .navigationDestination(isPresented: $showOfficeDocs) { OfficeDocumentsView() }
            .navigationDestination(item: $openedTask) { TaskDetailView(task: $0) }
            .onChange(of: router.route) { _, _ in openFromPush() }
            .onChange(of: showNotifications) { _, open in
                if !open { Task { await load() } }
            }
        }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                now = Date()
            }
        }
        .sheet(item: $closing) { t in
            SessionCloseSheet(target: t, mode: .close) { Task { await load() } }
        }
    }

    // MARK: - المحتوى

    private func content(_ ov: DashboardOverview) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.top, 8)

                if isDirector && scope == "all" {
                    Text("تعرض الآن لوحة المكتب كاملة")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.goldDark)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 5)
                        .background(Theme.brandGold.opacity(0.18), in: Capsule())
                        .padding(.top, 10)
                }

                if todayMood == nil || moodFarewell {
                    moodSection
                        .padding(.top, 22)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                statsRow(ov.stats)
                    .padding(.top, 12)

                if let next = nextEvent(ov) {
                    sectionTitle("الموعد القادم")
                        .padding(.top, 22)
                    nextCard(next)
                        .padding(.top, 10)
                }

                tasksSection(ov)
                    .padding(.top, 14)

                if isDirector && pendingHr > 0 {
                    hrPendingCard
                        .padding(.top, 14)
                }

                if !needClosure.isEmpty {
                    closureCard
                        .padding(.top, 14)
                }

                if let poas = ov.expiring_poas, !poas.isEmpty {
                    poaCard(poas)
                        .padding(.top, 14)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .softScrollEdges()
        .refreshable { await load() }
        .onChange(of: scope) {
            Task { await load() }
        }
    }

    private var isDirector: Bool { sb.member?.is_director == true }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(Theme.navy)
    }

    // MARK: - الرأس: الصورة والتحية والتاريخ والجرس

    private var header: some View {
        HStack(alignment: .center, spacing: 12) {
            Menu {
                if let name = sb.member?.name {
                    // سطر تعريفي فقط — معطّل حتى لا يوحي بأنه إجراء
                    Button(name) {}
                        .disabled(true)
                }
                if isDirector {
                    Picker("النطاق", selection: $scope) {
                        Label("لوحتي", systemImage: "person").tag("mine")
                        Label("لوحة المكتب", systemImage: "building.2").tag("all")
                    }
                }
                Button {
                    showMyPage = true
                } label: {
                    Label("صفحتي", systemImage: "person.text.rectangle")
                }
                Button {
                    showPrefs = true
                } label: {
                    Label("إعدادات الإشعارات", systemImage: "bell.badge")
                }
                Button("تسجيل الخروج", role: .destructive) {
                    sb.logout()
                }
            } label: {
                AvatarCircle(member: sb.member, size: 46)
                    .padding(3)
                    .background(Circle().fill(.white))
                    .shadow(color: Theme.navy.opacity(0.10), radius: 8, y: 3)
            }
            .accessibilityLabel("حسابي")

            VStack(alignment: .leading, spacing: 4) {
                Text([greeting, sb.member?.short_name ?? sb.member?.name].compactMap { $0 }.joined(separator: "، "))
                    .font(.system(size: 22, weight: .bold))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(dateLine)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }

            Spacer(minLength: 8)

            Button {
                showNotifications = true
            } label: {
                Image(systemName: "bell.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.navy)
                    .frame(width: 44, height: 44)
                    .overlay(alignment: .topTrailing) {
                        // نقطة هادئة بدل عدّاد أحمر
                        if unreadCount > 0 {
                            Circle()
                                .fill(Theme.brandGold)
                                .frame(width: 9, height: 9)
                                .overlay(Circle().stroke(.white, lineWidth: 1.5))
                                .offset(x: -11, y: 10)
                        }
                    }
                    .glassCircle()
            }
            .buttonStyle(.plain)
            .accessibilityLabel(unreadCount > 0 ? "الإشعارات، \(unreadCount) غير مقروء" : "الإشعارات")
        }
    }

    private var greeting: String {
        Calendar.current.component(.hour, from: now) < 12 ? "صباح الخير" : "مساء الخير"
    }

    /// «الخميس 17 سبتمبر 2026 · 6 ربيع الآخر 1448 هـ»
    private var dateLine: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA@numbers=latn")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "EEEE"
        let today = Fmt.todayISO()
        return "\(f.string(from: now)) \(Fmt.gregLong(today)) · \(Fmt.hijriLong(today))"
    }

    // MARK: - كيف حالك اليوم؟

    // ثلاثة خيارات بطلب المدير 2026-09-25 («ودي يكون ثلاث خيارات: فيس مبسوط، فيس مريض، فيس محبط»)
    private static let moods: [(emoji: String, label: String, reply: String)] = [
        ("😊", "مبسوط", "جميل! يومك يبدأ بشكل طيب."),
        ("🤒", "مريض", "سلامتك، ما تشوف شر — خذها بهدوء، وإن احتجت إجازة مرضية فقدّمها من «صفحتي»."),
        ("😞", "محبط", "ولا يهمك — ابدأ بأخف مهمة، وكل خطوة تنجزها تُحسب لك."),
    ]

    /// «يوم» السؤال يبدأ الرابعة فجراً — من أجاب ليلاً لا يُسأل ثانية بعد منتصف الليل،
    /// ويعود السؤال مع صباح اليوم التالي
    private var moodDayKey: String {
        Fmt.iso(now.addingTimeInterval(-4 * 3600))
    }

    private var todayMood: String? {
        moodDay == moodDayKey && !moodValue.isEmpty ? moodValue : nil
    }

    private var moodSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionTitle("كيف حالك اليوم؟")
                .font(.system(size: 15, weight: .semibold))

            HStack(spacing: 0) {
                ForEach(Self.moods, id: \.emoji) { m in
                    let selected = todayMood == m.emoji
                    Button {
                        guard todayMood == nil else { return }
                        moodFarewell = true
                        withAnimation(.spring(duration: 0.35)) {
                            moodDay = moodDayKey
                            moodValue = m.emoji
                        }
                        Task {
                            try? await Task.sleep(for: .seconds(2.4))
                            withAnimation(.easeInOut(duration: 0.45)) { moodFarewell = false }
                        }
                    } label: {
                        VStack(spacing: 3) {
                            Text(m.emoji)
                                .font(.system(size: 26))
                                .scaleEffect(selected ? 1.15 : 1)
                                .background {
                                    if selected {
                                        Circle().fill(Theme.brandGold.opacity(0.22)).frame(width: 42, height: 42)
                                    }
                                }
                            Text(m.label)
                                .font(.system(size: 11, weight: selected ? .semibold : .medium))
                                .foregroundStyle(selected ? Theme.navy : Theme.muted)
                        }
                        .opacity(todayMood == nil || selected ? 1 : 0.45)
                        .frame(maxWidth: .infinity, minHeight: 58)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(m.label)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                }
            }
            .padding(.horizontal, 6)
            .glassCapsule()

            if let mood = todayMood, let m = Self.moods.first(where: { $0.emoji == mood }) {
                Text(m.reply)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Theme.muted)
                    .transition(.opacity)
            }
        }
    }

    // MARK: - البطاقات الثلاث

    private func statsRow(_ stats: DashStats) -> some View {
        HStack(spacing: 10) {
            statCard(title: "المفتوحة", value: stats.open_tasks ?? 0, note: "مستمرة", tint: Theme.goldDark)
            statCard(title: "المكتملة", value: doneToday, note: "أُنجزت اليوم", tint: Theme.navySoft)
            statCard(title: "القادمة", value: stats.upcoming_sessions ?? 0, note: "جلسات قريبة", tint: Theme.navySoft)
        }
    }

    private func statCard(title: String, value: Int, note: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.muted)
            Text("\(value)")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundStyle(tint)
                .contentTransition(.numericText())
            Text(note)
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .homeCard(radius: 22)
        .accessibilityElement(children: .combine)
    }

    // MARK: - الموعد القادم

    private struct NextEvent {
        let isSession: Bool
        let title: String
        let subtitle: String?
        let dateISO: String
        let time: String?
        let caseId: String?
    }

    private func nextEvent(_ ov: DashboardOverview) -> NextEvent? {
        let today = Fmt.todayISO()
        let nowHM = String(format: "%02d:%02d", Calendar.current.component(.hour, from: now), Calendar.current.component(.minute, from: now))
        var list: [NextEvent] = []
        for s in ov.upcoming_sessions ?? [] {
            guard let d = s.session_date else { continue }
            list.append(NextEvent(
                isSession: true,
                title: s.title ?? s.case_title ?? "جلسة",
                subtitle: [s.court, s.title == nil ? nil : s.case_title].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " • "),
                dateISO: d, time: normTime(s.session_time), caseId: s.case_id
            ))
        }
        for a in ov.appointments ?? [] where a.status != "cancelled" {
            guard let d = a.appointment_date else { continue }
            list.append(NextEvent(
                isSession: false,
                title: "موعد · \(a.client_name ?? "موكّل")",
                subtitle: nil,
                dateISO: d, time: normTime(a.appointment_time), caseId: nil
            ))
        }
        // ما مضى وقته اليوم لا يُعرض «قادماً»
        return list
            .filter { !($0.dateISO == today && ($0.time.map { String($0.prefix(5)) < nowHM } ?? false)) }
            .sorted { ($0.dateISO, $0.time ?? "99") < ($1.dateISO, $1.time ?? "99") }
            .first
    }

    @ViewBuilder
    private func nextCard(_ e: NextEvent) -> some View {
        if e.isSession, let cid = e.caseId {
            NavigationLink {
                CaseDetailView(caseId: cid, initialTab: .sessions)
            } label: { nextCardBody(e) }
            .buttonStyle(.plain)
        } else {
            nextCardBody(e)
        }
    }

    private func nextCardBody(_ e: NextEvent) -> some View {
        HStack(alignment: .center, spacing: 12) {
            iconTile(e.isSession ? "building.columns" : "calendar", tint: Theme.navySoft)

            VStack(alignment: .leading, spacing: 6) {
                Text(e.title)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    chip(e.isSession ? "جلسة" : "موعد", fg: Theme.navySoft, bg: Theme.navySoft.opacity(0.08))
                    if let t = e.time {
                        chip(Fmt.time(t), icon: "clock", fg: Theme.navySoft, bg: Theme.navySoft.opacity(0.08))
                    }
                    chip(countdown(e), icon: "hourglass", fg: Theme.goldDark, bg: Theme.brandGold.opacity(0.2))
                }
                if let sub = e.subtitle, !sub.isEmpty {
                    Text(sub)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .homeCard(radius: 22)
    }

    /// «بعد 40 دقيقة» · «بعد 3 ساعات» · «غداً» · «بعد 4 أيام»
    private func countdown(_ e: NextEvent) -> String {
        if e.dateISO == Fmt.todayISO(), let t = e.time {
            let p = t.prefix(5).split(separator: ":").compactMap { Int($0) }
            if p.count == 2 {
                let cal = Calendar.current
                let mins = (p[0] * 60 + p[1]) - (cal.component(.hour, from: now) * 60 + cal.component(.minute, from: now))
                if mins <= 0 { return "الآن" }
                if mins < 60 { return "بعد \(mins) دقيقة" }
                let h = mins / 60
                return h == 1 ? "بعد ساعة" : h == 2 ? "بعد ساعتين" : "بعد \(h) ساعات"
            }
        }
        return Fmt.relDays(e.dateISO)?.text ?? Fmt.gregLong(e.dateISO)
    }

    // MARK: - مهام اليوم

    private func tasksSection(_ ov: DashboardOverview) -> some View {
        let tasks = Array((ov.tasks ?? []).prefix(4))
        return VStack(spacing: 10) {
            HStack(spacing: 10) {
                iconTile("list.bullet.rectangle", tint: Theme.goldDark, size: 34)
                Text("مهام اليوم")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.navy)
                Spacer()
                Button("رؤية الكل", action: openTasksTab)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .homeCard(radius: 20)

            if tasks.isEmpty {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle")
                        .foregroundStyle(Theme.success)
                    Text("لا مهام مفتوحة — يومك صافٍ")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.muted)
                    Spacer()
                }
                .padding(16)
                .homeCard(radius: 20)
            } else {
                ForEach(tasks) { t in
                    Button { Task { await openTask(t.id) } } label: {
                        taskRow(t)
                    }
                    .buttonStyle(.plain)
                    .disabled(openingTaskId != nil)
                }
            }
        }
    }

    private func taskRow(_ t: DashTask) -> some View {
        HStack(spacing: 12) {
            iconTile(taskIcon(t), tint: t.is_urgent == true ? Theme.goldDark : Theme.navySoft)

            VStack(alignment: .leading, spacing: 3) {
                Text(t.title ?? "مهمة")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(1)
                if let c = t.case_title, !c.isEmpty {
                    Text(c)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)

            if openingTaskId == t.id {
                ProgressView().controlSize(.small)
            } else {
                let tag = taskTag(t)
                Text(tag.text)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(tag.color)
                    .lineLimit(1)
            }
            Image(systemName: "chevron.left")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Theme.muted.opacity(0.6))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .homeCard(radius: 20)
    }

    private func taskIcon(_ t: DashTask) -> String {
        let title = t.title ?? ""
        if title.contains("جلسة") { return "calendar" }
        if title.contains("اعتراض") || title.contains("استئناف") { return "doc.text.magnifyingglass" }
        if title.contains("مذكرة") { return "signature" }
        return "checklist"
    }

    /// لا أحمر ولا «متأخرة» هنا: ما فات موعده «ينتظرك» بهدوء
    private func taskTag(_ t: DashTask) -> (text: String, color: Color) {
        if t.is_urgent == true { return ("عاجل", Theme.goldDark) }
        if t.overdue == true { return ("ينتظرك", Theme.amber) }
        guard let rel = Fmt.relDays(t.due_date) else { return ("", Theme.muted) }
        return (rel.text, rel.text == "اليوم" ? Theme.navySoft : Theme.muted)
    }

    private func openTask(_ id: String) async {
        openingTaskId = id
        defer { openingTaskId = nil }
        if let row = try? await sb.task(id: id) { openedTask = row }
    }

    // MARK: - مكوّنات صغيرة

    private func iconTile(_ symbol: String, tint: Color, size: CGFloat = 38) -> some View {
        Image(systemName: symbol)
            .font(.system(size: size * 0.42, weight: .medium))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(tint.opacity(0.09), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func chip(_ text: String, icon: String? = nil, fg: Color, bg: Color) -> some View {
        HStack(spacing: 3) {
            if let icon {
                Image(systemName: icon).font(.system(size: 9, weight: .semibold))
            }
            Text(text).font(.system(size: 11, weight: .semibold)).lineLimit(1)
        }
        .foregroundStyle(fg)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(bg, in: Capsule())
    }

    // MARK: - للمدير: طلبات الموظفين

    /// طلبات إجازة/استئذان بانتظار المدير — قرارٌ ينتظره موظف
    private var hrPendingCard: some View {
        Button { showApprovals = true } label: {
            HStack(spacing: 12) {
                iconTile("calendar.badge.clock", tint: Theme.goldDark)
                VStack(alignment: .leading, spacing: 2) {
                    Text("طلبات موظفين بانتظار اعتمادك")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Theme.navy)
                    Text("إجازة أو استئذان أو دوام عن بعد")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 8)
                Text("\(pendingHr)")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.goldDark)
                    .frame(minWidth: 26, minHeight: 26)
                    .background(Theme.brandGold.opacity(0.22), in: Capsule())
            }
            .padding(14)
            .homeCard(radius: 20)
        }
        .buttonStyle(.plain)
    }

    /// إشعار «طلب من موظف» ← الاعتمادات، و«اعتُمد/رُفض طلبك» ← صفحتي
    private func openFromPush() {
        switch router.route {
        case "/me":
            router.clear()
            showMyPage = true
        case "/hr/approvals":
            router.clear()
            showApprovals = true
        case "/office-documents":
            router.clear()
            showOfficeDocs = true
        default:
            break
        }
    }

    // MARK: - جلسات تحتاج تسجيل نتيجتها (sessions_need_closure — نفس تنبيه لوحة الويب)

    private var closureCard: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                iconTile("pencil.and.list.clipboard", tint: Theme.navySoft, size: 32)
                Text("جلسات تنتظر تسجيل نتيجتها")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.navy)
                Spacer()
                Text("\(needClosure.count)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.navySoft)
            }
            .padding(.bottom, 4)

            ForEach(Array(needClosure.enumerated()), id: \.element.id) { index, s in
                Button {
                    closing = CloseTarget(
                        id: s.id, caseId: s.case_id, sessionTitle: s.title, caseTitle: s.case_title,
                        clientName: nil, clientPhone: nil, outcome: nil, nextAction: nil, rulingDate: nil
                    )
                } label: {
                    HStack(alignment: .center, spacing: 10) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.case_title ?? "ملف")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(Theme.navy)
                                .lineLimit(1)
                            Text([s.title ?? "جلسة", Fmt.gregLong(s.session_date)].joined(separator: " · "))
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 8)
                        let d = s.days_ago ?? 0
                        Text(d <= 0 ? "اليوم" : d == 1 ? "أمس" : "منذ \(d) يوم")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.amber)
                        Image(systemName: "chevron.left")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Theme.muted.opacity(0.6))
                    }
                    .padding(.vertical, 9)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if index < needClosure.count - 1 {
                    Divider().overlay(Theme.line)
                }
            }
        }
        .padding(14)
        .homeCard(radius: 22)
    }

    // MARK: - الوكالات المنتهية قريباً

    private func poaCard(_ poas: [DashPOA]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                iconTile("doc.text", tint: Theme.goldDark, size: 32)
                Text("وكالات تنتهي قريباً")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.navy)
                Spacer()
            }
            .padding(.bottom, 4)

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
                        // يومان أو أقل وحدهما يأخذان لون الخطر
                        Text(expiryText(days))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(days <= 2 ? Theme.danger : Theme.amber)
                    }
                }
                .padding(.vertical, 9)

                if index < poas.count - 1 {
                    Divider().overlay(Theme.line)
                }
            }
        }
        .padding(14)
        .homeCard(radius: 22)
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
        now = Date()
        lastLoad = Date()
        // غير المدير لا يملك نطاق المكتب مهما كانت قيمة الحالة
        let effectiveScope = isDirector ? scope : "mine"
        let key = ScreenCache.homeKey(effectiveScope)

        // آخر نسخة محفوظة تظهر فوراً — ثم الجديد متى وصل (لا دائرة تحميل عند الفتح)
        if shownScope != effectiveScope, let snap = ScreenCache.load(HomeSnapshot.self, key, sb) {
            apply(snap)
            shownScope = effectiveScope
        }

        // الطلبات الخمسة معاً في رحلة واحدة — كانت متتابعة فتتراكم رحلاتها إلى الخادم
        let director = isDirector
        async let ovR = sb.dashboard(scope: effectiveScope)
        async let closureR = try? sb.sessionsNeedClosure(scope: effectiveScope)
        async let doneR = try? sb.doneTodayCount(scope: effectiveScope)
        async let notesR = try? sb.notifications(limit: 50)
        async let hrR = Self.pendingHr(sb, director: director)

        let closure = await closureR
        let done = await doneR
        let notes = await notesR
        let hr = await hrR
        do {
            let ov = try await ovR
            overview = ov
            shownScope = effectiveScope
            errorMessage = nil
        } catch {
            // الإلغاء ليس خطأً — تُعاد المحاولة صامتاً عند عودة الشاشة؛
            // وحين تُعرض نسخة محفوظة لا تمحوها شاشة خطأ
            if let t = uiErrorText(error) {
                if overview == nil { errorMessage = t }
            } else { cancelled = true }
        }
        // الثانويات لا تُفشل الشاشة؛ وما تعذّر منها يبقى على قيمته المعروضة
        if let closure { needClosure = closure }
        if let done { withAnimation { doneToday = done } }
        if let notes {
            // عدّاد الجرس — شارة الأيقونة تتبعه حتى لا يعلق رقم بعد قراءة كل شيء
            unreadCount = notes.filter { $0.is_read == false }.count
            try? await UNUserNotificationCenter.current().setBadgeCount(unreadCount)
        }
        if let hr { pendingHr = hr }

        if let ov = overview, shownScope == effectiveScope {
            ScreenCache.save(HomeSnapshot(
                overview: ov, doneToday: doneToday, needClosure: needClosure,
                unread: unreadCount, pendingHr: pendingHr
            ), key, sb)
        }
    }

    private func apply(_ snap: HomeSnapshot) {
        overview = snap.overview
        doneToday = snap.doneToday
        needClosure = snap.needClosure
        unreadCount = snap.unread
        pendingHr = snap.pendingHr
        errorMessage = nil
    }

    /// طلبات الموظفين المعلّقة — للمدير فقط
    private static func pendingHr(_ sb: SB, director: Bool) async -> Int? {
        guard director else { return 0 }
        return try? await sb.pendingHrCount()
    }
}

// MARK: - الخلفية والزجاج

/// خلفية باستيل هادئة بهالات الهوية — الزجاج لا يحيا فوق لون مسطّح
private struct HomeBackdrop: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(hex: 0xEEF2F8), Color(hex: 0xF5F4F1), Color(hex: 0xF3EFE8)],
                startPoint: .top, endPoint: .bottom
            )
            Circle()
                .fill(Theme.brandGold.opacity(0.16))
                .frame(width: 380).blur(radius: 90)
                .offset(x: 150, y: -300)
            Circle()
                .fill(Theme.navySoft.opacity(0.10))
                .frame(width: 420).blur(radius: 110)
                .offset(x: -170, y: 60)
            Circle()
                .fill(Color(hex: 0xF6D9C4).opacity(0.35))
                .frame(width: 360).blur(radius: 100)
                .offset(x: 140, y: 380)
            // هالتان تحت شريط التبويبات: الزجاج يكسر الضوء ويُظهر لونه
            // بدل أن يبدو أبيض مصمتاً فوق لون ساكن (ملاحظة المدير 2026-09-17)
            VStack {
                Spacer()
                ZStack {
                    Ellipse()
                        .fill(Theme.navySoft.opacity(0.28))
                        .frame(width: 300, height: 140).blur(radius: 50)
                        .offset(x: -90)
                    Ellipse()
                        .fill(Theme.brandGold.opacity(0.42))
                        .frame(width: 280, height: 130).blur(radius: 45)
                        .offset(x: 110, y: 10)
                }
                .offset(y: 30)
            }
        }
        .ignoresSafeArea()
    }
}

/// الشريط العلوي مخفي، فلا تغبيش تلقائياً تحت الساعة — هذا بديله:
/// زجاج ناعم يتلاشى نزولاً فلا يتداخل المحتوى مع الساعة والبطارية
private struct StatusBarFade: View {
    var body: some View {
        GeometryReader { g in
            let h = g.safeAreaInsets.top + 16
            Rectangle()
                .fill(.ultraThinMaterial)
                .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.6), .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom))
                .frame(height: h)
                .offset(y: -g.safeAreaInsets.top)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .allowsHitTesting(false)
    }
}

private extension Theme {
    /// الذهب الشامبين الرسمي (#C9A982) — Theme.gold القديم مطابق للويب ويبقى كما هو
    static let brandGold = Color(hex: 0xC9A982)
}

private extension View {
    /// بطاقة محتوى: بيضاء شبه شفافة بحافة ضوئية وظل ناعم
    func homeCard(radius: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return self
            .background(.white.opacity(0.72), in: shape)
            .background(.ultraThinMaterial, in: shape)
            .overlay(shape.stroke(.white.opacity(0.9), lineWidth: 1))
            .shadow(color: Theme.navy.opacity(0.06), radius: 12, y: 4)
    }

    /// تغبيش ناعم حيث يمر المحتوى تحت شريط التبويبات
    @ViewBuilder
    func softScrollEdges() -> some View {
        if #available(iOS 26.0, *) {
            self.scrollEdgeEffectStyle(.soft, for: .bottom)
        } else {
            self
        }
    }

    /// عناصر عائمة: Liquid Glass حقيقي على iOS 26، ومادة شفافة قبله
    @ViewBuilder
    func glassCircle() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular.interactive(), in: Circle())
        } else {
            self.background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().stroke(.white.opacity(0.8), lineWidth: 1))
        }
    }

    @ViewBuilder
    func glassCapsule() -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: Capsule())
        } else {
            self.background(.ultraThinMaterial, in: Capsule())
                .overlay(Capsule().stroke(.white.opacity(0.8), lineWidth: 1))
        }
    }
}
