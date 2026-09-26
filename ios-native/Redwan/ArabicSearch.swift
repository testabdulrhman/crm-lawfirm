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
        // لوحة المفاتيح العربية تكتب «٢٦٠١١» والمخزّن «26011» — الأرقام الهندية والفارسية لاتينية (2026-09-26)
        return String(s.map { c -> Character in
            if let m = map[c] { return m }
            if let v = c.unicodeScalars.first?.value, c.unicodeScalars.count == 1,
               (0x0660...0x0669).contains(v) || (0x06F0...0x06F9).contains(v) {
                return Character(String((v - (v >= 0x06F0 ? 0x06F0 : 0x0660))))
            }
            return c
        })
    }

    /// بحث غير حساس للهمزات/التاء المربوطة — needle يُطبَّع داخلياً
    func arContains(_ needle: String) -> Bool {
        arNorm.contains(needle.arNorm)
    }
}
