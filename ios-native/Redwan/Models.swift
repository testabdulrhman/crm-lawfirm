import Foundation

// النماذج تطابق ما يُرجعه PostgREST حرفياً (snake_case) — التواريخ تبقى
// نصوصاً YYYY-MM-DD كما في الويب، والتنسيق مسؤولية Fmt وحدها.

struct TeamMember: Codable, Identifiable, Equatable {
    let id: String
    let name: String?
    let short_name: String?
    let is_director: Bool?
    /// حساب مراجعة أبل — يكتب بيانات تجريبية فقط ولا تنطلق له رسائل
    var is_reviewer: Bool? = nil
    let avatar_initial: String?
    let avatar_color: String?
    /// صورة الموظف من الويب — تُعرض بدل حرف الاسم متى وُجدت
    var avatar_url: String? = nil
}

struct CaseRef: Codable, Equatable, Hashable { let title: String? }

// ===== لوحة التحكم (dashboard_overview RPC — نفس دالة الويب) =====

struct DashStats: Codable {
    let cases_total: Int?
    let cases_active: Int?
    let open_tasks: Int?
    let overdue_tasks: Int?
    let upcoming_sessions: Int?
    let upcoming_appointments: Int?
    let expiring_poas: Int?
}

struct DashSession: Codable, Identifiable {
    let id: String
    let case_id: String?
    let title: String?
    let session_date: String?
    let session_time: String?
    let court: String?
    let case_title: String?
}

struct DashTask: Codable, Identifiable {
    let id: String
    let case_id: String?
    let title: String?
    let due_date: String?
    let priority: String?
    let is_urgent: Bool?
    let overdue: Bool?
    let case_title: String?
}

struct DashAppointment: Codable, Identifiable {
    let id: String
    let client_name: String?
    let appointment_date: String?
    let appointment_time: String?
    let status: String?
}

struct DashPOA: Codable, Identifiable {
    let id: String
    let poa_number: String?
    let client_name: String?
    let expiry_date: String?
    let days_left: Int?
}

struct DashboardOverview: Codable {
    let stats: DashStats
    let upcoming_sessions: [DashSession]?
    let tasks: [DashTask]?
    let appointments: [DashAppointment]?
    let expiring_poas: [DashPOA]?
}

// ===== المهام =====

struct TaskRow: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let status: String?
    let due_date: String?
    let priority: String?
    let is_urgent: Bool?
    let notes: String?
    let description: String?
    let case_id: String?
    let assignee_id: String?
    let cases: CaseRef?
}

struct CommentRow: Codable, Identifiable {
    let id: String
    let body: String?
    let created_at: String?
    let author_id: String?
    let author: TeamMember?
}

// قيم priority في القاعدة: high · med · low
func priorityLabel(_ p: String?) -> String {
    switch p {
    case "high": return "عالية"
    case "med": return "متوسطة"
    case "low": return "منخفضة"
    default: return p ?? "عادية"
    }
}

// ===== التقويم — عنصر موحّد من أربعة مصادر =====

enum CalKind: String, CaseIterable {
    case session, appointment, task, poa

    var label: String {
        switch self {
        case .session: return "جلسة"
        case .appointment: return "موعد"
        case .task: return "مهمة"
        case .poa: return "وكالة"
        }
    }
}

struct CalItem: Identifiable {
    let id: String
    let kind: CalKind
    /// YYYY-MM-DD — مفتاح التجميع في الشبكة
    let date: String
    /// HH:MM أو nil لما ليس له ساعة (مهمة، انتهاء وكالة)
    let time: String?
    let title: String
    let subtitle: String?
    /// معرف الملف — للجلسات فقط، يفتح ملف القضية بنقرة
    var caseId: String? = nil
    /// معرف الموعد — للمواعيد فقط، يفتح تفاصيله بنقرة
    var apptId: String? = nil
}

/// الموعد كاملاً — شاشة التفاصيل في التطبيق
struct AppointmentFull: Codable, Identifiable {
    let id: String
    let reference_no: String?
    let client_name: String?
    let client_phone: String?
    let client_email: String?
    let company_name: String?
    let appointment_date: String?
    let appointment_time: String?
    let duration_minutes: Int?
    let meeting_method: String?
    let meeting_link: String?
    let service_type: String?
    let status: String?
    let notes: String?
    let source: String?
    let created_by: String?
    let created_at: String?
    let confirmation_sent_at: String?
    let meeting_link_sent_at: String?
    let client_id: String?
}

// ===== نقاش القضايا بالخيوط =====

/// صف في تبويب «النقاشات» — case_id فارغ = القناة العامة «عام — المكتب»
struct DiscussionRow: Codable, Identifiable {
    let case_id: String?
    let case_title: String?
    let office_num: String?
    let last_body: String?
    let last_at: String?
    let last_author: String?
    let has_file: Bool?
    let unread: Int?
    /// نوع الملف (cases.kind) — تُرجعه case_discussions أصلاً؛ 'channel' = قناة
    /// خاصة لا ملف لها، وفارغ = القناة العامة. وجهة رقاقة الملف في شريط النقاش.
    let kind: String?

    var id: String { case_id ?? DiscussionRow.generalKey }
    var isGeneral: Bool { case_id == nil }

    static let generalKey = "general"

    /// الصف نفسه مقروءاً — يُطفأ محلياً لحظة القراءة قبل أن يؤكده الجلب
    func markedRead() -> DiscussionRow {
        DiscussionRow(case_id: case_id, case_title: case_title, office_num: office_num,
                      last_body: last_body, last_at: last_at, last_author: last_author,
                      has_file: has_file, unread: 0, kind: kind)
    }
}

extension Notification.Name {
    /// عُلِّم نقاش مقروءاً (object = معرّف الملف أو DiscussionRow.generalKey)
    static let discussionRead = Notification.Name("discussionRead")
}

/// تفاعل إيموجي مجمّع: الرمز، العدد، وهل أنا منهم
struct Reaction: Codable, Equatable {
    let e: String
    let n: Int
    let me: Bool
}

/// رسالة في مجرى القضية — من دالة case_stream()
struct StreamMsg: Codable, Identifiable {
    let id: String
    let author_id: String?
    let author_name: String?
    let body: String?
    /// user رسالة موظف · ai ردّ الذكاء · system إعلان آلي (مهمة أُنشئت)
    let kind: String?
    let document_id: String?
    let document_name: String?
    let document_url: String?
    let mentions: [String]?
    let created_at: String?
    let edited_at: String?
    let reply_count: Int?
    let last_reply_at: String?
    let reactions: [Reaction]?
    let bookmarked: Bool?
}

/// ردّ داخل خيط — من دالة case_thread() (نفس تخصيب المجرى)
struct ThreadMsg: Codable, Identifiable {
    let id: String
    let author_id: String?
    let author_name: String?
    let avatar_initial: String?
    let avatar_color: String?
    let body: String?
    let kind: String?
    let document_id: String?
    let document_name: String?
    let document_url: String?
    let created_at: String?
    let edited_at: String?
    let reactions: [Reaction]?
    let bookmarked: Bool?
}

/// رسالة بمرفق أو برابط — نافذة «الملفات والروابط»
struct MediaMsg: Codable, Identifiable {
    let id: String
    let case_id: String?
    let parent_id: String?
    let author_id: String?
    let body: String?
    let kind: String?
    let created_at: String?
    let document: MediaDoc?
}

struct MediaDoc: Codable {
    let id: String
    let name: String?
    let file_url: String?
    let file_type: String?
    let file_size: Int?
}

/// رسالة محفوظة — من دالة my_bookmarks()
struct BookmarkRow: Codable, Identifiable {
    let comment_id: String
    let case_id: String?
    let case_title: String?
    let body: String?
    let kind: String?
    let author_name: String?
    let created_at: String?
    let saved_at: String?

    var id: String { comment_id }
}

/// ردّ داخل خيط — قراءة مباشرة من case_comments
struct ReplyRow: Codable, Identifiable {
    let id: String
    let author_id: String?
    let body: String?
    let kind: String?
    let document_id: String?
    let created_at: String?
    let author: TeamMember?
}

// ===== مركز الإشعارات (جدول notifications — نفس جرس الويب) =====

struct AppNotification: Codable, Identifiable {
    let id: String
    let type: String?
    let title: String?
    let message: String?
    let case_id: String?
    let task_id: String?
    let is_read: Bool?
    let created_at: String?
}


/// موعد مختصر — لفحص التعارض في شاشة إنشاء الموعد
struct ApptLite: Codable, Identifiable {
    let id: String
    let client_name: String?
    let appointment_time: String?
    let duration_minutes: Int?
    let status: String?
}


// ===== الخدمة الذاتية للموظف («صفحتي») =====

struct HrRequestRow: Codable, Identifiable {
    let id: String
    let member_id: String
    let kind: String
    let leave_type: String?
    let start_date: String
    let end_date: String
    let from_time: String?
    let to_time: String?
    let reason: String?
    let status: String
    let decision_note: String?
    let decided_at: String?
    let created_at: String?
    let member: MemberMini?

    struct MemberMini: Codable {
        let id: String?
        let name: String?
        let short_name: String?
        let avatar_initial: String?
        let avatar_color: String?
        let avatar_url: String?

        var asTeamMember: TeamMember {
            TeamMember(id: id ?? "", name: name, short_name: short_name, is_director: nil,
                       avatar_initial: avatar_initial, avatar_color: avatar_color, avatar_url: avatar_url)
        }
    }
}

struct PayrollRow: Codable, Identifiable {
    let id: String
    let entry_type: String?
    let amount: Double?
    let entry_date: String?
    let note: String?
    let file_url: String?
}

/// ناتج leave_balance — سنة الخدمة الجارية
struct LeaveBalance: Codable {
    let join_date: String?
    let missing_join_date: Bool?
    let not_started: Bool?
    let years_of_service: Int?
    let service_year_start: String?
    let service_year_end: String?
    let entitlement: Int?
    let used: Int?
    let pending: Int?
    let remaining: Int?
    let senior_after_years: Int?
}

struct MyProfile: Codable {
    let id: String
    let name: String?
    let role: String?
    let email: String?
    let phone: String?
    let join_date: String?
    let national_address: String?
    let bank_name: String?
    let bank_iban: String?
    let qualifications: String?
    let emergency_contact_name: String?
    let emergency_contact_phone: String?
    let emergency_contact_relation: String?
}


// ===== إيصالات القراءة في النقاشات =====

struct ReadCount: Codable {
    let comment_id: String
    let readers: Int
    let pending: Int
}

struct ReadReceipts: Codable {
    struct Person: Codable, Identifiable {
        let member_id: String
        let name: String?
        let short_name: String?
        let avatar_initial: String?
        let avatar_color: String?
        let avatar_url: String?
        var read_at: String? = nil
        var id: String { member_id }
        var asTeamMember: TeamMember {
            TeamMember(id: member_id, name: name, short_name: short_name, is_director: nil,
                       avatar_initial: avatar_initial, avatar_color: avatar_color, avatar_url: avatar_url)
        }
    }
    let readers: [Person]
    let not_read: [Person]
}
