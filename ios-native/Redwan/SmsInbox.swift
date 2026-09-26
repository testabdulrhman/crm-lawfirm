import SwiftUI

// رسائل ناجز والواردة في الآيفون (طلب المدير 2026-09-26: «ودي بالتطبيق يكون فيه وصول لرسائل
// sms بحيث أي قضية موجودة بالنظام يربطها فيه»).
//
// الالتقاط نفسه لا يكون من التطبيق — أبل لا تسمح لتطبيق بقراءة الرسائل — بل من أتمتة «الاختصارات»
// على الجوال (sms-inbox). هنا: القائمة، وربط غير المربوط بملفه بضغطة. والربط اليدوي «يعلّم» القاعدة
// أرقام الرسالة (case_refs) فتنربط أخواتها السابقة واللاحقة تلقائياً.

struct IncomingSms: Codable, Identifiable, Hashable {
    let id: String
    let message: String?
    let created_at: String?
    let recipient_name: String?
    let phone: String?
    let category: String?
    let case_id: String?
    let read_at: String?
    let matter: MatterLite?

    var senderLabel: String {
        switch recipient_name {
        case "MOJ": return "ناجز — وزارة العدل"
        case "SBC": return "المركز السعودي للأعمال"
        case .some(let n) where !n.isEmpty: return n
        default: return phone ?? "رسالة"
        }
    }
}

enum SmsFilter: String, CaseIterable {
    case najiz, unlinked, all
    var label: String {
        switch self {
        case .najiz: return "ناجز"
        case .unlinked: return "غير المربوطة"
        case .all: return "الكل"
        }
    }
}

extension SB {
    static let SMS_SELECT = "id,message,created_at,recipient_name,phone,category,case_id,read_at," +
        "matter:cases!sms_log_case_id_fkey(id,title,office_num,kind)"

    func incomingSms(filter: SmsFilter, offset: Int, limit: Int = 40) async throws -> [IncomingSms] {
        var q: [(String, String)] = [
            ("select", SB.SMS_SELECT), ("status", "eq.incoming"),
            ("order", "created_at.desc"), ("offset", "\(offset)"), ("limit", "\(limit)"),
        ]
        switch filter {
        case .najiz: q.append(("category", "eq.najiz"))
        case .unlinked: q.append(("case_id", "is.null")); q.append(("category", "eq.najiz"))
        case .all: break
        }
        return try await get("sms_log", query: q)
    }

    func caseSms(caseId: String, limit: Int = 100) async throws -> [IncomingSms] {
        try await get("sms_log", query: [
            ("select", SB.SMS_SELECT), ("status", "eq.incoming"), ("case_id", "eq.\(caseId)"),
            ("order", "created_at.desc"), ("limit", "\(limit)"),
        ])
    }

    /// الربط اليدوي — القاعدة تتعلّم أرقام الرسالة وتربط أخواتها (learn_sms_case_refs)
    func linkSms(id: String, caseId: String?) async throws {
        try await patch("sms_log", query: [("id", "eq.\(id)")], values: ["case_id": caseId ?? NSNull()])
    }

    func unlinkedNajizCount() async throws -> Int {
        struct R: Codable { let id: String }
        let r: [R] = try await get("sms_log", query: [
            ("select", "id"), ("status", "eq.incoming"), ("category", "eq.najiz"),
            ("case_id", "is.null"), ("limit", "500")])
        return r.count
    }
}

/// نص الرسالة بروابط قابلة للضغط (روابط جلسات ناجز)، والأرقام المركّبة معزولة الاتجاه —
/// وإلا انقلب «01-4803133217» إلى «4803133217-01» و«******2230» إلى «2230******» وسط العربية
func linkified(_ raw: String) -> AttributedString {
    let s = isolateCompoundNumbers(raw)
    var a = AttributedString(s)
    guard let det = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return a }
    let ns = s as NSString
    for m in det.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
        guard let url = m.url, let r = Range(m.range, in: s),
              let lo = AttributedString.Index(r.lowerBound, within: a),
              let hi = AttributedString.Index(r.upperBound, within: a) else { continue }
        a[lo..<hi].link = url
        a[lo..<hi].foregroundColor = Theme.blue
    }
    return a
}

/// يلفّ كل رقم فيه شرطة أو نجوم بعلامتي العزل (LRI…PDI) — لا يمسّ الروابط
func isolateCompoundNumbers(_ s: String) -> String {
    guard let re = try? NSRegularExpression(pattern: #"(?<![\w/.\-])[\d*][\d*\-]*[\d*](?![\w/])"#) else { return s }
    let ns = s as NSString
    var out = s
    for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)).reversed() {
        let tok = ns.substring(with: m.range)
        guard tok.contains("-") || tok.contains("*"), tok.contains(where: \.isNumber) else { continue }
        if let r = Range(m.range, in: out) { out.replaceSubrange(r, with: "\u{2066}\(tok)\u{2069}") }
    }
    return out
}

// MARK: - صفّ رسالة (مشترك بين الوارد وملف القضية)

struct SmsRow: View {
    let sms: IncomingSms
    var showMatter = true
    var onLink: (() -> Void)? = nil
    var onOpenMatter: ((MatterLite) -> Void)? = nil
    var onUnlink: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: sms.recipient_name == "MOJ" ? "building.columns.fill" : "message.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.goldDark)
                Text(sms.senderLabel).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.navy)
                Spacer(minLength: 6)
                Text(msgStamp(sms.created_at)).font(.system(size: 11)).foregroundStyle(Theme.muted)
            }
            Text(linkified(sms.message ?? ""))
                .font(.system(size: 14))
                .foregroundStyle(Theme.navy)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            if showMatter {
                if let m = sms.matter {
                    Button { onOpenMatter?(m) } label: {
                        HStack(spacing: 5) {
                            Text(matterKindEmoji(m.kind))
                            Text([m.office_num, m.title].compactMap { $0 }.joined(separator: " · "))
                                .lineLimit(1)
                            Image(systemName: "chevron.left").font(.system(size: 9))
                        }
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Theme.goldDark)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Theme.goldPale, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        if let onUnlink { Button("فك الربط", systemImage: "link.badge.plus", role: .destructive, action: onUnlink) }
                    }
                } else if let onLink {
                    Button(action: onLink) {
                        Label("ربط بملف", systemImage: "link")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(Theme.goldDark, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - الرسائل الواردة

struct SmsInboxView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [IncomingSms] = []
    @State private var filter: SmsFilter = .najiz
    @State private var loaded = false
    @State private var hasMore = true
    @State private var loadingMore = false
    @State private var error: String?
    @State private var cancelled = false
    @State private var linking: IncomingSms?
    @State private var openedCase: String?
    @State private var toast: String?
    @State private var unlinked = 0

    private static let page = 40

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $filter) {
                ForEach(SmsFilter.allCases, id: \.self) { f in
                    Text(f == .unlinked && unlinked > 0 ? "\(f.label) (\(unlinked))" : f.label).tag(f)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12).padding(.vertical, 8)

            Group {
                if let error {
                    ErrorBox(message: error) { Task { await load() } }
                        .padding(16).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                } else if !loaded {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if rows.isEmpty {
                    EmptyBox(icon: filter == .unlinked ? "checkmark.seal" : "tray",
                             text: filter == .unlinked ? "كل رسائل ناجز مربوطة بملفاتها ✓" : "لا رسائل بعد",
                             subtext: filter == .unlinked ? nil : "تصل من أتمتة «الاختصارات» على الجوال")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List {
                        if filter == .unlinked {
                            Text("اربط رسالة واحدة بملفها — ويتعلّم النظام رقم الطلب فيها فيربط أخواتها تلقائياً.")
                                .font(.system(size: 12)).foregroundStyle(Theme.muted)
                                .listRowBackground(Theme.goldPale)
                        }
                        ForEach(rows) { s in
                            SmsRow(sms: s, onLink: { linking = s }, onOpenMatter: { openedCase = $0.id },
                                   onUnlink: { Task { await link(s, to: nil) } })
                                .listRowBackground(Theme.card)
                                .onAppear { if s.id == rows.last?.id { Task { await loadMore() } } }
                        }
                        if loadingMore {
                            HStack { Spacer(); ProgressView(); Spacer() }.listRowBackground(Color.clear)
                        }
                    }
                    .listStyle(.plain)
                    .refreshable { await load() }
                }
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("الرسائل الواردة")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: filter) { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("الرسائل الواردة") }
        .navigationDestination(item: $openedCase) { CaseDetailView(caseId: $0) }
        .sheet(item: $linking) { s in
            MatterPicker { m in
                linking = nil
                Task { await link(s, to: m.id) }
            }
        }
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(Theme.navy, in: Capsule())
                    .padding(.bottom, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private func load() async {
        error = nil
        do {
            let page = try await sb.incomingSms(filter: filter, offset: 0, limit: Self.page)
            rows = page
            hasMore = page.count == Self.page
            loaded = true
            unlinked = (try? await sb.unlinkedNajizCount()) ?? 0
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }

    private func loadMore() async {
        guard hasMore, !loadingMore else { return }
        loadingMore = true
        defer { loadingMore = false }
        if let more = try? await sb.incomingSms(filter: filter, offset: rows.count, limit: Self.page) {
            let seen = Set(rows.map(\.id))
            rows += more.filter { !seen.contains($0.id) }
            hasMore = more.count == Self.page
        }
    }

    private func link(_ s: IncomingSms, to caseId: String?) async {
        let before = unlinked
        do {
            try await sb.linkSms(id: s.id, caseId: caseId)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            await load()
            if caseId != nil {
                let extra = max(0, before - unlinked - 1)
                show(extra > 0 ? "رُبطت — ومعها \(extra) رسالة بنفس الرقم تلقائياً" : "رُبطت بالملف")
            } else {
                show("فُكّ الربط")
            }
        } catch {
            show(uiErrorText(error) ?? "تعذّر الربط")
        }
    }

    private func show(_ t: String) {
        withAnimation { toast = t }
        Task {
            try? await Task.sleep(for: .seconds(2.6))
            withAnimation { toast = nil }
        }
    }
}

// MARK: - رسائل الملف (داخل ملف القضية)

struct CaseSmsCard: View {
    let caseId: String
    @EnvironmentObject private var sb: SB
    @State private var rows: [IncomingSms] = []
    @State private var expanded = false

    var body: some View {
        Group {
            if !rows.isEmpty {
                InfoCard(title: "رسائل ناجز (\(rows.count))", icon: "building.columns.fill") {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array((expanded ? rows : Array(rows.prefix(3))).enumerated()), id: \.element.id) { i, s in
                            if i > 0 { Divider() }
                            SmsRow(sms: s, showMatter: false)
                        }
                        if rows.count > 3 {
                            Button(expanded ? "أقل" : "عرض الكل (\(rows.count))") {
                                withAnimation { expanded.toggle() }
                            }
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.goldDark)
                            .padding(.top, 6)
                        }
                    }
                }
            }
        }
        .task { rows = (try? await sb.caseSms(caseId: caseId)) ?? [] }
    }
}
