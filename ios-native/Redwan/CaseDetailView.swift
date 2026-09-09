import SwiftUI

// ملف القضية على الجوال — أربعة تبويبات: نظرة · الجلسات · القصة · الدراسة.
// «الجلسات» هي غرفة المحكمة: ملخّص ما قبل الجلسة، وتسجيل النتيجة من القاعة،
// وإرسال التقرير للموكّل. النقاش يفتح من الزر في الأعلى (CaseStreamView).

enum CaseTab: String, CaseIterable {
    case overview = "نظرة", sessions = "الجلسات", documents = "المستندات", story = "القصة", study = "الدراسة"
}

struct CaseDetailView: View {
    let caseId: String
    var initialTab: CaseTab = .overview

    @EnvironmentObject private var sb: SB
    @State private var tab: CaseTab = .overview
    @State private var c: CaseFull?
    @State private var parties: [CaseParty] = []
    @State private var sessions: [CaseSession] = []
    @State private var briefs: [String: SessionBrief] = [:]
    @State private var events: [MatterEvent] = []
    @State private var study: CaseStudyRow?
    @State private var proposals: [StudyProposal] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var closing: CloseTarget?
    @State private var reporting: CloseTarget?
    @State private var generating: String?
    @State private var toast: String?
    @State private var documents: [DocumentRow] = []
    @State private var previewDoc: DocumentRow?
    @State private var showScan = false
    // فريق الملف — الإشراك من الجوال (طلب المدير 2026-09-09)
    @State private var members: [CaseMemberRow] = []
    @State private var showAddMember = false
    @State private var removing: CaseMemberRow?

    var body: some View {
        Group {
            if let error {
                ErrorBox(message: error) { Task { await load() } }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .padding(16)
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        header
                        Picker("", selection: $tab) {
                            ForEach(CaseTab.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        .pickerStyle(.segmented)

                        switch tab {
                        case .overview: overview
                        case .sessions: sessionsTab
                        case .documents: documentsTab
                        case .story: storyTab
                        case .study: studyTab
                        }
                    }
                    .padding(16)
                }
                .refreshable { await load() }
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle(c?.office_num ?? "الملف")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showScan = true } label: {
                    Image(systemName: "camera.fill").foregroundStyle(Theme.goldDark)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    CaseStreamView(caseId: caseId, title: c?.title ?? "نقاش الملف", fromMatter: true)
                } label: {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .foregroundStyle(Theme.goldDark)
                }
            }
        }
        .onAppear { tab = initialTab; Usage.shared.screen("ملف القضية") }
        .task { await load() }
        .sheet(item: $closing) { t in
            SessionCloseSheet(target: t, mode: .close) { Task { await load() } }
        }
        .sheet(item: $reporting) { t in
            SessionCloseSheet(target: t, mode: .report) { Task { await load() } }
        }
        .sheet(item: $previewDoc) { d in
            FilePreviewSheet(name: d.name ?? "مستند", url: d.file_url)
        }
        .sheet(isPresented: $showScan) {
            ScanSheet(caseId: caseId, caseTitle: c?.title) {
                tab = .documents
                Task { await load() }
            }
        }
        .sheet(isPresented: $showAddMember) {
            MemberPickerSheet(
                exclude: Set(members.map(\.member_id) + [c?.assignee?.id, sb.member?.id].compactMap { $0 })
            ) { picked in
                showAddMember = false
                Task {
                    do {
                        try await sb.addCaseMember(caseId: caseId, memberId: picked.id, addedBy: sb.member?.id)
                    } catch {
                        toast = teamErrorText(error)
                    }
                    // في الحالتين: القائمة المحلية قد تكون قديمة (أضاف زميل من الويب)
                    members = (try? await sb.caseMembers(caseId: caseId)) ?? members
                }
            }
        }
        .alert("إزالة من فريق الملف؟", isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } })) {
            Button("أزِل", role: .destructive) {
                guard let m = removing else { return }
                removing = nil
                Task {
                    do {
                        try await sb.removeCaseMember(caseId: caseId, memberId: m.member_id)
                    } catch {
                        toast = teamErrorText(error)
                    }
                    let fresh = (try? await sb.caseMembers(caseId: caseId)) ?? members
                    if fresh.contains(where: { $0.member_id == m.member_id }) {
                        toast = "لم تُزَل — ربما تغيّر مسؤول الملف. اسحب لتحديث الصفحة."
                    }
                    members = fresh
                }
            }
            Button("إلغاء", role: .cancel) { removing = nil }
        } message: {
            Text("\(removing?.member?.short_name ?? removing?.member?.name ?? "العضو") لن يعود يرى هذا الملف ولا جلساته ولا مستنداته.")
        }
        .alert("تنبيه", isPresented: Binding(get: { toast != nil }, set: { if !$0 { toast = nil } })) {
            Button("حسناً") { toast = nil }
        } message: { Text(toast ?? "") }
    }

    // MARK: - الرأس

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(c?.title ?? "ملف")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.navy)
            HStack(spacing: 8) {
                StatusChip(status: c?.status)
                // وسم النوع لغير القضايا — الشاشة صارت تفتح كل أنواع المشاريع
                if let k = c?.kind, k != "case" {
                    Text(matterKindLabel(k))
                        .font(.system(size: 10, weight: .semibold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Theme.gold.opacity(0.18), in: Capsule())
                        .foregroundStyle(Theme.goldDark)
                }
                if let t = c?.type, !t.isEmpty {
                    Text(t).font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                if let n = c?.court_num, !n.isEmpty {
                    Text("قضية \(n)").font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
            // سير الإجراء — «متابعة سير المشروع» (الديون والدائنون في نظام الإفلاس)
            if c?.kind == "bankruptcy" {
                HStack(spacing: 6) {
                    Image(systemName: "flag.checkered")
                        .font(.system(size: 11)).foregroundStyle(Theme.goldDark)
                    Text("المرحلة: \(bankruptcyStageLabel(c?.bankruptcy_stage))")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Theme.navy)
                }
            }
            if let client = c?.contact, let name = client.name, !name.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "person.fill").foregroundStyle(Theme.goldDark)
                    Text(name).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                    Spacer()
                    if let num = normalizeSaudiPhone(client.phone) {
                        Link(destination: URL(string: "tel:+\(num)")!) {
                            Image(systemName: "phone.fill").frame(width: 34, height: 34)
                                .background(Theme.success.opacity(0.12)).foregroundStyle(Theme.success)
                                .clipShape(Circle())
                        }
                        Link(destination: URL(string: "https://wa.me/\(num)")!) {
                            Image(systemName: "message.fill").frame(width: 34, height: 34)
                                .background(Theme.success.opacity(0.12)).foregroundStyle(Theme.success)
                                .clipShape(Circle())
                        }
                    }
                }
                .padding(10)
                .background(Theme.goldPale)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    // MARK: - نظرة

    private var overview: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let h = c?.hearing_date, h >= Fmt.todayISO() {
                InfoCard(title: c?.hearing_label ?? "الجلسة القادمة", icon: "building.columns.fill") {
                    Text("\(Fmt.gregLong(h)) — \(Fmt.relDays(h)?.text ?? "")")
                        .font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.navy)
                }
            }
            InfoCard(title: "بيانات القضية", icon: "info.circle.fill") {
                VStack(alignment: .leading, spacing: 6) {
                    InfoRow("المحكمة", c?.court)
                    InfoRow("الدائرة", c?.court_division)
                    InfoRow("رقم القضية", c?.court_num)
                    InfoRow("المسؤول", c?.assignee?.short_name ?? c?.assignee?.name)
                    InfoRow("تاريخ الفتح", c?.open_date.map { Fmt.gregLong($0) })
                    InfoRow("تاريخ الإغلاق", c?.close_date.map { Fmt.gregLong($0) })
                }
            }
            InfoCard(title: "الفريق", icon: "person.3.fill") {
                VStack(alignment: .leading, spacing: 10) {
                    if members.isEmpty {
                        Text("لا أحد غير المسؤول. من يُضاف هنا يرى الملف وجلساته ومستنداته ومهامه — ولا يرى الأتعاب.")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                    ForEach(members) { m in
                        HStack(spacing: 10) {
                            AvatarCircle(member: m.member, size: 30)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(m.member?.short_name ?? m.member?.name ?? "عضو")
                                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                                if let r = m.role, !r.isEmpty {
                                    Text(r).font(.system(size: 12)).foregroundStyle(Theme.muted)
                                }
                            }
                            Spacer()
                            if canManageTeam {
                                Button { removing = m } label: {
                                    Image(systemName: "xmark").font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(Theme.muted)
                                        .frame(width: 44, height: 44)
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("إزالة من فريق الملف")
                            }
                        }
                    }
                    if canManageTeam {
                        Button { showAddMember = true } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "person.badge.plus").font(.system(size: 13, weight: .semibold))
                                Text("إشراك زميل").font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(Theme.goldDark)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Theme.gold.opacity(0.18), in: Capsule())
                        }
                        .padding(.top, 2)
                    }
                }
            }
            if let s = c?.subject, !s.isEmpty {
                InfoCard(title: "الموضوع", icon: "text.alignright") {
                    Text(s).font(.system(size: 14)).foregroundStyle(Theme.navy)
                }
            }
            if let s = c?.agreed_scope, !s.isEmpty {
                InfoCard(title: "نطاق العمل المتفق عليه", icon: "doc.plaintext.fill") {
                    Text(s).font(.system(size: 14)).foregroundStyle(Theme.navy)
                }
            }
            if !parties.isEmpty {
                InfoCard(title: "الأطراف", icon: "person.2.fill") {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(parties) { p in
                            HStack(alignment: .top, spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(p.name ?? "—").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                                    Text([partySideLabel(p.party_side), p.role ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                                }
                                Spacer()
                                if let num = normalizeSaudiPhone(p.phone) {
                                    Link(destination: URL(string: "tel:+\(num)")!) {
                                        Image(systemName: "phone.fill").foregroundStyle(Theme.success)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - الجلسات

    private var sessionsTab: some View {
        VStack(spacing: 12) {
            if sessions.isEmpty {
                EmptyBox(icon: "building.columns", text: "لا جلسات في هذا الملف")
            }
            ForEach(sessions) { s in
                SessionCardView(
                    session: s,
                    brief: briefs[s.id],
                    generating: generating == s.id,
                    onClose: { closing = target(s) },
                    onReport: { reporting = target(s) },
                    onBrief: { Task { await generateBrief(s) } }
                )
            }
        }
    }

    private func target(_ s: CaseSession) -> CloseTarget {
        CloseTarget(
            id: s.id, caseId: caseId, sessionTitle: s.title, caseTitle: c?.title,
            clientName: c?.contact?.name, clientPhone: c?.contact?.phone,
            outcome: s.outcome, nextAction: s.next_action, rulingDate: s.ruling_due_date
        )
    }

    private func generateBrief(_ s: CaseSession) async {
        generating = s.id
        defer { generating = nil }
        if let err = await sb.generateSessionBrief(sessionId: s.id) {
            toast = err
            return
        }
        if let b = try? await sb.sessionBriefs(caseId: caseId) {
            briefs = Dictionary(uniqueKeysWithValues: b.map { ($0.session_id, $0) })
        }
    }

    // MARK: - المستندات

    private var documentsTab: some View {
        VStack(spacing: 10) {
            Button { showScan = true } label: {
                Label("تصوير مستند بالكاميرا", systemImage: "camera.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(Theme.gold).foregroundStyle(Theme.navyDeep)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            if documents.isEmpty {
                EmptyBox(icon: "doc", text: "لا مستندات في هذا الملف بعد")
            }
            ForEach(documents) { d in
                Button { previewDoc = d } label: {
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: (d.file_type ?? "").contains("pdf") ? "doc.richtext.fill" : "photo.fill")
                            .font(.system(size: 18)).foregroundStyle(Theme.goldDark)
                            .frame(width: 36, height: 36).background(Theme.goldPale).clipShape(RoundedRectangle(cornerRadius: 9))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(d.name ?? "مستند").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy).lineLimit(2)
                            HStack(spacing: 6) {
                                if let cat = d.category, !cat.isEmpty {
                                    Text(cat).font(.system(size: 11, weight: .medium))
                                        .padding(.horizontal, 7).padding(.vertical, 2)
                                        .background(Theme.goldPale).foregroundStyle(Theme.goldDark).clipShape(Capsule())
                                }
                                Text(Fmt.stamp(d.created_at)).font(.system(size: 11)).foregroundStyle(Theme.muted)
                            }
                            if let desc = d.description, !desc.isEmpty {
                                Text(desc).font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(2)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(12)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - القصة

    private var storyTab: some View {
        VStack(alignment: .leading, spacing: 0) {
            if events.isEmpty {
                EmptyBox(icon: "book", text: "لم تبدأ قصة هذا الملف بعد",
                         subtext: "كل جلسة وحكم ومستند يُسجَّل هنا تلقائياً")
            }
            ForEach(Array(events.enumerated()), id: \.element.id) { i, e in
                HStack(alignment: .top, spacing: 10) {
                    VStack(spacing: 0) {
                        Circle().fill(Theme.gold).frame(width: 9, height: 9).padding(.top, 5)
                        if i < events.count - 1 {
                            Rectangle().fill(Theme.line).frame(width: 1).frame(maxHeight: .infinity)
                        }
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.sentence ?? "").font(.system(size: 14)).foregroundStyle(Theme.navy)
                        Text([Fmt.stamp(e.created_at), e.actor_name ?? ""].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(.system(size: 11)).foregroundStyle(Theme.muted)
                    }
                    .padding(.bottom, 14)
                }
            }
        }
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1))
    }

    // MARK: - الدراسة

    private var studyTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let st = study {
                if st.stale_since != nil {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.amber)
                        Text("حدث في الملف ما قد يغيّر هذه الدراسة — تُجدَّد تلقائياً الليلة")
                            .font(.system(size: 12)).foregroundStyle(Theme.navy)
                    }
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.amber.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 10))
                }
                Text("النسخة \(st.version ?? 1) · \(Fmt.stamp(st.generated_at))")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)

                if !proposals.isEmpty {
                    InfoCard(title: "مقترحات تنتظر قرارك", icon: "lightbulb.fill") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(proposals) { p in
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(proposalKind(p.kind)).font(.system(size: 11, weight: .semibold))
                                            .padding(.horizontal, 7).padding(.vertical, 2)
                                            .background(Theme.goldPale).foregroundStyle(Theme.goldDark).clipShape(Capsule())
                                        Text(p.title ?? "").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                                    }
                                    if let d = p.detail, !d.isEmpty {
                                        Text(d).font(.system(size: 13)).foregroundStyle(Theme.navy.opacity(0.85))
                                    }
                                    if let due = p.due_date {
                                        Text("المهلة: \(Fmt.gregLong(due))").font(.system(size: 11)).foregroundStyle(Theme.muted)
                                    }
                                }
                            }
                            Text("الاعتماد (تحويلها مهامّ) من الويب حالياً").font(.system(size: 11)).foregroundStyle(Theme.muted)
                        }
                    }
                }

                ForEach(Array(st.sections.enumerated()), id: \.offset) { _, sec in
                    DisclosureGroup {
                        Text(sec.text).font(.system(size: 14)).foregroundStyle(Theme.navy)
                            .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                    } label: {
                        Text(sec.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.navy)
                    }
                    .padding(14)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
                }
            } else {
                EmptyBox(icon: "doc.text.magnifyingglass", text: "لا دراسة لهذا الملف بعد",
                         subtext: "تُولَّد من تبويب «دراسة القضية» في الويب")
            }
        }
    }

    private func proposalKind(_ k: String?) -> String {
        switch k {
        case "risk": return "خطر"
        case "question": return "سؤال للموكّل"
        default: return "مهمة"
        }
    }

    // MARK: - الجلب

    /// الإشراك للمدير أو مسؤول الملف — تُطبّقه سياسة القاعدة، وهذا يخفي الزر فقط
    private var canManageTeam: Bool {
        guard let me = sb.member else { return false }
        return me.is_director == true || (c?.assignee?.id != nil && c?.assignee?.id == me.id)
    }

    /// أخطاء القاعدة الشائعة هنا بلغة المستخدم لا بنصّ Postgres الخام
    private func teamErrorText(_ error: Error) -> String {
        let m = error.localizedDescription
        if m.contains("duplicate key") { return "هذا الزميل مُشرَك في الملف أصلاً" }
        if m.contains("row-level security") { return "لا تملك صلاحية الإشراك في هذا الملف — ربما تغيّر مسؤوله" }
        return m
    }

    private func load() async {
        error = nil
        do {
            async let a = sb.caseFull(id: caseId)
            async let b = sb.caseParties(caseId: caseId)
            async let s = sb.caseSessions(caseId: caseId)
            async let br = sb.sessionBriefs(caseId: caseId)
            async let ev = sb.matterEvents(caseId: caseId)
            async let st = sb.caseStudy(caseId: caseId)
            async let pr = sb.studyProposals(caseId: caseId)
            async let dc = sb.caseDocuments(caseId: caseId)
            async let cm = sb.caseMembers(caseId: caseId)
            let (cf, ps, ss, bs, es, sd, prs, docs, mbs) = try await (a, b, s, br, ev, st, pr, dc, cm)
            guard let cf else { throw SBError(message: "الملف غير موجود أو لا تملك صلاحية فتحه") }
            c = cf; parties = ps; sessions = ss; events = es; study = sd; proposals = prs; documents = docs
            members = mbs
            briefs = Dictionary(uniqueKeysWithValues: bs.map { ($0.session_id, $0) })
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - بطاقة الجلسة

struct SessionCardView: View {
    let session: CaseSession
    let brief: SessionBrief?
    let generating: Bool
    let onClose: () -> Void
    let onReport: () -> Void
    let onBrief: () -> Void

    @State private var showMinutes = false

    private var s: CaseSession { session }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        if let n = s.session_number {
                            Text("رقم \(n)").font(.system(size: 11, weight: .medium))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .overlay(Capsule().stroke(Theme.line)).foregroundStyle(Theme.muted)
                        }
                        Text(s.title ?? "جلسة").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.navy)
                    }
                    Text([Fmt.gregLong(s.session_date), s.session_time.map { Fmt.time($0) } ?? "", s.court ?? ""]
                        .filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    sessionBadge
                    if s.needsClosure {
                        Text("بحاجة إغلاق").font(.system(size: 11, weight: .medium))
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Theme.amber.opacity(0.14)).foregroundStyle(Theme.amber).clipShape(Capsule())
                    }
                }
            }

            // ملخّص ما قبل الجلسة — للقادمة والمنعقدة؛ يتولّد فجراً أو بضغطة الآن
            if let b = brief?.brief, !b.isEmpty {
                DisclosureGroup {
                    Text(b).font(.system(size: 14)).foregroundStyle(Theme.navy)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
                    Text("وُلّد \(Fmt.stamp(brief?.generated_at))").font(.system(size: 11)).foregroundStyle(Theme.muted)
                } label: {
                    Label("ملخّص ما قبل الجلسة", systemImage: "sparkles")
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.goldDark)
                }
                .padding(10).background(Theme.goldPale).clipShape(RoundedRectangle(cornerRadius: 10))
            } else if !s.isClosed && s.displayStatus != "منتهية" {
                Button(action: onBrief) {
                    HStack(spacing: 6) {
                        if generating { ProgressView().controlSize(.small) }
                        Image(systemName: "sparkles")
                        Text(generating ? "يُجهَّز الملخّص… نصف دقيقة" : "جهّز ملخّص ما قبل الجلسة")
                    }
                    .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.goldDark)
                }
                .disabled(generating)
            }

            if let p = s.preparation, !p.isEmpty {
                block("التحضير", p, bg: Theme.ivory, fg: Theme.navy)
            }
            if let o = s.outcome, !o.isEmpty {
                block("نتيجة الجلسة", o, bg: Theme.success.opacity(0.1), fg: Theme.success)
            }
            if s.isClosed {
                HStack(spacing: 10) {
                    let na = nextActionLabel(s.next_action)
                    if !na.isEmpty {
                        Text(na + (s.next_action == "await_ruling" && s.ruling_due_date != nil ? " — \(Fmt.gregLong(s.ruling_due_date))" : ""))
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.navy)
                    }
                    if s.report_sent_at != nil {
                        Label("أُرسل التقرير", systemImage: "paperplane.fill")
                            .font(.system(size: 12)).foregroundStyle(Theme.success)
                    }
                }
            }

            HStack(spacing: 8) {
                if s.needsClosure {
                    Button(action: onClose) {
                        Label("تسجيل نتيجة الجلسة", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 13, weight: .semibold))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(Theme.gold).foregroundStyle(Theme.navyDeep)
                            .clipShape(Capsule())
                    }
                }
                if s.isClosed, let o = s.outcome, !o.isEmpty {
                    Button(action: onReport) {
                        Label(s.report_sent_at == nil ? "إرسال التقرير للموكّل" : "إعادة إرسال التقرير", systemImage: "paperplane")
                            .font(.system(size: 13, weight: .medium))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .overlay(Capsule().stroke(Theme.success.opacity(0.5)))
                            .foregroundStyle(Theme.success)
                    }
                }
                // المحضر يُعرض **داخل التطبيق** (QuickLook) لا في سفاري —
                // القفز خارج التطبيق يقطع سياق الجلسة ويطلب تسجيل دخول التخزين
                if s.minutes_url != nil {
                    Button { showMinutes = true } label: {
                        Label("المحضر", systemImage: "doc.text")
                            .font(.system(size: 13, weight: .medium))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .overlay(Capsule().stroke(Theme.line)).foregroundStyle(Theme.navy)
                    }
                }
            }
        }
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(s.needsClosure ? Theme.amber.opacity(0.4) : Theme.line, lineWidth: 1))
        .sheet(isPresented: $showMinutes) {
            FilePreviewSheet(
                name: "محضر \(s.title ?? "الجلسة") — \(Fmt.gregLong(s.session_date))",
                url: s.minutes_url
            )
        }
    }

    private var sessionBadge: some View {
        let st = s.displayStatus
        let color: Color = st == "مُغلقة" ? Theme.success : st == "منعقدة" ? Theme.gold : st == "مؤجّلة" ? Theme.amber : st == "منتهية" ? Theme.muted : Theme.blue
        return Text(st).font(.system(size: 11, weight: .medium))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.12)).foregroundStyle(color).clipShape(Capsule())
    }

    private func block(_ title: String, _ text: String, bg: Color, fg: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.system(size: 11, weight: .semibold)).foregroundStyle(fg)
            Text(text).font(.system(size: 14)).foregroundStyle(Theme.navy)
        }
        .padding(10).frame(maxWidth: .infinity, alignment: .leading)
        .background(bg).clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - مكوّنات صغيرة

struct InfoCard<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content
    var body: some View {
        SectionCard(title: title, icon: icon) {
            content.padding(.horizontal, 6).padding(.bottom, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct InfoRow: View {
    let label: String
    let value: String?
    init(_ label: String, _ value: String?) { self.label = label; self.value = value }
    var body: some View {
        if let v = value, !v.isEmpty {
            HStack(alignment: .top, spacing: 8) {
                Text(label).font(.system(size: 12)).foregroundStyle(Theme.muted).frame(width: 84, alignment: .leading)
                Text(v).font(.system(size: 14)).foregroundStyle(Theme.navy)
                Spacer(minLength: 0)
            }
        }
    }
}


// MARK: - اختيار زميل لإشراكه في الملف

struct MemberPickerSheet: View {
    let exclude: Set<String>
    let onPick: (TeamMember) -> Void
    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var staff: [TeamMember] = []
    @State private var loaded = false
    @State private var loadError: String?
    @State private var search = ""

    private var candidates: [TeamMember] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return staff.filter { !exclude.contains($0.id) }
            .filter { q.isEmpty || ($0.name ?? "").arContains(q) || ($0.short_name ?? "").arContains(q) }
    }

    var body: some View {
        NavigationStack {
            List(candidates) { m in
                Button { onPick(m) } label: {
                    HStack(spacing: 10) {
                        AvatarCircle(member: m, size: 34)
                        Text(m.short_name ?? m.name ?? "—")
                            .font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.navy)
                        Spacer()
                    }
                }
                .listRowBackground(Theme.card)
            }
            .listStyle(.plain)
            .overlay {
                if let loadError {
                    ErrorBox(message: loadError) { Task { await load() } }.padding(16)
                } else if !loaded {
                    ProgressView()
                } else if candidates.isEmpty {
                    if search.isEmpty {
                        EmptyBox(icon: "person.3", text: "لا زملاء متاحين", subtext: "الكل مُشرَك أصلاً")
                    } else {
                        EmptyBox(icon: "magnifyingglass", text: "لا زميل بهذا الاسم", subtext: "جرّب كلمة أخرى")
                    }
                }
            }
            .searchable(text: $search, prompt: "ابحث باسم الزميل")
            .navigationTitle("إشراك زميل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
    }

    private func load() async {
        loadError = nil
        do { staff = try await sb.staff(); loaded = true }
        catch { loadError = error.localizedDescription }
    }
}
