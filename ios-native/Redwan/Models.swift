import Foundation

// النماذج تطابق ما يُرجعه PostgREST حرفياً (snake_case) — التواريخ تبقى
// نصوصاً YYYY-MM-DD كما في الويب، والتنسيق مسؤولية Fmt وحدها.

struct TeamMember: Codable, Identifiable, Equatable {
    let id: String
    let name: String?
    let short_name: String?
    let is_director: Bool?
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

    var id: String { case_id ?? "general" }
    var isGeneral: Bool { case_id == nil }
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
