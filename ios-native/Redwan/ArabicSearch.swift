import Foundation

// تطبيع عربي للبحث — «محكمه» تجد «المحكمة» و«احمد» يجد «أحمد».
// نفس القاعدة في src/lib/arabic.ts (الويب) وar_norm() في قاعدة البيانات.

extension String {
    /// توحيد الهمزات والتاء المربوطة والألف المقصورة + إسقاط التشكيل والتطويل
    var arNorm: String {
        var s = precomposedStringWithCanonicalMapping.lowercased()
        // التشكيل (0x064B-0x0652) + الألف الخنجرية (0x0670) + التطويل (0x0640)
        s.unicodeScalars.removeAll { scalar in
            (0x064B...0x0652).contains(scalar.value)
                || scalar.value == 0x0670 || scalar.value == 0x0640
        }
        let map: [Character: Character] = [
            "\u{0623}": "ا", "\u{0625}": "ا", "\u{0622}": "ا", "\u{0671}": "ا",
            "\u{0629}": "ه",
            "\u{0649}": "ي",
        ]
        return String(s.map { map[$0] ?? $0 })
    }

    /// بحث غير حساس للهمزات/التاء المربوطة — needle يُطبَّع داخلياً
    func arContains(_ needle: String) -> Bool {
        arNorm.contains(needle.arNorm)
    }
}
