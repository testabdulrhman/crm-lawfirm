import SwiftUI
import UIKit

// «اقترح تعديلاً» في الآيفون — مرآة زرّ المصباح في الويب (طلب المدير 2026-09-24: «فيه طريقة
// اقدر اعدل في النظام من داخل النظام نفسه؟»).
//
// الطريق الأسرع: **هزّ الجوال في أي شاشة** — تُلتقط الشاشة كما هي لحظتها واسمها، فلا يحتاج
// صاحب الطلب وصف أين كان. والطريق الثاني من «صفحتي»، ومعه قائمة اقتراحاتي والرد عليها.
// الحفظ في change_requests نفسه (platform = ios)، والقاعدة تُشعر المدير وتُشعر صاحبه بالرد.

extension Notification.Name {
    static let deviceDidShake = Notification.Name("sa.redwan.deviceDidShake")
}

/// الهزّ يصل النافذة لا عروض SwiftUI — فيُلتقط هنا ويُبثّ
extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake {
            NotificationCenter.default.post(name: .deviceDidShake, object: nil)
        }
        super.motionEnded(motion, with: event)
    }
}

enum ScreenGrab {
    /// لقطة النافذة الظاهرة الآن — قبل أن تُفتح الورقة فوقها
    @MainActor static func capture() -> UIImage? {
        guard let win = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 2 // مقروءة دون أن تثقل (~٢٠٠ ك.ب بعد الضغط)
        return UIGraphicsImageRenderer(bounds: win.bounds, format: format).image { _ in
            win.drawHierarchy(in: win.bounds, afterScreenUpdates: false)
        }
    }
}

struct ChangeRequestRow: Codable, Identifiable {
    let id: String
    let created_at: String?
    let body: String
    let status: String
    let reply: String?
    let replied_at: String?
    let page_title: String?
    let platform: String?

    var statusLabel: String {
        switch status {
        case "in_progress": return "قيد التنفيذ"
        case "done": return "نُفّذ"
        case "declined": return "لن يُنفَّذ"
        default: return "جديد"
        }
    }

    var statusColor: Color {
        switch status {
        case "in_progress": return Theme.blue
        case "done": return Theme.success
        case "declined": return Theme.muted
        default: return Theme.goldDark
        }
    }
}

extension SB {
    func submitChangeRequest(body: String, screen: String, screenshot: UIImage?) async throws {
        var shotUrl: Any = NSNull()
        // اللقطة تحسين لا شرط: إن تعذّر رفعها يُحفظ الطلب بدونها
        if let jpeg = screenshot?.jpegData(compressionQuality: 0.7) {
            shotUrl = (try? await storageUpload(
                bucket: "documents",
                path: "change_requests/ios-\(Int(Date().timeIntervalSince1970 * 1000)).jpg",
                data: jpeg, mime: "image/jpeg"
            )) ?? NSNull()
        }
        try await insertVoid("change_requests", values: [
            "body": body.trimmingCharacters(in: .whitespacesAndNewlines),
            "platform": "ios",
            "page_path": "ios:\(screen)",
            "page_title": screen,
            "screenshot_url": shotUrl,
        ])
    }

    /// اقتراحاتي — القاعدة تُرجع للموظف طلباته وحده (وللمدير الكل)
    func myChangeRequests() async throws -> [ChangeRequestRow] {
        guard let me = member?.id else { return [] }
        return try await get("change_requests", query: [
            ("select", "id,created_at,body,status,reply,replied_at,page_title,platform"),
            ("created_by", "eq.\(me)"),
            ("order", "created_at.desc"),
            ("limit", "100"),
        ])
    }
}

// MARK: - الورقة

struct SuggestChangeSheet: View {
    let screen: String
    let screenshot: UIImage?

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var attach = true
    @State private var sending = false
    @State private var alertText: String?
    @State private var sent = false
    @FocusState private var focused: Bool

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label(screen, systemImage: "mappin.and.ellipse")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.goldDark)
                    TextField("مثال: ودي زرّ يرسل ملخّص الجلسة للموكّل…", text: $text, axis: .vertical)
                        .lineLimit(4...10)
                        .focused($focused)
                } footer: {
                    Text("يصلك إشعار حين يُنفَّذ أو يُردّ عليه.")
                }

                if let screenshot {
                    Section {
                        Toggle("أرفق لقطة الشاشة كما كانت", isOn: $attach)
                            .tint(Theme.goldDark)
                        if attach {
                            Image(uiImage: screenshot)
                                .resizable()
                                .scaledToFit()
                                .frame(maxHeight: 260)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .frame(maxWidth: .infinity)
                        }
                    }
                }
            }
            .navigationTitle("اقترح تعديلاً")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }.disabled(sending)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView().tint(Theme.goldDark)
                    } else {
                        Button("إرسال") { Task { await send() } }
                            .fontWeight(.semibold)
                            .disabled(trimmed.isEmpty)
                    }
                }
            }
            .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
                Button("حسناً", role: .cancel) { alertText = nil }
            } message: { Text(alertText ?? "") }
            .alert("وصل اقتراحك", isPresented: $sent) {
                Button("حسناً") { dismiss() }
            } message: {
                Text("يصلك إشعار حين يُنفَّذ أو يُردّ عليه.")
            }
            .task { focused = true }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func send() async {
        guard !sending, !trimmed.isEmpty else { return }
        sending = true
        defer { sending = false }
        do {
            try await sb.submitChangeRequest(body: trimmed, screen: screen, screenshot: attach ? screenshot : nil)
            Usage.shared.action("اقتراح تعديل")
            sent = true
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}

// MARK: - الهزّ من أي شاشة

private struct ShakeCapture: Identifiable {
    let id = UUID()
    let screen: String
    let image: UIImage?
}

/// يُركَّب على جذر التبويبات: هزّة ⇐ لقطة للشاشة الحالية ⇐ ورقة الاقتراح
struct SuggestOnShake: ViewModifier {
    @State private var capture: ShakeCapture?

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in
                // ورقة مفتوحة أصلاً (اقتراح أو غيره) — لا تُكدَّس فوقها أخرى
                guard capture == nil else { return }
                let img = ScreenGrab.capture()
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                capture = ShakeCapture(screen: Usage.shared.currentScreen, image: img)
            }
            .sheet(item: $capture) { c in
                SuggestChangeSheet(screen: c.screen, screenshot: c.image)
            }
    }
}

extension View {
    func suggestChangeOnShake() -> some View { modifier(SuggestOnShake()) }
}

// MARK: - اقتراحاتي

struct MyChangeRequestsView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [ChangeRequestRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false
    @State private var showNew = false

    var body: some View {
        Group {
            if let error {
                ErrorBox(message: error) { Task { await load() } }
                    .padding(16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if rows.isEmpty {
                EmptyBox(icon: "lightbulb", text: "لا اقتراحات بعد",
                         subtext: "هزّ الجوال في أي شاشة لتقترح تعديلاً عليها")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(rows) { r in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Text(r.statusLabel)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(r.statusColor)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(r.statusColor.opacity(0.12), in: Capsule())
                            if let p = r.page_title {
                                Text(p).font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                            Spacer(minLength: 0)
                            Text(msgStamp(r.created_at)).font(.system(size: 11)).foregroundStyle(Theme.muted)
                        }
                        Text(r.body).font(.system(size: 14)).foregroundStyle(Theme.navy)
                        if let reply = r.reply, !reply.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("الرد").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.goldDark)
                                Text(reply).font(.system(size: 13)).foregroundStyle(Theme.navy)
                            }
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.goldPale, in: RoundedRectangle(cornerRadius: 8))
                        }
                    }
                    .padding(.vertical, 4)
                    .listRowBackground(Theme.card)
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("اقتراحاتي")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showNew = true } label: {
                    Image(systemName: "square.and.pencil").foregroundStyle(Theme.goldDark)
                }
                .accessibilityLabel("اقتراح جديد")
            }
        }
        .sheet(isPresented: $showNew, onDismiss: { Task { await load() } }) {
            SuggestChangeSheet(screen: "اقتراحاتي", screenshot: nil)
        }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("اقتراحاتي") }
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.myChangeRequests()
            loaded = true
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}
