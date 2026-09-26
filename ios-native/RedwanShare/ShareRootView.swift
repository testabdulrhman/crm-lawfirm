import SwiftUI

// واجهة المشاركة: قائمة النقاشات ← تعليق اختياري ← إرسال.
// ألوان الهوية مكررة محلياً — Theme.swift ملك هدف التطبيق وحده.

private enum ShareTheme {
    static let navy = Color(red: 0x11 / 255, green: 0x1D / 255, blue: 0x3A / 255)
    static let gold = Color(red: 0xC9 / 255, green: 0xA8 / 255, blue: 0x4C / 255)
    static let goldDark = Color(red: 0x8C / 255, green: 0x71 / 255, blue: 0x29 / 255)
    static let ivory = Color(red: 0xF8 / 255, green: 0xF6 / 255, blue: 0xF2 / 255)
    static let muted = Color(red: 0x5F / 255, green: 0x6B / 255, blue: 0x84 / 255)
}

struct ShareRootView: View {
    let extractItems: () async -> [SharedItem]
    let finish: () -> Void
    let cancel: () -> Void

    private let client = ShareClient()

    @State private var phase: Phase = .loading
    @State private var channels: [ShareChannel] = []
    @State private var items: [SharedItem] = []
    @State private var selected: ShareChannel?
    @State private var caption = ""
    @State private var sending = false
    @State private var progress = ""
    @State private var errorMsg: String?
    /// البحث عن نقاش بعينه (طلب المدير 2026-09-26: «ما يظهر اني اقدر أبحث عن مناقشة محددة»)
    @State private var query = ""

    enum Phase { case loading, needLogin, ready, done }

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .loading:
                    ProgressView("لحظات…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .needLogin:
                    VStack(spacing: 10) {
                        Image(systemName: "person.crop.circle.badge.exclamationmark")
                            .font(.system(size: 40))
                            .foregroundStyle(ShareTheme.goldDark)
                        Text("سجّل الدخول في تطبيق رضوان أولاً")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(ShareTheme.navy)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .ready:
                    content
                case .done:
                    VStack(spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.green)
                        Text("أُرسل إلى النقاش وحُفظ في المستندات")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(ShareTheme.navy)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .background(ShareTheme.ivory.ignoresSafeArea())
            .navigationTitle("إرسال إلى رضوان")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { cancel() }
                        .disabled(sending)
                }
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
        .task { await bootstrap() }
    }

    private var content: some View {
        VStack(spacing: 0) {
            // ما سيُرسل
            VStack(alignment: .leading, spacing: 6) {
                ForEach(items) { it in
                    HStack(spacing: 6) {
                        Image(systemName: it.data != nil ? "doc.fill" : "link")
                            .font(.system(size: 12))
                            .foregroundStyle(ShareTheme.goldDark)
                        Text(it.data != nil ? it.fileName : (it.text ?? ""))
                            .font(.system(size: 13))
                            .foregroundStyle(ShareTheme.navy)
                            .lineLimit(1)
                        if let d = it.data {
                            Text("\(d.count / 1024) ك.ب")
                                .font(.system(size: 11))
                                .foregroundStyle(ShareTheme.muted)
                        }
                    }
                }
                TextField("تعليق اختياري…", text: $caption)
                    .font(.system(size: 14))
                    .padding(10)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)

            Divider()

            // البحث عن النقاش — بالعنوان أو رقم الملف أو اسم الزميل
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 14))
                    .foregroundStyle(ShareTheme.muted)
                TextField("ابحث عن نقاش أو ملف أو زميل…", text: $query)
                    .font(.system(size: 14))
                    .autocorrectionDisabled()
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(ShareTheme.muted)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(10)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .padding(.horizontal, 12)
            .padding(.top, 10)

            // اختيار النقاش
            List {
                Section(query.isEmpty ? "أرسل إلى" : "النتائج (\(filtered.count + (generalMatches ? 1 : 0)))") {
                    if generalMatches {
                        row(nil, title: "عام — المكتب", icon: "megaphone.fill")
                    }
                    ForEach(filtered) { ch in
                        row(ch, title: ch.case_title ?? "نقاش", icon: icon(ch.kind))
                    }
                    if !query.isEmpty && filtered.isEmpty && !generalMatches {
                        Text("لا نقاش يطابق «\(query)»")
                            .font(.system(size: 13))
                            .foregroundStyle(ShareTheme.muted)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)

            if let errorMsg {
                Text(errorMsg)
                    .font(.system(size: 12))
                    .foregroundStyle(.red)
                    .padding(.horizontal, 12)
                    .padding(.top, 4)
            }

            Button(action: send) {
                HStack {
                    if sending {
                        ProgressView().tint(.white)
                        Text(progress)
                    } else {
                        Image(systemName: "paperplane.fill")
                        Text("إرسال")
                    }
                }
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(ShareTheme.navy)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(ShareTheme.gold)
                .clipShape(RoundedRectangle(cornerRadius: 13))
            }
            .disabled(sending || selected == nil)
            .opacity(sending ? 0.7 : 1)
            .padding(12)
        }
    }

    private var filtered: [ShareChannel] {
        let all = channels.filter { $0.case_id != nil }
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return all }
        let nq = q.shareNorm
        return all.filter {
            ($0.case_title ?? "").shareNorm.contains(nq) || ($0.office_num ?? "").shareNorm.contains(nq)
        }
    }

    private var generalMatches: Bool {
        let q = query.trimmingCharacters(in: .whitespaces)
        return q.isEmpty || "عام — المكتب".shareNorm.contains(q.shareNorm)
    }

    private func icon(_ kind: String?) -> String {
        switch kind {
        case "dm": return "person.fill"
        case "channel": return "number"
        case "legal_service": return "doc.text.fill"
        case "property": return "house.fill"
        case "bankruptcy": return "banknote.fill"
        default: return "building.columns.fill"
        }
    }

    private func row(_ ch: ShareChannel?, title: String, icon: String) -> some View {
        let isSel = selected?.id == (ch?.id ?? "general")
        return Button {
            selected = ch ?? ShareChannel(case_id: nil, case_title: "عام — المكتب", office_num: nil)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .foregroundStyle(ShareTheme.goldDark)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 14, weight: isSel ? .semibold : .regular))
                        .foregroundStyle(ShareTheme.navy)
                        .lineLimit(1)
                    if let num = ch?.office_num {
                        Text(num)
                            .font(.system(size: 11))
                            .foregroundStyle(ShareTheme.muted)
                    }
                }
                Spacer()
                if isSel {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(ShareTheme.gold)
                }
            }
        }
    }

    private func bootstrap() async {
        guard client.loadSession() else {
            phase = .needLogin
            return
        }
        items = await extractItems()
        do {
            try await client.loadMember()
            channels = try await client.channels()
            phase = .ready
        } catch {
            // جلسة ميتة أو شبكة — نفس معاملة عدم الدخول مع سبب واضح
            errorMsg = error.localizedDescription
            phase = .ready
        }
    }

    private func send() {
        guard let dest = selected, !sending else { return }
        sending = true
        errorMsg = nil
        Task {
            do {
                let files = items.filter { $0.data != nil }
                let texts = items.compactMap(\.text)
                var cap = caption.trimmingCharacters(in: .whitespaces)
                if !texts.isEmpty {
                    cap = (cap.isEmpty ? "" : cap + "\n") + texts.joined(separator: "\n")
                }

                var idx = 0
                for f in files {
                    idx += 1
                    progress = files.count > 1 ? "يرفع \(idx) من \(files.count)…" : "جارٍ الرفع…"
                    guard let data = f.data, data.count <= 15 * 1024 * 1024 else {
                        throw ShareError(message: "\(f.fileName): أكبر من ١٥ ميغابايت")
                    }
                    // التعليق مع أول ملف فقط — كالتطبيق تماماً
                    try await client.sendFile(
                        data: data, fileName: f.fileName, mime: f.mime,
                        caseId: dest.case_id, caption: idx == 1 ? cap : nil
                    )
                }

                // نص/رابط بلا ملفات — رسالة نصية
                if files.isEmpty {
                    guard !cap.isEmpty else { throw ShareError(message: "لا يوجد ما يُرسل") }
                    try await client.sendText(caseId: dest.case_id, body: cap)
                }

                phase = .done
                try? await Task.sleep(for: .seconds(1.2))
                finish()
            } catch {
                errorMsg = error.localizedDescription
            }
            sending = false
        }
    }
}

private extension String {
    /// تطبيع عربي للبحث — نسخة من arNorm في التطبيق (هدف الامتداد لا يراه):
    /// الهمزات والتاء المربوطة والألف المقصورة، وإسقاط التشكيل والتطويل
    var shareNorm: String {
        var s = precomposedStringWithCanonicalMapping.lowercased()
        s.unicodeScalars.removeAll { v in
            (0x064B...0x0652).contains(v.value) || v.value == 0x0670 || v.value == 0x0640
        }
        let map: [Character: Character] = [
            "\u{0623}": "ا", "\u{0625}": "ا", "\u{0622}": "ا", "\u{0671}": "ا",
            "\u{0629}": "ه", "\u{0649}": "ي",
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
}
