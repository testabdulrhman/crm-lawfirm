import SwiftUI
import QuickLook

// معاينة الملفات داخل التطبيق (QuickLook) بدل القفز إلى سفاري —
// طلب المستخدم 2026-08-22: «ابي استعرض داخل التطبيق». يدعم PDF والصور
// وWord وغيرها.
//
// ⚠️ زر المشاركة المدمج في QLPreviewController **لا يظهر** حين يُضمَّن
//    داخل NavigationStack سويفت يو آي (شريطه يُخفى ويحلّ محله شريطنا)، فبقي
//    الموظفون بلا مشاركة (بلاغهم 2026-09-10). الحل: ShareLink صريح في شريطنا.

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
                // المشاركة (واتساب · إيردروب · بريد · حفظ في الملفات) — تظهر
                // بعد اكتمال التنزيل فقط، فما يُشارَك هو الملف نفسه لا رابطه
                if let localURL {
                    ToolbarItem(placement: .topBarTrailing) {
                        // بلا SharePreview مخصّصة: العنوان وحده يستبدل معاينة النظام
                        // بمربّع فارغ ويُسقط سطر الحجم/النوع — النظام يولّدهما من الملف
                        ShareLink(item: localURL) {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundStyle(Theme.goldDark)
                        }
                        .accessibilityLabel("مشاركة الملف")
                    }
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
        }
        .task { await download() }
    }

    private func download() async {
        do { localURL = try await FileFetch.download(url: url, name: name) }
        catch let e as SBError { error = e.message }
        catch { self.error = "تعذّر تحميل الملف — تحقق من الاتصال" }
    }
}

/// تنزيل ملف إلى مجلد مؤقت باسم عربي مقروء وامتداد صحيح — تشترك فيه
/// المعاينة (QuickLook) والمشاركة من صفوف المستندات ومرفقات النقاش.
enum FileFetch {
    static func download(url: String?, name: String) async throws -> URL {
        guard let url, let remote = URL(string: url) else {
            throw SBError(message: "رابط الملف غير صالح")
        }
        let (data, response) = try await URLSession.shared.data(from: remote)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            throw SBError(message: "تعذّر تحميل الملف (\(http.statusCode))")
        }
        let ext = remote.pathExtension.isEmpty ? "bin" : remote.pathExtension
        // الاسم العربي يبقى ورقةَ الملف (يراه المستلم في واتساب/إيردروب)، لكن
        // المجلد يُميَّز برابط الملف: مستندان بالاسم نفسه (كل صور النقاش تُرفع
        // «صورة.jpg») كانا يتقاسمان مساراً واحداً فيستبدل تنزيلٌ ملفَ ورقةٍ مفتوحة.
        // والاسم يُقصّ: العربية بايتان للحرف والحد ٢٥٥ بايت وإلا فشلت الكتابة.
        let base = String(name.replacingOccurrences(of: "/", with: "-").prefix(80))
        let safeName = base.lowercased().hasSuffix(".\(ext.lowercased())") ? base : "\(base).\(ext)"
        let key = String(UInt(bitPattern: remote.absoluteString.hashValue), radix: 36)
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("share", isDirectory: true)
            .appendingPathComponent(key, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let dest = dir.appendingPathComponent(safeName)
        try? FileManager.default.removeItem(at: dest)
        try data.write(to: dest)
        return dest
    }
}

/// ملف جاهز للمشاركة — يُعرض في ورقة النظام
struct ShareFile: Identifiable {
    let url: URL
    var id: String { url.path }
}

/// ورقة المشاركة الأصلية (UIActivityViewController) — للمشاركة من صفٍّ بلا فتح
/// المعاينة. ShareLink لا يُستدعى برمجياً بعد تنزيل غير متزامن، فهذا الغلاف.
struct ActivitySheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
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
