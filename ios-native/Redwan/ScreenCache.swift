import Foundation

// نسخة محفوظة لكل تبويب — الشاشة تفتح فوراً بآخر ما عُرض، ثم تتحدث بهدوء في الخلفية
// (طلب المدير 2026-09-19: «يكون التطبيق سريع جداً وسلس»). نفس مخزن النقاشات المحفوظة:
// مشفّر، ولكل حساب، ويُمسح كاملاً مع تسجيل الخروج.
@MainActor
enum ScreenCache {
    static func homeKey(_ scope: String) -> String { "screen-home-\(scope)" }
    static func tasksKey(mine: Bool) -> String { "screen-tasks-\(mine ? "mine" : "all")" }
    static let casesKey = "screen-cases"
    static func calendarKey(from: String) -> String { "screen-calendar-\(from)" }

    static func load<T: Codable>(_ type: T.Type, _ key: String, _ sb: SB) -> T? {
        DiscussionCache.load(type, key: key, account: DiscussionCache.account(sb))?.value
    }

    static func save<T: Codable>(_ value: T, _ key: String, _ sb: SB) {
        DiscussionCache.save(value, key: key, account: DiscussionCache.account(sb))
    }
}

/// ما تعرضه الرئيسية — يُحفظ كاملاً فتُفتح بلا دائرة تحميل
struct HomeSnapshot: Codable {
    var overview: DashboardOverview
    var doneToday: Int
    var needClosure: [SessionNeedingClosure]
    var unread: Int
    var pendingHr: Int
}

/// عند فتح التطبيق: بيانات التبويبات الأخرى تُجلب بالتوازي إلى النسخة المحفوظة،
/// فيجدها الموظف جاهزة حين ينتقل إليها. ثانوية كلها — فشلها لا يظهر لأحد.
@MainActor
enum Prefetch {
    static func warm(_ sb: SB) async {
        if sb.member == nil { await sb.loadMember() }
        async let tasks: Void = warmTasks(sb)
        async let cases: Void = warmCases(sb)
        async let discussions: Void = warmDiscussions(sb)
        _ = await (tasks, cases, discussions)
    }

    private static func warmTasks(_ sb: SB) async {
        // «مهامي» تُصفّى بمعرّف الموظف — قبل تحميله تعود مهام المكتب كلها فلا تُحفظ باسمه
        guard sb.member != nil else { return }
        if let rows = try? await sb.openTasks(mineOnly: true) {
            ScreenCache.save(rows, ScreenCache.tasksKey(mine: true), sb)
        }
    }

    private static func warmCases(_ sb: SB) async {
        if let rows = try? await sb.cases() { ScreenCache.save(rows, ScreenCache.casesKey, sb) }
    }

    private static func warmDiscussions(_ sb: SB) async {
        if let rows = try? await sb.discussions() {
            DiscussionCache.save(rows, key: DiscussionCache.listKey, account: DiscussionCache.account(sb))
        }
    }
}
