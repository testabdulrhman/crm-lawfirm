import Foundation
import UIKit

// تتبع استخدام التطبيق الأصيل (طلب المستخدم 2026-08-22: «analytics كامل
// للتطبيق ولموقع الويب») — نفس جداول الويب ودلالاته حرفياً:
// usage_sessions (جلسة لكل فتح بدقائق نشطة) + usage_daily (فتحات الشاشات
// وثواني المكوث وأهم الأفعال) بعمود platform='ios'. التجميع في الذاكرة
// والدفع كل دقيقتين وعند الخلفية — التتبع لا يعطل التطبيق أبداً.

@MainActor
final class Usage {
    static let shared = Usage()

    private var sessionId: String?
    private var activeMinutes = 0
    private var lastTick = Date()
    private var curScreen = "الرئيسية"
    private var screenSince = Date()
    private var inForeground = true
    private var timer: Timer?
    private var flushCounter = 0

    private struct Bucket { var hits: Int; var seconds: Int }
    private var buf: [String: Bucket] = [:] // "type|page|label"

    private func bump(_ type: String, _ page: String, _ label: String?, hits: Int, seconds: Int) {
        let key = "\(type)|\(page)|\(label ?? "")"
        var b = buf[key] ?? Bucket(hits: 0, seconds: 0)
        b.hits += hits
        b.seconds += seconds
        buf[key] = b
    }

    private func accumulateScreenTime() {
        guard inForeground else { return }
        let secs = Int(Date().timeIntervalSince(screenSince).rounded())
        if secs > 0 { bump("page", curScreen, nil, hits: 0, seconds: secs) }
        screenSince = Date()
    }

    // MARK: - الواجهة العامة

    /// تبدأ بعد توفر العضو — تُستدعى من RootView عند الدخول
    func start() {
        guard sessionId == nil, timer == nil, let m = SB.shared.member else { return }
        let name = m.name ?? m.short_name ?? "؟"
        let role = m.is_director == true ? "مدير" : "موظف"
        Task {
            struct Row: Codable { let id: String }
            if let data = try? await SB.shared.rawInsertReturning("usage_sessions", values: [
                "user_name": name,
                "user_role": role,
                "login_at": ISO8601DateFormatter().string(from: Date()),
                "minutes": 0,
                "platform": "ios",
            ]), let row = try? JSONDecoder().decode([Row].self, from: data).first {
                self.sessionId = row.id
            }
        }
        lastTick = Date()
        screenSince = Date()
        bump("page", curScreen, nil, hits: 1, seconds: 0)

        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in
            Task { @MainActor in self.tick() }
        }
    }

    /// فُتحت شاشة (تبويب أو شاشة فرعية)
    func screen(_ name: String) {
        accumulateScreenTime()
        curScreen = name
        bump("page", name, nil, hits: 1, seconds: 0)
    }

    /// فعل مهم (إرسال رسالة، إنجاز مهمة…)
    func action(_ label: String) {
        bump("click", curScreen, String(label.prefix(40)), hits: 1, seconds: 0)
    }

    func appBecameActive() {
        inForeground = true
        lastTick = Date()
        screenSince = Date()
        start() // لا تفعل شيئاً إن كانت الجلسة قائمة
    }

    func appWentBackground() {
        accumulateScreenTime()
        inForeground = false
        Task {
            await persistSession()
            await flushDetails()
        }
    }

    // MARK: - الدفع

    private func tick() {
        if inForeground {
            activeMinutes += Int((Date().timeIntervalSince(lastTick) / 60).rounded())
        }
        lastTick = Date()
        flushCounter += 1
        if flushCounter % 2 == 0 { // كل دقيقتين
            accumulateScreenTime()
            Task {
                await persistSession()
                await flushDetails()
            }
        }
    }

    private func persistSession() async {
        guard let id = sessionId else { return }
        try? await SB.shared.patch("usage_sessions", query: [("id", "eq.\(id)")], values: [
            "minutes": activeMinutes,
            "updated_at": ISO8601DateFormatter().string(from: Date()),
        ])
    }

    private func flushDetails() async {
        guard let m = SB.shared.member, !buf.isEmpty else { return }
        let name = m.name ?? m.short_name ?? "؟"
        let entries = buf
        buf.removeAll()
        let day = String(ISO8601DateFormatter().string(from: Date()).prefix(10))

        for (key, b) in entries {
            let parts = key.split(separator: "|", maxSplits: 2, omittingEmptySubsequences: false)
            let type = String(parts[0]), page = String(parts[1])
            let label = parts.count > 2 && !parts[2].isEmpty ? String(parts[2]) : nil

            struct Row: Codable { let id: String; let hits: Int?; let seconds: Int? }
            var q: [(String, String)] = [
                ("select", "id,hits,seconds"),
                ("day", "eq.\(day)"),
                ("platform", "eq.ios"),
                ("user_name", "eq.\(name)"),
                ("event_type", "eq.\(type)"),
                ("page", "eq.\(page)"),
            ]
            q.append(label == nil ? ("label", "is.null") : ("label", "eq.\(label!)"))
            let existing: [Row]? = try? await SB.shared.get("usage_daily", query: q)
            if let row = existing?.first {
                try? await SB.shared.patch("usage_daily", query: [("id", "eq.\(row.id)")], values: [
                    "hits": (row.hits ?? 0) + b.hits,
                    "seconds": (row.seconds ?? 0) + b.seconds,
                    "updated_at": ISO8601DateFormatter().string(from: Date()),
                ])
            } else {
                try? await SB.shared.insertVoid("usage_daily", values: [
                    "day": day,
                    "platform": "ios",
                    "user_name": name,
                    "event_type": type,
                    "page": page,
                    "label": label ?? NSNull(),
                    "hits": b.hits,
                    "seconds": b.seconds,
                ])
            }
        }
    }
}
