import Foundation
import Security

// عميل الأداة — عملية منفصلة لا ترى ملفات التطبيق، فتقرأ الجلسة من الكيتشين المشترك
// (العنصر نفسه الذي يكتبه التطبيق وامتداد المشاركة) وتنادي dashboard_overview بنطاق «mine»،
// وهو مصدر «جدولي» في رئيسية التطبيق نفسه. مفتاح anon عام بطبيعته والأمان في RLS.
//
// التجديد عند ٤٠١ يُحفظ في الكيتشين؛ والتطبيق صار يتبنّى الجلسة الأحدث منه قبل أن يجدّد بنفسه
// (SB.performRefresh) — فلا يُطرد المستخدم لأن الأداة دوّرت رمز التجديد.

struct WSession: Codable {
    var accessToken: String
    var refreshToken: String
    var userId: String
}

struct WSessionItem: Codable, Hashable {
    let id: String
    let case_id: String?
    let title: String?
    let session_date: String?
    let session_time: String?
    let court: String?
    let case_title: String?
}

struct WTaskItem: Codable, Hashable {
    let id: String
    let title: String?
    let due_date: String?
    let overdue: Bool?
    let case_title: String?
}

struct WOverview: Codable {
    struct Stats: Codable {
        let open_tasks: Int?
        let overdue_tasks: Int?
    }
    let stats: Stats?
    let upcoming_sessions: [WSessionItem]?
    let tasks: [WTaskItem]?
}

enum WidgetFetchError: Error { case signedOut, network }

enum WidgetClient {
    static let baseURL = URL(string: "https://zwaahunavepleczuamuy.supabase.co")!
    static let anonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3YWFodW5hdmVwbGVjenVhbXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTY1ODUsImV4cCI6MjA4OTg3MjU4NX0.kXByPtJOV-TN7G2f8jcr0DwAX4ldtSu576Rpitwls7M"

    private static let base: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "sa.redwan.mobile",
        kSecAttrAccount as String: "session",
    ]

    static func loadSession() -> WSession? {
        var q = base
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(WSession.self, from: data)
    }

    private static func save(_ s: WSession) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    private static func refresh(_ s: WSession) async -> WSession? {
        var comps = URLComponents(url: baseURL.appendingPathComponent("auth/v1/token"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(["refresh_token": s.refreshToken])
        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        struct R: Codable { let access_token: String?; let refresh_token: String? }
        guard let r = try? JSONDecoder().decode(R.self, from: data),
              let at = r.access_token, let rt = r.refresh_token else { return nil }
        let ns = WSession(accessToken: at, refreshToken: rt, userId: s.userId)
        save(ns)
        return ns
    }

    private static func overviewRequest(_ s: WSession) -> URLRequest {
        var req = URLRequest(url: baseURL.appendingPathComponent("rest/v1/rpc/dashboard_overview"))
        req.httpMethod = "POST"
        req.timeoutInterval = 15
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(["p_scope": "mine"])
        return req
    }

    static func fetchOverview() async throws -> WOverview {
        guard var s = loadSession() else { throw WidgetFetchError.signedOut }
        var (data, resp) = try await URLSession.shared.data(for: overviewRequest(s))
        if (resp as? HTTPURLResponse)?.statusCode == 401 {
            // ربما جدّد التطبيق الجلسة للتو — نقرأ الكيتشين أولاً، ثم نجدّد إن بقيت قديمة
            if let fresh = loadSession(), fresh.refreshToken != s.refreshToken {
                s = fresh
            } else if let ns = await refresh(s) {
                s = ns
            } else {
                throw WidgetFetchError.signedOut
            }
            (data, resp) = try await URLSession.shared.data(for: overviewRequest(s))
        }
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw WidgetFetchError.network }
        return try JSONDecoder().decode(WOverview.self, from: data)
    }
}
