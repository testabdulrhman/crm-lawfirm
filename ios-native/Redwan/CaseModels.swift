import Foundation

// نماذج «ملف القضية» على الجوال — ثلاثية المحكمة (2026-09-02):
// فتح الملف من الجوال، قراءة ملخّص ما قبل الجلسة، وإغلاق الجلسة من القاعة.
// كلها تطابق أعمدة PostgREST حرفياً (snake_case) كبقية النماذج.

struct ContactLite: Codable, Equatable {
    let id: String?
    let name: String?
    let phone: String?
}

/// عضو فريق الملف (case_members) — زميل أُشرك في الملف بلا أن يكون مسؤوله
struct CaseMemberRow: Codable, Identifiable {
    let case_id: String
    let member_id: String
    let role: String?
    let member: TeamMember?
    var id: String { member_id }
}

struct MemberLite: Codable, Equatable {
    let id: String?
    let name: String?
    let short_name: String?
}

/// صف في قائمة «الملفات»
struct CaseRow: Codable, Identifiable, Hashable {
    let id: String
    /// case · legal_service · property · bankruptcy
    let kind: String?
    let bankruptcy_stage: String?
    let office_num: String?
    let court_num: String?
    let title: String?
    let type: String?
    let status: String?
    let court: String?
    let hearing_date: String?
    let contact: ContactLite?

    static func == (a: CaseRow, b: CaseRow) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

/// الملف كاملاً — رأس الشاشة وتبويب «نظرة»
struct CaseFull: Codable {
    let id: String
    let kind: String?
    let bankruptcy_stage: String?
    let office_num: String?
    let court_num: String?
    let title: String?
    let type: String?
    let status: String?
    let court: String?
    let court_division: String?
    let subject: String?
    let agreed_scope: String?
    let open_date: String?
    let close_date: String?
    let hearing_date: String?
    let hearing_label: String?
    let contact: ContactLite?
    let assignee: MemberLite?
}

struct CaseParty: Codable, Identifiable {
    let id: String
    let role: String?
    let party_side: String?
    let name: String?
    let phone: String?
    let id_number: String?
}

/// جلسة كما في تبويب الجلسات على الويب
struct CaseSession: Codable, Identifiable, Equatable {
    let id: String
    let case_id: String?
    let session_number: Int?
    let title: String?
    let session_date: String?
    let session_time: String?
    let court: String?
    let status: String?
    let preparation: String?
    let outcome: String?
    let minutes_url: String?
    let closed_at: String?
    let next_action: String?
    let ruling_due_date: String?
    let report_sent_at: String?
    let report_sent_via: String?

    var isClosed: Bool { closed_at != nil }

    /// نفس تطبيع الويب: مغلقة · مؤجّلة · منتهية (فاتت بلا إغلاق) · منعقدة (اليوم) · قادمة
    var displayStatus: String {
        if isClosed { return "مُغلقة" }
        let raw = (status ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        if raw == "postponed" || raw == "مؤجّلة" || raw == "مؤجلة" { return "مؤجّلة" }
        guard let d = session_date else { return "قادمة" }
        let today = Fmt.todayISO()
        if d < today { return "منتهية" }
        if d == today { return "منعقدة" }
        return "قادمة"
    }

    /// منعقدة أو منتهية وغير مغلقة — لحظة «سجّل النتيجة»
    var needsClosure: Bool {
        !isClosed && (displayStatus == "منعقدة" || displayStatus == "منتهية")
    }
}

struct SessionBrief: Codable, Identifiable {
    let session_id: String
    let brief: String?
    let generated_at: String?
    var id: String { session_id }
}

/// حدث في «قصة الملف» (matter_events — سرد بالمتكلم)
struct MatterEvent: Codable, Identifiable {
    let id: String
    let kind: String?
    let sentence: String?
    let actor_name: String?
    let created_at: String?
}

/// دراسة القضية الحيّة (case_studies v2)
struct CaseStudyRow: Codable {
    let version: Int?
    let generated_at: String?
    let generated_by: String?
    let stale_since: String?
    let what_changed: String?
    let basics: String?
    let timeline: String?
    let facts: String?
    let requests: String?
    let plaintiff_grounds: String?
    let defendant_defenses: String?
    let references_list: String?
    let legal_opinion: String?
    let suitability: String?
    let attachments_list: String?
    let precedents: String?
    let statutes: String?

    /// الأقسام بترتيب القراءة على الجوال — الرأي والتوصية أولاً لأنهما ما يُقرأ في الطريق
    var sections: [(title: String, text: String)] {
        let all: [(String, String?)] = [
            ("الرأي القانوني", legal_opinion),
            ("الملاءمة والتوصية", suitability),
            ("ما الذي تغيّر", what_changed),
            ("الوقائع", facts),
            ("الطلبات", requests),
            ("أسانيد المدعي", plaintiff_grounds),
            ("دفوع المدعى عليه", defendant_defenses),
            ("الأسانيد النظامية", statutes),
            ("سوابق المكتب", precedents),
            ("التسلسل الزمني", timeline),
            ("بيانات القضية", basics),
            ("المراجع", references_list),
            ("المرفقات", attachments_list),
        ]
        return all.compactMap { t, v in
            guard let v, !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return (t, v)
        }
    }
}

struct StudyProposal: Codable, Identifiable {
    let id: String
    let kind: String?
    let title: String?
    let detail: String?
    let due_date: String?
    let priority: String?
    let status: String?
}

/// مستند في الملف (documents) — category/description يكتبهما classify-doc
struct DocumentRow: Codable, Identifiable {
    let id: String
    let name: String?
    let category: String?
    let description: String?
    let file_url: String?
    let file_type: String?
    let created_at: String?
    let case_id: String?
    let suggested_case_id: String?
}

/// جلسة تحتاج إغلاقاً (sessions_need_closure RPC — نفس الويب)
struct SessionNeedingClosure: Codable, Identifiable {
    let id: String
    let case_id: String
    let case_title: String?
    let title: String?
    let session_date: String?
    let days_ago: Int?
}

/// ما تُرجعه close_session — الموكّل وجواله لإرسال التقرير
struct CloseSessionResult: Codable {
    let session_id: String?
    let case_id: String?
    let new_session_id: String?
    let client_name: String?
    let client_phone: String?
    let case_title: String?
}

// ===== تسميات مشتركة =====

func caseStatusLabel(_ s: String?) -> String {
    switch s {
    case "jarri": return "جارية"
    case "muntahia": return "منتهية"
    case "muallaq": return "معلّقة"
    // الاستشارات/اللوائح لها قاموسها — ظهرت بالإنجليزية حين اختلطت القائمة
    case "draft": return "مسودة"
    case "in_progress": return "قيد العمل"
    case "review": return "مراجعة"
    case "delivered": return "مُسلَّمة"
    default: return s ?? "—"
    }
}

/// نوع المشروع — نفس مفردات الويب (MattersPage) حرفياً
func matterKindLabel(_ k: String?) -> String {
    switch k {
    case "case": return "قضية"
    case "legal_service": return "استشارة / لائحة"
    case "property": return "توثيق عقاري"
    case "bankruptcy": return "إجراء إفلاس"
    default: return "مشروع"
    }
}

/// أنواع المشاريع التي تشارك القضايا حالاتها (جارية/معلّقة/منتهية).
/// غيرها له قاموسه (الاستشارة draft/delivered، والتوثيق «مكتملة») فلا يُفلتر بها.
func sharesCaseStatuses(_ k: String?) -> Bool {
    k == "case" || k == "bankruptcy" || k == nil
}

/// مراحل إجراء الإفلاس — نفس ترتيب BANKRUPTCY_STAGES في الويب
func bankruptcyStageLabel(_ s: String?) -> String {
    switch s {
    case "filed": return "تقديم الطلب"
    case "opened": return "افتتاح الإجراء"
    case "trustee": return "تعيين الأمين"
    case "claims": return "حصر الديون"
    case "plan": return "اقتراح الخطة"
    case "vote": return "تصويت الدائنين"
    case "ratified": return "التصديق"
    case "closed": return "انتهاء الإجراء"
    default: return "—"
    }
}

func partySideLabel(_ s: String?) -> String {
    switch s {
    case "plaintiff": return "مدّعٍ"
    case "defendant": return "مدّعى عليه"
    default: return s ?? ""
    }
}

func nextActionLabel(_ a: String?) -> String {
    switch a {
    case "next_session": return "الخطوة: جلسة قادمة"
    case "await_ruling": return "الخطوة: انتظار الحكم"
    case "case_closed": return "الخطوة: انتهت القضية"
    default: return ""
    }
}

/// رقم سعودي بصيغة دولية 9665XXXXXXXX — نفس normalizeSaudiPhone في الويب
func normalizeSaudiPhone(_ raw: String?) -> String? {
    var p = (raw ?? "").filter { $0.isNumber }
    if p.hasPrefix("00966") { p.removeFirst(2) }
    else if p.hasPrefix("966") { }
    else if p.hasPrefix("05") { p = "966" + p.dropFirst() }
    else if p.hasPrefix("5") { p = "966" + p }
    return p.count == 12 ? p : nil
}

extension Fmt {
    /// طابع زمني من PostgREST (بكسور ثوانٍ أو بدونها) → «d MMM · h:mm م»
    static func stamp(_ iso: String?) -> String {
        guard let iso, let d = parseStamp(iso) else { return "" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA@numbers=latn")
        f.calendar = Calendar(identifier: .gregorian)
        f.dateFormat = "d MMM yyyy · h:mm a"
        return f.string(from: d)
    }

    static func parseStamp(_ iso: String) -> Date? {
        // نُسقط كسور الثواني: ISO8601DateFormatter صارم في عدد خاناتها
        let cleaned = iso.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: cleaned) ?? f.date(from: cleaned + "Z")
    }
}
