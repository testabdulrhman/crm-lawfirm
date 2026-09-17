import SwiftUI

// ذاكرة النقاشات على الجهاز (طلب المدير 2026-09-14: «ذاكرة مؤقتة في التطبيق للمناقشات لو 5 أو
// 10 ميقا عشان اقرا آخر شيء»). آخر نسخة محفوظة تظهر فوراً عند فتح القائمة أو النقاش أو الخيط —
// ولو بلا شبكة — ثم يحلّ محلها الجديد متى وصل.
//
// نص فقط، بسقف 10 م.ب يُحذف منه الأقدم استعمالاً عند تجاوزه. والسرية أولاً، ففيها أسرار موكّلين:
//  • مجلد لكل حساب داخل Caches (لا يُنسخ احتياطياً إلى iCloud)
//  • كل ملف بحماية iOS الكاملة — مشفّر لا يُقرأ ما دام الجوال مقفلاً
//  • يُمسح كله عند تسجيل الخروج

enum DiscussionCache {
    static let limitBytes = 10 * 1024 * 1024
    /// آخر الرسائل تكفي للقراءة — والسقف يمنع نقاشاً طويلاً واحداً من ابتلاع الذاكرة
    static let maxMessages = 300

    static let listKey = "list"
    static func streamKey(_ caseId: String?) -> String { "stream-\(caseId ?? "general")" }
    static func threadKey(_ rootId: String) -> String { "thread-\(rootId)" }

    private struct Stamped<T: Codable>: Codable {
        let savedAt: Date
        let value: T
    }

    /// الكتابة والتقليم والمسح على طابور متسلسل واحد — لا تتسابق عملية مع أخرى
    private static let queue = DispatchQueue(label: "sa.redwan.discussion-cache", qos: .utility)

    #if DEBUG
    /// لصفحات الفحص وحدها: حساب وهمي بلا دخول
    static var accountOverride: String?
    #endif

    /// الحساب الذي تُحفظ نقاشاته — بلا حساب لا حفظ ولا قراءة
    @MainActor
    static func account(_ sb: SB) -> String? {
        #if DEBUG
        if let accountOverride { return accountOverride }
        #endif
        return sb.session?.userId
    }

    private static var root: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("discussions", isDirectory: true)
    }

    /// المعرّفات ASCII أصلاً — وأي حرف آخر يُستبدل كي لا يصير جزءاً من مسار
    private static func safe(_ s: String) -> String {
        String(s.unicodeScalars.map {
            $0.isASCII && (CharacterSet.alphanumerics.contains($0) || $0 == "-") ? Character($0) : "_"
        })
    }

    private static func fileURL(_ key: String, account: String) -> URL {
        root.appendingPathComponent(safe(account), isDirectory: true)
            .appendingPathComponent(safe(key) + ".json")
    }

    static func load<T: Codable>(_ type: T.Type, key: String, account: String?) -> (value: T, savedAt: Date)? {
        guard let account else { return nil }
        let url = fileURL(key, account: account)
        guard let data = try? Data(contentsOf: url),
              let stamped = try? JSONDecoder().decode(Stamped<T>.self, from: data)
        else { return nil }
        // لمسة استعمال: ما قُرئ حديثاً آخر ما يُحذف
        queue.async {
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
        }
        return (stamped.value, stamped.savedAt)
    }

    static func save<T: Codable>(_ value: T, key: String, account: String?) {
        guard let account,
              let data = try? JSONEncoder().encode(Stamped(savedAt: Date(), value: value))
        else { return }
        let url = fileURL(key, account: account)
        queue.async {
            try? FileManager.default.createDirectory(
                at: url.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try? data.write(to: url, options: [.atomic, .completeFileProtection])
            trim()
        }
    }

    /// تسجيل الخروج: لا يبقى على الجهاز حرف من نقاشات الحساب
    static func clearAll() {
        queue.async { try? FileManager.default.removeItem(at: root) }
    }

    /// يُبقي المجموع تحت السقف بحذف الأقدم استعمالاً — يجري على طابور الكتابة
    private static func trim() {
        let fm = FileManager.default
        let keys: Set<URLResourceKey> = [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        guard let walker = fm.enumerator(at: root, includingPropertiesForKeys: Array(keys)) else { return }
        var files: [(url: URL, size: Int, used: Date)] = []
        var total = 0
        for case let url as URL in walker {
            guard let v = try? url.resourceValues(forKeys: keys), v.isRegularFile == true else { continue }
            let size = v.fileSize ?? 0
            total += size
            files.append((url, size, v.contentModificationDate ?? .distantPast))
        }
        guard total > limitBytes else { return }
        // قائمة النقاشات آخر ما يُمس — هي أول ما يُفتح
        for f in files.sorted(by: { $0.used < $1.used }) where f.url.lastPathComponent != "\(listKey).json" {
            try? fm.removeItem(at: f.url)
            total -= f.size
            if total <= limitBytes { break }
        }
    }

    #if DEBUG
    /// للفحص: انتظار انتهاء الكتابات المعلّقة، وحجم الذاكرة الحالي
    static func flush() { queue.sync {} }

    static func totalBytes() -> Int {
        queue.sync {
            let keys: Set<URLResourceKey> = [.fileSizeKey, .isRegularFileKey]
            guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: Array(keys))
            else { return 0 }
            var total = 0
            for case let url as URL in walker {
                if let v = try? url.resourceValues(forKeys: keys), v.isRegularFile == true {
                    total += v.fileSize ?? 0
                }
            }
            return total
        }
    }
    #endif

    /// «قبل 5 دقائق» بأرقام لاتينية كبقية التطبيق
    static func ago(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.locale = Locale(identifier: "ar_SA@numbers=latn")
        f.dateTimeStyle = .named
        f.unitsStyle = .full
        return f.localizedString(for: date, relativeTo: Date())
    }
}

/// شريط يظهر حين يتعذّر التحديث والمعروض نسخة محفوظة — المحتوى يبقى مقروءاً تحته
struct SavedCopyBanner: View {
    let savedAt: Date?
    let retry: () -> Void

    var body: some View {
        Button(action: retry) {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 12, weight: .semibold))
                Text(savedAt.map { "تعذّر التحديث — نسخة محفوظة \(DiscussionCache.ago($0))" }
                     ?? "تعذّر التحديث — تقرأ آخر نسخة وصلت")
                    .font(.system(size: 12))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Spacer(minLength: 6)
                Text("إعادة المحاولة")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(Theme.amber)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity)
            .background(Theme.goldPale)
            .overlay(Rectangle().frame(height: 0.5).foregroundStyle(Theme.line), alignment: .bottom)
        }
        .buttonStyle(.plain)
        .accessibilityHint("يعيد محاولة جلب الجديد")
    }
}
