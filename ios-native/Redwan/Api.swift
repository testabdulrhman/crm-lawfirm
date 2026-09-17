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

    /// مهام أُنجزت منذ منتصف ليل اليوم (توقيت الجهاز) — «المكتملة» في الرئيسية
    func doneTodayCount(scope: String) async throws -> Int {
        struct IdRow: Codable { let id: String }
        let midnight = Calendar(identifier: .gregorian).startOfDay(for: Date())
        var q: [(String, String)] = [
            ("select", "id"),
            ("status", "eq.done"),
            ("deleted_at", "is.null"),
            ("done_at", "gte.\(ISO8601DateFormatter().string(from: midnight))"),
        ]
        if scope != "all", let me = member?.id {
            q.append(("assignee_id", "eq.\(me)"))
        }
        let rows: [IdRow] = try await get("tasks", query: q)
        return rows.count
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
                title: r.client_name ?? "موعد", subtitle: sub, apptId: r.id
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

    /// «الملفات والروابط»: رسائل بمرفق أو برابط، في نقاش واحد أو في كل ما أراه —
    /// نفس استعلام الويب (useDiscussionMedia)، والصلاحيات تحصرها القاعدة
    func discussionMedia(caseId: String?, all: Bool) async throws -> [MediaMsg] {
        var q: [(String, String)] = [
            ("select", "id,case_id,parent_id,author_id,body,kind,created_at,document:documents!case_comments_document_id_fkey(id,name,file_url,file_type,file_size)"),
            ("deleted_at", "is.null"),
            ("or", "(document_id.not.is.null,body.ilike.*http*,body.ilike.*www.*)"),
            ("order", "created_at.desc"),
            ("limit", all ? "500" : "300"),
        ]
        if !all { q.append(("case_id", caseId.map { "eq.\($0)" } ?? "is.null")) }
        return try await get("case_comments", query: q)
    }

    /// الرسالة التي كُتبت في لحظة بعينها داخل نقاش — إشعار المنشن يحمل وقتها لا معرّفها
    func messageAt(caseId: String?, at: String) async throws -> (id: String, parentId: String?)? {
        struct Row: Codable { let id: String; let parent_id: String? }
        let rows: [Row] = try await get("case_comments", query: [
            ("select", "id,parent_id"),
            ("created_at", "eq.\(Self.urlSafeStamp(at))"),
            ("case_id", caseId.map { "eq.\($0)" } ?? "is.null"),
            ("deleted_at", "is.null"),
            ("limit", "1"),
        ])
        return rows.first.map { ($0.id, $0.parent_id) }
    }

    /// وقت آخر منشن لي في هذا النقاش — نقرة إشعار الدفع لا تحمل غير رقم النقاش
    func latestMentionAt(caseId: String?) async throws -> String? {
        struct Row: Codable { let created_at: String? }
        guard let me = member?.id else { return nil }
        let rows: [Row] = try await get("notifications", query: [
            ("select", "created_at"),
            ("recipient_id", "eq.\(me)"),
            ("type", "eq.mention"),
            ("case_id", caseId.map { "eq.\($0)" } ?? "is.null"),
            ("order", "created_at.desc"),
            ("limit", "1"),
        ])
        return rows.first?.created_at
    }

    /// «+00:00» في رابط الاستعلام يُقرأ فراغاً عند الخادم — Z تعني الشيء نفسه بلا ترميز
    static func urlSafeStamp(_ s: String) -> String {
        s.hasSuffix("+00:00") ? String(s.dropLast(6)) + "Z" : s
    }

    /// ردود خيط واحد — مخصّبة بالتفاعلات والمحفوظات
    func thread(rootId: String) async throws -> [ThreadMsg] {
        try await rpc("case_thread", params: ["p_root": rootId])
    }

    /// موظفو المكتب النشطون — قائمة المنشن في النقاش
    // ===== جهات الاتصال — لمنتقي الموكّل عند إنشاء موعد (2026-09-11) =====

    /// جهات الاتصال للاختيار منها؛ البحث محلي بالعربية المطبَّعة كبقية المنتقيات
    /// جهات الاتصال للمنتقي — البحث محلي بالعربية المطبَّعة.
    /// ⚠️ السقف ٢٠٠٠ وعددها اليوم ٧٨٨؛ إن تجاوزتها يوماً فانقل البحث للخادم
    ///    وإلا اختفت الجهات الأخيرة من المنتقي بلا أثر.
    func contacts(limit: Int = 2000) async throws -> [ContactLite] {
        try await get("contacts", query: [
            ("select", "id,name,phone"),
            ("order", "name.asc"),
            ("limit", String(limit)),
        ])
    }

    // ===== المواعيد =====

    /// مواعيد يوم واحد — لفحص التعارض قبل الحفظ (المكتب تقويم واحد: قيد
    /// استبعاد في القاعدة يمنع التداخل، فنكشفه قبل الإرسال برسالة مفهومة)
    func appointmentsOn(dateISO: String) async throws -> [ApptLite] {
        try await get("appointments", query: [
            ("select", "id,client_name,appointment_time,duration_minutes,status"),
            ("appointment_date", "eq.\(dateISO)"),
            ("status", "neq.cancelled"),
        ])
    }

    /// الرقم المرجعي — نفس RPC الذي يستعمله الويب (بدونه تصل رسالة التأكيد
    /// بمرجع فارغ؛ درس 2026-08-26)
    func nextBookingReference() async throws -> String? {
        let v: String? = try? await rpc("next_booking_reference", params: [:])
        return v
    }

    /// إنشاء موعد. ⚠️ ترقر في القاعدة يرسل رسالة تأكيد للموكّل فور الإدراج
    /// متى كان status='confirmed' وللموكّل جوال — كما في الويب تماماً.
    func createAppointment(_ values: [String: Any]) async throws -> String? {
        let body = try JSONSerialization.data(withJSONObject: values)
        let data = try await raw(
            path: "rest/v1/appointments", method: "POST", query: [],
            body: body, prefer: "return=representation"
        )
        struct R: Codable { let id: String }
        return (try? JSONDecoder().decode([R].self, from: data))?.first?.id
    }

    private static let APPT_COLS =
        "id,reference_no,client_name,client_phone,client_email,company_name,appointment_date," +
        "appointment_time,duration_minutes,meeting_method,meeting_link,service_type,status,notes," +
        "source,created_by,created_at,confirmation_sent_at,meeting_link_sent_at,client_id"

    func appointment(id: String) async throws -> AppointmentFull? {
        let rows: [AppointmentFull] = try await get("appointments", query: [
            ("select", SB.APPT_COLS), ("id", "eq.\(id)"), ("limit", "1")])
        return rows.first
    }

    /// مواعيد اليوم فصاعداً — الأقرب أولاً (ما يفتحه إشعار الحجز)
    func upcomingAppointments(limit: Int = 100) async throws -> [AppointmentFull] {
        try await get("appointments", query: [
            ("select", SB.APPT_COLS),
            ("appointment_date", "gte.\(Fmt.todayISO())"),
            ("order", "appointment_date.asc,appointment_time.asc"),
            ("limit", String(limit))])
    }

    func setAppointmentStatus(_ id: String, status: String) async throws {
        try await patch("appointments", query: [("id", "eq.\(id)")], values: ["status": status])
    }

    func setAppointmentGcalId(_ id: String, eventId: String) async throws {
        try await patch("appointments", query: [("id", "eq.\(id)")], values: ["gcal_event_id": eventId])
    }

    // ===== النقاشات المُسمّاة (قنوات بعضوية) =====

    /// ذرّي في القاعدة: الصف + الأعضاء + رسالة «أنشأ… وأضاف…» — وللمدير فقط.
    /// ⚠️ لا JSONDecoder: الدالة تُرجع uuid نصاً مجرّداً، فيُقرأ كما هو
    func createChannel(title: String, memberIds: [String]) async throws -> String {
        let body = try JSONSerialization.data(withJSONObject: ["p_title": title, "p_member_ids": memberIds])
        let data = try await raw(path: "rest/v1/rpc/create_channel", method: "POST", query: [], body: body)
        let id = String(decoding: data, as: UTF8.self)
            .trimmingCharacters(in: CharacterSet(charactersIn: "\" \n"))
        guard !id.isEmpty else { throw SBError(message: "تعذّر إنشاء النقاش") }
        return id
    }

    func channelMemberIds(_ channelId: String) async throws -> Set<String> {
        struct R: Codable { let member_id: String }
        let rows: [R] = try await get("channel_members", query: [
            ("select", "member_id"), ("channel_id", "eq.\(channelId)")])
        return Set(rows.map(\.member_id))
    }

    /// الإضافة تُشعر العضو من القاعدة (ترقر channel_member_added_notify)
    func addChannelMember(_ channelId: String, memberId: String) async throws {
        var v: [String: Any] = ["channel_id": channelId, "member_id": memberId]
        if let me = member?.id { v["added_by"] = me }
        try await insertVoid("channel_members", values: v)
    }

    func removeChannelMember(_ channelId: String, memberId: String) async throws {
        try await delete("channel_members", query: [
            ("channel_id", "eq.\(channelId)"), ("member_id", "eq.\(memberId)")])
    }

    func renameChannel(_ channelId: String, title: String) async throws {
        try await patch("cases", query: [("id", "eq.\(channelId)"), ("kind", "eq.channel")],
                        values: ["title": title])
    }

    func staff() async throws -> [TeamMember] {
        try await get("team_members", query: [
            ("select", "id,name,short_name,is_director,is_reviewer,avatar_initial,avatar_color,avatar_url"),
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
    /// ملف واحد بخفّة (نوع + رقم + عنوان) — لرقاقة الملف في شريط النقاش حين
    /// لا يعرف المنادي نوعه (المحفوظات، إشعار المنشن قبل تحميل الصفوف)
    func matter(id: String) async throws -> MatterLite? {
        let rows: [MatterLite] = try await get("cases", query: [
            ("select", "id,title,office_num,kind"),
            ("id", "eq.\(id)"),
            ("limit", "1"),
        ])
        return rows.first
    }

    func matters() async throws -> [MatterLite] {
        try await get("cases", query: [
            ("select", "id,title,office_num,kind"),
            ("deleted_at", "is.null"),
            ("order", "created_at.desc"),
            ("limit", "300"),
        ])
    }
}


// ===== الخدمة الذاتية للموظف («صفحتي») =====
// نفس جداول الويب تحت RLS: الموظف طلباته وقيوده، والمدير الكل. الإشعارات من الترقرات.

extension SB {
    private static let HR_SELECT =
        "id,member_id,kind,leave_type,start_date,end_date,from_time,to_time,reason,status," +
        "decision_note,decided_at,created_at," +
        "member:team_members!hr_requests_member_id_fkey(id,name,short_name,avatar_initial,avatar_color,avatar_url)"

    func myProfile() async throws -> MyProfile? {
        guard let id = member?.id else { return nil }
        let rows: [MyProfile] = try await get("team_members", query: [
            ("select", "id,name,role,email,phone,join_date,national_address,bank_name,bank_iban,qualifications," +
                       "emergency_contact_name,emergency_contact_phone,emergency_contact_relation"),
            ("id", "eq.\(id)"), ("limit", "1")])
        return rows.first
    }

    /// الحقول التي يحدّثها الموظف بنفسه — الهوية وتاريخ التعيين يحرسها ترقر القاعدة للمدير
    func updateMyProfile(_ values: [String: Any]) async throws {
        guard let id = member?.id else { throw SBError(message: "لم يُحمَّل ملفك بعد — أعد فتح التطبيق") }
        try await patch("team_members", query: [("id", "eq.\(id)")], values: values)
    }

    func leaveBalance(memberId: String? = nil) async throws -> LeaveBalance {
        var p: [String: Any] = [:]
        if let memberId { p["p_member"] = memberId }
        return try await rpc("leave_balance", params: p)
    }

    func myHrRequests() async throws -> [HrRequestRow] {
        guard let id = member?.id else { return [] }
        return try await get("hr_requests", query: [
            ("select", SB.HR_SELECT), ("member_id", "eq.\(id)"),
            ("order", "created_at.desc"), ("limit", "100")])
    }

    /// للمدير — RLS يحصر غيره على طلباته
    func teamHrRequests() async throws -> [HrRequestRow] {
        try await get("hr_requests", query: [
            ("select", SB.HR_SELECT), ("order", "created_at.desc"), ("limit", "150")])
    }

    func pendingHrCount() async throws -> Int {
        struct R: Codable { let id: String }
        let rows: [R] = try await get("hr_requests", query: [
            ("select", "id"), ("status", "eq.pending"), ("limit", "200")])
        return rows.count
    }

    func createHrRequest(_ values: [String: Any]) async throws {
        guard let id = member?.id else { throw SBError(message: "لم يُحمَّل ملفك بعد — أعد فتح التطبيق") }
        var v = values
        v["member_id"] = id
        v["status"] = "pending"
        try await insertVoid("hr_requests", values: v)
    }

    /// مشروط بالمعلّق: صفر صفوف = بُتّ فيه قبل الإلغاء (درس «توست نجاح كاذب» في الويب)
    func cancelHrRequest(_ id: String) async throws {
        let n = try await patchReturningCount("hr_requests",
            query: [("id", "eq.\(id)"), ("status", "eq.pending")], values: ["status": "cancelled"])
        if n == 0 { throw SBError(message: "الطلب لم يعد معلّقاً — بُتّ فيه قبل الإلغاء") }
    }

    func decideHrRequest(_ id: String, approve: Bool, note: String?) async throws {
        var v: [String: Any] = [
            "status": approve ? "approved" : "rejected",
            "decided_at": ISO8601DateFormatter().string(from: Date()),
        ]
        if let me = member?.id { v["decided_by"] = me }
        if let note, !note.isEmpty { v["decision_note"] = note }
        let n = try await patchReturningCount("hr_requests",
            query: [("id", "eq.\(id)"), ("status", "eq.pending")], values: v)
        if n == 0 { throw SBError(message: "الطلب لم يعد معلّقاً — ربما ألغاه صاحبه") }
    }

    func myPayroll() async throws -> [PayrollRow] {
        guard let id = member?.id else { return [] }
        return try await get("payroll_entries", query: [
            ("select", "id,entry_type,amount,entry_date,note,file_url"),
            ("team_member_id", "eq.\(id)"), ("deleted_at", "is.null"),
            ("order", "entry_date.desc"), ("limit", "200")])
    }

    private func patchReturningCount(_ table: String, query: [(String, String)], values: [String: Any]) async throws -> Int {
        let body = try JSONSerialization.data(withJSONObject: values)
        let data = try await raw(path: "rest/v1/\(table)", method: "PATCH",
                                 query: query + [("select", "id")], body: body, prefer: "return=representation")
        struct R: Codable { let id: String }
        return (try? JSONDecoder().decode([R].self, from: data))?.count ?? 0
    }
}


// ===== إيصالات القراءة (مثل الواتساب) =====
// الحساب في القاعدة: case_reads يحجب صفوف الآخرين، فالدالتان تُرجعان للمُرسل وحده ما يخصّ رسائله.

extension SB {
    /// علامات رسائلي في مجرى نقاش — caseId فارغ = العامة
    func streamReadCounts(caseId: String?) async throws -> [String: ReadCount] {
        let rows: [ReadCount] = try await rpc("stream_read_counts", params: ["p_case_id": caseId ?? NSNull()])
        return Dictionary(rows.map { ($0.comment_id, $0) }, uniquingKeysWith: { a, _ in a })
    }

    func readReceipts(commentId: String) async throws -> ReadReceipts {
        try await rpc("message_read_receipts", params: ["p_comment_id": commentId])
    }
}
