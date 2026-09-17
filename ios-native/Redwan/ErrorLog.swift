import Foundation

// سجل الأخطاء من تطبيق الآيفون (طلب المدير 2026-09-15: «ليه إذا صار فيه خطأ ما يتسجل عندنا وانت
// تطلع على الأخطاء ونصلحها؟»). كل خطأ يُعرض لموظف عبر uiErrorText يُحفظ في error_logs نفسه الذي
// يقرؤه المدير في صفحة «سجل الأخطاء» على الويب — بنسخة التطبيق وموضع الخطأ في الكود.
//
// ثانوي: لا يرمي ولا يُظهر شيئاً، ولا يُسجَّل بلا دخول (القاعدة ترفض الزائر أصلاً)، والمتكرر من
// الموضع نفسه خلال دقيقة مرة واحدة، وبسقف للجلسة. والمحاكي والنسخ التجريبية لا تملأ سجل الإنتاج.

enum ErrorLog {
    private static let lock = NSLock()
    private static var recent: [String: Date] = [:]
    private static var sent = 0

    static func report(_ message: String, source: String) {
        #if DEBUG
        return
        #else
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let key = "\(source)|\(text)"
        lock.lock()
        let now = Date()
        let duplicate = recent[key].map { now.timeIntervalSince($0) < 60 } ?? false
        if !duplicate {
            recent[key] = now
            sent += 1
        }
        let overCap = sent > 80
        lock.unlock()
        guard !duplicate, !overCap else { return }

        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"

        Task { @MainActor in
            let sb = SB.shared
            guard let userId = sb.session?.userId else { return }
            try? await sb.insertVoid("error_logs", values: [
                "error_type": "ios",
                "message": String(text.prefix(2000)),
                "source": "iOS \(version) (\(build))",
                "user_id": userId,
                "user_name": sb.member?.short_name ?? sb.member?.name ?? NSNull(),
                "url": String(source.prefix(500)),
            ])
        }
        #endif
    }
}
