import SwiftUI
import UniformTypeIdentifiers

// امتداد المشاركة (طلب المستخدم 2026-08-22: «ابي اشارك ملف او صورة من اي
// مكان للتطبيق» — مثل الواتساب): زر المشاركة في أي تطبيق ← «رضوان» ←
// اختيار النقاش ← يصير مرفقاً في المحادثة ومستنداً في الملف.

/// عنصر مشارك واحد: ملف جاهز البيانات أو نص/رابط
struct SharedItem: Identifiable {
    let id = UUID()
    let fileName: String
    let mime: String
    let data: Data?
    let text: String?
}

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let root = ShareRootView(
            extractItems: { [weak self] in await self?.extractItems() ?? [] },
            finish: { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            },
            cancel: { [weak self] in
                self?.extensionContext?.cancelRequest(
                    withError: NSError(domain: "sa.redwan.share", code: 0)
                )
            }
        )
        let host = UIHostingController(rootView: root)
        addChild(host)
        view.addSubview(host.view)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.didMove(toParent: self)
    }

    /// قراءة كل المرفقات من سياق المشاركة — ملفات وصور ونصوص وروابط
    private func extractItems() async -> [SharedItem] {
        var out: [SharedItem] = []
        let inputs = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        for item in inputs {
            for provider in item.attachments ?? [] {
                if let it = await loadOne(provider) { out.append(it) }
            }
        }
        return out
    }

    private func loadOne(_ p: NSItemProvider) async -> SharedItem? {
        // ملف أو صورة — النوع الجامع public.data يغطي الغالبية
        if p.hasItemConformingToTypeIdentifier(UTType.data.identifier) {
            return await withCheckedContinuation { cont in
                p.loadFileRepresentation(forTypeIdentifier: UTType.data.identifier) { url, _ in
                    guard let url, let data = try? Data(contentsOf: url) else {
                        cont.resume(returning: nil)
                        return
                    }
                    let name = p.suggestedName.map {
                        $0.contains(".") ? $0 : $0 + "." + url.pathExtension
                    } ?? url.lastPathComponent
                    let mime = UTType(filenameExtension: url.pathExtension.lowercased())?
                        .preferredMIMEType ?? "application/octet-stream"
                    cont.resume(returning: SharedItem(
                        fileName: name, mime: mime, data: data, text: nil
                    ))
                }
            }
        }
        // رابط صفحة — يُرسل نصاً
        if p.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            return await withCheckedContinuation { cont in
                _ = p.loadObject(ofClass: URL.self) { url, _ in
                    cont.resume(returning: url.map {
                        SharedItem(fileName: "", mime: "", data: nil, text: $0.absoluteString)
                    })
                }
            }
        }
        // نص صريح
        if p.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
            return await withCheckedContinuation { cont in
                _ = p.loadObject(ofClass: NSString.self) { s, _ in
                    cont.resume(returning: (s as? String).map {
                        SharedItem(fileName: "", mime: "", data: nil, text: $0)
                    })
                }
            }
        }
        return nil
    }
}
