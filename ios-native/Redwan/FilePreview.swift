import SwiftUI
import QuickLook

// معاينة الملفات داخل التطبيق (QuickLook) بدل القفز إلى سفاري —
// طلب المستخدم 2026-08-22: «ابي استعرض داخل التطبيق». يدعم PDF والصور
// وWord وغيرها، ومعه زر المشاركة/الحفظ المدمج في النظام.

struct FilePreviewSheet: View {
    let name: String
    let url: String?

    @Environment(\.dismiss) private var dismiss
    @State private var localURL: URL?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let localURL {
                    QuickLookView(url: localURL)
                        .ignoresSafeArea(edges: .bottom)
                } else if let error {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 28))
                            .foregroundStyle(Theme.danger)
                        Text(error)
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.center)
                        if let url, let u = URL(string: url) {
                            Button("فتح في المتصفح") { UIApplication.shared.open(u) }
                                .buttonStyle(.borderedProminent)
                                .tint(Theme.gold)
                        }
                    }
                    .padding(24)
                } else {
                    VStack(spacing: 10) {
                        ProgressView()
                        Text("جارٍ تحميل الملف…")
                            .font(.system(size: 13))
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
            .navigationTitle(name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("إغلاق") { dismiss() }
                        .foregroundStyle(Theme.goldDark)
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
        }
        .task { await download() }
    }

    /// التنزيل لملف مؤقت — QuickLook يقرأ من القرص لا من الشبكة،
    /// والامتداد الحقيقي (من مسار الرابط) هو ما يحدد طريقة العرض.
    private func download() async {
        guard let url, let remote = URL(string: url) else {
            error = "رابط الملف غير صالح"
            return
        }
        do {
            let (data, response) = try await URLSession.shared.data(from: remote)
            if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
                throw URLError(.badServerResponse)
            }
            let ext = remote.pathExtension.isEmpty ? "bin" : remote.pathExtension
            // اسم عربي مقروء في شريط المعاينة والمشاركة، مع الامتداد الصحيح
            let base = name.replacingOccurrences(of: "/", with: "-")
            let safeName = base.lowercased().hasSuffix(".\(ext.lowercased())")
                ? base : "\(base).\(ext)"
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent(safeName)
            try? FileManager.default.removeItem(at: dest)
            try data.write(to: dest)
            localURL = dest
        } catch {
            self.error = "تعذّر تحميل الملف — تحقق من الاتصال"
        }
    }
}

/// غلاف QLPreviewController لسويفت يو آي
private struct QuickLookView: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(
            _ controller: QLPreviewController,
            previewItemAt index: Int
        ) -> QLPreviewItem {
            url as NSURL
        }
    }
}
