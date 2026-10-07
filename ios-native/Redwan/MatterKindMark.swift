import SwiftUI

// رمز نوع الملف — وإجراء الإفلاس بحلقة خضراء بلون لجنة الإفلاس (طلب المدير 2026-10-07: «حواف الأيقونة
// تكون باللون الأخضر اللي في شعار لجنة الإفلاس»، واختار الحلقة). مرآة MatterKindIcon في الويب (4d0eab1).
// اللون من هوية اللجنة نفسها (bankruptcy.gov.sa).
enum BankruptcyBrand {
    static let green = Color(hex: 0x14A99B)
    static let pale = Color(hex: 0xE6F6F4)
}

/// الرمز داخل السطر: للإفلاس دائرة بحلقة خضراء، ولغيره الإيموجي كما هو
struct MatterKindMark: View {
    let kind: String?
    var size: CGFloat = 14

    var body: some View {
        if kind == "bankruptcy" {
            Text(matterKindEmoji(kind))
                .font(.system(size: size * 0.78))
                .frame(width: size * 1.45, height: size * 1.45)
                .background(BankruptcyBrand.pale, in: Circle())
                .overlay(Circle().stroke(BankruptcyBrand.green, lineWidth: max(1.5, size * 0.12)))
                .accessibilityLabel("إجراء إفلاس")
        } else {
            Text(matterKindEmoji(kind)).font(.system(size: size))
        }
    }
}
