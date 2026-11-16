import SwiftUI

// روابط مخزن documents عبر توقيع مؤقت — المخزن الخاص، المرحلة ٢ (المراجعة الشاملة 2026-11-15، الدفعة ٤ البند ١).
// مرآة src/lib/storedUrl.ts في الويب: الرابط المحفوظ في القاعدة عام دائم (…/object/public/documents/…)،
// فكل فتح لملف يمرّ من هنا ليأخذ من دالة sign-files رابطاً صالحاً ساعة، بصلاحيات الموظف نفسه
// (يُوقَّع فقط ما يرى سجلاً يشير إليه). الطلبات خلال ٣٠ م.ث تُجمع في نداء واحد، والنتيجة تُحفظ ٥٠ دقيقة.
// ما دام المخزن عاماً: إن تعذّر التوقيع يُستعمل الرابط الأصلي فلا يتعطل شيء؛ وبعد قلبه خاصاً لا يعمل إلا الموقّع.

enum StoredURL {
    static let prefix = "https://zwaahunavepleczuamuy.supabase.co/storage/v1/object/public/documents/"

    static func isStored(_ url: String?) -> Bool { url?.hasPrefix(prefix) == true }

    /// الرابط الموقّع، أو الأصلي إن لم يكن من المخزن أو تعذّر التوقيع
    static func sign(_ url: String) async -> String {
        guard isStored(url) else { return url }
        return await StoredSigner.shared.sign(url)
    }

    /// للفتح والتنزيل والعرض: رابط جاهز (nil إن كان النص فارغاً أو غير صالح)
    static func resolve(_ url: String?) async -> URL? {
        guard let url, !url.isEmpty else { return nil }
        return URL(string: await sign(url))
    }

    /// يُنادى عند الخروج — الروابط الموقّعة لحساب لا تبقى لمن يدخل بعده
    static func clear() { Task { await StoredSigner.shared.clear() } }
}

actor StoredSigner {
    static let shared = StoredSigner()

    private var cache: [String: (url: String, exp: Date)] = [:]
    private var pending: [String: [CheckedContinuation<String, Never>]] = [:]
    private var scheduled = false

    func sign(_ url: String) async -> String {
        if let hit = cache[url], hit.exp > Date() { return hit.url }
        return await withCheckedContinuation { c in
            pending[url, default: []].append(c)
            if !scheduled {
                scheduled = true
                Task {
                    try? await Task.sleep(nanoseconds: 30_000_000)
                    await self.flush()
                }
            }
        }
    }

    func clear() { cache.removeAll() }

    private func flush() async {
        scheduled = false
        let batch = pending
        pending = [:]
        let urls = Array(batch.keys)
        var signed: [String: String] = [:]
        var i = 0
        while i < urls.count {
            let chunk = Array(urls[i..<min(i + 100, urls.count)])
            i += 100
            // عبر raw لا نداء مباشر: انتهاء الجلسة يُجدَّد صامتاً ويُعاد الطلب مرة
            if let body = try? JSONSerialization.data(withJSONObject: ["urls": chunk]),
               let data = try? await SB.shared.raw(path: "functions/v1/sign-files", method: "POST", query: [], body: body),
               let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let map = obj["signed"] as? [String: String] {
                signed.merge(map) { _, new in new }
            }
        }
        let exp = Date().addingTimeInterval(50 * 60)
        for (u, s) in signed { cache[u] = (s, exp) }
        for (u, waiters) in batch {
            let out = signed[u] ?? u
            for w in waiters { w.resume(returning: out) }
        }
    }
}

/// AsyncImage لروابط المخزن — يوقّع الرابط أولاً ثم يعرض (والمرحلة empty أثناء التوقيع)
struct StoredAsyncImage<Content: View>: View {
    let url: String?
    @ViewBuilder let content: (AsyncImagePhase) -> Content
    @State private var resolved: URL?

    init(url: String?, @ViewBuilder content: @escaping (AsyncImagePhase) -> Content) {
        self.url = url
        self.content = content
    }

    var body: some View {
        AsyncImage(url: resolved, content: content)
            .task(id: url) { resolved = await StoredURL.resolve(url) }
    }
}
