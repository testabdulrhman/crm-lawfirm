import SwiftUI

// «صفحتي» — الخدمة الذاتية للموظف (طلب المدير 2026-09-13: «تطبيق الأيفون ودي يكون الموظف
// يقدر يستفيد منه، يقدم على إجازة ويستأذن»). اختار: القسم الأول كاملاً + رصيد الإجازات.
//
// لماذا في التطبيق: طلبات الإجازة موجودة في الويب ولم يُقدَّم عبرها إلا طلبان — الموظف يعيش
// في الجوال. المنطق كله في القاعدة: RLS (الموظف طلباته وقيوده، والمدير الكل)، والإشعارات من
// الترقرات (تقديم ← المدير، قرار ← صاحب الطلب)، والرصيد دالة leave_balance.

// MARK: - تسميات ومساعدات

enum HrLabels {
    static func kind(_ k: String) -> String {
        switch k {
        case "leave": return "إجازة"
        case "permission": return "استئذان"
        case "remote": return "دوام عن بعد"
        default: return k
        }
    }
    static func leaveType(_ t: String?) -> String? {
        switch t ?? "" {
        case "annual": return "سنوية"
        case "sick": return "مرضية"
        case "emergency": return "اضطرارية"
        case "unpaid": return "بدون راتب"
        case "": return nil
        default: return t
        }
    }
    static func status(_ s: String) -> String {
        switch s {
        case "pending": return "بانتظار الاعتماد"
        case "approved": return "معتمد"
        case "rejected": return "مرفوض"
        case "cancelled": return "ملغى"
        default: return s
        }
    }
    static func statusColor(_ s: String) -> Color {
        switch s {
        case "approved": return Theme.success
        case "rejected": return Theme.danger
        case "pending": return Theme.goldDark
        default: return Theme.muted
        }
    }
    static func icon(_ k: String) -> String {
        switch k {
        case "leave": return "sun.max.fill"
        case "permission": return "clock.fill"
        case "remote": return "house.fill"
        default: return "doc"
        }
    }
    static func payType(_ t: String?) -> String {
        switch t ?? "" {
        case "salary": return "راتب"
        case "bonus": return "مكافأة"
        case "allowance": return "بدل"
        case "deduction": return "خصم"
        case "other": return "أخرى"
        default: return t ?? "—"
        }
    }
}

/// تمييز العدد العربي: يوم واحد · يومان · ٣–١٠ أيام · ١١+ يوماً
func arDays(_ n: Int) -> String {
    switch n {
    case 1: return "يوم واحد"
    case 2: return "يومان"
    case 3...10: return "\(n) أيام"
    default: return "\(n) يوماً"
    }
}

func arYears(_ n: Int) -> String {
    switch n {
    case ..<1: return "أقل من سنة"
    case 1: return "سنة"
    case 2: return "سنتان"
    case 3...10: return "\(n) سنوات"
    default: return "\(n) سنة"
    }
}

/// عدد الأيام شاملاً الطرفين — نفس hrDays في الويب
func inclusiveDays(_ a: String, _ b: String) -> Int {
    guard let da = Fmt.date(a), let db = Fmt.date(b) else { return 1 }
    let d = Calendar(identifier: .gregorian).dateComponents([.day], from: da, to: db).day ?? 0
    return max(1, d + 1)
}

func hrWhenText(_ r: HrRequestRow) -> String {
    if r.kind == "permission" {
        var s = dayMonthText(r.start_date)
        if let f = r.from_time, let t = r.to_time { s += " · \(timeText(f)) – \(timeText(t))" }
        return s
    }
    if r.start_date == r.end_date { return "\(dayMonthText(r.start_date)) · يوم واحد" }
    return "\(dayMonthText(r.start_date)) ← \(dayMonthText(r.end_date)) · \(arDays(inclusiveDays(r.start_date, r.end_date)))"
}

private let amountF: NumberFormatter = {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.maximumFractionDigits = 2
    f.locale = Locale(identifier: "en_US")
    return f
}()

/// حقل أرقام يعمل في RTL — نفس علاج شاشة الدخول (NumericField): لوحات الأرقام في iOS لا
/// ترسم المكتوب داخل تطبيق عربي الاتجاه، فنُخفي نص الحقل ونرسم القيمة بأنفسنا.
struct LTRNumberField: View {
    let placeholder: String
    @Binding var text: String
    var keyboard: UIKeyboardType = .phonePad

    var body: some View {
        ZStack(alignment: .trailing) {
            if text.isEmpty {
                Text(placeholder).foregroundStyle(Theme.muted.opacity(0.6))
            }
            Text(text).foregroundStyle(Theme.navy)
            TextField("", text: $text)
                .keyboardType(keyboard)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.characters)
                .foregroundStyle(.clear)
                .tint(.clear)
        }
        .environment(\.layoutDirection, .leftToRight)
    }
}

private struct HrStatusChip: View {
    let status: String
    var body: some View {
        Text(HrLabels.status(status))
            .font(.system(size: 11, weight: .semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(HrLabels.statusColor(status).opacity(0.12))
            .foregroundStyle(HrLabels.statusColor(status))
            .clipShape(Capsule())
    }
}

// MARK: - صفحتي

struct MyPageView: View {
    @EnvironmentObject private var sb: SB
    @State private var profile: MyProfile?
    @State private var balance: LeaveBalance?
    @State private var requests: [HrRequestRow] = []
    @State private var payroll: [PayrollRow] = []
    @State private var pendingForMe = 0
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false
    @State private var showNewRequest = false
    @State private var showEditDetails = false
    @State private var confirmCancel: HrRequestRow?
    @State private var preview: PayrollRow?
    @State private var alertText: String?

    private var isDirector: Bool { sb.member?.is_director == true }

    var body: some View {
        ScrollView {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.padding(16)
            } else if !loaded {
                ProgressView().padding(.top, 60)
            } else {
                VStack(spacing: 14) {
                    header
                    if isDirector { approvalsLink }
                    balanceCard
                    requestsCard
                    payrollCard
                    detailsCard
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("صفحتي")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("صفحتي") }
        .sheet(isPresented: $showNewRequest, onDismiss: { Task { await load() } }) {
            HrRequestSheet(balance: balance)
        }
        .sheet(isPresented: $showEditDetails, onDismiss: { Task { await load() } }) {
            if let profile { MyDetailsSheet(profile: profile) }
        }
        .sheet(item: $preview) { p in
            FilePreviewSheet(name: HrLabels.payType(p.entry_type), url: p.file_url)
        }
        .confirmationDialog("إلغاء الطلب؟", isPresented: Binding(get: { confirmCancel != nil },
                                                              set: { if !$0 { confirmCancel = nil } }),
                            titleVisibility: .visible) {
            Button("نعم، ألغِه", role: .destructive) {
                if let r = confirmCancel { Task { await cancel(r) } }
            }
            Button("تراجع", role: .cancel) { confirmCancel = nil }
        }
        .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
            Button("حسناً", role: .cancel) { alertText = nil }
        } message: { Text(alertText ?? "") }
    }

    // الرأس
    private var header: some View {
        HStack(spacing: 12) {
            // الضغط على الصورة يغيّرها (طلب المدير 2026-09-23)
            EditableAvatar(size: 54)
            VStack(alignment: .leading, spacing: 3) {
                Text(profile?.name ?? sb.member?.name ?? "—")
                    .font(.system(size: 18, weight: .bold)).foregroundStyle(Theme.navy)
                if let role = profile?.role, !role.isEmpty {
                    Text(role).font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
                if let j = profile?.join_date {
                    Text("انضم \(Fmt.gregLong(j))").font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
    }

    // للمدير: الطريق إلى اعتماد طلبات الفريق
    private var approvalsLink: some View {
        NavigationLink { HrApprovalsView() } label: {
            HStack(spacing: 10) {
                Image(systemName: "checkmark.seal.fill").foregroundStyle(Theme.goldDark)
                Text("طلبات الموظفين").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.navy)
                Spacer()
                if pendingForMe > 0 {
                    Text("\(pendingForMe) بانتظارك")
                        .font(.system(size: 12, weight: .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Theme.danger).clipShape(Capsule())
                }
            }
            .padding(14)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    /// ١٣ · ١٤٫٢٥ — بلا أصفار زائدة وبأرقام لاتينية
    private func dayText(_ d: Double) -> String {
        d == d.rounded() ? String(Int(d)) : String(format: "%.2f", d)
            .replacingOccurrences(of: "0$", with: "", options: .regularExpression)
    }

    // رصيد الإجازة السنوية
    private var balanceCard: some View {
        SectionCard(title: "رصيد الإجازة السنوية", icon: "sun.max.fill") {
            Group {
                if let b = balance, b.missing_join_date != true, b.not_started != true, let ent = b.entitlement {
                    let used = b.used ?? 0
                    // الدقيق بالكسر إن وُجد (١٣٫٢٥)، وإلا الصحيح — الرصيد يُستحق شهرياً منذ التعيين
                    let accrued = b.accrued ?? Double(ent)
                    let remaining = b.remaining_exact ?? Double(b.remaining ?? ent - used)
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(dayText(remaining))
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(remaining < 0 ? Theme.danger : Theme.navy)
                            Text("متبقٍّ من \(dayText(accrued)) مستحقة حتى الآن")
                                .font(.system(size: 14)).foregroundStyle(Theme.muted)
                        }
                        ProgressView(value: min(Double(used), max(accrued, 1)), total: max(accrued, 1))
                            .tint(Theme.goldDark)
                        HStack(spacing: 8) {
                            chip("استُخدم: \(used)", Theme.navy)
                            if (b.pending ?? 0) > 0 { chip("قيد الاعتماد: \(b.pending ?? 0)", Theme.goldDark) }
                        }
                        Text("منذ التعيين \(Fmt.gregLong(b.join_date))" + (b.months_accrued.map { " · \($0) شهراً مكتملاً" } ?? ""))
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                        Text("تُستحق شهرياً (1.75 يوم عن كل شهر) ويُرحَّل ما لم يُستخدم — 21 يوماً في السنة، و30 بعد خمس سنوات متصلة.")
                            .font(.system(size: 11)).foregroundStyle(Theme.muted)
                    }
                } else if balance?.missing_join_date == true {
                    Label(isDirector ? "سجّل تاريخ تعيينك من الويب ليُحسب الرصيد"
                                     : "لم يُسجَّل تاريخ تعيينك بعد — يُحسب الرصيد متى سجّله المدير",
                          systemImage: "calendar.badge.exclamationmark")
                        .font(.system(size: 13)).foregroundStyle(Theme.muted)
                } else if balance?.not_started == true {
                    Label("يبدأ الرصيد من تاريخ تعيينك", systemImage: "calendar")
                        .font(.system(size: 13)).foregroundStyle(Theme.muted)
                } else {
                    Label("تعذّر حساب الرصيد — اسحب للتحديث", systemImage: "wifi.exclamationmark")
                        .font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 6).padding(.bottom, 6)
        }
    }

    private func chip(_ t: String, _ c: Color) -> some View {
        Text(t).font(.system(size: 11, weight: .medium))
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(c.opacity(0.08)).foregroundStyle(c)
            .clipShape(Capsule())
    }

    // طلباتي
    private var requestsCard: some View {
        SectionCard(title: "طلباتي", icon: "calendar.badge.clock", count: requests.count) {
            VStack(spacing: 8) {
                Button { showNewRequest = true } label: {
                    Label("طلب جديد", systemImage: "plus")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                        .background(Theme.navy).foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)

                if requests.isEmpty {
                    Text("لا طلبات بعد — إجازة أو استئذان أو دوام عن بعد")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                        .padding(.vertical, 6)
                } else {
                    ForEach(requests.prefix(20)) { r in
                        requestRow(r)
                        if r.id != requests.prefix(20).last?.id { Divider().overlay(Theme.line) }
                    }
                }
            }
            .padding(.horizontal, 6).padding(.bottom, 6)
        }
    }

    private func requestRow(_ r: HrRequestRow) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: HrLabels.icon(r.kind))
                .font(.system(size: 14)).foregroundStyle(Theme.goldDark)
                .frame(width: 30, height: 30).background(Theme.goldPale)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(HrLabels.kind(r.kind) + (HrLabels.leaveType(r.leave_type).map { " · \($0)" } ?? ""))
                        .font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.navy)
                    HrStatusChip(status: r.status)
                }
                Text(hrWhenText(r)).font(.system(size: 12)).foregroundStyle(Theme.muted)
                if let reason = r.reason, !reason.isEmpty {
                    Text(reason).font(.system(size: 12)).foregroundStyle(Theme.navy.opacity(0.8)).lineLimit(2)
                }
                if let note = r.decision_note, !note.isEmpty {
                    Text("ملاحظة المدير: \(note)").font(.system(size: 12))
                        .foregroundStyle(HrLabels.statusColor(r.status))
                }
            }
            Spacer(minLength: 0)
            if r.status == "pending" {
                Button("إلغاء") { confirmCancel = r }
                    .font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.danger)
                    .buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 4)
    }

    // مستحقاتي
    private var payrollCard: some View {
        SectionCard(title: "مستحقاتي", icon: "banknote.fill", count: payroll.count) {
            VStack(spacing: 6) {
                if payroll.isEmpty {
                    Text("لا قيود مسجّلة لك بعد")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted).padding(.vertical, 6)
                } else {
                    ForEach(payroll.prefix(24)) { e in
                        Button { if e.file_url != nil { preview = e } } label: {
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(HrLabels.payType(e.entry_type))
                                        .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                                    Text([dayMonthText(e.entry_date), e.note].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(1)
                                }
                                Spacer(minLength: 8)
                                if e.file_url != nil {
                                    Image(systemName: "paperclip").font(.system(size: 12)).foregroundStyle(Theme.muted)
                                }
                                // المبلغ والعملة نصّان: في نصّ واحد يقلب ثنائيُّ الاتجاه علامة الخصم إلى ما بعد الرقم
                                HStack(spacing: 4) {
                                    Text("\u{200E}" + (e.entry_type == "deduction" ? "−" : "") + (amountF.string(from: NSNumber(value: e.amount ?? 0)) ?? "0"))
                                        .environment(\.layoutDirection, .leftToRight)
                                    Text("ريال")
                                }
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(e.entry_type == "deduction" ? Theme.danger : Theme.navy)
                            }
                            .padding(.vertical, 5)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 6).padding(.bottom, 6)
        }
    }

    // بياناتي
    private var detailsCard: some View {
        SectionCard(title: "بياناتي", icon: "person.text.rectangle") {
            VStack(spacing: 0) {
                detailRow("الجوال", profile?.phone, ltr: true)
                detailRow("البريد", profile?.email, ltr: true)
                detailRow("العنوان الوطني", profile?.national_address)
                detailRow("البنك", profile?.bank_name)
                detailRow("الآيبان", profile?.bank_iban, ltr: true)
                detailRow("جهة الطوارئ", [profile?.emergency_contact_name, profile?.emergency_contact_relation]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " — "))
                detailRow("جوال الطوارئ", profile?.emergency_contact_phone, ltr: true)
                detailRow("المؤهلات", profile?.qualifications)
                Button { showEditDetails = true } label: {
                    Label("تحديث بياناتي", systemImage: "pencil")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Theme.goldPale).foregroundStyle(Theme.goldDark)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .padding(.top, 8)
            }
            .padding(.horizontal, 6).padding(.bottom, 6)
        }
    }

    private func detailRow(_ label: String, _ value: String?, ltr: Bool = false) -> some View {
        HStack(alignment: .top) {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.muted)
            Spacer(minLength: 8)
            Text((value ?? "").isEmpty ? "—" : value!)
                .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.navy)
                .multilineTextAlignment(.trailing)
                .environment(\.layoutDirection, ltr ? .leftToRight : .rightToLeft)
        }
        .padding(.vertical, 6)
    }

    private func load() async {
        error = nil
        do {
            async let p = sb.myProfile()
            async let b = sb.leaveBalance()
            async let r = sb.myHrRequests()
            async let pay = sb.myPayroll()
            profile = try await p
            requests = try await r
            balance = try? await b          // الرصيد ثانوي — لا يُفشل الصفحة
            payroll = (try? await pay) ?? []
            if isDirector { pendingForMe = (try? await sb.pendingHrCount()) ?? 0 }
            loaded = true
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }

    private func cancel(_ r: HrRequestRow) async {
        confirmCancel = nil
        do {
            try await sb.cancelHrRequest(r.id)
            await load()
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}

// MARK: - طلب جديد

struct HrRequestSheet: View {
    var balance: LeaveBalance?

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var kind = "leave"
    @State private var leaveType = "annual"
    @State private var start = Date()
    @State private var end = Date()
    @State private var fromTime = Calendar(identifier: .gregorian).date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var toTime = Calendar(identifier: .gregorian).date(bySettingHour: 11, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var reason = ""
    @State private var busy = false
    @State private var alertText: String?

    private let gregorian = Calendar(identifier: .gregorian)
    private var days: Int { inclusiveDays(Fmt.iso(start), Fmt.iso(end)) }

    private func minutes(_ d: Date) -> Int {
        let c = gregorian.dateComponents([.hour, .minute], from: d)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
    private func hhmm(_ d: Date) -> String {
        let c = gregorian.dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }

    private var valid: Bool {
        kind == "permission" ? minutes(toTime) > minutes(fromTime) : Fmt.iso(end) >= Fmt.iso(start)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("النوع", selection: $kind) {
                        Text("إجازة").tag("leave")
                        Text("استئذان").tag("permission")
                        Text("عن بُعد").tag("remote")
                    }
                    .pickerStyle(.segmented)
                }

                if kind == "leave" {
                    Section("نوع الإجازة") {
                        HStack(spacing: 8) {
                            ForEach([("annual", "سنوية"), ("sick", "مرضية"), ("emergency", "اضطرارية"), ("unpaid", "بدون راتب")], id: \.0) { v, l in
                                let on = leaveType == v
                                Button { leaveType = v } label: {
                                    Text(l)
                                        .font(.system(size: 13, weight: on ? .semibold : .regular))
                                        .padding(.horizontal, 10).padding(.vertical, 6)
                                        .background(on ? Theme.navy : Theme.card)
                                        .foregroundStyle(on ? .white : Theme.navy)
                                        .overlay(Capsule().stroke(on ? Color.clear : Theme.line, lineWidth: 1))
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        if leaveType == "annual", let b = balance, let rem = b.remaining, b.missing_join_date != true {
                            // المعلّق محجوز من الرصيد: المتاح لهذا الطلب = المتبقي − قيد الاعتماد
                            let pend = b.pending ?? 0
                            let after = rem - pend - days
                            let head = pend > 0 ? "رصيدك \(rem) (\(pend) منها قيد الاعتماد)" : "رصيدك \(rem)"
                            Label(after < 0 ? "\(head) — هذا الطلب يتجاوزه بـ\(arDays(-after))، والقرار للمدير"
                                            : "\(head) — يبقى بعد هذا الطلب \(after)",
                                  systemImage: after < 0 ? "exclamationmark.triangle.fill" : "sun.max")
                                .font(.system(size: 12))
                                .foregroundStyle(after < 0 ? Theme.danger : Theme.muted)
                        }
                    }
                }

                Section(kind == "permission" ? "الوقت" : "المدة") {
                    DatePicker(kind == "permission" ? "اليوم" : "من", selection: $start, displayedComponents: .date)
                        .environment(\.calendar, gregorian)
                    if kind == "permission" {
                        DatePicker("من الساعة", selection: $fromTime, displayedComponents: .hourAndMinute)
                        DatePicker("إلى الساعة", selection: $toTime, displayedComponents: .hourAndMinute)
                        if !valid {
                            Text("وقت النهاية بعد البداية").font(.system(size: 12)).foregroundStyle(Theme.danger)
                        }
                    } else {
                        DatePicker("إلى", selection: $end, in: start..., displayedComponents: .date)
                            .environment(\.calendar, gregorian)
                        Text("المدة: \(arDays(days))").font(.system(size: 13)).foregroundStyle(Theme.muted)
                    }
                }

                Section("السبب") {
                    TextField("اختياري", text: $reason, axis: .vertical).lineLimit(2...5)
                }

                Section {
                    Label("يصل المدير إشعار بطلبك، ويصلك إشعار بقراره", systemImage: "bell")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle("طلب جديد")
            .navigationBarTitleDisplayMode(.inline)
            .onChange(of: start) { if end < start { end = start } }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView().tint(Theme.goldDark) }
                    else {
                        Button("تقديم") { Task { await submit() } }
                            .fontWeight(.semibold).disabled(!valid)
                    }
                }
            }
            .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
                Button("حسناً", role: .cancel) { alertText = nil }
            } message: { Text(alertText ?? "") }
        }
    }

    private func submit() async {
        guard !busy, valid else { return }
        busy = true
        defer { busy = false }
        var v: [String: Any] = [
            "kind": kind,
            "start_date": Fmt.iso(start),
            "end_date": kind == "permission" ? Fmt.iso(start) : Fmt.iso(end),
        ]
        if kind == "leave" { v["leave_type"] = leaveType }
        if kind == "permission" {
            v["from_time"] = hhmm(fromTime)
            v["to_time"] = hhmm(toTime)
        }
        let r = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        if !r.isEmpty { v["reason"] = r }
        do {
            try await sb.createHrRequest(v)
            Usage.shared.action("طلب \(HrLabels.kind(kind))")
            dismiss()
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}

// MARK: - اعتماد الطلبات (للمدير)

struct HrApprovalsView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [HrRequestRow] = []
    @State private var balances: [String: LeaveBalance] = [:]
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false
    @State private var busyId: String?
    @State private var rejecting: HrRequestRow?
    @State private var rejectNote = ""
    @State private var alertText: String?

    private var pending: [HrRequestRow] { rows.filter { $0.status == "pending" } }
    private var decided: [HrRequestRow] { Array(rows.filter { $0.status != "pending" }.prefix(30)) }

    var body: some View {
        ScrollView {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.padding(16)
            } else if !loaded {
                ProgressView().padding(.top, 60)
            } else {
                VStack(spacing: 14) {
                    SectionCard(title: "بانتظار اعتمادك", icon: "hourglass", count: pending.count) {
                        VStack(spacing: 8) {
                            if pending.isEmpty {
                                Text("لا طلبات معلّقة").font(.system(size: 13)).foregroundStyle(Theme.muted).padding(.vertical, 8)
                            }
                            ForEach(pending) { r in
                                approvalRow(r)
                                if r.id != pending.last?.id { Divider().overlay(Theme.line) }
                            }
                        }
                        .padding(.horizontal, 6).padding(.bottom, 6)
                    }
                    if !decided.isEmpty {
                        SectionCard(title: "آخر القرارات", icon: "clock.arrow.circlepath") {
                            VStack(spacing: 6) {
                                ForEach(decided) { r in
                                    HStack(spacing: 8) {
                                        if let m = r.member { AvatarCircle(member: m.asTeamMember, size: 26) }
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text("\(r.member?.short_name ?? r.member?.name ?? "—") · \(HrLabels.kind(r.kind))")
                                                .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.navy)
                                            Text(hrWhenText(r)).font(.system(size: 11)).foregroundStyle(Theme.muted)
                                        }
                                        Spacer(minLength: 0)
                                        HrStatusChip(status: r.status)
                                    }
                                    .padding(.vertical, 3)
                                }
                            }
                            .padding(.horizontal, 6).padding(.bottom, 6)
                        }
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("طلبات الموظفين")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("طلبات الموظفين") }
        .sheet(item: $rejecting) { r in
            NavigationStack {
                Form {
                    Section {
                        Text("\(r.member?.name ?? "—") · \(HrLabels.kind(r.kind))")
                        Text(hrWhenText(r)).foregroundStyle(Theme.muted)
                    }
                    Section("سبب الرفض") {
                        TextField("يصل للموظف مع القرار", text: $rejectNote, axis: .vertical).lineLimit(2...5)
                    }
                }
                .navigationTitle("رفض الطلب")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("تراجع") { rejecting = nil } }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("رفض") {
                            let target = r
                            rejecting = nil
                            Task { await decide(target, approve: false, note: rejectNote) }
                        }
                        .foregroundStyle(Theme.danger).fontWeight(.semibold)
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
            Button("حسناً", role: .cancel) { alertText = nil }
        } message: { Text(alertText ?? "") }
    }

    private func approvalRow(_ r: HrRequestRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                if let m = r.member { AvatarCircle(member: m.asTeamMember, size: 34) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.member?.name ?? "—").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.navy)
                    Text(HrLabels.kind(r.kind) + (HrLabels.leaveType(r.leave_type).map { " · \($0)" } ?? ""))
                        .font(.system(size: 12)).foregroundStyle(Theme.goldDark)
                }
                Spacer(minLength: 0)
            }
            Text(hrWhenText(r)).font(.system(size: 13)).foregroundStyle(Theme.navy)
            if r.kind == "leave", r.leave_type == "annual", let b = balances[r.member_id], let rem = b.remaining {
                let d = inclusiveDays(r.start_date, r.end_date)
                Label("رصيده \(rem) — يبقى بعد الاعتماد \(rem - d)", systemImage: "sun.max")
                    .font(.system(size: 12))
                    .foregroundStyle(rem - d < 0 ? Theme.danger : Theme.muted)
            } else if r.kind == "leave", r.leave_type == "annual", balances[r.member_id]?.missing_join_date == true {
                Label("رصيده غير محسوب — لم يُسجَّل تاريخ تعيينه", systemImage: "calendar.badge.exclamationmark")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
            if let reason = r.reason, !reason.isEmpty {
                Text(reason).font(.system(size: 12)).foregroundStyle(Theme.navy.opacity(0.8))
            }
            HStack(spacing: 8) {
                Button { Task { await decide(r, approve: true, note: nil) } } label: {
                    Label("اعتماد", systemImage: "checkmark")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Theme.success.opacity(0.12)).foregroundStyle(Theme.success)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                Button { rejectNote = ""; rejecting = r } label: {
                    Label("رفض", systemImage: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity).padding(.vertical, 9)
                        .background(Theme.danger.opacity(0.08)).foregroundStyle(Theme.danger)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
            }
            .buttonStyle(.plain)
            .disabled(busyId == r.id)
            .opacity(busyId == r.id ? 0.5 : 1)
        }
        .padding(.vertical, 4)
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.teamHrRequests()
            loaded = true
            // رصيد أصحاب الإجازات السنوية المعلّقة — يعين المدير على القرار
            let ids = Set(pending.filter { $0.kind == "leave" && $0.leave_type == "annual" }.map(\.member_id))
            for id in ids {
                if let b = try? await sb.leaveBalance(memberId: id) { balances[id] = b }
            }
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }

    private func decide(_ r: HrRequestRow, approve: Bool, note: String?) async {
        busyId = r.id
        defer { busyId = nil }
        do {
            try await sb.decideHrRequest(r.id, approve: approve,
                                         note: note?.trimmingCharacters(in: .whitespacesAndNewlines))
            Usage.shared.action(approve ? "اعتماد طلب موظف" : "رفض طلب موظف")
            await load()
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}

// MARK: - تحديث بياناتي

struct MyDetailsSheet: View {
    let profile: MyProfile

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var phone = ""
    @State private var nationalAddress = ""
    @State private var bankName = ""
    @State private var iban = ""
    @State private var emName = ""
    @State private var emPhone = ""
    @State private var emRelation = ""
    @State private var qualifications = ""
    @State private var busy = false
    @State private var alertText: String?

    /// آيبان سعودي: SA + ٢٢ رقماً (٢٤ خانة) — فارغ مقبول
    private var ibanClean: String { iban.replacingOccurrences(of: " ", with: "").uppercased() }
    private var ibanValid: Bool {
        ibanClean.isEmpty || (ibanClean.count == 24 && ibanClean.hasPrefix("SA") && ibanClean.dropFirst(2).allSatisfy(\.isNumber))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("التواصل") {
                    LTRNumberField(placeholder: "الجوال", text: $phone)
                    TextField("العنوان الوطني", text: $nationalAddress)
                }
                Section {
                    TextField("اسم البنك", text: $bankName)
                    LTRNumberField(placeholder: "الآيبان SA…", text: $iban, keyboard: .asciiCapable)
                } header: {
                    Text("الحساب البنكي")
                } footer: {
                    if !ibanValid {
                        Text("الآيبان السعودي 24 خانة تبدأ بـ SA").foregroundStyle(Theme.danger)
                    }
                }
                Section("جهة الاتصال للطوارئ") {
                    TextField("الاسم", text: $emName)
                    TextField("صلة القرابة", text: $emRelation)
                    LTRNumberField(placeholder: "جوالها", text: $emPhone)
                }
                Section("المؤهلات") {
                    TextField("اختياري", text: $qualifications, axis: .vertical).lineLimit(2...6)
                }
                Section {
                    Label("الاسم والمسمّى والبريد ورقم الهوية وتاريخ التعيين يعدّلها المدير.",
                          systemImage: "lock.fill")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
            }
            .navigationTitle("تحديث بياناتي")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView().tint(Theme.goldDark) }
                    else {
                        Button("حفظ") { Task { await save() } }
                            .fontWeight(.semibold).disabled(!ibanValid)
                    }
                }
            }
            .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
                Button("حسناً", role: .cancel) { alertText = nil }
            } message: { Text(alertText ?? "") }
            .task {
                phone = profile.phone ?? ""
                nationalAddress = profile.national_address ?? ""
                bankName = profile.bank_name ?? ""
                iban = profile.bank_iban ?? ""
                emName = profile.emergency_contact_name ?? ""
                emPhone = profile.emergency_contact_phone ?? ""
                emRelation = profile.emergency_contact_relation ?? ""
                qualifications = profile.qualifications ?? ""
            }
        }
    }

    private func save() async {
        guard !busy, ibanValid else { return }
        busy = true
        defer { busy = false }
        // الفارغ يُحفظ null؛ ولا يُرسل إلا ما تغيّر
        func val(_ s: String) -> Any {
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? NSNull() : t
        }
        let pairs: [(String, String, String?)] = [
            ("phone", phone, profile.phone),
            ("national_address", nationalAddress, profile.national_address),
            ("bank_name", bankName, profile.bank_name),
            ("bank_iban", ibanClean, profile.bank_iban),
            ("emergency_contact_name", emName, profile.emergency_contact_name),
            ("emergency_contact_phone", emPhone, profile.emergency_contact_phone),
            ("emergency_contact_relation", emRelation, profile.emergency_contact_relation),
            ("qualifications", qualifications, profile.qualifications),
        ]
        var values: [String: Any] = [:]
        for (k, new, old) in pairs where new.trimmingCharacters(in: .whitespacesAndNewlines) != (old ?? "") {
            values[k] = val(new)
        }
        guard !values.isEmpty else { dismiss(); return }
        do {
            try await sb.updateMyProfile(values)
            Usage.shared.action("تحديث بياناتي")
            dismiss()
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}
