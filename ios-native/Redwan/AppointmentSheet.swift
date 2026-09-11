import SwiftUI

// إنشاء موعد من الجوال (طلب المدير 2026-09-11: «ابي في التطبيق أقدر اعمل موعد»).
//
// قراران منه: (١) رسالة التأكيد التلقائية تنطلق كما في الويب — يرسلها ترقر في
// القاعدة فور الإدراج متى كان للموكّل جوال؛ (٢) منتقي جهات الاتصال يُبنى.
//
// ⚠️ المكتب **تقويم واحد**: قيد استبعاد في القاعدة يرفض تداخل موعدين غير
//    ملغيين. نفحص التعارض قبل الإرسال ونسمّي الموعد المتعارض، فلا يرى
//    المستخدم رسالة إنجليزية غامضة.
// ⚠️ المدة شرائح لا حقل رقم: لوحة المفاتيح الرقمية لا تُظهر ما يُكتب في تطبيق
//    عربي الاتجاه (علّة نظام — درس شاشة الدخول).

struct AppointmentSheet: View {
    /// اليوم المختار في التقويم، وساعة اختيارية من عرض اليوم
    var defaultDateISO: String
    var defaultHour: Int? = nil
    /// يُمرَّر تاريخ الموعد المحفوظ — التقويم ينتقل إليه حتى لو غُيّر الشهر داخل النموذج
    var onSaved: (String) -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss

    @State private var contact: ContactLite?
    @State private var clientName = ""
    @State private var clientPhone = ""
    @State private var date = Date()
    @State private var time = Date()
    @State private var duration = 60
    @State private var onsite = true
    @State private var notes = ""

    @State private var showContacts = false
    @State private var dayAppts: [ApptLite] = []
    @State private var loadedDay = ""
    /// ⚠️ تعذّر جلب مواعيد اليوم: لا نقل «شاغرة» ونحن لا نعرف — القاعدة تفصل عند الحفظ
    @State private var dayLoadFailed = false
    @State private var busy = false
    @State private var alertText: String?

    private let durations = [30, 45, 60, 90]

    private var canSave: Bool {
        !clientName.trimmingCharacters(in: .whitespaces).isEmpty && conflict == nil && !busy
    }

    /// الموعد المتعارض إن وُجد — نفس منطق الويب: تداخل الفترتين
    private var conflict: ApptLite? {
        let start = minutes(of: time)
        let end = start + duration
        return dayAppts.first { a in
            guard let t = a.appointment_time else { return false }
            let s = minutesFromHHMM(t)
            let e = s + (a.duration_minutes ?? 60)
            return start < e && s < end
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("الموكّل") {
                    Button { showContacts = true } label: {
                        HStack {
                            Image(systemName: "person.crop.circle.badge.plus")
                                .foregroundStyle(Theme.goldDark)
                            Text(contact == nil ? "اختر من جهات الاتصال" : (contact?.name ?? "—"))
                                .foregroundStyle(contact == nil ? Theme.muted : Theme.navy)
                            Spacer()
                            if contact != nil {
                                Button { clearContact() } label: {
                                    Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.muted)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    TextField("الاسم", text: $clientName)
                    TextField("الجوال", text: $clientPhone)
                        .keyboardType(.phonePad)
                        .environment(\.layoutDirection, .leftToRight)
                        .multilineTextAlignment(.trailing)
                }

                Section("الموعد") {
                    DatePicker("التاريخ", selection: $date, displayedComponents: .date)
                        .environment(\.calendar, Calendar(identifier: .gregorian))
                    Text(Fmt.hijriLong(Fmt.iso(date)))
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    DatePicker("الوقت", selection: $time, displayedComponents: .hourAndMinute)
                        .environment(\.calendar, Calendar(identifier: .gregorian))

                    VStack(alignment: .leading, spacing: 6) {
                        Text("المدة").font(.system(size: 13)).foregroundStyle(Theme.muted)
                        HStack(spacing: 8) {
                            ForEach(durations, id: \.self) { d in
                                let on = duration == d
                                Button { duration = d } label: {
                                    Text("\(d) د")
                                        .font(.system(size: 13, weight: on ? .semibold : .regular))
                                        .padding(.horizontal, 12).padding(.vertical, 6)
                                        .background(on ? Theme.navy : Theme.card)
                                        .foregroundStyle(on ? .white : Theme.navy)
                                        .overlay(Capsule().stroke(on ? Color.clear : Theme.line, lineWidth: 1))
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    Picker("اللقاء", selection: $onsite) {
                        Text("حضوري").tag(true)
                        Text("عن بُعد").tag(false)
                    }
                    .pickerStyle(.segmented)
                }

                if let c = conflict {
                    Section {
                        Label(
                            "هذا الوقت محجوز — يتعارض مع موعد \(c.client_name ?? "آخر") الساعة \(c.appointment_time?.prefix(5) ?? "")",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .font(.system(size: 13)).foregroundStyle(Theme.danger)
                    }
                } else if dayLoadFailed {
                    Section {
                        Label("تعذّر فحص المواعيد — يفحصها الخادم عند الحفظ",
                              systemImage: "wifi.exclamationmark")
                            .font(.system(size: 13)).foregroundStyle(Theme.muted)
                    }
                } else if loadedDay == Fmt.iso(date) {
                    Section {
                        Label("الفترة شاغرة", systemImage: "checkmark.circle.fill")
                            .font(.system(size: 13)).foregroundStyle(Theme.success)
                    }
                }

                Section("ملاحظات") {
                    TextField("اختياري", text: $notes, axis: .vertical).lineLimit(2...5)
                }

                if sb.member?.is_reviewer != true,
                   !clientPhone.trimmingCharacters(in: .whitespaces).isEmpty {
                    Section {
                        // الرقم الناقص لا يوقف الحفظ، لكن السكوت عنه يوهم أن
                        // الموكّل أُبلغ وهو لم يُبلَّغ
                        if normalizeSaudiPhone(clientPhone) == nil {
                            Label("الجوال غير مكتمل — لن تصل رسالة التأكيد", systemImage: "exclamationmark.circle")
                                .font(.system(size: 12)).foregroundStyle(Theme.danger)
                        } else {
                            Label("تصل الموكّل رسالة تأكيد بالموعد فور الحفظ", systemImage: "message.fill")
                                .font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .navigationTitle("موعد جديد")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView().tint(Theme.goldDark) }
                    else {
                        Button("حفظ") { Task { await save() } }
                            .fontWeight(.semibold).disabled(!canSave)
                    }
                }
            }
            .sheet(isPresented: $showContacts) {
                ContactPickerSheet { c in
                    showContacts = false
                    contact = c
                    clientName = c.name ?? ""
                    clientPhone = c.phone ?? ""
                }
            }
            .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
                Button("حسناً", role: .cancel) { alertText = nil }
            } message: { Text(alertText ?? "") }
            .task {
                date = Fmt.date(defaultDateISO) ?? Date()
                time = defaultTime()
                await loadDay()
            }
            .onChange(of: Fmt.iso(date)) { Task { await loadDay() } }
        }
    }

    private func clearContact() {
        contact = nil   // الاسم والجوال يبقيان — قد يكونا صُحّحا يدوياً
    }

    /// ساعة الضغط في عرض اليوم، وإلا نصف الساعة القادمة لليوم نفسه، وإلا ١٠ صباحاً
    private func defaultTime() -> Date {
        let cal = Calendar(identifier: .gregorian)
        if let h = defaultHour {
            return cal.date(bySettingHour: h, minute: 0, second: 0, of: Date()) ?? Date()
        }
        if defaultDateISO == Fmt.todayISO() {
            let m = cal.component(.minute, from: Date())
            return cal.date(byAdding: .minute, value: m < 30 ? (30 - m) : (60 - m), to: Date()) ?? Date()
        }
        return cal.date(bySettingHour: 10, minute: 0, second: 0, of: Date()) ?? Date()
    }

    private func loadDay() async {
        let iso = Fmt.iso(date)
        guard loadedDay != iso else { return }
        do {
            dayAppts = try await sb.appointmentsOn(dateISO: iso)
            loadedDay = iso
            dayLoadFailed = false
        } catch {
            dayAppts = []
            dayLoadFailed = true
        }
    }

    private func save() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }

        // حساب مراجعة أبل: الاسم يُوسم «تجريبي» (وإلا اختفى الصف عنه فور حفظه
        // بسبب فلتر RLS)، والجوال يُسقَط فلا تنطلق رسالة لرقم حقيقي
        let reviewer = sb.member?.is_reviewer == true
        var name = clientName.trimmingCharacters(in: .whitespaces)
        if reviewer && !name.contains("تجريبي") { name += " (تجريبي)" }

        let ref = try? await sb.nextBookingReference()
        var values: [String: Any] = [
            "client_name": name,
            "appointment_date": Fmt.iso(date),
            "appointment_time": hhmm(time),
            "duration_minutes": duration,
            "status": "confirmed",
            "meeting_method": onsite ? "onsite" : "remote",
            "created_by": sb.member?.name ?? sb.member?.short_name ?? "التطبيق",
        ]
        let phone = reviewer ? "" : clientPhone.trimmingCharacters(in: .whitespaces)
        if !phone.isEmpty { values["client_phone"] = phone }
        if let cid = contact?.id { values["client_id"] = cid }
        let n = notes.trimmingCharacters(in: .whitespaces)
        if !n.isEmpty { values["notes"] = n }
        if let ref, !ref.isEmpty { values["reference_no"] = ref }

        do {
            let id = try await sb.createAppointment(values)
            // تقويم قوقل — غير قاتل: الموعد محفوظ ولو فشلت المزامنة
            if let id, !reviewer {
                let (code, json) = await sb.callFunctionAuthed("calendar-sync", body: [
                    "action": "add-appointment",
                    "appointment": [
                        "appointment_date": Fmt.iso(date),
                        "appointment_time": hhmm(time),
                        "duration_minutes": duration,
                        "client_name": name,
                        "client_phone": phone,
                        "notes": n,
                    ],
                ])
                if code == 200, let ev = json["eventId"] as? String, !ev.isEmpty {
                    try? await sb.setAppointmentGcalId(id, eventId: ev)
                }
            }
            onSaved(Fmt.iso(date))
            dismiss()
        } catch let e as SBError {
            alertText = friendly(e.message)
        } catch {
            alertText = "تعذّر حفظ الموعد — تحقق من الاتصال"
        }
    }

    /// أخطاء القاعدة بلغة المستخدم — القيد يرفض التداخل حتى لو تغيّر شيء بيننا
    private func friendly(_ m: String) -> String {
        if m.contains("appointments_no_overlap") || m.contains("23P01") {
            return "حُجز هذا الوقت للتوّ من مكان آخر — اختر وقتاً غيره"
        }
        if m.contains("reference_no") { return "تكرّر الرقم المرجعي — أعد المحاولة" }
        return m
    }

    private func minutes(of d: Date) -> Int {
        let c = Calendar(identifier: .gregorian).dateComponents([.hour, .minute], from: d)
        return (c.hour ?? 0) * 60 + (c.minute ?? 0)
    }
    private func minutesFromHHMM(_ s: String) -> Int {
        let p = s.split(separator: ":")
        return (Int(p.first ?? "0") ?? 0) * 60 + (p.count > 1 ? Int(p[1]) ?? 0 : 0)
    }
    private func hhmm(_ d: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.hour, .minute], from: d)
        return String(format: "%02d:%02d", c.hour ?? 0, c.minute ?? 0)
    }
}

// MARK: - منتقي جهة الاتصال

struct ContactPickerSheet: View {
    let onPick: (ContactLite) -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var all: [ContactLite] = []
    @State private var loaded = false
    @State private var loadError: String?
    @State private var search = ""

    private var results: [ContactLite] {
        let q = search.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return Array(all.prefix(50)) }
        return all.filter {
            ($0.name ?? "").arContains(q) || ($0.phone ?? "").contains(q)
        }
        .prefix(50).map { $0 }
    }

    var body: some View {
        NavigationStack {
            List(results, id: \.id) { c in
                Button { onPick(c) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(c.name ?? "—")
                            .font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.navy)
                        if let p = c.phone, !p.isEmpty {
                            Text(p).font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                                .environment(\.layoutDirection, .leftToRight)
                        }
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
                } else if results.isEmpty {
                    EmptyBox(
                        icon: search.isEmpty ? "person.2" : "magnifyingglass",
                        text: search.isEmpty ? "لا جهات اتصال" : "لا جهة بهذا الاسم",
                        subtext: search.isEmpty ? nil : "اكتب الاسم يدوياً في النموذج"
                    )
                }
            }
            .searchable(text: $search, prompt: "ابحث بالاسم أو الجوال")
            .navigationTitle("اختر الموكّل")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } } }
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
    }

    private func load() async {
        loadError = nil
        do { all = try await sb.contacts(); loaded = true }
        catch { loadError = error.localizedDescription }
    }
}
