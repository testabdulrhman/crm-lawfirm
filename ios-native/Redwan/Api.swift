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
            ("select", "id,body,created_at,author_id,author:team_members(id,name,short_name,is_director,avatar_initial,avatar_color,avatar_url)"),
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
        // ⚠️ من العرض `poas_needing_renewal` لا من الجدول: العرض يُسقط الوكالات
        //    المربوطة بمشروع **منتهٍ** (لا بديل يُستخرج بعد انتهاء التمثيل)،
        //    ويطبّق شرطي `active` و`deleted_at is null` بنفسه. الويب يقرأ منه
        //    كذلك — وقراءة الجدول هنا كانت تُبقي التنبيه حيّاً على الجوال وحده.
        async let poas: [PoaRow] = get("poas_needing_renewal", query: [
            ("select", "id,poa_number,client_name,expiry_date"),
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
                title: r.cases?.title ?? r.title ?? "جلسة", subtitle: r.court,
                caseId: r.case_id
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

// ===== نقاش القضايا بالخيوط — v2: عامة + تفاعلات + محفوظات + مرفقات =====

extension SB {
    /// قائمة تبويب «النقاشات» — العامة تأتي ضمنها (case_id فارغ)
    func discussions() async throws -> [DiscussionRow] {
        try await rpc("case_discussions", params: [:])
    }

    /// مجرى قناة: قضية، أو العامة حين caseId فارغ
    func stream(caseId: String?) async throws -> [StreamMsg] {
        try await rpc("case_stream", params: ["p_case_id": caseId ?? NSNull()])
    }

    /// ردود خيط واحد — مخصّبة بالتفاعلات والمحفوظات
    func thread(rootId: String) async throws -> [ThreadMsg] {
        try await rpc("case_thread", params: ["p_root": rootId])
    }

    /// موظفو المكتب النشطون — قائمة المنشن في النقاش
    func staff() async throws -> [TeamMember] {
        try await get("team_members", query: [
            ("select", "id,name,short_name,is_director,avatar_initial,avatar_color,avatar_url"),
            ("is_active", "not.is.false"),
            ("order", "name.asc"),
        ])
    }

    /// إرسال رسالة/مرفق: جذر أو ردّ، في قضية أو في العامة.
    /// mentions: معرّفات المذكورين بـ@ — القاعدة تُشعرهم (notify_mentions).
    func postMessage(
        caseId: String?,
        body: String?,
        documentId: String? = nil,
        parentId: String? = nil,
        alsoToStream: Bool = false,
        mentions: [String]? = nil
    ) async throws {
        guard let me = member?.id else {
            throw SBError(message: "لم يُحمَّل ملفك بعد — اسحب للتحديث ثم أعد المحاولة")
        }
        var values: [String: Any] = ["author_id": me]
        values["case_id"] = caseId ?? NSNull()
        if let body, !body.isEmpty { values["body"] = body }
        if let documentId { values["document_id"] = documentId }
        if let parentId {
            values["parent_id"] = parentId
            values["also_to_stream"] = alsoToStream
        }
        if let mentions, !mentions.isEmpty { values["mentions"] = mentions }
        try await insertVoid("case_comments", values: values)
    }

    /// رفع مرفق (صورة/ملف) وتسجيله مستنداً — للقضية أو للعامة.
    /// الرفع قبل postMessage: المستند أولاً ثم الرسالة التي تشير إليه.
    func uploadAttachment(
        data: Data, fileName: String, mime: String, caseId: String?
    ) async throws -> String {
        let ext = (fileName as NSString).pathExtension.lowercased()
        let safeExt = ext.isEmpty ? "bin" : ext.filter { $0.isASCII }
        let folder = caseId.map { "case_documents/\($0)" } ?? "discussion_general"
        let path = "\(folder)/\(Int(Date().timeIntervalSince1970))_att.\(safeExt)"

        let url = try await storageUpload(
            bucket: "documents", path: path, data: data, mime: mime
        )

        struct DocRow: Codable { let id: String }
        let inserted = try await rawInsertReturning("documents", values: [
            "case_id": caseId ?? NSNull(),
            "name": fileName,
            "file_url": url,
            "file_path": path,
            "file_type": mime,
            "file_size": data.count,
            "uploaded_by_name": member?.name ?? NSNull(),
            "description": "أُرسل في النقاش",
        ])
        let rows = try JSONDecoder().decode([DocRow].self, from: inserted)
        guard let doc = rows.first else {
            throw SBError(message: "رُفع الملف لكن تعذّر تسجيله مستنداً")
        }
        return doc.id
    }

    func rawInsertReturning(_ table: String, values: [String: Any]) async throws -> Data {
        let body = try JSONSerialization.data(withJSONObject: values)
        return try await raw(
            path: "rest/v1/\(table)", method: "POST", query: [],
            body: body, prefer: "return=representation"
        )
    }

    /// تعليم مقروءة — upsert على (case_id, member_id)
    func markRead(caseId: String?) async throws {
        guard let me = member?.id else { return }
        try await upsert(
            table: "case_reads",
            values: [
                "case_id": caseId ?? NSNull(),
                "member_id": me,
                "read_at": ISO8601DateFormatter().string(from: Date()),
            ],
            onConflict: "case_id,member_id"
        )
    }

    // ===== التفاعل والحفظ والتحرير =====

    func toggleReaction(commentId: String, emoji: String, currentlyMine: Bool) async throws {
        guard let me = member?.id else { return }
        if currentlyMine {
            try await delete("case_comment_reactions", query: [
                ("comment_id", "eq.\(commentId)"),
                ("member_id", "eq.\(me)"),
                ("emoji", "eq.\(emoji)"),
            ])
        } else {
            try await insertVoid("case_comment_reactions", values: [
                "comment_id": commentId, "member_id": me, "emoji": emoji,
            ])
        }
    }

    func toggleBookmark(commentId: String, currentlyOn: Bool) async throws {
        guard let me = member?.id else { return }
        if currentlyOn {
            try await delete("case_comment_bookmarks", query: [
                ("comment_id", "eq.\(commentId)"),
                ("member_id", "eq.\(me)"),
            ])
        } else {
            try await insertVoid("case_comment_bookmarks", values: [
                "comment_id": commentId, "member_id": me,
            ])
        }
    }

    func bookmarks() async throws -> [BookmarkRow] {
        try await rpc("my_bookmarks", params: [:])
    }

    /// تعديل رسالتي — RLS يمنع تعديل رسائل الغير أصلاً
    func editMessage(id: String, body: String) async throws {
        try await patch("case_comments", query: [("id", "eq.\(id)")], values: [
            "body": body,
            "edited_at": ISO8601DateFormatter().string(from: Date()),
        ])
    }

    /// حذف ناعم لرسالتي
    func deleteMessage(id: String) async throws {
        try await patch("case_comments", query: [("id", "eq.\(id)")], values: [
            "deleted_at": ISO8601DateFormatter().string(from: Date()),
            "deleted_by": member?.name ?? "",
        ])
    }
}

// ===== مركز الإشعارات =====

extension SB {
    /// إشعاراتي — الأحدث أولاً
    func notifications(limit: Int = 50) async throws -> [AppNotification] {
        guard let me = member?.id else { return [] }
        return try await get("notifications", query: [
            ("select", "id,type,title,message,case_id,task_id,is_read,created_at"),
            ("recipient_id", "eq.\(me)"),
            ("order", "created_at.desc"),
            ("limit", "\(limit)"),
        ])
    }

    func markNotificationRead(id: String) async throws {
        try await patch("notifications", query: [("id", "eq.\(id)")],
                        values: ["is_read": true])
    }

    func markAllNotificationsRead() async throws {
        guard let me = member?.id else { return }
        try await patch("notifications", query: [
            ("recipient_id", "eq.\(me)"),
            ("is_read", "eq.false"),
        ], values: ["is_read": true])
    }

    /// مهمة واحدة — لفتحها من إشعارها
    func task(id: String) async throws -> TaskRow? {
        let rows: [TaskRow] = try await get("tasks", query: [
            ("select", "id,title,status,due_date,priority,is_urgent,notes,description,case_id,assignee_id,cases(title)"),
            ("id", "eq.\(id)"),
            ("limit", "1"),
        ])
        return rows.first
    }
}

// ===== تأجيل مهمة =====

extension SB {
    /// تأجيل مهمة لتاريخ جديد + توثيق التأجيل في نقاشها ليعرف الفريق
    func postponeTask(id: String, toISO: String, label: String) async throws {
        try await patch("tasks", query: [("id", "eq.\(id)")],
                        values: ["due_date": toISO])
        if let me = member?.id {
            try? await insertVoid("task_comments", values: [
                "task_id": id,
                "author_id": me,
                "body": "⏳ أُجّلت المهمة إلى \(label)",
            ])
        }
    }
}

// ===== قائمة الملفات — لبدء نقاش ملفٍ لم يبدأ نقاشه =====

struct MatterLite: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let office_num: String?
    let kind: String?
}

extension SB {
    func matters() async throws -> [MatterLite] {
        try await get("cases", query: [
            ("select", "id,title,office_num,kind"),
            ("deleted_at", "is.null"),
            ("order", "created_at.desc"),
            ("limit", "300"),
        ])
    }
}
