import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

// مجرى القناة وخيوطها — v2 (طلبات المستخدم 2026-08-21):
// تفاعل إيموجي + حفظ (بوك مارك) + تعديل وحذف رسالتي + إرسال صور وملفات.
// caseId فارغ = القناة العامة «عام — المكتب».


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

/// شريط اقتراح المنشن: كتابة @ في آخر النص تُظهر الأسماء فوق الحقل
/// (طلب المستخدم 2026-08-22: «اذا ضغطت @ مباشرة تطلع لي قائمة الاسماء»)
struct MentionSuggestBar: View {
    let staff: [TeamMember]
    @Binding var draft: String

    /// آخر @كلمة في نهاية النص — نمط الكتابة الطبيعي في الجوال
    private var query: String? {
        guard let r = draft.range(of: "@[\\p{L}\\p{N}_]{0,20}$", options: .regularExpression)
        else { return nil }
        return String(draft[r].dropFirst())
    }

    private var matches: [String] {
        guard let q = query else { return [] }
        var labels = staff.map(Mention.label).filter { !$0.isEmpty }
        labels.append("الذكاء")
        // arContains: كتابة «@احمد» تجد «أحمد»
        return labels.filter { q.isEmpty || $0.arContains(q) }
    }

    var body: some View {
        if query != nil && !matches.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(matches, id: \.self) { l in
                        Button {
                            if let r = draft.range(
                                of: "@[\\p{L}\\p{N}_]{0,20}$", options: .regularExpression
                            ) {
                                draft = draft.replacingCharacters(in: r, with: "@" + l + " ")
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: l == "الذكاء" ? "sparkles" : "at")
                                    .font(.system(size: 11))
                                Text(l)
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundStyle(Theme.goldDark)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Theme.goldPale)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
            }
            .padding(.vertical, 2)
        }
    }
}


/// «باب الملف» في شريط النقاش — يُبنى فقط حين يكون النقاش نقاش *ملف*:
/// لا للقناة العامة (caseId فارغ)، ولا للقنوات الخاصة (kind == "channel")،
/// ولا حين جئنا من الملف نفسه (زر الرجوع هو الطريق إليه)، ولا حين النوع مجهول
/// (فخطأ الإخفاء أهون من فتح قناة كأنها ملف). الحارس كله في مكان واحد.
struct MatterDoor: Hashable {
    let caseId: String
    let officeNum: String?
    let kind: String

    init?(caseId: String?, officeNum: String?, kind: String?, fromMatter: Bool = false) {
        guard let caseId, !fromMatter, let kind, kind != "channel" else { return nil }
        self.caseId = caseId
        self.officeNum = officeNum
        self.kind = kind
    }

    /// رقم الملف قصير ولاتيني فلا يُقصّ؛ وإن غاب فكلمة «الملف»
    var label: String {
        if let n = officeNum, !n.isEmpty { return n }
        return "الملف"
    }
}

/// رقاقة الملف في شريط العنوان (طلب المدير 2026-09-09: «ودي أقدر أنتقل لملف
/// المشروع اللي نتناقش فيه… زر جميل») — نفس رابط المشروع الذهبي في الويب
/// (bg-gold/15 + text-gold-600 = Theme.gold.opacity(0.18) + Theme.goldDark).
/// مجلّد «المشاريع» + رقم الملف؛ الضغط يفتح ملف المشروع — مرآة زر الفقاعات في الملف.
/// اختير بلجنة تصميم (٣ تصاميم × ٣ حكّام) — الفائز بالاتساق وسلامة العربية.
struct MatterFileChip: View {
    let door: MatterDoor

    var body: some View {
        NavigationLink {
            CaseDetailView(caseId: door.caseId)
        } label: {
            HStack(spacing: 5) {
                Text(matterKindEmoji(door.kind)).font(.system(size: 12))
                Text(door.label)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(1)
                    .fixedSize()
            }
            .foregroundStyle(Theme.goldDark)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Theme.gold.opacity(0.18), in: Capsule())
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("افتح ملف \(door.officeNum ?? matterKindLabel(door.kind))")
        .accessibilityHint("يفتح ملف المشروع")
    }
}

struct CaseStreamView: View {
    let caseId: String?
    let title: String
    /// باب الملف إن عرفه المنادي (صف النقاشات / المنتقي / إشعار المنشن).
    /// nil = نسأل القاعدة مرة (المحفوظات)؛ والقيم الافتراضية تُبقي كل المنادين يترجمون.
    var matter: MatterDoor? = nil
    /// فُتح من ملف المشروع نفسه (زر الفقاعات في CaseDetailView)؟ زر الرجوع هو الطريق إليه فلا نكرّره.
    var fromMatter: Bool = false
    /// نقاش مُسمّى (قناة بعضوية)؟ يُظهر للمدير زرّ إدارة الأعضاء والاسم
    var isChannel: Bool = false

    @EnvironmentObject private var sb: SB
    @State private var msgs: [StreamMsg] = []
    /// إيصالات قراءة رسائلي في هذا النقاش
    @State private var receipts: [String: ReadCount] = [:]
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

    /// باب الملف المستنتج من القاعدة حين لم يمرّره المنادي
    @State private var resolvedDoor: MatterDoor?
    private var door: MatterDoor? { matter ?? resolvedDoor }

    /// نوع الخيط من القاعدة حين لم يمرّره المنادي (فتحٌ من إشعار قبل تحميل القائمة)
    @State private var resolvedKind: String?
    @State private var showChannelAdmin = false
    @State private var renamedTitle: String?
    private var channelThread: Bool { isChannel || resolvedKind == "channel" }

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
                                    onEdit: { editing = m; editDraft = m.body ?? "" },
                                    receipt: receipts[m.id]
                                )
                                .id(m.id)
                            }
                        }
                        .padding(12)
                    }
                    // المحادثة تفتح على آخر الرسائل مثل الواتساب (طلب 2026-08-22)
                    .defaultScrollAnchor(.bottom)
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
        .navigationTitle(renamedTitle ?? title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // رقاقة الملف — في الخانة الطرفية نفسها التي تشغلها الكاميرا/التصفية في
            // «المشاريع» والفقاعات في «ملف القضية». لا باب للعامة ولا للقنوات ولا من داخل الملف.
            if let door {
                ToolbarItem(placement: .topBarTrailing) {
                    MatterFileChip(door: door)
                }
            }
            // النقاش المُسمّى: أعضاؤه واسمه — للمدير (القاعدة تفرض ذلك أيضاً)
            if channelThread, sb.member?.is_director == true, caseId != nil {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showChannelAdmin = true } label: {
                        Image(systemName: "person.2.fill")
                            .foregroundStyle(Theme.goldDark)
                    }
                    .accessibilityLabel("أعضاء النقاش")
                }
            }
        }
        .task {
            // النوع يُجلب بالتوازي مع الرسائل فتظهر الرقاقة معها لا بعدها
            async let fallback = resolveDoor()
            await load()
            try? await sb.markRead(caseId: caseId)
            staff = (try? await sb.staff()) ?? []
            let fb = await fallback
            resolvedDoor = fb.door
            resolvedKind = fb.kind
        }
        // إيصالات القراءة: ما حُمّل هنا رآه صاحبه، فتُعلَّم القراءة مع كل رسالة جديدة (لا عند الفتح
        // وحده — وإلا بدا من يقرأ مباشرةً كأنه لم يقرأ)، وتُحدَّث علامات رسائلي كل ٢٠ ثانية ما
        // دامت الشاشة ظاهرة؛ المهمة تُلغى باختفائها وتُعاد عند وصول رسالة جديدة.
        .task(id: msgs.last?.id) {
            guard loaded else { return }
            try? await sb.markRead(caseId: caseId)
            while !Task.isCancelled {
                if let r = try? await sb.streamReadCounts(caseId: caseId) { receipts = r }
                try? await Task.sleep(for: .seconds(20))
            }
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
        .sheet(isPresented: $showChannelAdmin) {
            if let caseId {
                ChannelMembersSheet(channelId: caseId, currentTitle: renamedTitle ?? title) {
                    renamedTitle = $0
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
            MentionSuggestBar(staff: staff, draft: $draft)

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

    /// تعذُّر الجلب (بلا صلاحية أو انقطاع) = لا رقاقة، بصمت — فشل مغلق
    private func resolveDoor() async -> (door: MatterDoor?, kind: String?) {
        guard matter == nil, !fromMatter, let caseId else { return (nil, nil) }
        let m = try? await sb.matter(id: caseId)
        return (MatterDoor(caseId: caseId, officeNum: m?.office_num, kind: m?.kind), m?.kind)
    }

    private func send() {
        let body = draft.trimmingCharacters(in: .whitespaces)
        guard !body.isEmpty else { return }
        Usage.shared.action("رسالة نقاش")
        sendError = nil

        // عرض متفائل (نمط الواتساب): الرسالة تظهر فوراً والحقل يفرغ فوراً،
        // والخادم يلحق بالخلفية — كان الإحساس بالبطء من انتظار رحلتين للشبكة
        let tempId = "temp-\(UUID().uuidString)"
        let optimistic = StreamMsg(
            id: tempId,
            author_id: sb.member?.id,
            author_name: sb.member?.short_name ?? sb.member?.name,
            body: body,
            kind: "user",
            document_id: nil, document_name: nil, document_url: nil,
            mentions: nil,
            created_at: ISO8601DateFormatter().string(from: Date()),
            edited_at: nil, reply_count: 0, last_reply_at: nil,
            reactions: [], bookmarked: false
        )
        msgs.append(optimistic)
        draft = ""

        Task {
            do {
                try await sb.postMessage(
                    caseId: caseId, body: body,
                    mentions: Mention.extract(from: body, people: staff)
                )
                await load()
                Task {
                    try? await Task.sleep(for: .seconds(5))
                    await load()
                    try? await Task.sleep(for: .seconds(7))
                    await load()
                }
            } catch {
                // تراجع: أزل الرسالة المتفائلة وأعد النص للحقل كي لا يضيع
                msgs.removeAll { $0.id == tempId }
                draft = body
                sendError = error.localizedDescription
            }
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

// MARK: - فقاعة في المجرى (جذر خيط)

private struct StreamBubble: View {
    let msg: StreamMsg
    let caseId: String?
    let mine: Bool
    let onChange: () -> Void
    let onEdit: () -> Void
    /// إيصال القراءة لرسالتي (nil لغير رسائلي أو قبل وصوله)
    var receipt: ReadCount? = nil

    @State private var openThread = false
    @State private var showReceipts = false

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
                Text(msgStamp(msg.created_at))
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.muted.opacity(0.8))
                if msg.edited_at != nil {
                    Text("(معدّلة)")
                        .font(.system(size: 9))
                        .foregroundStyle(Theme.muted.opacity(0.7))
                }
                if mine, msg.kind == "user", let r = receipt {
                    Button { showReceipts = true } label: { ReadTicks(count: r) }
                        .buttonStyle(.plain)
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
            .messageActions(
                commentId: msg.id,
                messageBody: msg.body,
                reactions: msg.reactions ?? [],
                bookmarked: msg.bookmarked ?? false,
                mine: mine,
                createdAt: msg.created_at,
                onChange: onChange,
                onEdit: mine ? onEdit : nil
            )

            ReactionsBar(commentId: msg.id, reactions: msg.reactions ?? [], onChange: onChange)
        }
        .navigationDestination(isPresented: $openThread) {
            ThreadView(root: msg, caseId: caseId, onChange: onChange)
        }
        .sheet(isPresented: $showReceipts) {
            ReadReceiptsSheet(commentId: msg.id, preview: msg.body)
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

    // المعاينة داخل التطبيق (QuickLook) — لا قفز إلى سفاري
    @State private var showPreview = false
    @State private var sharing: ShareFile?
    @State private var busy = false
    @State private var shareError: String?

    var body: some View {
        Button {
            showPreview = true
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
                shareButton
            }
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $showPreview) {
            FilePreviewSheet(name: name, url: url)
        }
        .sheet(item: $sharing) { f in
            ActivitySheet(url: f.url)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.hidden)
        }
        .alert("تنبيه", isPresented: Binding(get: { shareError != nil }, set: { if !$0 { shareError = nil } })) {
            Button("حسناً", role: .cancel) { shareError = nil }
        } message: { Text(shareError ?? "") }
    }

    /// زر المشاركة المرئي — لا قائمة سياق: الفقاعة تملك الضغط المطوّل أصلاً
    /// (تفاعل/تعديل/حذف) وقائمةٌ ثانية على نفس اللمسة تتنازعان.
    private var shareButton: some View {
        Button { Task { await share() } } label: {
            Group {
                if busy { ProgressView().controlSize(.small).tint(Theme.goldDark) }
                else { Image(systemName: "square.and.arrow.up").font(.system(size: 14, weight: .medium)) }
            }
            .foregroundStyle(Theme.goldDark)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
            .padding(.vertical, -6)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("مشاركة المرفق")
    }

    private func share() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do { sharing = ShareFile(url: try await FileFetch.download(url: url, name: name)) }
        catch let e as SBError { shareError = e.message }
        catch { shareError = "تعذّر تحميل المرفق للمشاركة — تحقق من الاتصال" }
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
                            Text(msgStamp(root.created_at))
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
                    Text(msgStamp(r.created_at))
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
                .messageActions(
                    commentId: r.id,
                    messageBody: r.body,
                    reactions: r.reactions ?? [],
                    bookmarked: r.bookmarked ?? false,
                    mine: mine,
                    createdAt: r.created_at,
                    onChange: { Task { await load() } },
                    onEdit: mine ? { editingReply = r; editDraft = r.body ?? "" } : nil
                )

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
            MentionSuggestBar(staff: staff, draft: $draft)

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
        guard !body.isEmpty else { return }
        sendError = nil

        // عرض متفائل — نفس نمط المجرى
        let tempId = "temp-\(UUID().uuidString)"
        let wasAlsoToStream = alsoToStream
        replies.append(ThreadMsg(
            id: tempId,
            author_id: sb.member?.id,
            author_name: sb.member?.short_name ?? sb.member?.name,
            avatar_initial: sb.member?.avatar_initial,
            avatar_color: sb.member?.avatar_color,
            body: body,
            kind: "user",
            document_id: nil, document_name: nil, document_url: nil,
            created_at: ISO8601DateFormatter().string(from: Date()),
            edited_at: nil, reactions: [], bookmarked: false
        ))
        draft = ""
        alsoToStream = false

        Task {
            do {
                try await sb.postMessage(
                    caseId: caseId,
                    body: body,
                    parentId: root.id,
                    alsoToStream: wasAlsoToStream,
                    mentions: Mention.extract(from: body, people: staff)
                )
                await load()
                onChange()
                Task {
                    try? await Task.sleep(for: .seconds(5))
                    await load()
                }
            } catch {
                replies.removeAll { $0.id == tempId }
                draft = body
                sendError = error.localizedDescription
            }
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
