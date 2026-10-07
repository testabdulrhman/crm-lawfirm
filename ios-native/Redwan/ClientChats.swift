import SwiftUI

// «العملاء» — محادثات الواتساب مع العملاء، مفتاحٌ داخل تبويب النقاشات (قرار المدير 2026-10-07:
// «داخل النقاشات»). مرآة صفحة /clients في الويب (8cae566):
//   الأخضر يصل للعميل (هنا وحده) · الذهبي للفريق (النقاشات) — ولا يُرسل للعميل شيء من نقاش.
//   الجسر «ناقش مع الفريق» بضغطة مطوّلة على رسالة العميل: تُقتبس في نقاش ملفه.
// يرى المحادثة مسؤول ملفها وفريقه، والمدير وراكان الكل؛ و«غير المصنّف» لهما وحدهما وهما يربطانه.
// الفهرس من wa_threads، والنص من الـHub عبر دالة wa-inbox عند الفتح (تعلّمها مقروءة أيضاً).

enum WA {
    static let green = Color(hex: 0x059669)
    static let greenDark = Color(hex: 0x065F46)
    static let bubble = Color(hex: 0xD1FAE5)
    static let ink = Color(hex: 0x064E3B)
    static let pale = Color(hex: 0xECFDF5)
    static let amber = Color(hex: 0x92400E)
    static let amberPale = Color(hex: 0xFEF3C7)
}

extension Notification.Name {
    /// فُتحت محادثة عميل (فعُلّمت مقروءة) — تُحدَّث شارة التبويب والمفتاح فوراً
    static let clientChatRead = Notification.Name("clientChatRead")
}

// MARK: - النماذج

struct ClientThread: Codable, Identifiable, Hashable {
    struct Contact: Codable, Hashable { let name: String? }
    struct Matter: Codable, Hashable { let office_num: String?; let title: String?; let kind: String? }

    let phone_e164: String
    var case_id: String?
    let display_name: String?
    let last_message_at: String?
    let last_in_at: String?
    let last_preview: String?
    let last_direction: String?
    let contact: Contact?
    var matter: Matter?
    /// يُحسب من wa_inbox_reads — ليس من الخادم
    var unread: Bool? = nil

    var id: String { phone_e164 }

    var localPhone: String {
        phone_e164.hasPrefix("9665") ? "0" + phone_e164.dropFirst(3) : "+" + phone_e164
    }
    var name: String {
        for n in [contact?.name, display_name] {
            if let t = n?.trimmingCharacters(in: .whitespaces), !t.isEmpty { return t }
        }
        return localPhone
    }
    var initial: String {
        let n = name
        return n.first.map { $0.isNumber || $0 == "+" ? "#" : String($0) } ?? "#"
    }
    var door: MatterDoor? { MatterDoor(caseId: case_id, officeNum: matter?.office_num, kind: matter?.kind ?? "case") }
}

struct ClientMsg: Codable, Identifiable, Hashable {
    let id: String
    let at: String
    let direction: String
    /// client · member (موظف من النظام) · hatif_staff (لوحة هاتف) · bot · system
    let who: String
    let member_id: String?
    let member_name: String?
    let body: String?
    let type: String?
    let media: String?
    let mime: String?
    let status: String?
    let template: String?

    var fromClient: Bool { direction == "in" }
    var isImage: Bool { (mime ?? "").hasPrefix("image/") || type == "image" }
    var senderLabel: String? {
        switch who {
        case "member": return member_name ?? "موظف"
        case "hatif_staff": return "من لوحة هاتف"
        case "bot": return "الرد الآلي"
        case "system": return "رسالة من النظام"
        default: return nil
        }
    }
}

struct ClientThreadDetail: Codable {
    let window_open: Bool
    let window_expires_at: String?
    let messages: [ClientMsg]
}

// MARK: - الاتصال

extension SB {
    func clientThreads() async throws -> [ClientThread] {
        async let threads: [ClientThread] = get("wa_threads", query: [
            ("select", "phone_e164,case_id,display_name,last_message_at,last_in_at,last_preview,last_direction,contact:contacts(name),matter:cases(office_num,title,kind)"),
            ("order", "last_message_at.desc.nullslast"),
            ("limit", "300"),
        ])
        struct Read: Codable { let phone_e164: String; let read_at: String }
        async let reads: [Read] = get("wa_inbox_reads", query: [
            ("select", "phone_e164,read_at"),
            ("member_id", "eq.\(member?.id ?? "")"),
        ])
        let rs = (try? await reads) ?? []
        let readAt = Dictionary(rs.map { ($0.phone_e164, $0.read_at) }, uniquingKeysWith: { a, _ in a })
        return try await threads.map { t in
            var t = t
            if let inAt = ISO8601DateFormatter.parse(t.last_in_at) {
                t.unread = ISO8601DateFormatter.parse(readAt[t.phone_e164]).map { inAt > $0 } ?? true
            } else {
                t.unread = false
            }
            return t
        }
    }

    private func waInbox(_ body: [String: Any]) async throws -> Data {
        let data = try JSONSerialization.data(withJSONObject: body)
        return try await raw(path: "functions/v1/wa-inbox", method: "POST", query: [], body: data)
    }

    func clientThread(phone: String) async throws -> ClientThreadDetail {
        let d = try await waInbox(["action": "thread", "phone": phone])
        return try JSONDecoder().decode(ClientThreadDetail.self, from: d)
    }

    func sendClientMessage(phone: String, body: String, template: Bool, clientId: String) async throws {
        _ = try await waInbox([
            "action": "send", "phone": phone, "body": body,
            "mode": template ? "template" : "text", "client_id": clientId,
        ])
    }

    func linkClientThread(phone: String, caseId: String?) async throws {
        let data = try JSONSerialization.data(withJSONObject: ["p_phone": phone, "p_case_id": caseId.map { $0 as Any } ?? NSNull()] as [String: Any])
        _ = try await raw(path: "rest/v1/rpc/wa_link_thread", method: "POST", query: [], body: data)
    }
}

// MARK: - القائمة

struct ClientThreadsList: View {
    @EnvironmentObject private var sb: SB
    /// تُفتح من إشعار — يضبطها تبويب النقاشات
    @Binding var openPhone: String?
    @State private var rows: [ClientThread] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false
    @State private var search = ""
    @State private var onlyUnlinked = false
    @State private var opened: ClientThread?

    private var viewer: Bool { sb.member?.is_director == true || sb.member?.can_view_all == true }

    private var filtered: [ClientThread] {
        let q = search.trimmingCharacters(in: .whitespaces)
        return rows.filter { t in
            if onlyUnlinked && t.case_id != nil { return false }
            guard !q.isEmpty else { return true }
            return t.name.arContains(q) || t.localPhone.contains(q)
                || (t.matter?.office_num ?? "").localizedCaseInsensitiveContains(q)
        }
    }

    var body: some View {
        Group {
            if let error {
                ErrorBox(message: error) { Task { await load() } }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .padding(16)
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if rows.isEmpty {
                EmptyBox(
                    icon: "message",
                    text: "لا محادثات عملاء في ملفاتك",
                    subtext: "تظهر هنا رسائل عملاء ملفاتك على الواتساب — وما تكتبه هنا يصلهم"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    if viewer {
                        Toggle(isOn: $onlyUnlinked) {
                            Label("غير المصنّف وحده", systemImage: "tray")
                                .font(.system(size: 14))
                        }
                        .tint(WA.green)
                        .listRowBackground(Theme.card)
                    }
                    ForEach(filtered) { t in
                        Button { opened = t } label: { ClientThreadRow(t: t) }
                            .buttonStyle(.plain)
                            .listRowBackground(Theme.card)
                    }
                }
                .listStyle(.plain)
                .searchable(text: $search, prompt: "اسم أو جوال أو رقم ملف")
                .refreshable { await load() }
            }
        }
        .navigationDestination(item: $opened) { t in
            ClientChatView(thread: t)
        }
        .task {
            await load()
            openFromPush()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(20))
                await load()
            }
        }
        .retryIfCancelled($cancelled) { await load() }
        .onChange(of: openPhone) { _, _ in openFromPush() }
        .onReceive(NotificationCenter.default.publisher(for: .clientChatRead)) { note in
            guard let p = note.object as? String else { return }
            rows = rows.map { var t = $0; if t.phone_e164 == p { t.unread = false }; return t }
        }
    }

    private func openFromPush() {
        guard let p = openPhone else { return }
        if let t = rows.first(where: { $0.phone_e164 == p }) {
            openPhone = nil
            opened = t
        } else if loaded {
            openPhone = nil   // ليست ضمن ما يراه — يكفي فتح القائمة
        }
    }

    private func load() async {
        do {
            rows = try await sb.clientThreads()
            loaded = true
            error = nil
            openFromPush()
        } catch {
            guard let t = uiErrorText(error) else { cancelled = true; return }
            if !loaded { self.error = t }
        }
    }
}

private struct ClientThreadRow: View {
    let t: ClientThread
    private var unread: Bool { t.unread == true }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Text(t.initial)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(WA.ink)
                .frame(width: 40, height: 40)
                .background(WA.bubble, in: Circle())
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(t.name)
                        .font(.system(size: 15, weight: unread ? .bold : .semibold))
                        .foregroundStyle(Theme.navy)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Text(shortStamp(t.last_message_at))
                        .font(.system(size: 12, weight: unread ? .semibold : .regular))
                        .foregroundStyle(unread ? WA.green : Theme.muted)
                }
                HStack(spacing: 6) {
                    Text((t.last_direction == "out" ? "↩︎ " : "") + (t.last_preview ?? ""))
                        .font(.system(size: 13))
                        .foregroundStyle(unread ? Theme.navy : Theme.muted)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if unread {
                        Circle().fill(WA.green).frame(width: 10, height: 10)
                    }
                }
                if let n = t.matter?.office_num, t.case_id != nil {
                    HStack(spacing: 4) { MatterKindMark(kind: t.matter?.kind, size: 10); Text(n) }
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.goldDark)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Theme.gold.opacity(0.18), in: Capsule())
                } else {
                    Text("غير مصنّف")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Theme.line.opacity(0.6), in: Capsule())
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

// MARK: - المحادثة

struct ClientChatView: View {
    @EnvironmentObject private var sb: SB
    @State var thread: ClientThread
    @State private var detail: ClientThreadDetail?
    @State private var error: String?
    @State private var cancelled = false
    @State private var text = ""
    @State private var sending = false
    @State private var sendError: String?
    @State private var pendingId: String?
    @State private var discuss: ClientMsg?
    @State private var linking = false
    @FocusState private var focused: Bool

    private var viewer: Bool { sb.member?.is_director == true || sb.member?.can_view_all == true }
    private var windowOpen: Bool { detail?.window_open ?? false }

    var body: some View {
        VStack(spacing: 0) {
            if let d = detail { windowBar(d) }
            messagesArea
            composer
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle(thread.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let door = thread.door {
                    MatterFileChip(door: door)
                } else {
                    Text("غير مصنّف")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Theme.line.opacity(0.6), in: Capsule())
                }
            }
            if viewer {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { linking = true } label: {
                        Image(systemName: "link").foregroundStyle(WA.green)
                    }
                    .accessibilityLabel(thread.case_id == nil ? "ربط بملف" : "تغيير الملف")
                }
            }
        }
        .onAppear { Usage.shared.screen("محادثة عميل") }
        .task {
            await load()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(12))
                await load()
            }
        }
        .retryIfCancelled($cancelled) { await load() }
        .sheet(item: $discuss) { m in
            if let cid = thread.case_id {
                DiscussClientSheet(msg: m, caseId: cid, clientName: thread.name)
                    .presentationDetents([.medium, .large])
            }
        }
        .sheet(isPresented: $linking) {
            MatterPicker { m in
                linking = false
                Task { await link(m) }
            }
        }
    }

    private func windowBar(_ d: ClientThreadDetail) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "clock").font(.system(size: 12))
            Text(d.window_open
                 ? "النافذة مفتوحة — يبقى \(hoursLeft(d.window_expires_at)) للرد الحر"
                 : "مرّت ٢٤ ساعة على آخر رسالة من العميل — يصله ردّك داخل قالب «متابعة»")
                .font(.system(size: 12))
            Spacer(minLength: 0)
        }
        .foregroundStyle(d.window_open ? WA.ink : WA.amber)
        .padding(.horizontal, 14).padding(.vertical, 6)
        .background(d.window_open ? WA.pale : WA.amberPale)
    }

    private var messagesArea: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 4) {
                    if let error, detail == nil {
                        ErrorBox(message: error) { Task { await load() } }.padding(16)
                    } else if detail == nil {
                        ProgressView().padding(.top, 60)
                    }
                    let msgs = detail?.messages ?? []
                    ForEach(Array(msgs.enumerated()), id: \.element.id) { i, m in
                        let prev = i > 0 ? msgs[i - 1] : nil
                        if prev.map({ !sameDay($0.at, m.at) }) ?? true {
                            Text(dayLabel(m.at))
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.muted)
                                .padding(.horizontal, 10).padding(.vertical, 3)
                                .background(Theme.card, in: Capsule())
                                .padding(.vertical, 6)
                        }
                        ClientBubble(
                            m: m,
                            continued: prev.map { $0.who == m.who && $0.member_id == m.member_id && sameDay($0.at, m.at)
                                && (ISO8601DateFormatter.parse(m.at)?.timeIntervalSince(ISO8601DateFormatter.parse($0.at) ?? .distantPast) ?? 999) < 300 } ?? false,
                            canDiscuss: thread.case_id != nil,
                            onDiscuss: { discuss = m }
                        )
                        .id(m.id)
                    }
                    Color.clear.frame(height: 4).id("end")
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: detail?.messages.count) { _, _ in
                withAnimation { proxy.scrollTo("end", anchor: .bottom) }
            }
            .onAppear { proxy.scrollTo("end", anchor: .bottom) }
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let sendError {
                Text(sendError)
                    .font(.system(size: 12))
                    .foregroundStyle(.red)
            }
            Label("يصل إلى \(thread.name) على الواتساب", systemImage: "paperplane")
                .font(.system(size: 12))
                .foregroundStyle(WA.greenDark)
            HStack(alignment: .bottom, spacing: 8) {
                TextField(windowOpen ? "اكتب رداً للعميل…" : "رسالتك — تُرسل داخل قالب «متابعة»", text: $text, axis: .vertical)
                    .lineLimit(1...6)
                    .focused($focused)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).stroke(WA.green.opacity(0.45), lineWidth: 1))
                    .onChange(of: text) { _, _ in pendingId = nil; sendError = nil }
                Button { Task { await send() } } label: {
                    Group {
                        if sending { ProgressView().tint(.white) }
                        else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)) }
                    }
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(WA.green.opacity(canSend ? 1 : 0.4), in: Circle())
                }
                .disabled(!canSend)
                .accessibilityLabel("إرسال للعميل")
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Theme.card.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) { Divider() }
    }

    private var canSend: Bool {
        !sending && detail != nil && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func load() async {
        do {
            detail = try await sb.clientThread(phone: thread.phone_e164)
            error = nil
            NotificationCenter.default.post(name: .clientChatRead, object: thread.phone_e164)
        } catch {
            guard let t = uiErrorText(error) else { cancelled = true; return }
            self.error = t
        }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, !sending else { return }
        sending = true
        defer { sending = false }
        // معرّف ثابت للنص نفسه: إعادة المحاولة بعد انقطاع لا تُرسل نسخة ثانية
        let id = pendingId ?? UUID().uuidString
        pendingId = id
        do {
            try await sb.sendClientMessage(phone: thread.phone_e164, body: body, template: !windowOpen, clientId: id)
            text = ""
            pendingId = nil
            sendError = nil
            await load()
        } catch {
            sendError = uiErrorText(error) ?? "لم تُرسل الرسالة"
            pendingId = nil
        }
    }

    private func link(_ m: MatterLite) async {
        do {
            try await sb.linkClientThread(phone: thread.phone_e164, caseId: m.id)
            thread.case_id = m.id
            thread.matter = .init(office_num: m.office_num, title: m.title, kind: m.kind)
        } catch {
            sendError = uiErrorText(error) ?? "لم يتم الربط"
        }
    }

    private func hoursLeft(_ exp: String?) -> String {
        guard let d = ISO8601DateFormatter.parse(exp) else { return "" }
        let h = max(0, d.timeIntervalSinceNow / 3600)
        return h >= 1 ? "\(Int(h)) ساعة" : "\(max(1, Int(h * 60))) دقيقة"
    }

    private func sameDay(_ a: String, _ b: String) -> Bool {
        guard let x = ISO8601DateFormatter.parse(a), let y = ISO8601DateFormatter.parse(b) else { return false }
        return Calendar(identifier: .gregorian).isDate(x, inSameDayAs: y)
    }

    private func dayLabel(_ iso: String) -> String {
        guard let d = ISO8601DateFormatter.parse(iso) else { return "" }
        let cal = Calendar(identifier: .gregorian)
        if cal.isDateInToday(d) { return "اليوم" }
        if cal.isDateInYesterday(d) { return "أمس" }
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA@numbers=latn")
        f.calendar = cal
        f.dateFormat = "d MMMM yyyy"
        return f.string(from: d)
    }
}

private struct ClientBubble: View {
    let m: ClientMsg
    let continued: Bool
    let canDiscuss: Bool
    let onDiscuss: () -> Void

    var body: some View {
        // ترتيب الواتساب كالنقاشات: ما يخرج منا يساراً، والعميل يميناً (الواجهة من اليمين)
        HStack {
            if !m.fromClient { Spacer(minLength: 50) }
            VStack(alignment: .leading, spacing: 3) {
                if !m.fromClient, !continued, let label = m.senderLabel {
                    HStack(spacing: 4) {
                        if m.who == "bot" { Image(systemName: "sparkles").font(.system(size: 10)) }
                        Text(label).font(.system(size: 11, weight: .semibold))
                        if m.template != nil { Text("· قالب").font(.system(size: 11)).opacity(0.7) }
                    }
                    .foregroundStyle(WA.greenDark)
                }
                if let url = m.media.flatMap(URL.init(string:)) {
                    if m.isImage {
                        AsyncImage(url: url) { p in
                            if case .success(let img) = p { img.resizable().scaledToFit() }
                            else { Theme.line.opacity(0.3).frame(height: 140) }
                        }
                        .frame(maxWidth: 230, maxHeight: 260)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        Link(destination: url) {
                            Label("مرفق", systemImage: "paperclip").font(.system(size: 13))
                        }
                    }
                }
                if let b = m.body, !b.isEmpty {
                    Text(b)
                        .font(.system(size: 15))
                        .foregroundStyle(m.fromClient ? Theme.navy : WA.ink)
                        .textSelection(.enabled)
                }
                HStack(spacing: 4) {
                    Text(msgStamp(m.at))
                    if !m.fromClient, let s = m.status {
                        Text(s == "failed" ? "⚠︎" : (s == "read" || s == "delivered") ? "✓✓" : "✓")
                            .foregroundStyle(s == "read" ? Color.blue : WA.greenDark.opacity(0.7))
                    }
                }
                .font(.system(size: 10))
                .foregroundStyle(m.fromClient ? Theme.muted : WA.greenDark.opacity(0.75))
                .frame(maxWidth: .infinity, alignment: .trailing)
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 11).padding(.top, 7).padding(.bottom, 5)
            .background(
                m.fromClient ? Theme.card : WA.bubble,
                in: RoundedRectangle(cornerRadius: 16)
            )
            .frame(maxWidth: 300, alignment: m.fromClient ? .leading : .trailing)
            .contextMenu {
                if m.fromClient && canDiscuss {
                    Button { onDiscuss() } label: { Label("ناقش مع الفريق", systemImage: "bubble.left.and.bubble.right") }
                }
                if let b = m.body, !b.isEmpty {
                    Button { UIPasteboard.general.string = b } label: { Label("نسخ", systemImage: "doc.on.doc") }
                }
            }
            if m.fromClient { Spacer(minLength: 50) }
        }
        .padding(.top, continued ? 0 : 4)
    }
}

/// رسالة العميل تُقتبس في نقاش ملفه — داخلي، لا يصل للعميل
private struct DiscussClientSheet: View {
    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    let msg: ClientMsg
    let caseId: String
    let clientName: String
    @State private var note = ""
    @State private var busy = false
    @State private var error: String?

    private var quote: String {
        let b = (msg.body ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return b.isEmpty ? (msg.media != nil ? "📎 مرفق" : "") : b
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 0) {
                    Rectangle().fill(WA.green).frame(width: 3)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("من \(clientName) على الواتساب").font(.system(size: 12)).foregroundStyle(WA.greenDark)
                        Text(quote).font(.system(size: 14)).foregroundStyle(WA.ink)
                    }
                    .padding(9)
                    Spacer(minLength: 0)
                }
                .background(WA.pale)
                TextField("سؤالك أو ملاحظتك للفريق (اختياري)", text: $note, axis: .vertical)
                    .lineLimit(3...8)
                    .padding(10)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                Label("تُنشر في نقاش الملف — لا تصل للعميل", systemImage: "lock")
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.goldDark)
                if let error { Text(error).font(.system(size: 12)).foregroundStyle(.red) }
                Spacer()
            }
            .padding(16)
            .background(Theme.ivory)
            .navigationTitle("ناقش مع الفريق")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("انشر") { Task { await post() } }
                        .disabled(busy)
                        .foregroundStyle(Theme.goldDark)
                }
            }
        }
    }

    private func post() async {
        busy = true
        defer { busy = false }
        let n = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = "💬 من \(clientName) على الواتساب:\n«\(quote)»" + (n.isEmpty ? "" : "\n\n\(n)")
        do {
            try await sb.postMessage(caseId: caseId, body: body)
            dismiss()
            // بعد انغلاق الورقة: إلى نقاش الملف (المفتاح يرجع للفريق)
            Task {
                try? await Task.sleep(for: .milliseconds(450))
                PushRouter.shared.route = "/discussions?case=\(caseId)"
            }
        } catch {
            self.error = uiErrorText(error) ?? "لم تُنشر"
        }
    }
}
