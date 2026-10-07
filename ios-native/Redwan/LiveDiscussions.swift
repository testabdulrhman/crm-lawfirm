import Foundation

// النقاش لحظي كالواتساب (طلب المدير 2026-10-07: «ليه التأخير، كيف أخليه مثل الواتس أب لحظي» ثم «نفذها»).
// اتصالٌ دائم بـ Supabase Realtime (بروتوكول Phoenix فوق WebSocket — التطبيق لا يستعمل مكتبة supabase-swift):
// الخادم يدفع كل تغيير في case_comments وcase_comment_reactions، وتطبَّق صلاحيات الجدول بجلسة الموظف
// (فلا يصله نقاشٌ لا يراه). الحدث إشارة فقط: الشاشة المعنية تعيد الجلب بدوالها المعتادة.
// وإن انقطع البث عادت الشاشات للسؤال كل ٤ ثوانٍ حتى يعود (انظر CaseStreamView).

extension Notification.Name {
    /// تغيّر في نقاش: object = [case_id, parent_id, comment_id, table] (قيمٌ قد تغيب)
    static let discussionChanged = Notification.Name("discussionChanged")
}

struct DiscussionChange {
    let caseId: String?
    let parentId: String?
    let commentId: String?
    let table: String
}

@MainActor
final class LiveDiscussions: ObservableObject {
    static let shared = LiveDiscussions()
    @Published private(set) var connected = false

    private let topic = "realtime:disc-live"
    private var socket: URLSessionWebSocketTask?
    private var heartbeat: Task<Void, Never>?
    private var reconnect: Task<Void, Never>?
    private var token: String?
    private var ref = 0
    private var joinRef = "1"
    private var attempts = 0
    private var wanted = false

    private func nextRef() -> String { ref += 1; return String(ref) }

    /// يبدأ الاتصال (أو يحدّث رمز الجلسة إن كان متصلاً)
    func start(token: String) {
        wanted = true
        if socket != nil, self.token != nil {
            if self.token != token { updateToken(token) }
            return
        }
        self.token = token
        connect()
    }

    /// التطبيق إلى الخلفية أو خروج: يُغلق ولا يُعاد حتى start
    func stop() {
        wanted = false
        reconnect?.cancel(); reconnect = nil
        heartbeat?.cancel(); heartbeat = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        connected = false
    }

    private func updateToken(_ t: String) {
        token = t
        send(["topic": topic, "event": "access_token", "payload": ["access_token": t], "ref": nextRef(), "join_ref": joinRef])
    }

    private func connect() {
        guard wanted, let token else { return }
        heartbeat?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        var c = URLComponents(url: SB.shared.baseURL.appendingPathComponent("realtime/v1/websocket"), resolvingAgainstBaseURL: false)!
        c.scheme = "wss"
        c.queryItems = [URLQueryItem(name: "apikey", value: SB.shared.anonKey), URLQueryItem(name: "vsn", value: "1.0.0")]
        let ws = URLSession.shared.webSocketTask(with: c.url!)
        socket = ws
        ws.resume()
        joinRef = nextRef()
        send([
            "topic": topic, "event": "phx_join", "ref": joinRef, "join_ref": joinRef,
            "payload": [
                "config": [
                    "broadcast": ["self": false],
                    "presence": ["key": ""],
                    "postgres_changes": [
                        ["event": "*", "schema": "public", "table": "case_comments"],
                        ["event": "*", "schema": "public", "table": "case_comment_reactions"],
                    ],
                ],
                "access_token": token,
            ],
        ])
        listen(ws)
        heartbeat = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(25))
                guard let self else { return }
                self.send(["topic": "phoenix", "event": "heartbeat", "payload": [:], "ref": self.nextRef()])
            }
        }
    }

    private func send(_ obj: [String: Any]) {
        guard let socket, let data = try? JSONSerialization.data(withJSONObject: obj),
              let text = String(data: data, encoding: .utf8) else { return }
        socket.send(.string(text)) { _ in }
    }

    private func listen(_ ws: URLSessionWebSocketTask) {
        ws.receive { [weak self] result in
            Task { @MainActor in
                guard let self, self.socket === ws else { return }
                switch result {
                case .failure:
                    self.dropped()
                case .success(let message):
                    if case .string(let text) = message { self.handle(text) }
                    else if case .data(let d) = message, let text = String(data: d, encoding: .utf8) { self.handle(text) }
                    self.listen(ws)
                }
            }
        }
    }

    private func handle(_ text: String) {
        guard let data = text.data(using: .utf8),
              let msg = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let event = msg["event"] as? String else { return }
        let payload = msg["payload"] as? [String: Any] ?? [:]
        switch event {
        case "phx_reply":
            if (msg["ref"] as? String) == joinRef {
                if (payload["status"] as? String) == "ok" { connected = true; attempts = 0 }
                else { dropped() }
            }
        case "postgres_changes":
            guard let d = payload["data"] as? [String: Any] else { return }
            let rec = (d["record"] as? [String: Any]).flatMap { $0.isEmpty ? nil : $0 } ?? (d["old_record"] as? [String: Any]) ?? [:]
            let table = d["table"] as? String ?? ""
            let change = DiscussionChange(
                caseId: rec["case_id"] as? String,
                parentId: rec["parent_id"] as? String,
                commentId: table == "case_comment_reactions" ? rec["comment_id"] as? String : rec["id"] as? String,
                table: table
            )
            NotificationCenter.default.post(name: .discussionChanged, object: change)
        case "phx_error", "phx_close":
            dropped()
        default:
            break
        }
    }

    /// انقطع: الشاشات تعود للسؤال الدوري، وإعادة اتصال بتباعد متزايد (٢، ٤، ٨… حتى ٣٠ ثانية)
    private func dropped() {
        connected = false
        heartbeat?.cancel(); heartbeat = nil
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        guard wanted else { return }
        attempts += 1
        let wait = min(30.0, pow(2.0, Double(min(attempts, 5))))
        reconnect?.cancel()
        reconnect = Task { [weak self] in
            try? await Task.sleep(for: .seconds(wait))
            guard let self, !Task.isCancelled else { return }
            // رمزٌ أحدث إن جُدِّدت الجلسة أثناء الانقطاع
            if let t = SB.shared.session?.accessToken { self.token = t }
            self.connect()
        }
    }
}
