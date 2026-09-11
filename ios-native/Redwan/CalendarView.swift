import SwiftUI

// تبويب «التقويم» — بنية تقويم كليو للجوال (طلب المستخدم 2026-08-20):
// شبكة شهر تنطوي إلى شريط أسبوع، وتحتها أجندة تسرد الأيام القادمة مجمّعةً،
// وورقة خيارات فيها صيغة العرض (أجندة/يوم) وطبقات الأنواع الأربعة.

private let gcal = Calendar(identifier: .gregorian)

private func firstOfMonth(_ d: Date) -> Date {
    gcal.date(from: gcal.dateComponents([.year, .month], from: d)) ?? d
}

/// ٤٢ خلية تبدأ من الأحد الذي عند/قبل أول الشهر (weekday: الأحد = 1)
private func gridDays(_ anchor: Date) -> [Date] {
    let first = firstOfMonth(anchor)
    let wd = gcal.component(.weekday, from: first)
    let start = gcal.date(byAdding: .day, value: -(wd - 1), to: first) ?? first
    return (0..<42).compactMap { gcal.date(byAdding: .day, value: $0, to: start) }
}

private func weekDays(containing d: Date) -> [Date] {
    let wd = gcal.component(.weekday, from: d)
    let start = gcal.date(byAdding: .day, value: -(wd - 1), to: d) ?? d
    return (0..<7).compactMap { gcal.date(byAdding: .day, value: $0, to: start) }
}

/// الشهر الميلادي يعبر شهرين هجريين غالباً — نعرض المدى لا أول الشهر وحده
private func hijriSpan(_ anchor: Date) -> String {
    let first = firstOfMonth(anchor)
    let last = gcal.date(byAdding: DateComponents(month: 1, day: -1), to: first) ?? first
    let a = Fmt.hijriMonthYear(first)
    let b = Fmt.hijriMonthYear(last)
    if a == b { return a }
    let ya = a.range(of: #"\d{3,4}"#, options: .regularExpression).map { String(a[$0]) }
    let yb = b.range(of: #"\d{3,4}"#, options: .regularExpression).map { String(b[$0]) }
    if let ya, let yb, ya == yb {
        let aName = a.replacingOccurrences(
            of: #"\s*\d{3,4} هـ$"#, with: "", options: .regularExpression
        )
        return "\(aName) – \(b)"
    }
    return "\(a) – \(b)"
}

private let agendaHeaderF: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ar_SA@numbers=latn")
    f.calendar = gcal
    f.dateFormat = "EEEE d MMMM"
    return f
}()

private func agendaHeader(_ iso: String) -> String {
    guard let d = Fmt.date(iso) else { return iso }
    let base = agendaHeaderF.string(from: d)
    return iso == Fmt.todayISO() ? "اليوم — \(base)" : base
}

private let WEEKDAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]

struct CalendarView: View {
    @EnvironmentObject private var sb: SB

    // تُحفظ بين الجلسات — المستخدم يضبطها مرة فتبقى
    @AppStorage("cal.format") private var format = "agenda"
    @AppStorage("cal.hiddenKinds") private var hiddenRaw = ""

    @State private var anchor = firstOfMonth(Date())
    @State private var selectedISO = Fmt.todayISO()
    @State private var collapsed = false
    @State private var items: [CalItem] = []
    @State private var loaded = false
    @State private var error: String?
    /// أُلغي الجلب السابق (اختفت الشاشة أثناءه) — يُعاد عند عودتها
    @State private var cancelled = false
    @State private var showOptions = false
    /// موعد جديد — من زرّ + أو بالضغط على ساعة فارغة في عرض اليوم
    @State private var newAppt: NewApptTarget?

    private var hidden: Set<CalKind> {
        Set(hiddenRaw.split(separator: ",").compactMap { CalKind(rawValue: String($0)) })
    }

    private var visible: [CalItem] { items.filter { !hidden.contains($0.kind) } }

    private var byDate: [String: [CalItem]] {
        Dictionary(grouping: visible, by: { $0.date })
    }

    private var cells: [Date] {
        collapsed
            ? weekDays(containing: Fmt.date(selectedISO) ?? Date())
            : gridDays(anchor)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ErrorBox(message: error) { Task { await load() } }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .padding(16)
                } else {
                    content
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("التقويم")
            .onAppear { Usage.shared.screen("التقويم") }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showOptions = true
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                            .foregroundStyle(Theme.navy)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        newAppt = NewApptTarget(dateISO: selectedISO, hour: nil)
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Theme.goldDark)
                    }
                    .accessibilityLabel("موعد جديد")
                }
                ToolbarItem(placement: .topBarLeading) {
                    Button("اليوم") {
                        withAnimation {
                            selectedISO = Fmt.todayISO()
                            anchor = firstOfMonth(Date())
                        }
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.goldDark)
                }
            }
            .sheet(isPresented: $showOptions) {
                CalendarOptionsSheet(
                    format: $format,
                    hiddenRaw: $hiddenRaw,
                    counts: Dictionary(grouping: items, by: { $0.kind })
                        .mapValues { $0.count }
                )
                .presentationDetents([.medium])
            }
            .sheet(item: $newAppt) { t in
                AppointmentSheet(defaultDateISO: t.dateISO, defaultHour: t.hour) { savedISO in
                    // انتقل إلى يوم الموعد — قد يكون المستخدم غيّر التاريخ داخل النموذج
                    selectedISO = savedISO
                    anchor = firstOfMonth(Fmt.date(savedISO) ?? Date())
                    Task { await load() }
                }
            }
        }
        .task(id: Fmt.iso(anchor)) { await load() }
        .retryIfCancelled($cancelled) { await load() }
    }

    // MARK: - المحتوى

    private var content: some View {
        ScrollView {
            VStack(spacing: 0) {
                monthBar
                grid
                collapseHandle

                if !loaded {
                    ProgressView().padding(.vertical, 40)
                } else if format == "day" {
                    dayView
                } else {
                    agendaView
                }
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 24)
        }
        .refreshable { await load() }
    }

    private var monthBar: some View {
        HStack {
            // في RTL: «السابق» جهة اليمين
            Button { shift(-1) } label: {
                Image(systemName: "chevron.forward")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 38, height: 38)
            }
            Spacer()
            VStack(spacing: 1) {
                Text(hijriSpan(anchor))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Theme.navy)
                Text(Fmt.gregMonthYear(anchor))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            Button { shift(1) } label: {
                Image(systemName: "chevron.backward")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 38, height: 38)
            }
        }
        .padding(.top, 4)
    }

    private var grid: some View {
        VStack(spacing: 4) {
            HStack(spacing: 0) {
                ForEach(WEEKDAY_NAMES, id: \.self) { n in
                    Text(n)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity)
                }
            }
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7),
                spacing: 2
            ) {
                ForEach(cells, id: \.self) { d in
                    dayCell(d)
                }
            }
        }
        .padding(10)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1))
    }

    private func dayCell(_ d: Date) -> some View {
        let iso = Fmt.iso(d)
        let isToday = iso == Fmt.todayISO()
        let isSelected = iso == selectedISO
        let outside = !collapsed && gcal.component(.month, from: d) != gcal.component(.month, from: anchor)
        let dayItems = byDate[iso] ?? []

        return Button {
            withAnimation(.easeOut(duration: 0.15)) { selectedISO = iso }
        } label: {
            VStack(spacing: 2) {
                Text("\(gcal.component(.day, from: d))")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(isToday ? Theme.navy : Theme.navy.opacity(outside ? 0.35 : 1))
                    .frame(width: 26, height: 26)
                    .background(isToday ? Theme.gold : .clear)
                    .clipShape(Circle())
                Text(Fmt.hijriDay(d))
                    .font(.system(size: 8))
                    .foregroundStyle(Theme.muted.opacity(outside ? 0.4 : 0.8))
                // نقاط الأنواع — حتى ثلاث، كما في تقويم كليو للجوال
                HStack(spacing: 2) {
                    ForEach(Array(dayItems.prefix(3).enumerated()), id: \.offset) { _, it in
                        KindDot(kind: it.kind)
                    }
                }
                .frame(height: 6)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 3)
            .background(isSelected ? Theme.goldPale : .clear)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(isSelected ? Theme.gold : .clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    /// مقبض الطيّ — الشبكة الكاملة ↔ شريط الأسبوع (نمط كليو)
    private var collapseHandle: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) { collapsed.toggle() }
        } label: {
            Image(systemName: collapsed ? "chevron.compact.down" : "chevron.compact.up")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }

    private func shift(_ delta: Int) {
        withAnimation {
            if collapsed {
                // في شريط الأسبوع: التنقّل أسبوعاً لا شهراً
                if let d = Fmt.date(selectedISO),
                   let n = gcal.date(byAdding: .day, value: delta * 7, to: d) {
                    selectedISO = Fmt.iso(n)
                    anchor = firstOfMonth(n)
                }
            } else if let n = gcal.date(byAdding: .month, value: delta, to: anchor) {
                anchor = n
            }
        }
    }

    // MARK: - الأجندة (الصيغة الافتراضية)

    /// أيام لها بنود من اليوم المختار حتى آخر النطاق المجلوب
    private var agendaDates: [String] {
        byDate.keys.filter { $0 >= selectedISO }.sorted()
    }

    private var agendaView: some View {
        VStack(spacing: 12) {
            if agendaDates.isEmpty {
                EmptyBox(
                    icon: "calendar",
                    text: "لا شيء من هذا اليوم فصاعداً",
                    subtext: "جرّب شهراً آخر أو عدّل الطبقات من الخيارات"
                )
                .padding(.top, 12)
            } else {
                ForEach(agendaDates, id: \.self) { iso in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(agendaHeader(iso))
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(iso == Fmt.todayISO() ? Theme.goldDark : Theme.navy)
                            .padding(.horizontal, 4)

                        VStack(spacing: 0) {
                            let dayItems = byDate[iso] ?? []
                            ForEach(Array(dayItems.enumerated()), id: \.element.id) { idx, it in
                                agendaRow(it)
                                if idx < dayItems.count - 1 {
                                    Divider().overlay(Theme.line).padding(.leading, 52)
                                }
                            }
                        }
                        .background(Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
                    }
                }
            }
        }
        .padding(.top, 10)
    }

    @ViewBuilder
    private func agendaRow(_ it: CalItem) -> some View {
        if it.kind == .session, let cid = it.caseId {
            NavigationLink {
                CaseDetailView(caseId: cid, initialTab: .sessions)
            } label: {
                agendaRowBody(it)
            }
            .buttonStyle(.plain)
        } else {
            agendaRowBody(it)
        }
    }

    private func agendaRowBody(_ it: CalItem) -> some View {
        HStack(spacing: 10) {
            Image(systemName: kindIcon(it.kind))
                .font(.system(size: 14))
                .foregroundStyle(kindColor(it.kind))
                .frame(width: 34, height: 34)
                .background(kindColor(it.kind).opacity(0.12))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text(it.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(1)
                Text(subtitleLine(it))
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }

    private func subtitleLine(_ it: CalItem) -> String {
        var parts: [String] = [it.kind.label]
        if let t = it.time { parts.append(Fmt.time(t)) }
        if let s = it.subtitle { parts.append(s) }
        return parts.joined(separator: " · ")
    }

    // MARK: - عرض اليوم بالساعات

    private var dayView: some View {
        let dayItems = byDate[selectedISO] ?? []
        let allDay = dayItems.filter { $0.time == nil }
        let timed = dayItems.filter { $0.time != nil }
        let hourH: CGFloat = 56

        return VStack(alignment: .leading, spacing: 10) {
            Text(agendaHeader(selectedISO))
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.navy)
                .padding(.horizontal, 4)

            if !allDay.isEmpty {
                VStack(spacing: 4) {
                    ForEach(allDay) { it in
                        HStack(spacing: 8) {
                            KindDot(kind: it.kind)
                            Text(it.title)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(kindColor(it.kind))
                                .lineLimit(1)
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(kindColor(it.kind).opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }

            ZStack(alignment: .topLeading) {
                // شبكة الساعات
                VStack(spacing: 0) {
                    ForEach(0..<24, id: \.self) { h in
                        HStack(alignment: .top, spacing: 8) {
                            Text(Fmt.time(String(format: "%02d:00", h)))
                                .font(.system(size: 10))
                                .foregroundStyle(Theme.muted)
                                .frame(width: 52, alignment: .center)
                            Rectangle()
                                .fill(Theme.line)
                                .frame(height: 1)
                                .padding(.top, 6)
                        }
                        .frame(height: hourH, alignment: .top)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            newAppt = NewApptTarget(dateISO: selectedISO, hour: h)
                        }
                    }
                }

                // الأحداث في مواضعها الزمنية
                ForEach(timed) { it in
                    if let m = minutesOf(it.time) {
                        HStack(spacing: 6) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(kindColor(it.kind))
                                .frame(width: 3)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(it.title)
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(Theme.navy)
                                    .lineLimit(1)
                                Text(subtitleLine(it))
                                    .font(.system(size: 10))
                                    .foregroundStyle(Theme.muted)
                                    .lineLimit(1)
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(6)
                        .background(kindColor(it.kind).opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .padding(.leading, 62)
                        .offset(y: CGFloat(m) / 60 * hourH + 4)
                    }
                }

                // خط الآن الأحمر — يوم اليوم فقط (نمط كليو)
                if selectedISO == Fmt.todayISO() {
                    let now = gcal.dateComponents([.hour, .minute], from: Date())
                    let mins = (now.hour ?? 0) * 60 + (now.minute ?? 0)
                    HStack(spacing: 0) {
                        Circle().fill(Theme.danger).frame(width: 7, height: 7)
                        Rectangle().fill(Theme.danger).frame(height: 1.5)
                    }
                    .padding(.leading, 56)
                    .offset(y: CGFloat(mins) / 60 * hourH + 6)
                }
            }
            .padding(.vertical, 6)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
        }
        .padding(.top, 10)
    }

    private func minutesOf(_ t: String?) -> Int? {
        guard let t else { return nil }
        let p = t.split(separator: ":").compactMap { Int($0) }
        guard p.count >= 2 else { return nil }
        return p[0] * 60 + p[1]
    }

    // MARK: - الجلب

    private func load() async {
        error = nil
        do {
            let range = gridDays(anchor)
            guard let first = range.first, let last = range.last else { return }
            items = try await sb.calendar(fromISO: Fmt.iso(first), toISO: Fmt.iso(last))
            loaded = true
        } catch {
            // الإلغاء ليس خطأً — تُعاد المحاولة صامتاً عند عودة الشاشة
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}

// MARK: - ورقة الخيارات — صيغة العرض + الطبقات (نمط Calendar options في كليو)

private struct CalendarOptionsSheet: View {
    @Binding var format: String
    @Binding var hiddenRaw: String
    let counts: [CalKind: Int]
    @Environment(\.dismiss) private var dismiss

    private var hidden: Set<CalKind> {
        Set(hiddenRaw.split(separator: ",").compactMap { CalKind(rawValue: String($0)) })
    }

    private func toggle(_ k: CalKind) {
        var h = hidden
        if h.contains(k) { h.remove(k) } else { h.insert(k) }
        hiddenRaw = h.map(\.rawValue).sorted().joined(separator: ",")
    }

    var body: some View {
        NavigationStack {
            List {
                Section("صيغة العرض") {
                    Picker("الصيغة", selection: $format) {
                        Text("أجندة").tag("agenda")
                        Text("يوم").tag("day")
                    }
                    .pickerStyle(.segmented)
                }

                Section("الطبقات") {
                    ForEach(CalKind.allCases, id: \.self) { k in
                        Button { toggle(k) } label: {
                            HStack(spacing: 10) {
                                Image(systemName: hidden.contains(k) ? "square" : "checkmark.square.fill")
                                    .foregroundStyle(hidden.contains(k) ? Theme.muted : Theme.goldDark)
                                KindDot(kind: k)
                                Text(k.label)
                                    .foregroundStyle(Theme.navy)
                                Spacer()
                                Text("\(counts[k] ?? 0)")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                    }
                }

                Button("إعادة الضبط") {
                    format = "agenda"
                    hiddenRaw = ""
                }
                .foregroundStyle(Theme.goldDark)
            }
            .navigationTitle("خيارات التقويم")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("تم") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}

/// وجهة إنشاء الموعد: التاريخ المختار وساعة اختيارية من عرض اليوم
struct NewApptTarget: Identifiable {
    let dateISO: String
    let hour: Int?
    var id: String { "\(dateISO)-\(hour ?? -1)" }
}
