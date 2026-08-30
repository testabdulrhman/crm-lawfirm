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

    /// "/discussions?case=<id>" أو "/cases/<id>" → معرف القضية لفتح نقاشها
    var discussionCaseId: String? {
        guard let r = route else { return nil }
        if let q = r.range(of: "/discussions?case=") {
            return String(r[q.upperBound...])
        }
        if r.hasPrefix("/cases/") {
            return String(r.dropFirst("/cases/".count))
        }
        return nil
    }

    func clear() { route = nil }
}
