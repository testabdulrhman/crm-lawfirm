import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

// مجرى القناة وخيوطها — v2 (طلبات المستخدم 2026-08-21):
// تفاعل إيموجي + حفظ (بوك مارك) + تعديل وحذف رسالتي + إرسال صور وملفات.
// caseId فارغ = القناة العامة «عام — المكتب».

private let QUICK_EMOJIS = ["👍", "❤️", "✅", "😂", "😮", "🙏"]

// MARK: - منشن الموظفين (طلب المستخدم 2026-08-21: «ابي اعمل منشن للي عندي»)

enum Mention {
    static func label(_ p: TeamMember) -> String {
        (p.short_name ?? p.name ?? "").trimmingCharacters(in: .whitespaces)
    }

    /// من ذُكر فعلاً في النص عند الإرسال — فحص النص النهائي، فيصح المنشن
    /// حتى لو كُتب الاسم يدوياً دون القائمة.
    /// ⚠️ \b لا يعمل مع العربية — lookahead يونيكود (نفس درس الويب).
    static func extract(from body: String, people: [TeamMember]) -> [String] {
        guard body.contains("@") else { return [] }
        return people.filter { p in
            let l = label(p)
            guard !l.isEmpty,
                  let re = try? NSRegularExpression(
                      pattern: "@" + NSRegularExpression.escapedPattern(for: l) + "(?![\\p{L}\\p{N}_])"
                  )
            else { return false }
            return re.firstMatch(
                in: body, range: NSRange(body.startIndex..., in: body)
            ) != nil
        }.map(\.id)
    }

    /// تلوين أي @كلمة بالذهبي (يشمل @الذكاء) — للعرض في الفقاعات
    static func styled(_ text: String) -> AttributedString {
        var out = AttributedString(text)
        guard text.contains("@"),
              let re = try? NSRegularExpression(pattern: "@[\\p{L}\\p{N}_]+")
        else { return out }
        let full = NSRange(text.startIndex..., in: text)
        for m in re.matches(in: text, range: full) {
            guard let sr = Range(m.range, in: text),
                  let lo = AttributedString.Index(sr.lowerBound, within: out),
                  let up = AttributedString.Index(sr.upperBound, within: out)
            else { continue }
            out[lo..<up].foregroundColor = Theme.goldDark
            out[lo..<up].font = .system(size: 14, weight: .semibold)
        }
        return out
    }
}

/// زر @ في حقل الكتابة: قائمة الموظفين، والاختيار يُدرج @الاسم في النص
struct MentionMenu: View {
    let staff: [TeamMember]
    @Binding var draft: String

    var body: some View {
        Menu {
            ForEach(staff) { p in
                let l = Mention.label(p)
                if !l.isEmpty {
                    Button(l) {
                        let sep = draft.isEmpty || draft.hasSuffix(" ") ? "" : " "
                        draft += sep + "@" + l + " "
                    }
                }
            }
        } label: {
            Image(systemName: "at")
                .font(.system(size: 15))
                .foregroundStyle(Theme.muted)
        }
        .disabled(staff.isEmpty)
    }
}

struct CaseStreamView: View {
    let caseId: String?
    let title: String

    @EnvironmentObject private var sb: SB
    @State private var msgs: [StreamMsg] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var draft = ""
    @State private var sending = false
    @State private var sendError: String?

    // المرفقات
    @State private var photoItem: PhotosPickerItem?
    @State private var showPhotoPicker = false
    @State private var showFilePicker = false
    @State private var uploading = false

    // تحرير رسالة
    @State private var editing: StreamMsg?
    @State private var editDraft = ""

    // قائمة المنشن
    @State private var staff: [TeamMember] = []

    var body: some View {
        VStack(spacing: 0) {
            if let error {
                ErrorBox(message: error) { Task { await load() } }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            if msgs.isEmpty {
                                EmptyBox(
                                    icon: "bubble.left",
                                    text: caseId == nil ? "القناة العامة هادئة" : "لا كلام في هذه القضية بعد",
                                    subtext: "اكتب أول رسالة — تبقى هنا مربوطة بمكانها"
                                )
                                .padding(.top, 30)
                            }
                            ForEach(msgs) { m in
                                StreamBubble(
                                    msg: m, caseId: caseId,
                                    mine: m.author_id == sb.member?.id,
                                    onChange: { Task { await load() } },
                                    onEdit: { editing = m; editDraft = m.body ?? "" }
                                )
                                .id(m.id)
                            }
                        }
                        .padding(12)
                    }
                    .onChange(of: msgs.count) {
                        if let last = msgs.last?.id {
                            withAnimation { proxy.scrollTo(last, anchor: .bottom) }
                        }
                    }
                }
            }

            composer
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await load()
            try? await sb.markRead(caseId: caseId)
            staff = (try? await sb.staff()) ?? []
        }
        .sheet(item: $editing) { m in
            EditMessageSheet(draft: $editDraft) { newBody in
                Task {
                    try? await sb.editMessage(id: m.id, body: newBody)
                    editing = nil
                    await load()
                }
            }
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images)
        .fileImporter(
            isPresented: $showFilePicker,
            allowedContentTypes: [.pdf, .image, .data]
        ) { result in
            if case .success(let url) = result {
                Task { await uploadFile(url: url) }
            }
        }
        .onChange(of: photoItem) {
            guard let item = photoItem else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await uploadData(data, fileName: "صورة.jpg", mime: "image/jpeg")
                }
                photoItem = nil
            }
        }
    }

    // MARK: - حقل الإرسال

    private var composer: some View {
        VStack(spacing: 4) {
            if let sendError {
                Text(sendError)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
            }
            if uploading {
                HStack(spacing: 6) {
                    ProgressView().scaleEffect(0.8)
                    Text("جارٍ رفع المرفق…")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14)
            }
            // ترتيب الواتساب حرفياً (طلب المستخدم 2026-08-22): الإرسال يمين
            // و«+» يسار يجمع كل الإضافات — حتى لا يحس الموظف بفرق.
            // في RTL أول عنصر بالكود يقع يميناً.
            HStack(spacing: 8) {
                Button(action: send) {
                    Group {
                        if sending {
                            ProgressView().tint(Theme.navy)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.navy)
                        }
                    }
                    .frame(width: 36, height: 36)
                    .background(Theme.gold)
                    .clipShape(Circle())
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)

                TextField("اكتب رسالة…", text: $draft, axis: .vertical)
                    .font(.system(size: 14))
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Theme.ivory)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                Menu {
                    Button {
                        showPhotoPicker = true
                    } label: {
                        Label("صورة", systemImage: "photo")
                    }
                    Button {
                        showFilePicker = true
                    } label: {
                        Label("ملف", systemImage: "doc")
                    }
                    Menu {
                        ForEach(staff) { p in
                            let l = Mention.label(p)
                            if !l.isEmpty {
                                Button(l) {
                                    let sep = draft.isEmpty || draft.hasSuffix(" ") ? "" : " "
                                    draft += sep + "@" + l + " "
                                }
                            }
                        }
                    } label: {
                        Label("منشن زميل", systemImage: "at")
                    }
                    Button {
                        if !draft.contains("@الذكاء") { draft = "@الذكاء " + draft }
                    } label: {
                        Label("سؤال الذكاء", systemImage: "sparkles")
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(Theme.navy)
                        .frame(width: 36, height: 36)
                }
                .disabled(uploading)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(Theme.card)
        .overlay(Rectangle().frame(height: 0.5).foregroundStyle(Theme.line), alignment: .top)
    }

    private func send() {
        let body = draft.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty, !sending else { return }
        sending = true
        sendError = nil
        Task {
            do {
                try await sb.postMessage(
                    caseId: caseId, body: body,
                    mentions: Mention.extract(from: body, people: staff)
                )
                draft = ""
                await load()
                Task {
                    try? await Task.sleep(for: .seconds(5))
                    await load()
                    try? await Task.sleep(for: .seconds(7))
                    await load()
                }
            } catch {
                sendError = error.localizedDescription
            }
            sending = false
        }
    }

    // MARK: - المرفقات

    private func uploadFile(url: URL) async {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else {
            sendError = "تعذّرت قراءة الملف"
            return
        }
        let mime = url.pathExtension.lowercased() == "pdf" ? "application/pdf" : "application/octet-stream"
        await uploadData(data, fileName: url.lastPathComponent, mime: mime)
    }

    private func uploadData(_ data: Data, fileName: String, mime: String) async {
        guard data.count <= 15 * 1024 * 1024 else {
            sendError = "الملف أكبر من ١٥ ميغابايت"
            return
        }
        uploading = true
        sendError = nil
        do {
            let docId = try await sb.uploadAttachment(
                data: data, fileName: fileName, mime: mime, caseId: caseId
            )
            let caption = draft.trimmingCharacters(in: .whitespaces)
            try await sb.postMessage(
                caseId: caseId,
                body: caption.isEmpty ? nil : caption,
                documentId: docId,
                mentions: caption.isEmpty ? nil : Mention.extract(from: caption, people: staff)
            )
            draft = ""
            await load()
        } catch {
            sendError = error.localizedDescription
        }
        uploading = false
    }

    private func load() async {
        error = nil
        do {
            msgs = try await sb.stream(caseId: caseId)
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - شريط التفاعلات تحت الفقاعة

struct ReactionsBar: View {
    let commentId: String
    let reactions: [Reaction]
    let onChange: () -> Void
    @EnvironmentObject private var sb: SB

    var body: some View {
        if !reactions.isEmpty {
            HStack(spacing: 5) {
                ForEach(reactions, id: \.e) { r in
                    Button {
                        Task {
                            try? await sb.toggleReaction(
                                commentId: commentId, emoji: r.e, currentlyMine: r.me
                            )
                            onChange()
                        }
                    } label: {
                        HStack(spacing: 3) {
                            Text(r.e).font(.system(size: 12))
                            Text("\(r.n)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(r.me ? Theme.goldDark : Theme.muted)
                        }
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(r.me ? Theme.goldPale : Theme.ivory)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule().stroke(r.me ? Theme.gold.opacity(0.5) : Theme.line, lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

/// قائمة السياق المشتركة: تفاعل سريع + حفظ + (تعديل/حذف لرسالتي)
struct MessageContextMenu: View {
    let commentId: String
    let messageBody: String?
    let reactions: [Reaction]
    let bookmarked: Bool
    let mine: Bool
    let createdAt: String?
    let onChange: () -> Void
    let onEdit: (() -> Void)?
    @EnvironmentObject private var sb: SB

    /// مهلة التعديل والحذف ساعة — القاعدة تفرضها أيضاً (enforce_edit_window)
    private var withinEditWindow: Bool {
        guard let createdAt,
              let d = ISO8601DateFormatter.flexible.date(from: createdAt)
        else { return false }
        return Date().timeIntervalSince(d) < 3600
    }

    var body: some View {
        Group {
            ForEach(QUICK_EMOJIS, id: \.self) { e in
                let isMine = reactions.first(where: { $0.e == e })?.me ?? false
                Button {
                    Task {
                        try? await sb.toggleReaction(commentId: commentId, emoji: e, currentlyMine: isMine)
                        onChange()
                    }
                } label: {
                    Label("\(e) تفاعل", systemImage: isMine ? "checkmark.circle.fill" : "face.smiling")
                }
            }

            Divider()

            Button {
                Task {
                    try? await sb.toggleBookmark(commentId: commentId, currentlyOn: bookmarked)
                    onChange()
                }
            } label: {
                Label(bookmarked ? "إزالة من المحفوظات" : "حفظ للرجوع إليها",
                      systemImage: bookmarked ? "bookmark.slash" : "bookmark")
            }

            if let messageBody, !messageBody.isEmpty {
                Button {
                    UIPasteboard.general.string = messageBody
                } label: {
                    Label("نسخ النص", systemImage: "doc.on.doc")
                }
            }

            if mine && withinEditWindow {
                Divider()
                if let onEdit {
                    Button { onEdit() } label: {
                        Label("تعديل", systemImage: "pencil")
                    }
                }
                Button(role: .destructive) {
                    Task {
                        try? await sb.deleteMessage(id: commentId)
                        onChange()
                    }
                } label: {
                    Label("حذف", systemImage: "trash")
                }
            }
        }
    }
}

// MARK: - فقاعة في المجرى (جذر خيط)

private struct StreamBubble: View {
    let msg: StreamMsg
    let caseId: String?
    let mine: Bool
    let onChange: () -> Void
    let onEdit: () -> Void

    @State private var openThread = false

    private var isAI: Bool { msg.kind == "ai" }
    private var isSystem: Bool { msg.kind == "system" }

    var body: some View {
        if isSystem {
            Text(msg.body ?? "")
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Theme.navy.opacity(0.06))
                .clipShape(Capsule())
                .frame(maxWidth: .infinity)
        } else {
            bubble
        }
    }

    private var bubble: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                if isAI {
                    Image(systemName: "sparkles")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.goldDark)
                }
                Text(isAI ? "الذكاء" : (msg.author_name ?? "—"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(isAI ? Theme.goldDark : Theme.muted)
                Text(shortStamp(msg.created_at))
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.muted.opacity(0.8))
                if msg.edited_at != nil {
                    Text("(معدّلة)")
                        .font(.system(size: 9))
                        .foregroundStyle(Theme.muted.opacity(0.7))
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                if let body = msg.body, !body.isEmpty {
                    Text(Mention.styled(body))
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.navy)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let name = msg.document_name {
                    AttachmentChip(name: name, url: msg.document_url)
                }

                Divider().overlay(mine ? Theme.gold.opacity(0.35) : Theme.line)
                Button {
                    openThread = true
                } label: {
                    HStack(spacing: 6) {
                        if let n = msg.reply_count, n > 0 {
                            Text(repliesLabel(n))
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.blue)
                            if let last = msg.last_reply_at {
                                Text("آخرها \(shortStamp(last))")
                                    .font(.system(size: 10))
                                    .foregroundStyle(Theme.muted)
                            }
                        } else {
                            Text("ردّ في خيط")
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.left")
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.muted.opacity(0.6))
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(11)
            .background(mine ? Theme.gold.opacity(0.16) : (isAI ? Theme.goldPale : Theme.card))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(mine ? .clear : (isAI ? Theme.gold.opacity(0.4) : Theme.line), lineWidth: 1)
            )
            .contextMenu {
                MessageContextMenu(
                    commentId: msg.id,
                    messageBody: msg.body,
                    reactions: msg.reactions ?? [],
                    bookmarked: msg.bookmarked ?? false,
                    mine: mine,
                    createdAt: msg.created_at,
                    onChange: onChange,
                    onEdit: mine ? onEdit : nil
                )
            }

            ReactionsBar(commentId: msg.id, reactions: msg.reactions ?? [], onChange: onChange)
        }
        .navigationDestination(isPresented: $openThread) {
            ThreadView(root: msg, caseId: caseId, onChange: onChange)
        }
    }

    private func repliesLabel(_ n: Int) -> String {
        switch n {
        case 1: return "ردّ واحد"
        case 2: return "ردّان"
        default: return "\(n) ردود"
        }
    }
}

/// شريحة مرفق — تفتح الملف
struct AttachmentChip: View {
    let name: String
    let url: String?

    var body: some View {
        Button {
            if let url, let u = URL(string: url) {
                UIApplication.shared.open(u)
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "doc.text.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(Theme.goldDark)
                VStack(alignment: .leading, spacing: 1) {
                    Text(name)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(Theme.navy)
                        .lineLimit(1)
                    Text("محفوظ في المستندات — اضغط للفتح")
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.success)
                }
                Spacer(minLength: 0)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - ورقة التعديل

private struct EditMessageSheet: View {
    @Binding var draft: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                TextField("نص الرسالة", text: $draft, axis: .vertical)
                    .font(.system(size: 15))
                    .lineLimit(3...10)
                    .padding(12)
                    .background(Theme.ivory)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                Spacer()
            }
            .padding(16)
            .background(Theme.card)
            .navigationTitle("تعديل الرسالة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") {
                        let t = draft.trimmingCharacters(in: .whitespaces)
                        if !t.isEmpty { onSave(t) }
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - داخل الخيط

private struct ThreadView: View {
    let root: StreamMsg
    let caseId: String?
    let onChange: () -> Void

    @EnvironmentObject private var sb: SB
    @State private var replies: [ThreadMsg] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var draft = ""
    @State private var alsoToStream = false
    @State private var sending = false
    @State private var sendError: String?
    @State private var editingReply: ThreadMsg?
    @State private var editDraft = ""
    @State private var staff: [TeamMember] = []

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 5) {
                            Text(root.kind == "ai" ? "الذكاء" : (root.author_name ?? "—"))
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Theme.muted)
                            Text(shortStamp(root.created_at))
                                .font(.system(size: 10))
                                .foregroundStyle(Theme.muted.opacity(0.8))
                        }
                        Text(Mention.styled(root.body ?? root.document_name ?? "—"))
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Theme.navy)
                    }
                    .padding(11)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.card)
                    .overlay(
                        Rectangle().frame(width: 3).foregroundStyle(Theme.gold),
                        alignment: .trailing
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 10))

                    if !loaded {
                        ProgressView().frame(maxWidth: .infinity)
                    } else if let error {
                        ErrorBox(message: error) { Task { await load() } }
                    } else if replies.isEmpty {
                        EmptyBox(icon: "arrowshape.turn.up.left", text: "لا ردود بعد")
                    } else {
                        Text(replies.count == 1 ? "ردّ واحد" : "\(replies.count) ردود")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.muted)
                            .frame(maxWidth: .infinity)

                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(replies) { r in
                                replyBubble(r)
                            }
                        }
                        .padding(.trailing, 10)
                        .overlay(
                            Rectangle().frame(width: 1).foregroundStyle(Theme.line),
                            alignment: .trailing
                        )
                    }
                }
                .padding(12)
            }

            composer
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("خيط")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await load()
            staff = (try? await sb.staff()) ?? []
        }
        .sheet(item: $editingReply) { r in
            EditMessageSheet(draft: $editDraft) { newBody in
                Task {
                    try? await sb.editMessage(id: r.id, body: newBody)
                    editingReply = nil
                    await load()
                }
            }
        }
    }

    private func replyBubble(_ r: ThreadMsg) -> some View {
        let mine = r.author_id == sb.member?.id
        let isAI = r.kind == "ai"
        let isSystem = r.kind == "system"
        return VStack(alignment: .leading, spacing: 3) {
            if isSystem {
                Text(r.body ?? "")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Theme.navy.opacity(0.06))
                    .clipShape(Capsule())
                    .frame(maxWidth: .infinity)
            } else {
                HStack(spacing: 6) {
                    if isAI {
                        Image(systemName: "sparkles")
                            .font(.system(size: 11))
                            .foregroundStyle(Theme.goldDark)
                            .frame(width: 20, height: 20)
                            .background(Theme.goldPale)
                            .clipShape(Circle())
                    } else {
                        AvatarCircle(
                            member: TeamMember(
                                id: r.author_id ?? "", name: r.author_name,
                                short_name: r.author_name, is_director: nil,
                                avatar_initial: r.avatar_initial, avatar_color: r.avatar_color
                            ),
                            size: 20
                        )
                    }
                    Text(isAI ? "الذكاء" : (r.author_name ?? "—"))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(isAI ? Theme.goldDark : Theme.muted)
                    Text(shortStamp(r.created_at))
                        .font(.system(size: 10))
                        .foregroundStyle(Theme.muted.opacity(0.8))
                    if r.edited_at != nil {
                        Text("(معدّلة)")
                            .font(.system(size: 9))
                            .foregroundStyle(Theme.muted.opacity(0.7))
                    }
                }
                VStack(alignment: .leading, spacing: 6) {
                    if let b = r.body, !b.isEmpty {
                        Text(Mention.styled(b))
                            .font(.system(size: 14))
                            .foregroundStyle(Theme.navy)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if let name = r.document_name {
                        AttachmentChip(name: name, url: r.document_url)
                    }
                }
                .padding(10)
                .background(mine ? Theme.gold.opacity(0.16) : (isAI ? Theme.goldPale : Theme.card))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(mine ? .clear : (isAI ? Theme.gold.opacity(0.4) : Theme.line), lineWidth: 1)
                )
                .contextMenu {
                    MessageContextMenu(
                        commentId: r.id,
                        messageBody: r.body,
                        reactions: r.reactions ?? [],
                        bookmarked: r.bookmarked ?? false,
                        mine: mine,
                        createdAt: r.created_at,
                        onChange: { Task { await load() } },
                        onEdit: mine ? { editingReply = r; editDraft = r.body ?? "" } : nil
                    )
                }

                ReactionsBar(commentId: r.id, reactions: r.reactions ?? []) {
                    Task { await load() }
                }
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 6) {
            if let sendError {
                Text(sendError)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
            }
            // نفس ترتيب الواتساب: الإرسال يمين و«+» يسار (أول الكود = يمين في RTL)
            HStack(spacing: 8) {
                Button(action: send) {
                    Group {
                        if sending {
                            ProgressView().tint(Theme.navy)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.navy)
                        }
                    }
                    .frame(width: 36, height: 36)
                    .background(Theme.gold)
                    .clipShape(Circle())
                }
                .disabled(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty)
                .opacity(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)

                TextField("ردّ في الخيط…", text: $draft, axis: .vertical)
                    .font(.system(size: 14))
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Theme.ivory)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

                Menu {
                    ForEach(staff) { p in
                        let l = Mention.label(p)
                        if !l.isEmpty {
                            Button(l) {
                                let sep = draft.isEmpty || draft.hasSuffix(" ") ? "" : " "
                                draft += sep + "@" + l + " "
                            }
                        }
                    }
                    Divider()
                    Button {
                        if !draft.contains("@الذكاء") { draft = "@الذكاء " + draft }
                    } label: {
                        Label("سؤال الذكاء", systemImage: "sparkles")
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(Theme.navy)
                        .frame(width: 36, height: 36)
                }
            }
            .padding(.horizontal, 12)

            Button {
                alsoToStream.toggle()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: alsoToStream ? "checkmark.square.fill" : "square")
                        .font(.system(size: 13))
                        .foregroundStyle(alsoToStream ? Theme.goldDark : Theme.muted)
                    Text("أرسل أيضاً إلى المجرى")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                    Spacer()
                }
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 14)
            .padding(.bottom, 8)
        }
        .background(Theme.card)
        .overlay(Rectangle().frame(height: 0.5).foregroundStyle(Theme.line), alignment: .top)
    }

    private func send() {
        let body = draft.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty, !sending else { return }
        sending = true
        sendError = nil
        Task {
            do {
                try await sb.postMessage(
                    caseId: caseId,
                    body: body,
                    parentId: root.id,
                    alsoToStream: alsoToStream,
                    mentions: Mention.extract(from: body, people: staff)
                )
                draft = ""
                alsoToStream = false
                await load()
                onChange()
                Task {
                    try? await Task.sleep(for: .seconds(5))
                    await load()
                }
            } catch {
                sendError = error.localizedDescription
            }
            sending = false
        }
    }

    private func load() async {
        error = nil
        do {
            replies = try await sb.thread(rootId: root.id)
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}
