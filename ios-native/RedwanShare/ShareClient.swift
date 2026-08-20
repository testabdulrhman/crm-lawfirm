import Foundation
import Security

// عميل مصغّر مستقل لامتداد المشاركة — الامتداد عملية منفصلة لا ترى
// ملفات التطبيق، فنكرر هنا الحد الأدنى (جلسة + رفع + إدراج) بدل صراع
// عضويات الأهداف في pbxproj. مفتاح anon عام بطبيعته والأمان في RLS.

struct ShareError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct ShareChannel: Codable, Identifiable {
    let case_id: String?
    let case_title: String?
    let office_num: String?
    var id: String { case_id ?? "general" }
}

final class ShareClient {
    static let baseURL = URL(string: "https://zwaahunavepleczuamuy.supabase.co")!
    static let anonKey =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3YWFodW5hdmVwbGVjenVhbXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyOTY1ODUsImV4cCI6MjA4OTg3MjU4NX0.kXByPtJOV-TN7G2f8jcr0DwAX4ldtSu576Rpitwls7M"

    struct Session: Codable {
        var accessToken: String
        var refreshToken: String
        var userId: String
    }

    private(set) var session: Session?
    private(set) var memberId: String?
    private(set) var memberName: String?

    // MARK: - الجلسة من الكيتشين المشترك (نفس عنصر التطبيق حرفياً)

    func loadSession() -> Bool {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "sa.redwan.mobile",
            kSecAttrAccount as String: "session",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data,
              let s = try? JSONDecoder().decode(Session.self, from: data)
        else { return false }
        session = s
        return true
    }

    private func saveSession(_ s: Session) {
        guard let data = try? JSONEncoder().encode(s) else { return }
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "sa.redwan.mobile",
            kSecAttrAccount as String: "session",
        ]
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    private func refresh() async -> Bool {
        guard let s = session else { return false }
        var comps = URLComponents(
            url: Self.baseURL.appendingPathComponent("auth/v1/token"),
            resolvingAgainstBaseURL: false
        )!
        comps.queryItems = [URLQueryItem(name: "grant_type", value: "refresh_token")]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue(Self.anonKey, forHTTPHeaderField: "apikey")
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
        saveSession(ns)
        return true
    }

    // MARK: - طلب موقّع بإعادة محاولة واحدة بعد تجديد الجلسة

    private func send(_ make: (Session) -> URLRequest) async throws -> (Data, Int) {
        guard let s = session else { throw ShareError(message: "سجّل الدخول في تطبيق رضوان أولاً") }
        let (d, r) = try await URLSession.shared.data(for: make(s))
        let code = (r as? HTTPURLResponse)?.statusCode ?? 0
        if code == 401, await refresh(), let s2 = session {
            let (d2, r2) = try await URLSession.shared.data(for: make(s2))
            return (d2, (r2 as? HTTPURLResponse)?.statusCode ?? 0)
        }
        return (d, code)
    }

    private func restRequest(
        _ s: Session, path: String, method: String, query: [(String, String)] = [], body: Data? = nil,
        headers: [String: String] = [:]
    ) -> URLRequest {
        var comps = URLComponents(
            url: Self.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty {
            comps.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        req.setValue(Self.anonKey, forHTTPHeaderField: "apikey")
        req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        req.httpBody = body
        return req
    }

    // MARK: - العمليات

    /// عضو الفريق الحالي — للاسم على المستند وauthor_id للرسالة
    func loadMember() async throws {
        guard let uid = session?.userId else { throw ShareError(message: "سجّل الدخول في تطبيق رضوان أولاً") }
        let (data, code) = try await send { s in
            self.restRequest(s, path: "rest/v1/team_members", method: "GET", query: [
                ("select", "id,name,short_name"),
                ("auth_id", "eq.\(uid)"),
                ("limit", "1"),
            ])
        }
        struct M: Codable { let id: String; let name: String?; let short_name: String? }
        guard code == 200, let m = (try? JSONDecoder().decode([M].self, from: data))?.first
        else { throw ShareError(message: "تعذّر تحميل ملفك (\(code)) — افتح التطبيق ثم أعد المحاولة") }
        memberId = m.id
        memberName = m.name ?? m.short_name
    }

    /// قنوات النقاش — نفس دالة القاعدة التي يقرأها التطبيق والويب
    func channels() async throws -> [ShareChannel] {
        let (data, code) = try await send { s in
            self.restRequest(s, path: "rest/v1/rpc/case_discussions", method: "POST", body: Data("{}".utf8))
        }
        guard code == 200 else { throw ShareError(message: "تعذّر تحميل النقاشات (\(code))") }
        return try JSONDecoder().decode([ShareChannel].self, from: data)
    }

    /// رفع ملف واحد وربطه: تخزين ← مستند ← رسالة في النقاش
    func sendFile(
        data: Data, fileName: String, mime: String, caseId: String?, caption: String?
    ) async throws {
        guard let me = memberId else { throw ShareError(message: "لم يُحمَّل ملفك بعد") }

        let ext = (fileName as NSString).pathExtension.lowercased()
        let safeExt = ext.isEmpty ? "bin" : ext.filter { $0.isASCII }
        let folder = caseId.map { "case_documents/\($0)" } ?? "discussion_general"
        let path = "\(folder)/\(Int(Date().timeIntervalSince1970))_\(Int.random(in: 100...999))_share.\(safeExt)"

        // ١. التخزين
        let (_, upCode) = try await send { s in
            self.restRequest(
                s, path: "storage/v1/object/documents/\(path)", method: "POST",
                body: data, headers: ["Content-Type": mime, "x-upsert": "true"]
            )
        }
        guard upCode == 200 else { throw ShareError(message: "فشل رفع الملف (\(upCode))") }
        let publicUrl = "\(Self.baseURL.absoluteString)/storage/v1/object/public/documents/\(path)"

        // ٢. صف المستند
        var doc: [String: Any] = [
            "name": fileName,
            "file_url": publicUrl,
            "file_path": path,
            "file_type": mime,
            "file_size": data.count,
            "description": "أُرسل عبر المشاركة",
        ]
        doc["case_id"] = caseId ?? NSNull()
        doc["uploaded_by_name"] = memberName ?? NSNull()
        let docBody = try JSONSerialization.data(withJSONObject: [doc])
        let (docData, docCode) = try await send { s in
            self.restRequest(
                s, path: "rest/v1/documents", method: "POST", body: docBody,
                headers: ["Prefer": "return=representation"]
            )
        }
        struct D: Codable { let id: String }
        guard docCode == 201, let docId = (try? JSONDecoder().decode([D].self, from: docData))?.first?.id
        else { throw ShareError(message: "رُفع الملف لكن تعذّر تسجيله مستنداً (\(docCode))") }

        // ٣. الرسالة
        var msg: [String: Any] = ["author_id": me, "document_id": docId]
        msg["case_id"] = caseId ?? NSNull()
        if let caption, !caption.isEmpty { msg["body"] = caption }
        let msgBody = try JSONSerialization.data(withJSONObject: [msg])
        let (_, msgCode) = try await send { s in
            self.restRequest(s, path: "rest/v1/case_comments", method: "POST", body: msgBody)
        }
        guard msgCode == 201 else { throw ShareError(message: "رُفع الملف لكن تعذّر إرسال الرسالة (\(msgCode))") }
    }
}

extension ShareClient {
    /// رسالة نصية فقط (مشاركة رابط أو نص بلا ملف)
    func sendText(caseId: String?, body: String) async throws {
        guard let me = memberId else { throw ShareError(message: "لم يُحمَّل ملفك بعد") }
        var msg: [String: Any] = ["author_id": me, "body": body]
        msg["case_id"] = caseId ?? NSNull()
        let msgBody = try JSONSerialization.data(withJSONObject: [msg])
        let (_, code) = try await send { s in
            self.restRequest(s, path: "rest/v1/case_comments", method: "POST", body: msgBody)
        }
        guard code == 201 else { throw ShareError(message: "تعذّر الإرسال (\(code))") }
    }
}
