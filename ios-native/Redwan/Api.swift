import Foundation

// طبقة البيانات كاملة هنا — الشاشات لا تعرف PostgREST ولا أسماء الجداول.
// نفس استعلامات الويب المجرَّبة تحت RLS حرفياً (useDashboard/useTasks/useCalendar).

extension SB {
    // ===== لوحة التحكم — نفس RPC الويب =====

    func dashboard(scope: String) async throws -> DashboardOverview {
        try await rpc("dashboard_overview", params: ["p_scope": scope])
    }

    // ===== المهام =====

    func openTasks(mineOnly: Bool) async throws -> [TaskRow] {
        var q: [(String, String)] = [
            ("select", "id,title,status,due_date,priority,is_urgent,notes,description,case_id,assignee_id,cases(title)"),
            ("status", "eq.todo"),
            ("deleted_at", "is.null"),
            ("order", "is_urgent.desc,due_date.asc.nullslast"),
        ]
        if mineOnly, let me = member?.id {
            q.append(("assignee_id", "eq.\(me)"))
        }
        return try await get("tasks", query: q)
    }

    func completeTask(id: String) async throws {
        try await patch(
            "tasks",
            query: [("id", "eq.\(id)")],
            values: [
                "status": "done",
                "done_at": ISO8601DateFormatter().string(from: Date()),
            ]
        )
    }

    // task_comments → team_members عبر author_id (FK واحد — لا لبس PGRST201)
    func comments(taskId: String) async throws -> [CommentRow] {
        try await get("task_comments", query: [
            ("select", "id,body,created_at,author_id,author:team_members(id,name,short_name,is_director,avatar_initial,avatar_color)"),
            ("task_id", "eq.\(taskId)"),
            ("deleted_at", "is.null"),
            ("order", "created_at.asc"),
        ])
    }

    func addComment(taskId: String, body: String) async throws {
        guard let me = member?.id else {
            throw SBError(message: "لم يُحمَّل ملفك بعد — اسحب للتحديث ثم أعد المحاولة")
        }
        try await insertVoid("task_comments", values: [
            "task_id": taskId,
            "author_id": me,
            "body": body,
        ])
    }

    // ===== التقويم — أربعة مصادر بالتوازي (نفس useCalendarRange في الويب) =====

    func calendar(fromISO: String, toISO: String) async throws -> [CalItem] {
        struct SessRow: Codable {
            let id: String
            let case_id: String?
            let title: String?
            let session_date: String?
            let session_time: String?
            let court: String?
            let cases: CaseRef?
        }
        struct ApptRow: Codable {
            let id: String
            let client_name: String?
            let appointment_date: String?
            let appointment_time: String?
            let meeting_method: String?
        }
        struct TaskDue: Codable {
            let id: String
            let title: String?
            let due_date: String?
            let cases: CaseRef?
        }
        struct PoaRow: Codable {
            let id: String
            let poa_number: String?
            let client_name: String?
            let expiry_date: String?
        }

        async let sessions: [SessRow] = get("sessions", query: [
            ("select", "id,case_id,title,session_date,session_time,court,cases(title)"),
            ("session_date", "gte.\(fromISO)"),
            ("session_date", "lte.\(toISO)"),
        ])
        async let appts: [ApptRow] = get("appointments", query: [
            ("select", "id,client_name,appointment_date,appointment_time,meeting_method"),
            ("status", "neq.cancelled"),
            ("appointment_date", "gte.\(fromISO)"),
            ("appointment_date", "lte.\(toISO)"),
        ])
        async let tasks: [TaskDue] = get("tasks", query: [
            ("select", "id,title,due_date,cases(title)"),
            ("status", "eq.todo"),
            ("deleted_at", "is.null"),
            ("due_date", "gte.\(fromISO)"),
            ("due_date", "lte.\(toISO)"),
        ])
        async let poas: [PoaRow] = get("powers_of_attorney", query: [
            ("select", "id,poa_number,client_name,expiry_date"),
            ("deleted_at", "is.null"),
            ("status", "eq.active"),
            ("expiry_date", "gte.\(fromISO)"),
            ("expiry_date", "lte.\(toISO)"),
        ])

        let (se, ap, tk, poa) = try await (sessions, appts, tasks, poas)
        let hhmm: (String?) -> String? = { t in
            guard let t, t.count >= 5 else { return nil }
            return String(t.prefix(5))
        }

        var items: [CalItem] = []
        items += se.compactMap { r in
            guard let d = r.session_date else { return nil }
            return CalItem(
                id: "s-\(r.id)", kind: .session, date: d, time: hhmm(r.session_time),
                title: r.cases?.title ?? r.title ?? "جلسة", subtitle: r.court
            )
        }
        items += ap.compactMap { r in
            guard let d = r.appointment_date else { return nil }
            let sub = r.meeting_method == "remote" ? "عن بُعد"
                : r.meeting_method == "onsite" ? "حضوري" : nil
            return CalItem(
                id: "a-\(r.id)", kind: .appointment, date: d,
                time: hhmm(r.appointment_time),
                title: r.client_name ?? "موعد", subtitle: sub
            )
        }
        items += tk.compactMap { r in
            guard let d = r.due_date else { return nil }
            return CalItem(
                id: "t-\(r.id)", kind: .task, date: d, time: nil,
                title: r.title ?? "مهمة", subtitle: r.cases?.title
            )
        }
        items += poa.compactMap { r in
            guard let d = r.expiry_date else { return nil }
            return CalItem(
                id: "p-\(r.id)", kind: .poa, date: d, time: nil,
                title: "انتهاء وكالة — \(r.client_name ?? "موكّل")",
                subtitle: r.poa_number.map { "وكالة \($0)" }
            )
        }

        return items.sorted { a, b in
            if a.date != b.date { return a.date < b.date }
            switch (a.time, b.time) {
            case let (ta?, tb?): return ta < tb
            case (_?, nil): return true
            case (nil, _?): return false
            default: return a.title < b.title
            }
        }
    }
}

// ===== نقاش القضايا بالخيوط =====

extension SB {
    /// قائمة تبويب «النقاشات» — مرتّبة بالأحدث مع عدّاد غير المقروء
    func discussions() async throws -> [DiscussionRow] {
        try await rpc("case_discussions", params: [:])
    }

    /// مجرى القضية: الجذور فقط (والردود المعلَّمة also_to_stream)
    func stream(caseId: String) async throws -> [StreamMsg] {
        try await rpc("case_stream", params: ["p_case_id": caseId])
    }

    /// ردود خيط واحد — بترتيب زمني صاعد
    func replies(rootId: String) async throws -> [ReplyRow] {
        try await get("case_comments", query: [
            ("select", "id,author_id,body,kind,document_id,created_at,author:team_members(id,name,short_name,is_director,avatar_initial,avatar_color)"),
            ("parent_id", "eq.\(rootId)"),
            ("deleted_at", "is.null"),
            ("order", "created_at.asc"),
        ])
    }

    /// إرسال رسالة: جذر في المجرى (parentId = nil) أو ردّ في خيط.
    /// alsoToStream يعالج عيب سلاك: الردّ المعلَّم يظهر في المجرى أيضاً.
    func postMessage(
        caseId: String,
        body: String,
        parentId: String? = nil,
        alsoToStream: Bool = false
    ) async throws {
        guard let me = member?.id else {
            throw SBError(message: "لم يُحمَّل ملفك بعد — اسحب للتحديث ثم أعد المحاولة")
        }
        var values: [String: Any] = [
            "case_id": caseId,
            "author_id": me,
            "body": body,
        ]
        if let parentId {
            values["parent_id"] = parentId
            values["also_to_stream"] = alsoToStream
        }
        try await insertVoid("case_comments", values: values)
    }

    /// تعليم القضية مقروءة — يصفّر عدّادها في القائمة.
    /// upsert لأن الصف قد يوجد أو لا (مفتاح مركّب case_id+member_id).
    func markRead(caseId: String) async throws {
        guard let me = member?.id else { return }
        let body = try JSONSerialization.data(withJSONObject: [
            "case_id": caseId,
            "member_id": me,
            "read_at": ISO8601DateFormatter().string(from: Date()),
        ])
        _ = try await rawUpsert(table: "case_reads", body: body)
    }
}
