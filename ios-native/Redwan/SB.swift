import Foundation
import Security

// عميل Supabase خفيف بلا اعتماديات خارجية — REST مباشرة عبر URLSession.
//
// ⚠️ قاعدة أمنية ثابتة من المستخدم: لا أسرار في كود العميل. مفتاح anon
//    **عام بطبيعته** (منشور في الويب أصلاً) والأمان كله في سياسات RLS على
//    الخادم — service_role لا يقترب من هذا الملف أبداً.

struct SBError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

@MainActor
final class SB: ObservableObject {
    static let shared = SB()

    private let baseURL = URL(string: "https://zwaahunavepleczuamuy.supabase.co")!
    private let anonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3YWFodW5hdmVwbGVjenVhbXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTY1ODUsImV4cCI6MjA4OTg3MjU4NX0.kXByPtJOV-TN7G2f8jcr0DwAX4ldtSu576Rpitwls7M"

    struct Session: Codable {
        var accessToken: String
        var refreshToken: String
        var userId: String
    }

    @Published private(set) var session: Session?
    @Published private(set) var member: TeamMember?

    private init() {
        session = Keychain.load()
        if session != nil {
            Task { await loadMember() }
        }
    }

    // MARK: - الدخول والخروج

    func login(email: String, password: String) async throws {
        var comps = URLComponents(
            url: baseURL.appendingPathComponent("auth/v1/token"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "grant_type", value: "password")]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["email": email, "password": password])

        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0

        struct AuthResp: Codable {
            let access_token: String?
            let refresh_token: String?
            let user: U?
            let error_description: String?
            let msg: String?
            struct U: Codable { let id: String }
        }
        let a = try? JSONDecoder().decode(AuthResp.self, from: data)
        guard code == 200,
              let at = a?.access_token, let rt = a?.refresh_token, let uid = a?.user?.id
        else {
            // رسالة سبب واضحة — قاعدة «لا تعذّر بلا سبب» تنطبق هنا أيضاً
            let raw = a?.error_description ?? a?.msg ?? ""
            let msg = raw.contains("Invalid login")
                ? "البريد أو كلمة المرور غير صحيحة"
                : (raw.isEmpty ? "تعذّر الاتصال بالخادم (\(code))" : raw)
            throw SBError(message: msg)
        }

        let s = Session(accessToken: at, refreshToken: rt, userId: uid)
        session = s
        Keychain.save(s)
        await loadMember()
    }

    func logout() {
        session = nil
        member = nil
        Keychain.clear()
    }

    private func refresh() async -> Bool {
        guard let s = session else { return false }
        var comps = URLComponents(
            url: baseURL.appendingPathComponent("auth/v1/token"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(["refresh_token": s.refreshToken])

        guard let (data, resp) = try? await URLSession.shared.data(for: req),
              (resp as? HTTPURLResponse)?.statusCode == 200
        else { return false }

        struct R: Codable {
            let access_token: String?
            let refresh_token: String?
            let user: U?
            struct U: Codable { let id: String }
        }
        guard let r = try? JSONDecoder().decode(R.self, from: data),
              let at = r.access_token, let rt = r.refresh_token
        else { return false }

        let ns = Session(accessToken: at, refreshToken: rt, userId: r.user?.id ?? s.userId)
        session = ns
        Keychain.save(ns)
        return true
    }

    func loadMember() async {
        guard let uid = session?.userId else { return }
        do {
            let rows: [TeamMember] = try await get("team_members", query: [
                ("select", "id,name,short_name,is_director,avatar_initial,avatar_color"),
                ("auth_id", "eq.\(uid)"),
                ("limit", "1"),
            ])
            member = rows.first
        } catch {
            // يبقى nil — الواجهات تتصرف بدونه، ويُعاد الجلب مع أول تحديث
        }
    }

    // MARK: - REST عام

    func get<T: Decodable>(_ table: String, query: [(String, String)]) async throws -> T {
        let data = try await raw(path: "rest/v1/\(table)", method: "GET", query: query)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func insertVoid(_ table: String, values: [String: Any]) async throws {
        let body = try JSONSerialization.data(withJSONObject: values)
        _ = try await raw(
            path: "rest/v1/\(table)", method: "POST", query: [],
            body: body, prefer: "return=minimal"
        )
    }

    func patch(_ table: String, query: [(String, String)], values: [String: Any]) async throws {
        let body = try JSONSerialization.data(withJSONObject: values)
        _ = try await raw(
            path: "rest/v1/\(table)", method: "PATCH", query: query,
            body: body, prefer: "return=minimal"
        )
    }

    /// إدراج-أو-تحديث على مفتاح موجود (Prefer: resolution=merge-duplicates).
    /// يخدم case_reads: الصف قد يوجد أو لا، ومفتاحه مركّب.
    func rawUpsert(table: String, body: Data) async throws -> Data {
        try await raw(
            path: "rest/v1/\(table)", method: "POST", query: [],
            body: body, prefer: "resolution=merge-duplicates,return=minimal"
        )
    }

    func rpc<T: Decodable>(_ fn: String, params: [String: Any]) async throws -> T {
        let body = try JSONSerialization.data(withJSONObject: params)
        let data = try await raw(path: "rest/v1/rpc/\(fn)", method: "POST", query: [], body: body)
        return try JSONDecoder().decode(T.self, from: data)
    }

    fileprivate func raw(
        path: String,
        method: String,
        query: [(String, String)],
        body: Data? = nil,
        prefer: String? = nil,
        retried: Bool = false
    ) async throws -> Data {
        guard let s = session else {
            throw SBError(message: "انتهت الجلسة — سجّل الدخول من جديد")
        }
        var comps = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty {
            comps.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let prefer { req.setValue(prefer, forHTTPHeaderField: "Prefer") }
        req.httpBody = body

        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0

        // انتهاء التوكن: تجديد صامت ومحاولة واحدة
        if code == 401, !retried, await refresh() {
            return try await raw(
                path: path, method: method, query: query,
                body: body, prefer: prefer, retried: true
            )
        }

        guard (200..<300).contains(code) else {
            struct PgErr: Codable { let message: String? }
            let m = (try? JSONDecoder().decode(PgErr.self, from: data))?.message
            throw SBError(message: m ?? "خطأ من الخادم (\(code))")
        }
        return data
    }
}

// MARK: - Keychain — تخزين الجلسة الآمن (لا UserDefaults)

enum Keychain {
    private static let service = "sa.redwan.mobile"
    private static let account = "session"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func save(_ s: SB.Session) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        SecItemDelete(baseQuery as CFDictionary)
        var add = baseQuery
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    static func load() -> SB.Session? {
        var q = baseQuery
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data
        else { return nil }
        return try? JSONDecoder().decode(SB.Session.self, from: data)
    }

    static func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}
