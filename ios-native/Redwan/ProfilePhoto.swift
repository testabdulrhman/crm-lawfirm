import SwiftUI
import PhotosUI
import UIKit

// الصورة الشخصية يغيّرها الموظف بنفسه من «صفحتي» (طلب المدير 2026-09-23: «ودي الموظفين
// يقدرون يعدلون صورتهم في تطبيق الأيفون»). كانت تُضبط من الويب في نموذج الموظف وحده — للمدير.
//
// لا تعديل في القاعدة: سياسة tm_update_scope تسمح للموظف بصفّه، وحارس tm_guard_privilege_fields
// لا يحمي avatar_url، ومخزن avatars يقبل الرفع من أي موظف مسجّل.

enum ProfilePhoto {
    /// مربّع من وسط الصورة بحجم ٥١٢ — الدوائر في التطبيق والويب مربّعة الأصل،
    /// والصورة الأصلية من الجوال (٤ م.ب فأكثر) ثقيلة على كل قائمة تعرضها.
    static func prepare(_ image: UIImage, side: CGFloat = 512) -> Data? {
        let src = image.size
        let edge = min(src.width, src.height)
        guard edge > 0 else { return nil }
        let target = CGSize(width: side, height: side)
        let scale = side / edge
        let drawn = CGSize(width: src.width * scale, height: src.height * scale)
        let origin = CGPoint(x: (side - drawn.width) / 2, y: (side - drawn.height) / 2)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        // draw(in:) يحترم اتجاه الصورة (صور الكاميرا تصل مقلوبة الاتجاه في بياناتها)
        let out = UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: origin, size: drawn))
        }
        return out.jpegData(compressionQuality: 0.82)
    }
}

extension SB {
    /// يرفع الصورة ويربطها بصفّ الموظف. المسار جديد في كل مرة فيتجاوز كل ذاكرة مؤقتة
    /// (AsyncImage والمتصفح) بلا ‎?t=… — الرابط الجديد يُجلب من جديد حتماً.
    func updateMyAvatar(jpeg: Data) async throws {
        guard let me = member?.id else { throw SBError(message: "تعذّر التعرّف على حسابك") }
        let stamp = Int(Date().timeIntervalSince1970)
        let url = try await storageUpload(
            bucket: "avatars", path: "staff/\(me)/\(stamp).jpg", data: jpeg, mime: "image/jpeg"
        )
        try await patch("team_members", query: [("id", "eq.\(me)")], values: ["avatar_url": url])
        await loadMember()
    }

    /// بلا صورة يعود الحرف على اللون — كما قبل رفعها
    func removeMyAvatar() async throws {
        guard let me = member?.id else { throw SBError(message: "تعذّر التعرّف على حسابك") }
        try await patch("team_members", query: [("id", "eq.\(me)")], values: ["avatar_url": NSNull()])
        await loadMember()
    }
}

/// الكاميرا الأمامية لالتقاط الصورة مباشرة — PhotosPicker لا يفتح الكاميرا
struct CameraPicker: UIViewControllerRepresentable {
    let onPicked: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let c = UIImagePickerController()
        c.sourceType = .camera
        if UIImagePickerController.isCameraDeviceAvailable(.front) { c.cameraDevice = .front }
        c.allowsEditing = true   // مربّع القصّ من النظام — يختار الموظف موضع وجهه
        c.delegate = context.coordinator
        return c
    }

    func updateUIViewController(_ vc: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ p: CameraPicker) { parent = p }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let img = (info[.editedImage] ?? info[.originalImage]) as? UIImage { parent.onPicked(img) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// الصورة في رأس «صفحتي» — الضغط عليها يعرض: التقاط · اختيار · إزالة
struct EditableAvatar: View {
    @EnvironmentObject private var sb: SB
    var size: CGFloat = 54

    @State private var showMenu = false
    @State private var showLibrary = false
    @State private var showCamera = false
    @State private var libraryItem: PhotosPickerItem?
    @State private var busy = false
    @State private var alertText: String?

    private var hasPhoto: Bool { !(sb.member?.avatar_url ?? "").isEmpty }

    var body: some View {
        Button { showMenu = true } label: {
            ZStack(alignment: .bottomTrailing) {
                AvatarCircle(member: sb.member, size: size)
                    .overlay {
                        if busy {
                            Circle().fill(.black.opacity(0.35))
                            ProgressView().tint(.white)
                        }
                    }
                Image(systemName: "camera.fill")
                    .font(.system(size: size * 0.2, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: size * 0.38, height: size * 0.38)
                    .background(Theme.goldDark, in: Circle())
                    .overlay(Circle().stroke(Theme.card, lineWidth: 2))
                    .offset(x: 2, y: 2)
            }
        }
        .buttonStyle(.plain)
        .disabled(busy)
        .accessibilityLabel(hasPhoto ? "غيّر صورتك" : "أضف صورتك")
        .confirmationDialog("صورتك الشخصية", isPresented: $showMenu, titleVisibility: .visible) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("التقط صورة") { showCamera = true }
            }
            Button("اختر من الصور") { showLibrary = true }
            if hasPhoto {
                Button("إزالة الصورة", role: .destructive) { Task { await remove() } }
            }
            Button("إلغاء", role: .cancel) {}
        } message: {
            Text("تظهر لزملائك في النقاشات والمحادثات والمهام")
        }
        .photosPicker(isPresented: $showLibrary, selection: $libraryItem, matching: .images)
        .onChange(of: libraryItem) { _, item in
            guard let item else { return }
            libraryItem = nil
            Task {
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let img = UIImage(data: data) else {
                    alertText = "تعذّرت قراءة الصورة — جرّب صورة أخرى"
                    return
                }
                await upload(img)
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { img in Task { await upload(img) } }
                .ignoresSafeArea()
        }
        .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
            Button("حسناً", role: .cancel) { alertText = nil }
        } message: { Text(alertText ?? "") }
    }

    private func upload(_ img: UIImage) async {
        guard !busy else { return }
        guard let jpeg = ProfilePhoto.prepare(img) else {
            alertText = "تعذّر تجهيز الصورة — جرّب صورة أخرى"
            return
        }
        busy = true
        defer { busy = false }
        do {
            try await sb.updateMyAvatar(jpeg: jpeg)
            Usage.shared.action("تغيير الصورة الشخصية")
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }

    private func remove() async {
        busy = true
        defer { busy = false }
        do {
            try await sb.removeMyAvatar()
        } catch {
            if let t = uiErrorText(error) { alertText = t }
        }
    }
}
