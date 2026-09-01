import Foundation
import Combine

/// جسر نقرة الإشعار → التنقّل. الحمولة تحمل route (من notification_push_dispatch)
/// والتبويبات وشاشاتها تستهلكه ثم تصفّره — مستهلك واحد لكل مسار.
@MainActor
final class PushRouter: ObservableObject {
    static let shared = PushRouter()
    @Published var route: String?

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

    /// "/cases/<id>[?tab=…]" → معرف القضية لفتح ملفها (تبويب الملفات)
    var caseId: String? {
        guard let r = route, r.hasPrefix("/cases/") else { return nil }
        let rest = r.dropFirst("/cases/".count)
        let id = rest.split(whereSeparator: { $0 == "?" || $0 == "/" }).first.map(String.init) ?? ""
        return id.isEmpty ? nil : id
    }

    func clear() { route = nil }
}
