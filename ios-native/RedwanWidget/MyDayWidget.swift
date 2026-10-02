import SwiftUI
import WidgetKit

// أداة «يومي» (طلب المدير 2026-10-02: «ودي تطبيق ios يدعم أدوات كار بلاي»). تطبيق كار بلاي كامل يحتاج
// إذناً من أبل لفئات لا يدخلها نظام محاماة، أما الأدوات فتظهر في لوحة كار بلاي تلقائياً — وعلى الشاشة
// الرئيسية وشاشة القفل. تعرض الجلسة القادمة وكم بقي عليها، ومهام اليوم، من «جدولي» نفسه.

// MARK: - الألوان (رموز المكتب الرسمية)

private enum WTheme {
    static let navy = Color(red: 0x11 / 255, green: 0x1D / 255, blue: 0x3A / 255)
    static let navy2 = Color(red: 0x1E / 255, green: 0x2E / 255, blue: 0x55 / 255)
    static let gold = Color(red: 0xC9 / 255, green: 0xA9 / 255, blue: 0x82 / 255)
}

// MARK: - التواريخ (الرياض، والهجري بأم القرى)

private enum WDate {
    static let riyadh = TimeZone(identifier: "Asia/Riyadh")!
    static let ar = Locale(identifier: "ar_SA@numbers=latn")

    static func sessionDate(_ s: WSessionItem) -> Date? {
        guard let d = s.session_date?.prefix(10) else { return nil }
        let t = (s.session_time ?? "09:00").prefix(5)
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = riyadh
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(d) \(t)")
    }

    /// «2:30 م» كما يكتبها التطبيق (Theme.time) — والرقم معزول اتجاهاً فلا ينقلب ترتيبه مع «ص/م»
    static func time(_ d: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = riyadh
        let c = cal.dateComponents([.hour, .minute], from: d)
        let h24 = c.hour ?? 0
        var h = h24 % 12
        if h == 0 { h = 12 }
        return String(format: "\u{2066}%d:%02d\u{2069} %@", h, c.minute ?? 0, h24 < 12 ? "ص" : "م")
    }

    /// «اليوم» / «غداً» / «الأحد 12 جمادى الأولى»
    static func dayLabel(_ d: Date, now: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = riyadh
        if cal.isDate(d, inSameDayAs: now) { return "اليوم" }
        if let tmr = cal.date(byAdding: .day, value: 1, to: now), cal.isDate(d, inSameDayAs: tmr) { return "غداً" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA@calendar=islamic-umalqura;numbers=latn")
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.timeZone = riyadh
        f.dateFormat = "EEEE d MMMM"
        return f.string(from: d)
    }

    static func isToday(_ iso: String?, now: Date) -> Bool {
        guard let iso else { return false }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = riyadh
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = riyadh
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: now) == String(iso.prefix(10))
    }
}

// MARK: - المدخل

struct DayEntry: TimelineEntry {
    enum State { case ok, signedOut, failed }
    let date: Date
    let state: State
    let sessions: [WSessionItem]
    let tasks: [WTaskItem]
    let openTasks: Int
    let overdue: Int

    /// الجلسة القادمة نسبةً لوقت هذا المدخل — وتبقى «جارية» ساعة بعد بدئها
    var next: (WSessionItem, Date)? {
        sessions
            .compactMap { s in WDate.sessionDate(s).map { (s, $0) } }
            .filter { $0.1.addingTimeInterval(3600) > date }
            .sorted { $0.1 < $1.1 }
            .first
    }

    var todayTasks: [WTaskItem] {
        tasks.filter { ($0.overdue ?? false) || WDate.isToday($0.due_date, now: date) }
    }

    static let sample = DayEntry(
        date: .now, state: .ok,
        sessions: [WSessionItem(
            id: "s", case_id: nil, title: "جلسة مرئية عبر ناجز",
            session_date: ISO8601DateFormatter().string(from: .now.addingTimeInterval(7200)).prefix(10).description,
            session_time: nil, court: "المحكمة التجارية بالرياض", case_title: "شركة المثال ضد مؤسسة النموذج"
        )],
        tasks: [WTaskItem(id: "t", title: "تقديم مذكرة الرد", due_date: nil, overdue: true, case_title: nil)],
        openTasks: 3, overdue: 1
    )
}

// MARK: - المزوّد

struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { .sample }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        if context.isPreview { return completion(.sample) }
        Task { completion(await load(at: .now)) }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        Task {
            let first = await load(at: .now)
            var entries = [first]
            // مدخل عند بدء كل جلسة خلال ٢٤ ساعة وبعده بساعة — فتنتقل «القادمة» دون انتظار جلب جديد
            if first.state == .ok {
                let marks = first.sessions.compactMap { WDate.sessionDate($0) }
                    .flatMap { [$0, $0.addingTimeInterval(3601)] }
                    .filter { $0 > .now && $0 < .now.addingTimeInterval(86_400) }
                    .sorted()
                for m in marks {
                    entries.append(DayEntry(date: m, state: .ok, sessions: first.sessions, tasks: first.tasks,
                                            openTasks: first.openTasks, overdue: first.overdue))
                }
            }
            // جلب جديد كل نصف ساعة (النظام قد يؤخّره بحسب ميزانية الأدوات)
            completion(Timeline(entries: entries, policy: .after(.now.addingTimeInterval(1800))))
        }
    }

    private func load(at date: Date) async -> DayEntry {
        do {
            let ov = try await WidgetClient.fetchOverview()
            return DayEntry(date: date, state: .ok, sessions: ov.upcoming_sessions ?? [], tasks: ov.tasks ?? [],
                            openTasks: ov.stats?.open_tasks ?? 0, overdue: ov.stats?.overdue_tasks ?? 0)
        } catch WidgetFetchError.signedOut {
            return DayEntry(date: date, state: .signedOut, sessions: [], tasks: [], openTasks: 0, overdue: 0)
        } catch {
            return DayEntry(date: date, state: .failed, sessions: [], tasks: [], openTasks: 0, overdue: 0)
        }
    }
}

// MARK: - الواجهات

private struct NextSessionBlock: View {
    let entry: DayEntry
    var compact = false

    var body: some View {
        if let (s, d) = entry.next {
            VStack(alignment: .leading, spacing: 3) {
                Text("الجلسة القادمة")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(WTheme.gold)
                Text("\(WDate.dayLabel(d, now: entry.date)) · \(WDate.time(d))")
                    .font(.system(size: compact ? 14 : 15, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(s.case_title ?? s.title ?? "جلسة")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(compact ? 2 : 2)
                if let court = s.court, !court.isEmpty {
                    Text(court)
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.65))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if d > entry.date {
                    // عدّاد حيّ يتحدث وحده دون جلب
                    (Text("بعد ") + Text(d, style: .relative))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(WTheme.navy)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(WTheme.gold))
                        .lineLimit(1)
                } else {
                    Text("جارية الآن")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(WTheme.navy)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(WTheme.gold))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text("يومي")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(WTheme.gold)
                Text("لا جلسات قادمة")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                Spacer(minLength: 0)
                Text(entry.openTasks > 0 ? "\(entry.openTasks) مهام مفتوحة" : "يوم هادئ ✓")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.75))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }
}

private struct StateMessage: View {
    let state: DayEntry.State
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("يومي")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WTheme.gold)
            Text(state == .signedOut ? "سجّل الدخول في تطبيق رضوان" : "تعذّر التحديث — يُعاد لاحقاً")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.white)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct MyDayView: View {
    @Environment(\.widgetFamily) private var family
    let entry: DayEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                if let (_, d) = entry.next {
                    Text("⚖️ \(WDate.dayLabel(d, now: entry.date)) \(WDate.time(d))")
                } else {
                    Text("لا جلسات قادمة")
                }
            case .accessoryRectangular:
                if let (s, d) = entry.next {
                    VStack(alignment: .leading, spacing: 1) {
                        Text("⚖️ \(WDate.dayLabel(d, now: entry.date)) · \(WDate.time(d))")
                            .font(.system(size: 13, weight: .bold))
                        Text(s.case_title ?? s.title ?? "جلسة").font(.system(size: 12)).lineLimit(1)
                        if let c = s.court { Text(c).font(.system(size: 11)).lineLimit(1).opacity(0.8) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Text("لا جلسات قادمة").font(.system(size: 13, weight: .semibold))
                }
            case .systemMedium:
                if entry.state != .ok {
                    StateMessage(state: entry.state)
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        NextSessionBlock(entry: entry)
                        Rectangle().fill(.white.opacity(0.15)).frame(width: 1)
                        TodayList(entry: entry)
                    }
                }
            default:
                if entry.state != .ok { StateMessage(state: entry.state) } else { NextSessionBlock(entry: entry, compact: true) }
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .environment(\.locale, Locale(identifier: "ar_SA@numbers=latn"))
        .containerBackground(for: .widget) {
            LinearGradient(colors: [WTheme.navy2, WTheme.navy], startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

private struct TodayList: View {
    let entry: DayEntry
    var body: some View {
        let todays = entry.todayTasks.prefix(3)
        VStack(alignment: .leading, spacing: 4) {
            Text("مهام اليوم")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WTheme.gold)
            if todays.isEmpty {
                Text(entry.openTasks > 0 ? "لا شيء مستحق اليوم" : "لا مهام مفتوحة ✓")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.75))
            } else {
                ForEach(Array(todays), id: \.id) { t in
                    HStack(alignment: .top, spacing: 5) {
                        Circle()
                            .fill((t.overdue ?? false) ? Color.red.opacity(0.85) : WTheme.gold)
                            .frame(width: 5, height: 5)
                            .padding(.top, 5)
                        Text(t.title ?? "مهمة")
                            .font(.system(size: 12))
                            .foregroundStyle(.white.opacity(0.92))
                            .lineLimit(2)
                    }
                }
            }
            Spacer(minLength: 0)
            if entry.overdue > 0 {
                Text("\(entry.overdue) متأخرة")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.red.opacity(0.9))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// MARK: - الأداة

struct MyDayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyDay", provider: DayProvider()) { entry in
            MyDayView(entry: entry)
        }
        .configurationDisplayName("يومي")
        .description("جلستك القادمة وكم بقي عليها، ومهام اليوم — وتظهر في كار بلاي.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct RedwanWidgets: WidgetBundle {
    var body: some Widget {
        MyDayWidget()
    }
}
