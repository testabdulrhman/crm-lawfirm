import Foundation
import Security
import UIKit
import UserNotifications

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

    // MARK: - إشعارات الدفع

    /// طلب إذن الإشعارات والتسجيل في APNs — تُستدعى بعد الدخول
    func enablePush() async {
        guard session != nil else { return }
        let granted = (try? await UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// حفظ device token — upsert على token فالجهاز الواحد صف واحد
    func registerPushDevice(token: String) async {
        // العضو قد لا يكون حُمّل بعد لحظة وصول التوكن
        if member == nil { await loadMember() }
        guard let me = member?.id else { return }
        try? await upsert(
            table: "push_devices",
            values: [
                "member_id": me,
                "token": token,
                "platform": "ios",
                "device_name": UIDevice.current.name,
                "last_seen_at": ISO8601DateFormatter().string(from: Date()),
            ],
            onConflict: "token"
        )
    }

    // MARK: - الدخول برمز التحقق (نفس دالة الويب staff-login-otp)

    /// إرسال رمز SMS لرقم موظف — الدالة تصمت عن الأرقام غير المسجّلة عمداً
    func otpSend(phone: String) async throws {
        _ = try await callFunction("staff-login-otp", body: ["action": "send", "phone": phone])
    }

    /// التحقق من الرمز وتفعيل الجلسة
    func otpVerify(phone: String, code: String) async throws {
        let data = try await callFunction(
            "staff-login-otp",
            body: ["action": "verify", "phone": phone, "code": code]
        )
        struct R: Codable {
            let ok: Bool?
            let access_token: String?
            let refresh_token: String?
            let error: String?
        }
        let r = try? JSONDecoder().decode(R.self, from: data)
        guard let at = r?.access_token, let rt = r?.refresh_token else {
            throw SBError(message: r?.error ?? "الرمز غير صحيح أو منتهي الصلاحية")
        }
        // هوية المستخدم من حمولة JWT (الحقل sub)
        let parts = at.split(separator: ".")
        guard parts.count == 3,
              let payload = Data(base64URL: String(parts[1])),
              let obj = try? JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let uid = obj["sub"] as? String
        else { throw SBError(message: "استجابة دخول غير مفهومة") }

        let s = Session(accessToken: at, refreshToken: rt, userId: uid)
        session = s
        Keychain.save(s)
        await loadMember()
    }

    /// نداء Edge Function بلا جلسة (مفتاح anon فقط) — للدخول قبل وجود جلسة
    private func callFunction(_ name: String, body: [String: Any]) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent("functions/v1/\(name)"))
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else {
            throw SBError(message: "تعذّر الاتصال بالخادم (\(code))")
        }
        return data
    }

    /// نتيجة محاولة التجديد — التمييز بينها هو بيت العلّة:
    /// رفض الخادم للرمز شيء، وتعذّر الوصول إليه شيء آخر تماماً.
    enum RefreshOutcome {
        case ok          // جلسة جديدة محفوظة
        case rejected    // الخادم رفض رمز التجديد نفسه ⇒ لا مخرج إلا دخول جديد
        case transient   // شبكة أو خادم متوقف مؤقتاً ⇒ الجلسة تبقى ونعيد لاحقاً
    }

    /// تجديد واحد فقط في كل لحظة. بدون هذا القفل تتسابق طلبات ٤٠١ المتزامنة
    /// على رمز التجديد، فيستهلكه أوّلها (Supabase يدوّره) وتفشل البقية بلا سبب.
    private var refreshTask: Task<RefreshOutcome, Never>?

    private func refresh() async -> RefreshOutcome {
        if let t = refreshTask { return await t.value }
        let t = Task { () -> RefreshOutcome in await self.performRefresh() }
        refreshTask = t
        let out = await t.value
        refreshTask = nil
        return out
    }

    private func performRefresh() async -> RefreshOutcome {
        guard let s = session else { return .rejected }
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
              let http = resp as? HTTPURLResponse
        else { return .transient }          // بلا شبكة — لا نُخرج المستخدم

        // ٤٠٠/٤٠١/٤٠٣ = الرمز نفسه مرفوض. أما ٥٠٠ و٥٠٣ (كإعادة تشغيل القاعدة
        // عند ترقية الحوسبة) فعارض مؤقت لا يستحق طرد المستخدم.
        if [400, 401, 403, 422].contains(http.statusCode) { return .rejected }
        guard http.statusCode == 200 else { return .transient }

        struct R: Codable {
            let access_token: String?
            let refresh_token: String?
            let user: U?
            struct U: Codable { let id: String }
        }
        guard let r = try? JSONDecoder().decode(R.self, from: data),
              let at = r.access_token, let rt = r.refresh_token
        else { return .transient }

        let ns = Session(accessToken: at, refreshToken: rt, userId: r.user?.id ?? s.userId)
        session = ns
        Keychain.save(ns)
        return .ok
    }

    func loadMember() async {
        guard let uid = session?.userId else { return }
        do {
            let rows: [TeamMember] = try await get("team_members", query: [
                ("select", "id,name,short_name,is_director,is_reviewer,avatar_initial,avatar_color,avatar_url"),
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

    /// إدراج-أو-تحديث. ⚠️ on_conflict إلزامي: بدونه يستنتج PostgREST المفتاح
    /// الأساسي (id عشوائي جديد) فلا يتصادم أبداً ويصطدم الإدراج بفهرس الفرادة
    /// — كان يجعل markRead يفشل بصمت بعد أول قراءة لكل قضية.
    func upsert(table: String, values: [String: Any], onConflict: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: values)
        _ = try await raw(
            path: "rest/v1/\(table)", method: "POST",
            query: [("on_conflict", onConflict)],
            body: body, prefer: "resolution=merge-duplicates,return=minimal"
        )
    }

    func delete(_ table: String, query: [(String, String)]) async throws {
        _ = try await raw(
            path: "rest/v1/\(table)", method: "DELETE", query: query,
            prefer: "return=minimal"
        )
    }

    /// رفع ملف إلى Supabase Storage — يُرجع الرابط العام.
    /// المسار ASCII فقط: مفاتيح التخزين ترفض الأسماء العربية (درس مُسجَّل)،
    /// والاسم العربي يُحفظ في documents.name.
    func storageUpload(bucket: String, path: String, data: Data, mime: String) async throws -> String {
        guard let s = session else {
            throw SBError(message: "انتهت الجلسة — سجّل الدخول من جديد")
        }
        var req = URLRequest(url: baseURL.appendingPathComponent("storage/v1/object/\(bucket)/\(path)"))
        req.httpMethod = "POST"
        req.setValue(anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue(mime, forHTTPHeaderField: "Content-Type")
        req.httpBody = data
        let (respData, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            struct E: Codable { let message: String? }
            let m = (try? JSONDecoder().decode(E.self, from: respData))?.message
            throw SBError(message: m ?? "فشل رفع الملف (\(code))")
        }
        return baseURL.appendingPathComponent("storage/v1/object/public/\(bucket)/\(path)").absoluteString
    }

    func rpc<T: Decodable>(_ fn: String, params: [String: Any]) async throws -> T {
        let body = try JSONSerialization.data(withJSONObject: params)
        let data = try await raw(path: "rest/v1/rpc/\(fn)", method: "POST", query: [], body: body)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func raw(
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
        if code == 401, !retried {
            switch await refresh() {
            case .ok:
                return try await raw(
                    path: path, method: method, query: query,
                    body: body, prefer: prefer, retried: true
                )
            case .rejected:
                // ⚠️ كانت هذه الحالة تُسقط الرسالة الخام «JWT expired» وتُبقي
                //    الجلسة الميتة في الـKeychain، فيعلق التطبيق عليها في كل
                //    إقلاع بلا طريق إلى شاشة الدخول. الآن نُنهيها فتظهر الشاشة.
                logout()
                throw SBError(message: "انتهت الجلسة — سجّل الدخول من جديد")
            case .transient:
                throw SBError(message: "تعذّر الوصول إلى الخادم — أعد المحاولة بعد قليل")
            }
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

extension Data {
    /// فك base64url (حمولة JWT) — إكمال الحشو وإبدال المحارف
    init?(base64URL s: String) {
        var b = s.replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        self.init(base64Encoded: b)
    }
}

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
