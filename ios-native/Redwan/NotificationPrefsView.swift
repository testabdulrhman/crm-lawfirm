import SwiftUI

// إعدادات الإشعارات — كل موظف يختار لكل فئة: الكل (داخل التطبيق + تنبيه)،
// داخل التطبيق فقط، أو صامت. الاختيار يُحفظ في notification_prefs وتطبّقه
// القاعدة نفسها (بوابة الإدراج + مرسل الدفع) فيسري على الويب والجوال معاً.
// (طلب المستخدم 2026-09-02)

struct NotificationPref: Codable {
    let category: String
    let mode: String
}

private struct PrefCategory: Identifiable {
    let id: String
    let label: String
    let detail: String
    let icon: String
}

private let CATEGORIES: [PrefCategory] = [
    .init(id: "mention", label: "المنشن", detail: "حين يذكرك زميل بـ@ في نقاش", icon: "at"),
    .init(id: "tasks", label: "المهام", detail: "إسناد، استحقاق، اعتماد، إرجاع، تعليقات", icon: "checklist"),
    .init(id: "approvals", label: "اعتمادات الصادر", detail: "طلبات الاعتماد ونتائجها", icon: "signature"),
    .init(id: "sessions", label: "الجلسات", detail: "تذكير الجلسة وملخّص ما قبلها", icon: "building.columns"),
    .init(id: "deadlines", label: "المهل النظامية", detail: "سلّم التنبيه ١٤/٧/٣/١ يوم", icon: "hourglass"),
    .init(id: "appointments", label: "المواعيد", detail: "حجز موعد جديد من رابط الحجز", icon: "calendar.badge.clock"),
    .init(id: "birthdays", label: "أعياد الميلاد", detail: "احتفال الفريق بيوم ميلاد زميل", icon: "gift"),
    .init(id: "inbox", label: "الرسائل الواردة", detail: "رسائل العملاء الواردة", icon: "envelope"),
]

struct NotificationPrefsView: View {
    @EnvironmentObject private var sb: SB
    @State private var modes: [String: String] = [:]
    @State private var loaded = false
    @State private var error: String?
    @State private var saveError: String?

    var body: some View {
        Group {
            if let error {
                ErrorBox(message: error) { Task { await load() } }
                    .padding(16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    Section {
                        Text("«الكل» يصلك داخل التطبيق ويوقظ جوالك بتنبيه. «داخل التطبيق» يظهر في الجرس بلا تنبيه. «صامت» لا يصلك إطلاقاً.")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    }
                    if let saveError {
                        Section { Text(saveError).foregroundStyle(Theme.danger).font(.system(size: 13)) }
                    }
                    ForEach(CATEGORIES) { c in
                        Section {
                            HStack(spacing: 10) {
                                Image(systemName: c.icon)
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(Theme.goldDark)
                                    .frame(width: 30, height: 30)
                                    .background(Theme.goldPale)
                                    .clipShape(RoundedRectangle(cornerRadius: 9))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.label).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.navy)
                                    Text(c.detail).font(.system(size: 12)).foregroundStyle(Theme.muted)
                                }
                            }
                            Picker("", selection: Binding(
                                get: { modes[c.id] ?? "all" },
                                set: { newValue in
                                    modes[c.id] = newValue
                                    Task { await save(c.id, newValue) }
                                }
                            )) {
                                Text("الكل").tag("all")
                                Text("داخل التطبيق").tag("inapp")
                                Text("صامت").tag("off")
                            }
                            .pickerStyle(.segmented)
                        }
                        .listRowBackground(Theme.card)
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("إعدادات الإشعارات")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { Usage.shared.screen("إعدادات الإشعارات") }
        .task { await load() }
    }

    private func load() async {
        error = nil
        do {
            let rows = try await sb.notificationPrefs()
            modes = Dictionary(uniqueKeysWithValues: rows.map { ($0.category, $0.mode) })
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save(_ category: String, _ mode: String) async {
        saveError = nil
        do {
            try await sb.setNotificationPref(category: category, mode: mode)
        } catch {
            saveError = "لم يُحفظ الخيار: \(error.localizedDescription)"
        }
    }
}

extension SB {
    func notificationPrefs() async throws -> [NotificationPref] {
        guard let me = member?.id else { return [] }
        return try await get("notification_prefs", query: [
            ("select", "category,mode"),
            ("member_id", "eq.\(me)"),
        ])
    }

    func setNotificationPref(category: String, mode: String) async throws {
        guard let me = member?.id else {
            throw SBError(message: "لم يُحمَّل ملفك بعد — اسحب للتحديث ثم أعد المحاولة")
        }
        try await upsert(
            table: "notification_prefs",
            values: [
                "member_id": me, "category": category, "mode": mode,
                "updated_at": ISO8601DateFormatter().string(from: Date()),
            ],
            onConflict: "member_id,category"
        )
    }
}
