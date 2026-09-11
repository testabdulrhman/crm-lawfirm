import SwiftUI

// تفاصيل الموعد وقائمة المواعيد (بلاغ المدير 2026-09-11: وصله إشعار حجز جديد من
// الموقع «ما أقدر ادخل واشوف التفاصيل» — التطبيق لم تكن فيه شاشة موعد أصلاً،
// والتقويم يعرض الاسم والوقت فقط بلا جوال ولا رابط اجتماع ولا رقم مرجعي).

// MARK: - التسميات (مطابقة للويب: src/lib/appointmentLabels.ts)

enum ApptLabels {
    static func status(_ s: String?) -> String {
        switch s {
        case "confirmed": return "مؤكّد"
        case "completed": return "مكتمل"
        case "cancelled": return "ملغى"
        case "no_show":   return "لم يحضر"
        default:          return s ?? "—"
        }
    }
    static func statusColor(_ s: String?) -> Color {
        switch s {
        case "confirmed": return Theme.success
        case "cancelled": return Theme.danger
        case "no_show":   return Theme.goldDark
        default:          return Theme.muted
        }
    }
    static func service(_ k: String?) -> String? {
        switch k {
        case "law": return "أعمال المحاماة"
        case "bankruptcy": return "أعمال إفلاس"
        case "notarization": return "التوثيق والتسجيل العيني"
        case "other": return "أخرى"
        default: return k
        }
    }
    static func method(_ m: String?) -> String? {
        m == "remote" ? "عن بُعد" : m == "onsite" ? "حضوري" : nil
    }
    static func source(_ s: String?) -> String? {
        s == "website" ? "حجز من الموقع" : s == "manual" ? "أُدخل يدوياً" : s
    }
}


/// الوقت للعرض — «—» حين لا وقت (Fmt.time تُرجع نصاً فارغاً)
func timeText(_ t: String?) -> String {
    let s = Fmt.time(t)
    return s.isEmpty ? "—" : s
}

/// «الخميس » — اسم اليوم يسبق التاريخ في الموعد
func weekdayText(_ iso: String?) -> String {
    guard let d = Fmt.date(iso) else { return "" }
    let f = DateFormatter()
    f.locale = Locale(identifier: "ar")
    f.calendar = Calendar(identifier: .gregorian)
    f.dateFormat = "EEEE"
    return f.string(from: d) + " "
}

/// «١٧ سبتمبر» مختصراً لصف القائمة
func dayMonthText(_ iso: String?) -> String {
    guard let d = Fmt.date(iso) else { return "—" }
    let f = DateFormatter()
    f.locale = Locale(identifier: "ar_SA@numbers=latn")
    f.calendar = Calendar(identifier: .gregorian)
    f.dateFormat = "d MMM"
    return f.string(from: d)
}

// MARK: - التفاصيل

struct AppointmentDetailView: View {
    let appointmentId: String

    @EnvironmentObject private var sb: SB
    @State private var a: AppointmentFull?
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false
    @State private var busy = false
    @State private var confirmCancel = false

    private var phone: String? { normalizeSaudiPhone(a?.client_phone) }

    var body: some View {
        ScrollView {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.padding(16)
            } else if let a {
                VStack(spacing: 12) {
                    header(a)
                    clientCard(a)
                    if a.meeting_method == "remote" { meetingCard(a) }
                    detailsCard(a)
                    if let n = a.notes, !n.isEmpty { notesCard(n) }
                    statusActions(a)
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
            } else if !loaded {
                ProgressView().padding(.top, 60)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("الموعد")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("الموعد") }
    }

    // الرأس: التاريخ بالتقويمين والوقت والمدة — أول ما تبحث عنه العين
    private func header(_ a: AppointmentFull) -> some View {
        VStack(spacing: 6) {
            Text(weekdayText(a.appointment_date) + Fmt.gregLong(a.appointment_date))
                .font(.system(size: 17, weight: .bold)).foregroundStyle(Theme.navy)
            Text(Fmt.hijriLong(a.appointment_date))
                .font(.system(size: 12)).foregroundStyle(Theme.muted)
            HStack(spacing: 6) {
                Image(systemName: "clock.fill").font(.system(size: 12))
                Text(timeText(a.appointment_time))
                    .font(.system(size: 15, weight: .semibold))
                if let d = a.duration_minutes {
                    Text("· \(d) دقيقة").font(.system(size: 13))
                }
            }
            .foregroundStyle(Theme.goldDark)
            .padding(.top, 2)

            HStack(spacing: 6) {
                Text(ApptLabels.status(a.status))
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(ApptLabels.statusColor(a.status).opacity(0.12))
                    .foregroundStyle(ApptLabels.statusColor(a.status))
                    .clipShape(Capsule())
                if let m = ApptLabels.method(a.meeting_method) {
                    Text(m).font(.system(size: 12))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Theme.navy.opacity(0.07))
                        .foregroundStyle(Theme.navy).clipShape(Capsule())
                }
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
    }

    private func clientCard(_ a: AppointmentFull) -> some View {
        SectionCard(title: "الموكّل", icon: "person.fill") {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(a.client_name ?? "—")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.navy)
                    if let co = a.company_name, !co.isEmpty {
                        Text(co).font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                    if let p = a.client_phone, !p.isEmpty {
                        Text(p).font(.system(size: 12)).foregroundStyle(Theme.muted)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    if let e = a.client_email, !e.isEmpty {
                        Text(e).font(.system(size: 12)).foregroundStyle(Theme.muted)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                }
                Spacer(minLength: 0)
                if let num = phone {
                    Link(destination: URL(string: "tel:+\(num)")!) {
                        RoundIcon(name: "phone.fill")
                    }
                    Link(destination: URL(string: "https://wa.me/\(num)")!) {
                        RoundIcon(name: "message.fill")
                    }
                }
            }
        }
    }

    private func meetingCard(_ a: AppointmentFull) -> some View {
        SectionCard(title: "الاجتماع", icon: "video.fill") {
            if let l = a.meeting_link, !l.isEmpty, let url = URL(string: l) {
                VStack(alignment: .leading, spacing: 8) {
                    Link(destination: url) {
                        HStack(spacing: 8) {
                            Image(systemName: "video.fill")
                            Text("افتح غرفة الاجتماع").font(.system(size: 14, weight: .semibold))
                            Spacer(minLength: 0)
                            Image(systemName: "arrow.up.forward.square")
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .background(Theme.navy).foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                    Text(l).font(.system(size: 11)).foregroundStyle(Theme.muted)
                        .environment(\.layoutDirection, .leftToRight)
                        .textSelection(.enabled).lineLimit(1)
                    if a.meeting_link_sent_at != nil {
                        Label("أُرسل الرابط للموكّل", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 11)).foregroundStyle(Theme.success)
                    }
                }
            } else {
                Label("موعد عن بُعد بلا رابط اجتماع", systemImage: "exclamationmark.triangle")
                    .font(.system(size: 13)).foregroundStyle(Theme.danger)
            }
        }
    }

    private func detailsCard(_ a: AppointmentFull) -> some View {
        SectionCard(title: "بيانات الحجز", icon: "doc.text.fill") {
            VStack(spacing: 0) {
                if let r = a.reference_no, !r.isEmpty { ApptInfoRow("الرقم المرجعي", r) }
                if let s = ApptLabels.service(a.service_type) { ApptInfoRow("الخدمة", s) }
                if let s = ApptLabels.source(a.source) { ApptInfoRow("المصدر", s) }
                if let c = a.created_by, !c.isEmpty { ApptInfoRow("أنشأه", c) }
                ApptInfoRow("رسالة التأكيد",
                        a.confirmation_sent_at != nil ? "وصلت الموكّل" : "لم تُرسل")
            }
        }
    }

    private func notesCard(_ n: String) -> some View {
        SectionCard(title: "ملاحظات", icon: "note.text") {
            Text(n).font(.system(size: 14)).foregroundStyle(Theme.navy)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder
    private func statusActions(_ a: AppointmentFull) -> some View {
        if a.status == "confirmed" {
            HStack(spacing: 8) {
                Button { Task { await setStatus("completed") } } label: {
                    actionLabel("تمّ الحضور", "checkmark.circle.fill", Theme.success)
                }
                Button { Task { await setStatus("no_show") } } label: {
                    actionLabel("لم يحضر", "person.slash.fill", Theme.goldDark)
                }
            }
            .disabled(busy)

            Button(role: .destructive) { confirmCancel = true } label: {
                Text("إلغاء الموعد")
                    .font(.system(size: 13, weight: .medium))
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(Theme.danger.opacity(0.08))
                    .foregroundStyle(Theme.danger)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .disabled(busy)
            .confirmationDialog("إلغاء الموعد؟", isPresented: $confirmCancel, titleVisibility: .visible) {
                Button("نعم، ألغِه", role: .destructive) { Task { await setStatus("cancelled") } }
                Button("تراجع", role: .cancel) {}
            } message: {
                // القاعدة لا تُبلّغ الموكّل بالإلغاء — قُلها صراحةً ولا تدع المدير يفترض
                Text("لن تصل الموكّل رسالة بالإلغاء — أبلغه بنفسك")
            }
        }
    }

    private func actionLabel(_ t: String, _ icon: String, _ color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
            Text(t).font(.system(size: 13, weight: .semibold))
        }
        .frame(maxWidth: .infinity).padding(.vertical, 10)
        .background(color.opacity(0.12)).foregroundStyle(color)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func load() async {
        error = nil
        do {
            a = try await sb.appointment(id: appointmentId)
            loaded = true
            if a == nil { error = "الموعد غير موجود أو لا تملك صلاحية عرضه" }
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }

    private func setStatus(_ s: String) async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await sb.setAppointmentStatus(appointmentId, status: s)
            await load()
        } catch {
            if let t = uiErrorText(error) { self.error = t }
        }
    }
}

private struct RoundIcon: View {
    let name: String
    var body: some View {
        Image(systemName: name)
            .frame(width: 34, height: 34)
            .background(Theme.success.opacity(0.12))
            .foregroundStyle(Theme.success)
            .clipShape(Circle())
    }
}

private struct ApptInfoRow: View {
    let label: String
    let value: String
    init(_ label: String, _ value: String) { self.label = label; self.value = value }
    var body: some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.muted)
            Spacer(minLength: 8)
            Text(value).font(.system(size: 13, weight: .medium))
                .foregroundStyle(Theme.navy).multilineTextAlignment(.trailing)
        }
        .padding(.vertical, 7)
    }
}

// MARK: - القائمة (وجهة إشعار الحجز)

struct AppointmentsListView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [AppointmentFull] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false

    var body: some View {
        ScrollView {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.padding(16)
            } else if !loaded {
                ProgressView().padding(.top, 60)
            } else if rows.isEmpty {
                EmptyBox(icon: "calendar.badge.clock", text: "لا مواعيد قادمة",
                         subtext: "المواعيد الماضية في التقويم")
                    .padding(.top, 40)
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(rows) { a in
                        NavigationLink { AppointmentDetailView(appointmentId: a.id) } label: {
                            row(a)
                        }
                        .buttonStyle(.plain)
                        Divider().overlay(Theme.line).padding(.leading, 16)
                    }
                }
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
                .padding(12)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("المواعيد")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { loaded = false; await load() }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("المواعيد") }
    }

    private func row(_ a: AppointmentFull) -> some View {
        HStack(spacing: 10) {
            VStack(spacing: 1) {
                Text(timeText(a.appointment_time))
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.goldDark)
                Text(dayMonthText(a.appointment_date))
                    .font(.system(size: 10)).foregroundStyle(Theme.muted)
            }
            .frame(width: 62)

            VStack(alignment: .leading, spacing: 2) {
                Text(a.client_name ?? "—")
                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                    .lineLimit(1)
                let sub = [ApptLabels.method(a.meeting_method), ApptLabels.service(a.service_type)]
                    .compactMap { $0 }.joined(separator: " · ")
                if !sub.isEmpty {
                    Text(sub).font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if a.status != "confirmed" {
                Text(ApptLabels.status(a.status))
                    .font(.system(size: 10, weight: .semibold))
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(ApptLabels.statusColor(a.status).opacity(0.12))
                    .foregroundStyle(ApptLabels.statusColor(a.status))
                    .clipShape(Capsule())
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 11)
        .contentShape(Rectangle())
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.upcomingAppointments()
            loaded = true
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}
