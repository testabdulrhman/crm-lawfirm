import Foundation

// طبقة بيانات «ملف القضية» — نفس استعلامات الويب تحت RLS حرفياً
// (useCases / useCaseSessions / useMatterEvents / useCaseStudy / useSessionBrief).

extension SB {
    // ===== قائمة الملفات =====

    /// **كل** المشاريع لا القضايا وحدها — قضية · استشارة/لائحة · توثيق عقاري ·
    /// إجراء إفلاس. (كان الاستعلام يفلتر `kind=eq.case` فيخفي البقية رغم أن
    /// التبويب اسمه «المشاريع».) القنوات وحدها تُستثنى: ليست ملفاً.
    /// الأحدث أولاً؛ البحث والفرز محليان بالعربية المطبَّعة.
    func cases() async throws -> [CaseRow] {
        try await get("cases", query: [
            ("select", "id,kind,office_num,court_num,title,type,status,court,hearing_date,bankruptcy_stage,contact:contacts!cases_contact_id_fkey(id,name,phone)"),
            ("kind", "neq.channel"),
            ("deleted_at", "is.null"),
            ("order", "created_at.desc"),
            ("limit", "500"),
        ])
    }

    // ===== الملف الواحد =====

    func caseFull(id: String) async throws -> CaseFull? {
        let rows: [CaseFull] = try await get("cases", query: [
            ("select", "id,kind,bankruptcy_stage,office_num,court_num,title,type,status,court,court_division,subject,agreed_scope,open_date,close_date,hearing_date,hearing_label,contact:contacts!cases_contact_id_fkey(id,name,phone),assignee:team_members!cases_assignee_id_fkey(id,name,short_name)"),
            ("id", "eq.\(id)"),
            ("limit", "1"),
        ])
        return rows.first
    }

    func caseParties(caseId: String) async throws -> [CaseParty] {
        try await get("case_parties", query: [
            ("select", "id,role,party_side,name,phone,id_number"),
            ("case_id", "eq.\(caseId)"),
            ("order", "created_at.asc"),
        ])
    }

    // ===== فريق الملف (case_members) — نفس استعلام useCaseMembers في الويب =====

    func caseMembers(caseId: String) async throws -> [CaseMemberRow] {
        try await get("case_members", query: [
            ("select", "case_id,member_id,role,member:team_members!case_members_member_id_fkey(id,name,short_name,is_director,avatar_initial,avatar_color,avatar_url)"),
            ("case_id", "eq.\(caseId)"),
            ("order", "created_at.asc"),
        ])
    }

    /// الإشراك: المدير أو مسؤول الملف (تحكمه سياسة case_members_write)؛ الإشعار
    /// للمُضاف يكتبه ترقر القاعدة (case_member_notify) فلا يُرسل من هنا.
    func addCaseMember(caseId: String, memberId: String, addedBy: String?) async throws {
        try await insertVoid("case_members", values: [
            "case_id": caseId, "member_id": memberId, "role": "متعاون",
            "added_by": addedBy ?? NSNull(),
        ])
    }

    func removeCaseMember(caseId: String, memberId: String) async throws {
        try await delete("case_members", query: [
            ("case_id", "eq.\(caseId)"), ("member_id", "eq.\(memberId)"),
        ])
    }

    func caseSessions(caseId: String) async throws -> [CaseSession] {
        try await get("sessions", query: [
            ("select", "id,case_id,session_number,title,session_date,session_time,court,status,preparation,outcome,minutes_url,closed_at,next_action,ruling_due_date,report_sent_at,report_sent_via"),
            ("case_id", "eq.\(caseId)"),
            ("order", "session_date.desc,session_time.desc.nullslast"),
        ])
    }

    func sessionBriefs(caseId: String) async throws -> [SessionBrief] {
        try await get("session_briefs", query: [
            ("select", "session_id,brief,generated_at"),
            ("case_id", "eq.\(caseId)"),
        ])
    }

    /// قصة الملف — الأحدث أولاً (نفس useMatterEvents)
    func matterEvents(caseId: String, limit: Int = 80) async throws -> [MatterEvent] {
        try await get("matter_events", query: [
            ("select", "id,kind,sentence,actor_name,created_at"),
            ("matter_id", "eq.\(caseId)"),
            ("order", "created_at.desc"),
            ("limit", "\(limit)"),
        ])
    }

    func caseStudy(caseId: String) async throws -> CaseStudyRow? {
        let rows: [CaseStudyRow] = try await get("case_studies", query: [
            ("select", "version,generated_at,generated_by,stale_since,what_changed,basics,timeline,facts,requests,plaintiff_grounds,defendant_defenses,references_list,legal_opinion,suitability,attachments_list,precedents,statutes"),
            ("case_id", "eq.\(caseId)"),
            ("limit", "1"),
        ])
        return rows.first
    }

    func studyProposals(caseId: String) async throws -> [StudyProposal] {
        try await get("case_study_proposals", query: [
            ("select", "id,kind,title,detail,due_date,priority,status"),
            ("case_id", "eq.\(caseId)"),
            ("status", "eq.proposed"),
            ("order", "due_date.asc.nullslast"),
        ])
    }

    // ===== المستندات =====

    func caseDocuments(caseId: String) async throws -> [DocumentRow] {
        try await get("documents", query: [
            ("select", "id,name,category,description,file_url,file_type,created_at,case_id,suggested_case_id"),
            ("case_id", "eq.\(caseId)"),
            ("deleted_at", "is.null"),
            ("order", "created_at.desc"),
        ])
    }

    func document(id: String) async throws -> DocumentRow? {
        let rows: [DocumentRow] = try await get("documents", query: [
            ("select", "id,name,category,description,file_url,file_type,created_at,case_id,suggested_case_id"),
            ("id", "eq.\(id)"),
            ("limit", "1"),
        ])
        return rows.first
    }

    func matterLite(id: String) async throws -> MatterLite? {
        let rows: [MatterLite] = try await get("cases", query: [
            ("select", "id,title,office_num,kind"),
            ("id", "eq.\(id)"),
            ("limit", "1"),
        ])
        return rows.first
    }

    /// رفع مستند ممسوح (PDF) وتسجيله — الوصف يُترك فارغاً عمداً كي يكتب
    /// classify-doc عنوانه وملخّصه (يحافظ على أي وصف بشري موجود).
    /// المسار ASCII: مفاتيح التخزين ترفض العربية، والاسم العربي في documents.name.
    func uploadDocument(data: Data, name: String, mime: String, caseId: String?) async throws -> String {
        let ext = mime == "application/pdf" ? "pdf" : "jpg"
        let folder = caseId.map { "case_documents/\($0)" } ?? "scans"
        let path = "\(folder)/\(Int(Date().timeIntervalSince1970))_scan.\(ext)"
        let url = try await storageUpload(bucket: "documents", path: path, data: data, mime: mime)
        struct DocRow: Codable { let id: String }
        let inserted = try await rawInsertReturning("documents", values: [
            "case_id": caseId ?? NSNull(),
            "name": name,
            "file_url": url,
            "file_path": path,
            "file_type": mime,
            "file_size": data.count,
            "uploaded_by": member?.id ?? NSNull(),
            "uploaded_by_name": member?.name ?? NSNull(),
        ])
        let rows = try JSONDecoder().decode([DocRow].self, from: inserted)
        guard let doc = rows.first else { throw SBError(message: "رُفع الملف لكن تعذّر تسجيله مستنداً") }
        return doc.id
    }

    // ===== إغلاق الجلسة (نفس دالة الويب close_session) =====

    func sessionsNeedClosure(scope: String) async throws -> [SessionNeedingClosure] {
        try await rpc("sessions_need_closure", params: ["p_scope": scope])
    }

    func closeSession(
        sessionId: String,
        outcome: String,
        nextAction: String,
        nextSessionDate: String?,
        nextSessionTime: String?,
        rulingDueDate: String?
    ) async throws -> CloseSessionResult {
        try await rpc("close_session", params: [
            "p_session_id": sessionId,
            "p_outcome": outcome,
            "p_minutes_url": NSNull(),
            "p_next_action": nextAction,
            "p_next_session_date": nextSessionDate ?? NSNull(),
            "p_next_session_time": nextSessionTime ?? NSNull(),
            "p_ruling_due_date": rulingDueDate ?? NSNull(),
        ])
    }

    func markSessionReportSent(sessionId: String, via: String) async throws {
        try await patch("sessions", query: [("id", "eq.\(sessionId)")], values: [
            "report_sent_at": ISO8601DateFormatter().string(from: Date()),
            "report_sent_via": via,
        ])
    }

    /// قالب تقرير الجلسة — نسخة الواتساب إن وُجدت وإلا النصية (نفس getTemplateVariants)
    func sessionReportTemplate() async -> (sms: String, whatsapp: String) {
        struct T: Codable { let body: String?; let body_whatsapp: String?; let is_active: Bool? }
        let fallback = "عميلنا الكريم {client_name}\nنفيدكم بشأن قضيتكم ({case_title}):\n{outcome}\nشركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس"
        let rows: [T] = (try? await get("message_templates", query: [
            ("select", "body,body_whatsapp,is_active"),
            ("key", "eq.session_report"),
            ("limit", "1"),
        ])) ?? []
        let sms = rows.first?.body.flatMap { $0.isEmpty ? nil : $0 } ?? fallback
        let wa = rows.first?.body_whatsapp.flatMap { $0.isEmpty ? nil : $0 } ?? sms
        return (sms, wa)
    }

    // ===== الإرسال للعميل — الدوال الخادمية نفسها التي يستعملها الويب =====

    /// نداء Edge Function بجلسة المستخدم — يُرجع الحمولة وحالة HTTP بلا رمي
    private func callFunctionAuthed(_ name: String, body: [String: Any]) async -> (code: Int, json: [String: Any]) {
        guard let s = session else { return (0, ["error": "انتهت الجلسة — سجّل الدخول من جديد"]) }
        var req = URLRequest(url: URL(string: "https://zwaahunavepleczuamuy.supabase.co/functions/v1/\(name)")!)
        req.httpMethod = "POST"
        req.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 120
        guard let (data, resp) = try? await URLSession.shared.data(for: req) else {
            return (0, ["error": "تعذّر الاتصال بالخادم"])
        }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        return (code, obj)
    }

    /// واتساب عبر whatsapp-send (هاتف) — يسجّل في sms_log خادميّاً
    func sendWhatsApp(phone: String, message: String, recipientName: String?) async -> String? {
        guard let num = normalizeSaudiPhone(phone) else { return "رقم الجوال غير صالح" }
        let r = await callFunctionAuthed("whatsapp-send", body: [
            "phone": num, "message": message, "recipient_name": recipientName ?? "عميل",
        ])
        if r.code == 200, r.json["success"] as? Bool == true { return nil }
        let detail = r.json["detail"] as? String
        let err = r.json["error"] as? String
        return detail?.isEmpty == false ? detail : (err ?? "تعذّر الإرسال عبر الواتساب (\(r.code))")
    }

    /// SMS عبر swift-endpoint (Msegat) — وتسجيل في sms_log كما يفعل الويب
    func sendSms(phone: String, message: String, recipientName: String?) async -> String? {
        guard let num = normalizeSaudiPhone(phone) else { return "رقم الجوال غير صالح" }
        let r = await callFunctionAuthed("swift-endpoint", body: ["numbers": num, "msg": message])
        let codeStr = (r.json["code"] as? String) ?? (r.json["code"] as? Int).map(String.init) ?? ""
        let ok = r.code == 200 && codeStr == "1"
        try? await insertVoid("sms_log", values: [
            "recipient_name": recipientName ?? "عميل",
            "phone": num,
            "message": message,
            "status": ok ? "sent" : "failed",
            "sent_by": member?.name ?? NSNull(),
        ])
        return ok ? nil : ((r.json["error"] as? String) ?? "تعذّر إرسال الرسالة النصية — تحقّق من الرقم ورصيد الرسائل")
    }

    /// توليد ملخّص ما قبل الجلسة الآن (session-brief) — يستغرق نحو نصف دقيقة
    func generateSessionBrief(sessionId: String) async -> String? {
        let r = await callFunctionAuthed("session-brief", body: [
            "session_id": sessionId, "user_name": member?.name ?? "الجوال", "force": true,
        ])
        if r.code == 200, (r.json["ok"] as? Bool) == true { return nil }
        return (r.json["error"] as? String) ?? "تعذّر توليد الملخّص (\(r.code))"
    }
}

/// تعبئة قالب رسالة — نفس fillTemplate في الويب
func fillTemplate(_ tpl: String, _ vars: [String: String]) -> String {
    var s = tpl
    for (k, v) in vars { s = s.replacingOccurrences(of: "{\(k)}", with: v) }
    return s
}
