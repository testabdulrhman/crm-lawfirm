import SwiftUI

// «الملفات والروابط» في النقاشات — مرآة DiscussionMediaDialog في الويب (طلب المدير 2026-09-17):
// كل مرفق ورابط في نقاش واحد أو في كل ما أراه، بالخيوط، مع معاينة وقفز إلى الرسالة.

/// الروابط داخل نص رسالة — نفس قواعد links.ts في الويب
enum MessageLinks {
    /// يبدأ بـhttp(s):// أو www. حتى أول فراغ؛ الحروف العربية لا تدخل فيه
    /// («الرابط https://x.comوهذا» شائع بلا فراغ، والعنوان الحقيقي لا يحملها إلا مُرمَّزة)
    private static let urlRE = try! NSRegularExpression(
        pattern: #"(?:https?://|www\.)[^\s<>"'«»\x{0600}-\x{06FF}]+"#,
        options: [.caseInsensitive]
    )
    /// علامات ترقيم تلتصق بآخر الرابط ولا تنتمي إليه
    private static let trailRE = try! NSRegularExpression(pattern: #"[.,،؛:!?؟)\]}"'…]+$"#)

    static func extract(_ text: String?) -> [String] {
        guard let text, !text.isEmpty else { return [] }
        let ns = text as NSString
        var seen: [String] = []
        for m in urlRE.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let url = clean(ns.substring(with: m.range))
            if url.count > 4, !seen.contains(url) { seen.append(url) }
        }
        return seen
    }

    static func clean(_ raw: String) -> String {
        trailRE.stringByReplacingMatches(in: raw, range: NSRange(location: 0, length: (raw as NSString).length), withTemplate: "")
    }

    /// «www.» تُكمَّل بـhttps://
    static func href(_ url: String) -> URL? {
        URL(string: url.lowercased().hasPrefix("http") ? url : "https://\(url)")
    }

    /// اسم الموقع للعرض: بلا https:// ولا www.
    static func host(_ url: String) -> String {
        guard let h = href(url)?.host else { return url }
        return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    }

    /// نص الرسالة بلا روابطها — سطر السياق تحت الرابط
    static func context(_ text: String?) -> String {
        guard let text else { return "" }
        let ns = text as NSString
        let stripped = urlRE.stringByReplacingMatches(in: text, range: NSRange(location: 0, length: ns.length), withTemplate: "")
        return stripped
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+([،,.؛])"#, with: "$1", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
    }
}

struct DiscussionMediaSheet: View {
    /// النقاش المفتوح (nil = العامة). يُتجاهل حين لا نقاش حالي
    let caseId: String?
    /// فُتحت من داخل نقاش؟ وإلا فهي على «كل النقاشات» بلا مبدّل
    let fromDiscussion: Bool
    /// «في النقاش»: الرسالة المقصودة — المنادي يقرر أين يفتحها
    let onJump: (MediaMsg) -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    private enum Tab: Hashable { case files, links }
    @State private var tab: Tab = .files
    @State private var all = false
    @State private var search = ""
    @State private var msgs: [MediaMsg] = []
    @State private var names: [String: String] = [:]
    @State private var titles: [String: String] = [:]
    @State private var loaded = false
    @State private var error: String?
    @State private var preview: FileItem?

    private struct FileItem: Identifiable {
        let msg: MediaMsg
        let doc: MediaDoc
        var id: String { doc.id }
        var name: String { doc.name ?? "ملف" }
    }

    private struct LinkItem: Identifiable {
        let msg: MediaMsg
        let url: String
        var id: String { msg.id + "|" + url }
    }

    private var showAll: Bool { all || !fromDiscussion }

    /// المرفق نفسه قد يُعاد إرساله — يظهر مرة واحدة (الأحدث)
    private var files: [FileItem] {
        var seen = Set<String>()
        return msgs.compactMap { m in
            guard let d = m.document, d.file_url != nil, !seen.contains(d.id) else { return nil }
            seen.insert(d.id)
            return FileItem(msg: m, doc: d)
        }
    }

    private var links: [LinkItem] {
        msgs.flatMap { m in MessageLinks.extract(m.body).map { LinkItem(msg: m, url: $0) } }
    }

    private func matches(_ parts: String?...) -> Bool {
        let q = search.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return true }
        return parts.contains { ($0 ?? "").arContains(q) }
    }

    private var shownFiles: [FileItem] {
        files.filter { matches($0.name, $0.msg.body, author($0.msg), place($0.msg)) }
    }

    private var shownLinks: [LinkItem] {
        links.filter { matches($0.url, $0.msg.body, author($0.msg), place($0.msg)) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 10) {
                if fromDiscussion {
                    Picker("النطاق", selection: $all) {
                        Text("هذا النقاش").tag(false)
                        Text("كل النقاشات").tag(true)
                    }
                    .pickerStyle(.segmented)
                }
                Picker("النوع", selection: $tab) {
                    Text("الملفات (\(files.count))").tag(Tab.files)
                    Text("الروابط (\(links.count))").tag(Tab.links)
                }
                .pickerStyle(.segmented)

                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("الملفات والروابط")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "ابحث باسم الملف أو الرابط أو الكاتب")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إغلاق") { dismiss() }
                }
            }
        }
        .task(id: showAll) { await load() }
        .sheet(item: $preview) { f in
            FilePreviewSheet(name: f.name, url: f.doc.file_url)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let error {
            ErrorBox(message: error) { Task { await load() } }
                .frame(maxHeight: .infinity, alignment: .top)
        } else if !loaded {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if tab == .files {
            if shownFiles.isEmpty {
                EmptyBox(
                    icon: "paperclip",
                    text: search.isEmpty ? "لا ملفات في \(showAll ? "النقاشات" : "هذا النقاش")" : "لا نتائج",
                    subtext: search.isEmpty ? "كل مرفق يُرسل في النقاش يظهر هنا" : nil
                )
                .frame(maxHeight: .infinity, alignment: .top)
            } else {
                list { ForEach(shownFiles) { fileRow($0) } }
            }
        } else {
            if shownLinks.isEmpty {
                EmptyBox(
                    icon: "link",
                    text: search.isEmpty ? "لا روابط في \(showAll ? "النقاشات" : "هذا النقاش")" : "لا نتائج",
                    subtext: search.isEmpty ? "كل رابط يُكتب في رسالة يظهر هنا" : nil
                )
                .frame(maxHeight: .infinity, alignment: .top)
            } else {
                list { ForEach(shownLinks) { linkRow($0) } }
            }
        }
    }

    private func list<C: View>(@ViewBuilder _ rows: () -> C) -> some View {
        ScrollView {
            LazyVStack(spacing: 8) { rows() }
                .padding(.bottom, 20)
        }
        .scrollDismissesKeyboard(.immediately)
    }

    // MARK: - الصفوف

    private func fileRow(_ f: FileItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if VoiceNote.isAudio(f.name) {
                VoiceNoteView(name: f.name, url: f.doc.file_url)
            } else {
                Button { preview = f } label: {
                    HStack(spacing: 10) {
                        Image(systemName: fileIcon(f))
                            .font(.system(size: 17))
                            .foregroundStyle(Theme.goldDark)
                            .frame(width: 38, height: 38)
                            .background(Theme.goldPale, in: RoundedRectangle(cornerRadius: 10))
                        Text(f.name)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Theme.navy)
                            .lineLimit(2)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            footer(f.msg, extra: sizeLabel(f.doc.file_size))
        }
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
    }

    private func linkRow(_ l: LinkItem) -> some View {
        let context = MessageLinks.context(l.msg.body)
        return VStack(alignment: .leading, spacing: 6) {
            Button {
                if let u = MessageLinks.href(l.url) { openURL(u) }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "link")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.blue)
                        .frame(width: 38, height: 38)
                        .background(Theme.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(MessageLinks.host(l.url))
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Theme.navy)
                            .lineLimit(1)
                        Text(l.url)
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.blue)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .environment(\.layoutDirection, .leftToRight)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if !context.isEmpty {
                Text(context)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
            }
            footer(l.msg, extra: nil)
        }
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
    }

    /// الكاتب · الوقت · الحجم · النقاش — وزرّ القفز إلى الرسالة
    private func footer(_ m: MediaMsg, extra: String?) -> some View {
        HStack(spacing: 8) {
            Text(
                [author(m), msgStamp(m.created_at), extra, showAll ? place(m) : nil,
                 m.parent_id != nil ? "في خيط" : nil]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            )
            .font(.system(size: 11))
            .foregroundStyle(Theme.muted)
            .lineLimit(2)
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                dismiss()
                onJump(m)
            } label: {
                Label("في النقاش", systemImage: "arrow.uturn.backward")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Theme.goldDark)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Theme.goldPale, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityHint("يفتح الرسالة داخل نقاشها")
        }
    }

    private func author(_ m: MediaMsg) -> String {
        if m.kind == "ai" { return "الذكاء" }
        return m.author_id.flatMap { names[$0] } ?? "—"
    }

    private func place(_ m: MediaMsg) -> String {
        guard let cid = m.case_id else { return "عام — المكتب" }
        return titles[cid] ?? "نقاش"
    }

    private func fileIcon(_ f: FileItem) -> String {
        let n = f.name.lowercased(), t = (f.doc.file_type ?? "").lowercased()
        if t.hasPrefix("image") || [".png", ".jpg", ".jpeg", ".heic", ".webp", ".gif"].contains(where: n.hasSuffix) { return "photo" }
        if t.contains("pdf") || n.hasSuffix(".pdf") { return "doc.richtext" }
        if [".xls", ".xlsx", ".csv"].contains(where: n.hasSuffix) { return "tablecells" }
        if [".doc", ".docx"].contains(where: n.hasSuffix) { return "doc.text" }
        return "doc"
    }

    private func sizeLabel(_ bytes: Int?) -> String? {
        guard let b = bytes, b > 0 else { return nil }
        if b < 1024 * 1024 { return "\(max(1, b / 1024)) ك.ب" }
        return String(format: "%.1f م.ب", Double(b) / 1_048_576)
    }

    private func load() async {
        error = nil
        do {
            async let media = sb.discussionMedia(caseId: caseId, all: showAll)
            async let people = sb.staff()
            async let rows = sb.discussions()
            msgs = try await media
            names = Dictionary(((try? await people) ?? []).map { ($0.id, $0.short_name ?? $0.name ?? "—") }, uniquingKeysWith: { a, _ in a })
            titles = Dictionary(((try? await rows) ?? []).compactMap { r in r.case_id.map { ($0, r.case_title ?? "نقاش") } }, uniquingKeysWith: { a, _ in a })
            loaded = true
        } catch {
            guard let t = uiErrorText(error) else { return }
            self.error = t
        }
    }
}
