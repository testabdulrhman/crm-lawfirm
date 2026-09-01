import SwiftUI
import VisionKit
import UIKit

// ماسح المستندات — كاميرا VisionKit (قصّ تلقائي وتصحيح منظور ومتعدد الصفحات)
// والناتج PDF واحد بحجم A4، فيقرؤه classify-doc كمستند ويصنّفه.
// (طلب المستخدم 2026-09-02: «اشتغل على الكاميرا والمستندات»)

struct DocumentScannerView: UIViewControllerRepresentable {
    let onFinish: ([UIImage]) -> Void
    let onCancel: () -> Void

    static var isSupported: Bool { VNDocumentCameraViewController.isSupported }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let parent: DocumentScannerView
        init(_ p: DocumentScannerView) { parent = p }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController,
            didFinishWith scan: VNDocumentCameraScan
        ) {
            let pages = (0..<scan.pageCount).map { scan.imageOfPage(at: $0) }
            parent.onFinish(pages)
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            parent.onCancel()
        }

        func documentCameraViewController(
            _ controller: VNDocumentCameraViewController, didFailWithError error: Error
        ) {
            parent.onCancel()
        }
    }
}

enum ScanPDF {
    /// صفحات → PDF بحجم A4، كل صورة مضغوطة JPEG ومصغّرة (≤ ١٦٠٠ بكسل)
    /// حتى يبقى الملف خفيفاً: classify-doc يرفض ما فوق ٨ ميغابايت.
    static func make(_ images: [UIImage]) -> Data {
        let page = CGRect(x: 0, y: 0, width: 595, height: 842)
        let margin: CGFloat = 18
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        return renderer.pdfData { ctx in
            for img in images {
                guard let small = shrink(img, maxSide: 1600),
                      let jpeg = small.jpegData(compressionQuality: 0.72),
                      let drawn = UIImage(data: jpeg) else { continue }
                ctx.beginPage()
                let box = page.insetBy(dx: margin, dy: margin)
                let scale = min(box.width / drawn.size.width, box.height / drawn.size.height)
                let w = drawn.size.width * scale, h = drawn.size.height * scale
                let rect = CGRect(x: box.midX - w / 2, y: box.midY - h / 2, width: w, height: h)
                drawn.draw(in: rect)
            }
        }
    }

    private static func shrink(_ img: UIImage, maxSide: CGFloat) -> UIImage? {
        let longest = max(img.size.width, img.size.height)
        guard longest > maxSide else { return img }
        let k = maxSide / longest
        let size = CGSize(width: img.size.width * k, height: img.size.height * k)
        let f = UIGraphicsImageRendererFormat.default()
        f.scale = 1
        return UIGraphicsImageRenderer(size: size, format: f).image { _ in
            img.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}
