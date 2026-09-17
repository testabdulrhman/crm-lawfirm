import Foundation
import Combine

/// جسر نقرة الإشعار → التنقّل. الحمولة تحمل route (من notification_push_dispatch)
/// والتبويبات وشاشاتها تستهلكه ثم تصفّره — مستهلك واحد لكل مسار.
@MainActor
final class PushRouter: ObservableObject {
    static let shared = PushRouter()
    @Published var route: String?
    /// الرسالة المقصودة داخل نقاش المسار — يُضبط قبل route، ويقرؤه تبويب النقاشات مع المسار
    var pendingFocus: DiscussionFocus?

    /// "/tasks/<id>" → id
    var taskId: String? {
        guard let r = route, r.hasPrefix("/tasks/") else { return nil }
        return String(r.dropFirst("/tasks/".count))
    }

    /// "/discussions?case=<id>" → معرف القضية لفتح نقاشها
    var discussionCaseId: String? {
        guard let r = route, let q = r.range(of: "/discussions?case=") else { return nil }
        return String(r[q.upperBound...])
    }

    /// "/cases/<id>[?tab=…]" → معرف القضية لفتح ملفها (تبويب المشاريع)
    var caseId: String? {
        guard let r = route, r.hasPrefix("/cases/") else { return nil }
        let rest = r.dropFirst("/cases/".count)
        let id = rest.split(whereSeparator: { $0 == "?" || $0 == "/" }).first.map(String.init) ?? ""
        return id.isEmpty ? nil : id
    }

    /// "/appointments" → قائمة المواعيد (إشعار حجز جديد من الموقع)
    var isAppointments: Bool { route == "/appointments" }

    func clear() { route = nil; pendingFocus = nil }
}

/// «افتح النقاش عند هذه الرسالة» — مرآة discussionJump في الويب.
/// بالمعرّف إن عُرف (نافذة الملفات والروابط)، أو بالوقت: إشعار المنشن يُكتب داخل معاملة
/// الرسالة نفسها فوقته يطابق created_at حرفياً. وكلاهما فارغ = آخر منشن لي في هذا النقاش
/// (نقرة إشعار الدفع لا تحمل إلا رقم النقاش).
struct DiscussionFocus: Hashable {
    var messageId: String? = nil
    var parentId: String? = nil
    var at: String? = nil
}
