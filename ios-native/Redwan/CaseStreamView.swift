import SwiftUI

// مجرى القضية وخيوطها — قلب حلّ مشكلة الواتساب.
//
// ملاحظة المستخدم التي شكّلت التصميم: «الواتساب فيه رد لكنه اقتباس لا تجميع»
// — الرد يهبط في المجرى فيزيده ازدحاماً. هنا الردود تُسحب من المجرى وتُجمع
// تحت سؤالها، فيبقى المجرى قائمة مواضيع لا سيل رسائل.

struct CaseStreamView: View {
    let caseId: String
    let title: String

    @EnvironmentObject private var sb: SB
    @State private var msgs: [StreamMsg] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var draft = ""
    @State private var sending = false
    @State private var sendError: String?

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
                                    text: "لا كلام في هذه القضية بعد",
                                    subtext: "اكتب أول رسالة — تبقى هنا مربوطة بالقضية"
                                )
                                .padding(.top, 30)
                            }
                            ForEach(msgs) { m in
                                StreamBubble(msg: m, caseId: caseId, mine: m.author_id == sb.member?.id) {
                                    Task { await load() }
                                }
                                .id(m.id)
                            }
                        }
                        .padding(12)
                    }
                    .onChange(of: msgs.count) {
                        // ينزل لآخر رسالة كما تفعل تطبيقات المحادثة
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
            // فتح الشاشة = قراءة — يصفّر عدّاد القضية في القائمة
            try? await sb.markRead(caseId: caseId)
        }
    }

    private var composer: some View {
        VStack(spacing: 4) {
            if let sendError {
                Text(sendError)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
            }
            HStack(spacing: 8) {
                // منشن الذكاء بنقرة — أسهل من كتابته
                Button {
                    if !draft.contains("@الذكاء") { draft = "@الذكاء " + draft }
                } label: {
                    Image(systemName: "sparkles")
                        .font(.system(size: 15))
                        .foregroundStyle(draft.contains("@الذكاء") ? Theme.gold : Theme.muted)
                }
                .buttonStyle(.plain)

                TextField("اكتب رسالة…", text: $draft, axis: .vertical)
                    .font(.system(size: 14))
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Theme.ivory)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

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
                try await sb.postMessage(caseId: caseId, body: body)
                draft = ""
                await load()
                // ردّ الذكاء/إعلان المهمة يصل بعد ثوانٍ عبر الخادم — جلبتان
                // مؤجّلتان تلتقطانه بلا Realtime
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

// MARK: - فقاعة في المجرى (جذر خيط)

private struct StreamBubble: View {
    let msg: StreamMsg
    let caseId: String
    let mine: Bool
    let onChange: () -> Void

    @State private var openThread = false

    private var isAI: Bool { msg.kind == "ai" }
    private var isSystem: Bool { msg.kind == "system" }

    var body: some View {
        // إعلان النظام (مهمة أُنشئت): شريحة وسطية هادئة لا فقاعة
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
            }

            VStack(alignment: .leading, spacing: 8) {
                if let body = msg.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.navy)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                if let name = msg.document_name {
                    HStack(spacing: 8) {
                        Image(systemName: "doc.text.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(Theme.goldDark)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(Theme.navy)
                                .lineLimit(1)
                            Text("محفوظ في مستندات القضية")
                                .font(.system(size: 10))
                                .foregroundStyle(Theme.success)
                        }
                        Spacer(minLength: 0)
                    }
                }

                // شريط الخيط — نمط سلاك: العدد يفتح الردود المجمّعة
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

// MARK: - داخل الخيط

private struct ThreadView: View {
    let root: StreamMsg
    let caseId: String
    let onChange: () -> Void

    @EnvironmentObject private var sb: SB
    @State private var replies: [ReplyRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var draft = ""
    @State private var alsoToStream = false
    @State private var sending = false
    @State private var sendError: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    // السؤال الأصل — مميّز بشريط ذهبي
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 5) {
                            Text(root.author_name ?? "—")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Theme.muted)
                            Text(shortStamp(root.created_at))
                                .font(.system(size: 10))
                                .foregroundStyle(Theme.muted.opacity(0.8))
                        }
                        Text(root.body ?? root.document_name ?? "—")
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

                        // الردود منزاحة بخط رأسي — يوضّح أنها تابعة للسؤال
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
        .task { await load() }
    }

    private func replyBubble(_ r: ReplyRow) -> some View {
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
                    AvatarCircle(member: r.author, size: 20)
                }
                Text(isAI ? "الذكاء" : (r.author?.short_name ?? r.author?.name ?? "—"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(isAI ? Theme.goldDark : Theme.muted)
                Text(shortStamp(r.created_at))
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.muted.opacity(0.8))
            }
            Text(r.body ?? "—")
                .font(.system(size: 14))
                .foregroundStyle(Theme.navy)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(10)
                .background(mine ? Theme.gold.opacity(0.16) : (isAI ? Theme.goldPale : Theme.card))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(mine ? .clear : (isAI ? Theme.gold.opacity(0.4) : Theme.line), lineWidth: 1)
                )
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
            HStack(spacing: 8) {
                TextField("ردّ في الخيط…", text: $draft, axis: .vertical)
                    .font(.system(size: 14))
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(Theme.ivory)
                    .clipShape(RoundedRectangle(cornerRadius: 18))

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
            }
            .padding(.horizontal, 12)

            // علاج عيب سلاك المعروف: الردود تُدفن في الخيوط فلا يراها من ليس فيه
            Button {
                alsoToStream.toggle()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: alsoToStream ? "checkmark.square.fill" : "square")
                        .font(.system(size: 13))
                        .foregroundStyle(alsoToStream ? Theme.goldDark : Theme.muted)
                    Text("أرسل أيضاً إلى مجرى القضية")
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
                    alsoToStream: alsoToStream
                )
                draft = ""
                alsoToStream = false
                await load()
                onChange()   // المجرى يعيد الجلب ليحدّث عدّاد الردود
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
            replies = try await sb.replies(rootId: root.id)
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}
