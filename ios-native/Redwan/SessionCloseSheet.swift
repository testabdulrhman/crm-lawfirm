import SwiftUI

// ورقة «تسجيل نتيجة الجلسة» من قاعة المحكمة — نفس دورة الويب حرفياً:
// close_session (النتيجة + الخطوة القادمة: جلسة/انتظار حكم/انتهت) ثم تقرير
// للموكّل واتساب و/أو SMS بقالب session_report، ثم وسم report_sent.
// الوضع report: إرسال/إعادة إرسال التقرير لجلسة مغلقة.

struct CloseTarget: Identifiable {
    let id: String              // session_id
    let caseId: String
    let sessionTitle: String?
    let caseTitle: String?
    let clientName: String?
    let clientPhone: String?
    let outcome: String?
    let nextAction: String?
    let rulingDate: String?
}

struct SessionCloseSheet: View {
    enum Mode { case close, report }

    let target: CloseTarget
    let mode: Mode
    let onDone: () -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss

    @State private var outcome = ""
    @State private var next = "none"
    @State private var nextDate = Date()
    @State private var withTime = false
    @State private var nextTime = Date()
    @State private var rulingDate = Date()
    @State private var confirmClose = false

    @State private var sendWa = false
    @State private var sendSms = false
    @State private var reportText = ""
    @State private var reportTouched = false
    @State private var tplWa = ""
    @State private var tplSms = ""
    @State private var phone = ""
    @State private var clientName: String?

    @State private var busy = false
    @State private var error: String?
    @State private var summary: String?

    private var hasPhone: Bool { normalizeSaudiPhone(phone) != nil }

    private var defaultReport: String {
        let tpl = sendWa ? (tplWa.isEmpty ? tplSms : tplWa) : tplSms
        return fillTemplate(tpl, [
            "client_name": clientName ?? "عميلنا",
            "case_title": target.caseTitle ?? "",
            "outcome": outcome.trimmingCharacters(in: .whitespacesAndNewlines),
        ])
    }
    private var reportValue: String { reportTouched ? reportText : defaultReport }

    private var canSave: Bool {
        if mode == .report { return hasPhone && (sendWa || sendSms) && !busy }
        let o = !outcome.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return o && (next != "case_closed" || confirmClose) && !busy
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(target.caseTitle ?? "ملف").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.navy)
                    if let t = target.sessionTitle, !t.isEmpty {
                        Text(t).font(.system(size: 13)).foregroundStyle(Theme.muted)
                    }
                }

                if mode == .close {
                    Section("ماذا حدث في الجلسة؟") {
                        TextEditor(text: $outcome)
                            .frame(minHeight: 110)
                            .font(.system(size: 15))
                    }

                    Section("الخطوة القادمة") {
                        Picker("الخطوة", selection: $next) {
                            Text("لا شيء الآن").tag("none")
                            Text("جلسة قادمة").tag("next_session")
                            Text("انتظار الحكم").tag("await_ruling")
                            Text("انتهت القضية").tag("case_closed")
                        }
                        .pickerStyle(.menu)

                        if next == "next_session" {
                            DatePicker("تاريخ الجلسة", selection: $nextDate, displayedComponents: .date)
                            Toggle("بوقت محدّد", isOn: $withTime)
                            if withTime {
                                DatePicker("الوقت", selection: $nextTime, displayedComponents: .hourAndMinute)
                            }
                            Text("تُنشأ الجلسة القادمة تلقائياً وتدخل التقويم").font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                        if next == "await_ruling" {
                            DatePicker("موعد استلام الحكم", selection: $rulingDate, displayedComponents: .date)
                            Text("يُشتق منه موعد الاعتراض بمهلته").font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                        if next == "case_closed" {
                            Toggle("أؤكد إغلاق القضية كلها", isOn: $confirmClose).tint(Theme.danger)
                        }
                    }
                }

                Section(mode == .close ? "إبلاغ الموكّل (اختياري)" : "إرسال التقرير") {
                    HStack {
                        Text("جوال الموكّل")
                        TextField("05xxxxxxxx", text: $phone)
                            .keyboardType(.phonePad)
                            .multilineTextAlignment(.leading)
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    Toggle(isOn: $sendWa) { Label("واتساب", systemImage: "message.fill") }.disabled(!hasPhone)
                    Toggle(isOn: $sendSms) { Label("رسالة نصية", systemImage: "paperplane.fill") }.disabled(!hasPhone)
                    if !hasPhone {
                        Text("لا جوال محفوظ للموكّل — أدخله لتفعيل الإرسال").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                    if sendWa || sendSms {
                        TextEditor(text: Binding(
                            get: { reportValue },
                            set: { reportTouched = true; reportText = $0 }
                        ))
                        .frame(minHeight: 130)
                        .font(.system(size: 14))
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(Theme.danger).font(.system(size: 13)) }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(mode == .close ? "تسجيل نتيجة الجلسة" : "تقرير الجلسة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task { await save() }
                    } label: {
                        if busy { ProgressView() } else { Text(mode == .close ? "حفظ" : "إرسال").fontWeight(.semibold) }
                    }
                    .disabled(!canSave)
                }
            }
            .alert("تم", isPresented: Binding(get: { summary != nil }, set: { if !$0 { summary = nil } })) {
                Button("حسناً") { summary = nil; onDone(); dismiss() }
            } message: { Text(summary ?? "") }
        }
        .task { await prepare() }
    }

    private func prepare() async {
        outcome = target.outcome ?? ""
        next = mode == .close ? "none" : (target.nextAction ?? "none")
        if let r = target.rulingDate, let d = Fmt.date(r) { rulingDate = d }
        phone = target.clientPhone ?? ""
        clientName = target.clientName
        if mode == .report { sendSms = true }
        let t = await sb.sessionReportTemplate()
        tplSms = t.sms; tplWa = t.whatsapp
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        var lines: [String] = []

        if mode == .close {
            do {
                let res = try await sb.closeSession(
                    sessionId: target.id,
                    outcome: outcome.trimmingCharacters(in: .whitespacesAndNewlines),
                    nextAction: next,
                    nextSessionDate: next == "next_session" ? Fmt.iso(nextDate) : nil,
                    nextSessionTime: next == "next_session" && withTime ? hhmm(nextTime) : nil,
                    rulingDueDate: next == "await_ruling" ? Fmt.iso(rulingDate) : nil
                )
                if let p = res.client_phone, !p.isEmpty, !hasPhone { phone = p }
                if let n = res.client_name, !n.isEmpty { clientName = n }
                lines.append("سُجّلت نتيجة الجلسة")
                if next == "next_session" { lines.append("أُنشئت الجلسة القادمة") }
                if next == "await_ruling" { lines.append("سُجّل موعد استلام الحكم") }
                if next == "case_closed" { lines.append("أُغلقت القضية") }
            } catch {
                self.error = error.localizedDescription
                return
            }
        }

        // التقرير — فشل قناة لا يُخفى: يُعرض بالاسم حتى لا يُظن أن الموكّل استلم
        var channels: [String] = []
        var failures: [String] = []
        if hasPhone {
            if sendWa {
                if let e = await sb.sendWhatsApp(phone: phone, message: reportValue, recipientName: clientName) {
                    failures.append("واتساب: \(e)")
                } else { channels.append("whatsapp") }
            }
            if sendSms {
                if let e = await sb.sendSms(phone: phone, message: reportValue, recipientName: clientName) {
                    failures.append("SMS: \(e)")
                } else { channels.append("sms") }
            }
            if !channels.isEmpty {
                try? await sb.markSessionReportSent(sessionId: target.id, via: channels.joined(separator: ","))
                lines.append("أُرسل التقرير عبر " + channels.map { $0 == "sms" ? "SMS" : "واتساب" }.joined(separator: " و"))
            }
        }

        if !failures.isEmpty {
            error = failures.joined(separator: "\n")
            if mode == .report { return }
        }
        summary = lines.isEmpty ? "لم يُرسل شيء" : lines.joined(separator: " · ")
        if mode == .close, !failures.isEmpty {
            summary! += "\n\nلكن: " + failures.joined(separator: "\n") + "\nيمكنك إعادة الإرسال من بطاقة الجلسة."
        }
    }

    private func hhmm(_ d: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}
