import SwiftUI

// ألوان الهوية — نفس قيم tailwind.config.js في نظام الويب حرفياً
enum Theme {
    static let navy     = Color(hex: 0x111D3A)
    static let navyDeep = Color(hex: 0x0C162C)
    static let navySoft = Color(hex: 0x2A3C63)
    static let gold     = Color(hex: 0xC9A84C)
    static let goldDark = Color(hex: 0x8C7129)
    static let goldPale = Color(hex: 0xFAF6EA)
    static let ivory    = Color(hex: 0xF8F6F2)   // خلفية الصفحات
    static let card     = Color.white
    static let line     = Color(hex: 0xE7E2D6)
    static let muted    = Color(hex: 0x5F6B84)
    static let danger   = Color(hex: 0xC2410C)
    static let success  = Color(hex: 0x0F766E)
    static let blue     = Color(hex: 0x1D4ED8)
    static let amber    = Color(hex: 0xB45309)
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

/// تنسيق التواريخ — القاعدة نفسها المطبّقة في الويب:
/// أسماء عربية وأرقام **لاتينية** (قرار المستخدم الثابت)، والهجري أم القرى للعرض فقط.
enum Fmt {
    // locale بأرقام لاتينية — «ar» وحدها تعطي أرقاماً هندية
    private static let arLatn = Locale(identifier: "ar_SA@numbers=latn")
    private static let hijriLocale = Locale(identifier: "ar_SA@calendar=islamic-umalqura;numbers=latn")

    private static let greg: DateFormatter = {
        let f = DateFormatter()
        f.locale = arLatn
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "d MMMM yyyy"
        return f
    }()

    private static let hijri: DateFormatter = {
        let f = DateFormatter()
        f.locale = hijriLocale
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.dateFormat = "d MMMM yyyy"
        return f
    }()

    private static let hijriDayF: DateFormatter = {
        let f = DateFormatter()
        f.locale = hijriLocale
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.dateFormat = "d"
        return f
    }()

    private static let hijriMonthF: DateFormatter = {
        let f = DateFormatter()
        f.locale = hijriLocale
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.dateFormat = "MMMM yyyy"
        return f
    }()

    private static let gregMonthF: DateFormatter = {
        let f = DateFormatter()
        f.locale = arLatn
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "MMMM yyyy"
        return f
    }()

    /// YYYY-MM-DD → Date بمكوّنات محلية (لا toISOString ولا انزياح مناطق —
    /// نفس درس todayISO في الويب: الرياض +03 وUTC يرجع تاريخ الأمس فجراً)
    static func date(_ iso: String?) -> Date? {
        guard let iso, iso.count >= 10 else { return nil }
        let p = iso.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        var c = DateComponents()
        c.year = p[0]; c.month = p[1]; c.day = p[2]; c.hour = 12
        return Calendar(identifier: .gregorian).date(from: c)
    }

    static func iso(_ d: Date) -> String {
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    static func todayISO() -> String { iso(Date()) }

    static func gregLong(_ isoStr: String?) -> String {
        guard let d = date(isoStr) else { return "—" }
        return greg.string(from: d)
    }

    static func hijriLong(_ isoStr: String?) -> String {
        guard let d = date(isoStr) else { return "—" }
        return hijri.string(from: d).replacingOccurrences(of: " هـ", with: "") + " هـ"
    }

    static func hijriDay(_ d: Date) -> String { hijriDayF.string(from: d) }

    static func hijriMonthYear(_ d: Date) -> String {
        hijriMonthF.string(from: d).replacingOccurrences(of: " هـ", with: "") + " هـ"
    }

    static func gregMonthYear(_ d: Date) -> String { gregMonthF.string(from: d) }

    /// "14:30:00" → "2:30 م"
    static func time(_ t: String?) -> String {
        guard let t, t.count >= 5 else { return "" }
        let parts = t.prefix(5).split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return String(t.prefix(5)) }
        let h24 = parts[0], m = parts[1]
        let suffix = h24 < 12 ? "ص" : "م"
        var h = h24 % 12
        if h == 0 { h = 12 }
        return String(format: "%d:%02d %@", h, m, suffix)
    }

    /// المسافة من اليوم: «اليوم» · «غداً» · «بعد ن يوم» · «متأخرة ن يوم»
    static func relDays(_ isoStr: String?) -> (text: String, overdue: Bool)? {
        guard let d = date(isoStr), let today = date(todayISO()) else { return nil }
        let days = Calendar(identifier: .gregorian).dateComponents([.day], from: today, to: d).day ?? 0
        if days == 0 { return ("اليوم", false) }
        if days == 1 { return ("غداً", false) }
        if days > 0 { return ("بعد \(days) يوم", false) }
        return ("متأخرة \(-days) يوم", true)
    }
}
