import SwiftUI
import UIKit
import UniformTypeIdentifiers

// لصق صورة منسوخة في النقاش (اقتراح المدير 2026-09-27 من «اقترح تعديلاً»: «ودي اذا كنت ناسخ صورة
// من اي تطبيق آخر أقدر الصقها في المناقشة»). حقل الكتابة نصي لا يقبل الصور، فيظهر فوقه شريط صغير
// حين تكون في الحافظة صورة، وزرّ «لصق» الرسمي من أبل (PasteButton) — لا يسأل النظام «هل تسمح
// باللصق؟» لأن المستخدم ضغطه بنفسه. فحص hasImages لا يقرأ الحافظة فلا يثير السؤال أيضاً.
struct PasteImageChip: View {
    let disabled: Bool
    let onImage: (Data) -> Void

    @State private var hasImage = UIPasteboard.general.hasImages

    var body: some View {
        Group {
            if hasImage {
                HStack(spacing: 8) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .foregroundStyle(Theme.goldDark)
                    Text("صورة منسوخة جاهزة للّصق")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.navy)
                    Spacer(minLength: 4)
                    PasteButton(supportedContentTypes: [.image]) { providers in
                        guard let p = providers.first else { return }
                        p.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { data, _ in
                            guard let data, let img = UIImage(data: data),
                                  let jpeg = img.jpegData(compressionQuality: 0.85) else { return }
                            DispatchQueue.main.async {
                                hasImage = false
                                onImage(jpeg)
                            }
                        }
                    }
                    .labelStyle(.titleAndIcon)
                    .buttonBorderShape(.capsule)
                    .controlSize(.small)
                    .tint(Theme.goldDark)
                    .disabled(disabled)
                    Button {
                        withAnimation { hasImage = false }
                    } label: {
                        Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.muted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("تجاهل")
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Theme.goldPale, in: Capsule())
                .padding(.horizontal, 12)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIPasteboard.changedNotification)) { _ in
            withAnimation { hasImage = UIPasteboard.general.hasImages }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            withAnimation { hasImage = UIPasteboard.general.hasImages }
        }
    }
}
