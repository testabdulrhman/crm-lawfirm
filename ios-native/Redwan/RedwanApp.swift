import SwiftUI

// تطبيق «رضوان» الأصيل — SwiftUI على نفس قاعدة Supabase التي يقرأها الويب.
// التبويبات: الرئيسية · المهام · التقويم · النقاشات.
// «النقاشات» أُضيف 2026-08-21 لحلّ تشتّت العمل بين خاص الواتساب وقروبه.

@main
struct RedwanApp: App {
    @StateObject private var sb = SB.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(sb)
                // النظام عربي RTL بالكامل — لا اعتماد على لغة الجهاز
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .tint(Theme.gold)
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
        }
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("الرئيسية", systemImage: "house.fill") }
            TasksView()
                .tabItem { Label("المهام", systemImage: "checklist") }
            CalendarView()
                .tabItem { Label("التقويم", systemImage: "calendar") }
            DiscussionsView()
                .tabItem { Label("النقاشات", systemImage: "bubble.left.and.bubble.right.fill") }
        }
    }
}
