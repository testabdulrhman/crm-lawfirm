import SwiftUI
import CoreSpotlight
import UserNotifications

// تطبيق «Redwan» الأصيل — SwiftUI على نفس قاعدة Supabase التي يقرأها الويب.
// التبويبات: الرئيسية · الملفات · المهام · التقويم · النقاشات.
// «الملفات» أُضيف 2026-09-02 (ثلاثية المحكمة: ملف القضية، ملخّص الجلسة، إغلاقها من القاعة).
// «النقاشات» أُضيف 2026-08-21 لحلّ تشتّت العمل بين خاص الواتساب وقروبه.

@main
struct RedwanApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var sb = SB.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(sb)
                // النظام عربي RTL بالكامل — لا اعتماد على لغة الجهاز
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                // الألوان ثابتة فاتحة (عاجي/كحلي) — الوضع الداكن كان يجعل
                // نص الحقول أبيض على عاجي = غير مرئي (بلاغ المستخدم 2026-08-22)
                .preferredColorScheme(.light)
                .tint(Theme.gold)
                .task { donateSpotlight() }
                .onChange(of: scenePhase) {
                    // تتبع الاستخدام: جلسة ودقائق نشطة (نفس تحليلات الويب)
                    switch scenePhase {
                    case .active: Usage.shared.appBecameActive()
                    case .background: Usage.shared.appWentBackground()
                    default: break
                    }
                }
        }
    }

    /// فهرسة التطبيق في بحث iOS بالعربي والإنجليزي (طلب المستخدم 2026-08-22:
    /// «ابي اقدر ابحث باسم التطبيق عربي وانجليزي») — اسم الأيقونة Redwan
    /// وSpotlight يجده أيضاً بـ«رضوان» وبقية الكلمات.
    private func donateSpotlight() {
        let attrs = CSSearchableItemAttributeSet(contentType: .item)
        attrs.title = "Redwan — رضوان"
        attrs.contentDescription =
            "شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس"
        attrs.keywords = [
            "رضوان", "ردوان", "المشيقح", "محاماة", "قضايا",
            "redwan", "Redwan", "redwans", "almoshiqeh", "law",
        ]
        let item = CSSearchableItem(
            uniqueIdentifier: "sa.redwan.app.main",
            domainIdentifier: "sa.redwan.app",
            attributeSet: attrs
        )
        CSSearchableIndex.default().indexSearchableItems([item])
    }
}

/// إشعارات الدفع: استقبال device token وإظهار التنبيه والتطبيق مفتوح
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await SB.shared.registerPushDevice(token: token) }
    }

    // التنبيه يظهر حتى والتطبيق في المقدمة
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    // نقرة الإشعار: الحمولة تحمل route — نسلّمه للجسر فتفتح الشاشة الصحيحة
    // (كان النقر يفتح التطبيق فقط — بلاغ المستخدم 2026-08-30)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        if let route = info["route"] as? String, route.hasPrefix("/") {
            await MainActor.run { PushRouter.shared.route = route }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var sb: SB

    var body: some View {
        if sb.session == nil {
            LoginView()
        } else {
            MainTabs()
                .task {
                    await sb.enablePush()
                    Usage.shared.start()
                }
        }
    }
}

struct MainTabs: View {
    @ObservedObject private var router = PushRouter.shared
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            HomeView()
                .tabItem { Label("الرئيسية", systemImage: "house.fill") }
                .tag(0)
            CasesView()
                .tabItem { Label("الملفات", systemImage: "folder.fill") }
                .tag(1)
            TasksView()
                .tabItem { Label("المهام", systemImage: "checklist") }
                .tag(2)
            CalendarView()
                .tabItem { Label("التقويم", systemImage: "calendar") }
                .tag(3)
            DiscussionsView()
                .tabItem { Label("النقاشات", systemImage: "bubble.left.and.bubble.right.fill") }
                .tag(4)
        }
        // مسار الإشعار يقلب التبويب — والشاشة نفسها تفتح وجهتها ثم تصفّر الجسر
        .onChange(of: router.route) { _, r in switchTab(for: r) }
        .task { switchTab(for: router.route) }
    }

    private func switchTab(for route: String?) {
        guard let r = route else { return }
        if r.hasPrefix("/tasks/") { tab = 2 }
        else if r.hasPrefix("/discussions") { tab = 4 }
        else if r.hasPrefix("/cases/") { tab = 1 }
    }
}
