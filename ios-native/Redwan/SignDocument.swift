import SwiftUI
import PDFKit
import UIKit

// التوقيع من التطبيق (طلب المدير 2026-11-02: «ودي اذا جاني طلب توقيع، اقدر أوقع من التطبيق»).
// نظير SignAttachment.tsx في الويب بالقاعدة نفسها:
//  - الموظف «اطلب التوقيع» على PDF في نقاش ملف ← sign_requests ← إشعار approval_sign للمدير يفتح الرسالة.
//  - المدير «وقّع» ← يسحب الختم والتوقيع على الصفحة ← يُسجَّل الخطاب في الصادر برقمٍ من الخادم
//    (outgoing_number_trg) ← يُطبع الرقم وتاريخه الهجري أعلى يسار الصفحة الأولى ← النسخة الموقّعة
//    ردٌّ في خيط الرسالة وفي مستندات الملف، وهي ملف الصادر النهائي، ويُسجَّل الاعتماد ويُغلق الطلب.
// الأبعاد والمواضع كـ computeLayout في src/lib/pdfStamp.ts (الختم ١١٥ نقطة، التوقيع ١٥٠، الرقم ١ سم من الحافتين).
// والفرق الوحيد: الدمج هنا بـ PDFKit، فالرقم العربي يُرسم نصاً مشكّلاً لا صورةً.

// MARK: - البيانات

struct SignRequestRow: Codable, Identifiable {
    struct Requester: Codable { let name: String?; let short_name: String? }
    let id: String
    let comment_id: String
    let requested_by: String?
    let note: String?
    let requester: Requester?

    var requesterName: String { requester?.short_name ?? requester?.name ?? "موظف" }
}

/// طلبات التوقيع المعلّقة لكل نقاش — نداء واحد يتشاركه كل زرّ في المجرى (كـ usePendingSignRequests)
@MainActor
final class SignRequestCache {
    static let shared = SignRequestCache()
    private var cache: [String: (at: Date, rows: [SignRequestRow])] = [:]
    private var inflight: [String: Task<[SignRequestRow], Error>] = [:]

    func pending(sb: SB, caseId: String?, force: Bool = false) async -> [SignRequestRow] {
        guard let caseId else { return [] }
        if !force, let c = cache[caseId], Date().timeIntervalSince(c.at) < 20 { return c.rows }
        if let t = inflight[caseId] { return (try? await t.value) ?? [] }
        let t = Task { () throws -> [SignRequestRow] in
            try await sb.get("sign_requests", query: [
                ("select", "id,comment_id,requested_by,note,requester:team_members!sign_requests_requested_by_fkey(name,short_name)"),
                ("case_id", "eq.\(caseId)"),
                ("status", "eq.pending"),
            ])
        }
        inflight[caseId] = t
        defer { inflight[caseId] = nil }
        let rows = (try? await t.value) ?? cache[caseId]?.rows ?? []
        cache[caseId] = (Date(), rows)
        return rows
    }

    func invalidate(_ caseId: String?) {
        guard let caseId else { return }
        cache[caseId] = nil
    }
}

enum SignAssets {
    /// الختم من بيانات المكتب، والتوقيع من integration_config/director_signature_url — كما في الويب
    static func load(sb: SB) async throws -> (stamp: UIImage?, signature: UIImage?) {
        struct Office: Codable { let stamp_url: String? }
        struct Lookup: Codable { let value: String? }
        async let office: [Office] = sb.get("office_info", query: [("select", "stamp_url"), ("limit", "1")])
        async let sig: [Lookup] = sb.get("lookup_values", query: [
            ("select", "value"), ("type", "eq.integration_config"),
            ("label", "eq.director_signature_url"), ("limit", "1"),
        ])
        let (o, s) = try await (office, sig)
        async let stampImg = image(o.first?.stamp_url)
        async let sigImg = image(s.first?.value)
        return await (stampImg, sigImg)
    }

    private static func image(_ url: String?) async -> UIImage? {
        guard let url, !url.isEmpty, let u = URL(string: url),
              let (data, _) = try? await URLSession.shared.data(from: u) else { return nil }
        return UIImage(data: data)
    }
}

enum SignMode: String, CaseIterable, Identifiable {
    case both, signature, stamp
    var id: String { rawValue }
    var label: String {
        switch self {
        case .both: return "ختم وتوقيع"
        case .signature: return "توقيع فقط"
        case .stamp: return "ختم فقط"
        }
    }
}

// MARK: - الدمج

enum SignedPdf {
    static let stampWidth: CGFloat = 115
    static let signatureWidth: CGFloat = 150
    static let numberWidth: CGFloat = 150
    static let numberMargin: CGFloat = 72 / 2.54 // ١ سم
    static let numberFont: CGFloat = 8.5
    static let numberLine: CGFloat = 11.5

    /// حجم الصفحة كما تُعرض (بعد الدوران)
    static func size(of page: PDFPage) -> CGSize {
        let b = page.bounds(for: .mediaBox)
        return page.rotation % 180 == 0 ? b.size : CGSize(width: b.height, height: b.width)
    }

    /// مستطيل عنصر متمركز على كسور 0..1 من أعلى يسار الصفحة
    static func rect(center: CGPoint, width: CGFloat, aspect: CGFloat, page: CGSize) -> CGRect {
        let h = width * aspect
        return CGRect(x: center.x * page.width - width / 2, y: center.y * page.height - h / 2, width: width, height: h)
    }

    static func numberLines(_ letterNumber: String, date: Date = Date()) -> [String] {
        ["رقم الصادر: \(letterNumber)", "التاريخ: \(hijriYMD(date))"]
    }

    static func numberRect(lines: Int) -> CGRect {
        CGRect(x: numberMargin, y: numberMargin, width: numberWidth, height: CGFloat(lines) * numberLine + 3)
    }

    private static let hijriF: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar_SA@calendar=islamic-umalqura;numbers=latn")
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.dateFormat = "yyyy/MM/dd"
        return f
    }()
    static func hijriYMD(_ d: Date) -> String { hijriF.string(from: d) + " هـ" }

    static func drawNumber(_ lines: [String]) {
        let font = UIFont(name: "IBMPlexSansArabic-SemiBold", size: numberFont)
            ?? .systemFont(ofSize: numberFont, weight: .semibold)
        let para = NSMutableParagraphStyle()
        para.alignment = .left
        para.baseWritingDirection = .rightToLeft
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font, .paragraphStyle: para,
            .foregroundColor: UIColor(red: 0x1f / 255, green: 0x29 / 255, blue: 0x37 / 255, alpha: 1),
        ]
        for (i, line) in lines.enumerated() {
            NSAttributedString(string: line, attributes: attrs).draw(in: CGRect(
                x: numberMargin, y: numberMargin + 1.5 + CGFloat(i) * numberLine,
                width: numberWidth, height: numberLine + 2
            ))
        }
    }

    /// يعيد رسم كل صفحة (المحتوى يبقى متّجهاً) ويضع الختم والتوقيع في صفحتهما، والرقم في الصفحة الأولى
    static func make(
        pdf: PDFDocument, pageIndex: Int,
        stamp: UIImage?, stampCenter: CGPoint,
        signature: UIImage?, sigCenter: CGPoint,
        numberLines: [String]?
    ) throws -> Data {
        guard pdf.pageCount > 0 else { throw SBError(message: "الملف بلا صفحات") }
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 595, height: 842))
        return renderer.pdfData { ctx in
            for i in 0..<pdf.pageCount {
                guard let page = pdf.page(at: i) else { continue }
                let size = size(of: page)
                ctx.beginPage(withBounds: CGRect(origin: .zero, size: size), pageInfo: [:])
                let cg = ctx.cgContext
                cg.saveGState()
                cg.translateBy(x: 0, y: size.height)
                cg.scaleBy(x: 1, y: -1)
                page.draw(with: .mediaBox, to: cg)
                cg.restoreGState()

                if i == 0, let numberLines, !numberLines.isEmpty { drawNumber(numberLines) }
                if i == pageIndex {
                    if let stamp, stamp.size.width > 0 {
                        stamp.draw(in: rect(center: stampCenter, width: stampWidth,
                                            aspect: stamp.size.height / stamp.size.width, page: size),
                                   blendMode: .normal, alpha: 0.92)
                    }
                    if let signature, signature.size.width > 0 {
                        signature.draw(in: rect(center: sigCenter, width: signatureWidth,
                                                aspect: signature.size.height / signature.size.width, page: size),
                                       blendMode: .normal, alpha: 0.95)
                    }
                }
            }
        }
    }
}

// MARK: - الزر تحت مرفق PDF

/// «وقّع» للمدير و«اطلب التوقيع» للموظف — تحت كل مرفق PDF في النقاش وخيوطه
struct SignChip: View {
    let name: String
    let url: String?
    let caseId: String?
    /// رسالة الملف نفسها — بها يُعرف طلب توقيعها
    let messageId: String
    /// الرسالة التي يُردّ تحتها بالنسخة الموقّعة (جذر الخيط)
    let parentId: String
    let documentId: String?
    var onSigned: () async -> Void = {}

    @EnvironmentObject private var sb: SB
    @State private var request: SignRequestRow?
    @State private var signing = false
    @State private var asking = false
    @State private var busy = false
    @State private var alertText: String?

    static func isPdf(_ name: String?) -> Bool { (name ?? "").lowercased().hasSuffix(".pdf") }

    private var isDirector: Bool { sb.member?.is_director == true }

    var body: some View {
        Group {
            if url != nil && Self.isPdf(name) {
                if isDirector { directorChip } else { employeeChip }
            }
        }
        .task(id: messageId) { await refresh() }
        .fullScreenCover(isPresented: $signing) {
            SignSheet(
                name: name, url: url ?? "", caseId: caseId, messageId: messageId,
                parentId: parentId, request: request
            ) {
                SignRequestCache.shared.invalidate(caseId)
                request = nil
                await onSigned()
            }
        }
        .sheet(isPresented: $asking) {
            AskSignSheet(name: name, caseId: caseId, messageId: messageId, documentId: documentId) {
                SignRequestCache.shared.invalidate(caseId)
                await refresh(force: true)
            }
            .presentationDetents([.medium])
        }
        .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
            Button("حسناً", role: .cancel) { alertText = nil }
        } message: { Text(alertText ?? "") }
    }

    private func refresh(force: Bool = false) async {
        guard Self.isPdf(name), caseId != nil else { return }
        let rows = await SignRequestCache.shared.pending(sb: sb, caseId: caseId, force: force)
        request = rows.first { $0.comment_id == messageId }
    }

    private var directorChip: some View {
        VStack(alignment: .leading, spacing: 3) {
            Button { signing = true } label: {
                Label("وقّع", systemImage: "signature")
                    .font(.system(size: 12, weight: .semibold))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .foregroundStyle(request != nil ? Theme.navy : Theme.goldDark)
                    .background(request != nil ? Theme.gold.opacity(0.28) : .clear)
                    .clipShape(Capsule())
                    .overlay(Capsule().stroke(Theme.gold.opacity(request != nil ? 1 : 0.6), lineWidth: 1))
            }
            .buttonStyle(.plain)
            if let r = request {
                Text("⏳ طلب \(r.requesterName)\(r.note.map { " — \($0)" } ?? "")")
                    .font(.system(size: 10))
                    .foregroundStyle(Theme.amber)
                    .lineLimit(2)
            }
        }
    }

    @ViewBuilder private var employeeChip: some View {
        if let r = request {
            HStack(spacing: 5) {
                Image(systemName: "clock").font(.system(size: 11))
                Text("بانتظار توقيع المدير").font(.system(size: 11, weight: .medium))
                if r.requested_by == sb.member?.id {
                    Button { Task { await cancel(r) } } label: {
                        Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                    .accessibilityLabel("إلغاء طلب التوقيع")
                }
            }
            .foregroundStyle(Theme.amber)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(Theme.amber.opacity(0.1))
            .clipShape(Capsule())
        } else if caseId != nil {
            // طلب التوقيع مربوط بملف (يُسجَّل صادراً عليه)
            Button { asking = true } label: {
                Label("اطلب التوقيع", systemImage: "signature")
                    .font(.system(size: 12, weight: .medium))
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .foregroundStyle(Theme.goldDark)
                    .overlay(Capsule().stroke(Theme.gold.opacity(0.6), lineWidth: 1))
            }
            .buttonStyle(.plain)
        }
    }

    private func cancel(_ r: SignRequestRow) async {
        busy = true
        defer { busy = false }
        do {
            try await sb.patch("sign_requests", query: [("id", "eq.\(r.id)")], values: ["status": "cancelled"])
            SignRequestCache.shared.invalidate(caseId)
            request = nil
        } catch {
            alertText = uiErrorText(error)
        }
    }
}

// MARK: - طلب التوقيع (الموظف)

private struct AskSignSheet: View {
    let name: String
    let caseId: String?
    let messageId: String
    let documentId: String?
    let onSent: () async -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""
    @State private var busy = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label(name, systemImage: "doc.richtext").lineLimit(2)
                }
                Section {
                    TextField("مثل: الخطاب للمحكمة ويُرسل اليوم", text: $note, axis: .vertical)
                        .lineLimit(2...4)
                } header: {
                    Text("ملاحظة للمدير (اختياري)")
                } footer: {
                    Text("يصل المديرَ إشعارٌ يفتح هذه الرسالة. وحين يوقّع تصل النسخة الموقّعة في الخيط، ويُسجَّل الخطاب في الصادر برقمه.")
                }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(Theme.danger).font(.system(size: 13)) }
                }
            }
            .navigationTitle("اطلب توقيع المدير")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button { Task { await send() } } label: {
                        if busy { ProgressView() } else { Text("أرسل").bold() }
                    }
                    .disabled(busy)
                }
            }
        }
    }

    private func send() async {
        guard let me = sb.member?.id else {
            errorText = "لم يُحمَّل ملفك بعد — اسحب للتحديث ثم أعد المحاولة"
            return
        }
        busy = true
        defer { busy = false }
        do {
            let n = note.trimmingCharacters(in: .whitespacesAndNewlines)
            try await sb.insertVoid("sign_requests", values: [
                "comment_id": messageId,
                "case_id": caseId ?? NSNull(),
                "document_id": documentId ?? NSNull(),
                "requested_by": me,
                "note": n.isEmpty ? NSNull() : n,
            ])
            await onSent()
            dismiss()
        } catch {
            errorText = uiErrorText(error) ?? error.localizedDescription
        }
    }
}

// MARK: - شاشة التوقيع (المدير)

struct SignSheet: View {
    let name: String
    let url: String
    let caseId: String?
    let messageId: String
    let parentId: String
    let request: SignRequestRow?
    let onDone: () async -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss

    @State private var pdf: PDFDocument?
    @State private var stamp: UIImage?
    @State private var signature: UIImage?
    @State private var loadError: String?
    @State private var pageIndex = 0
    @State private var pageImage: UIImage?
    @State private var mode: SignMode = .both
    @State private var asLetter = true
    @State private var stampPos = CGPoint(x: 0.22, y: 0.86)
    @State private var sigPos: CGPoint?
    @State private var dragStart: CGPoint?
    @State private var busy = false
    @State private var errorText: String?

    private var useStamp: Bool { mode != .signature && stamp != nil }
    private var useSig: Bool { mode != .stamp && signature != nil }
    private var modes: [SignMode] {
        SignMode.allCases.filter {
            switch $0 {
            case .both: return stamp != nil && signature != nil
            case .signature: return signature != nil
            case .stamp: return stamp != nil
            }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let loadError {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle").font(.system(size: 30)).foregroundStyle(Theme.amber)
                        Text(loadError).multilineTextAlignment(.center).foregroundStyle(Theme.navy)
                    }
                    .padding(30)
                } else if let pdf {
                    content(pdf)
                } else {
                    ProgressView("يُجهّز الملف…")
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.ivory)
            .navigationTitle("توقيع الخطاب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إلغاء") { dismiss() }.disabled(busy)
                }
            }
        }
        .interactiveDismissDisabled(busy)
        .task { await load() }
    }

    @ViewBuilder private func content(_ pdf: PDFDocument) -> some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 12) {
                    if let r = request {
                        HStack(alignment: .top, spacing: 6) {
                            Image(systemName: "clock").foregroundStyle(Theme.amber)
                            Text("طلب \(r.requesterName)\(r.note.map { " — \($0)" } ?? "")")
                                .font(.system(size: 13))
                                .foregroundStyle(Theme.navy)
                            Spacer(minLength: 0)
                        }
                        .padding(10)
                        .background(Theme.amber.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }

                    if modes.count > 1 {
                        Picker("ما يُطبَّق", selection: $mode) {
                            ForEach(modes) { Text($0.label).tag($0) }
                        }
                        .pickerStyle(.segmented)
                    }

                    Toggle(isOn: $asLetter) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("خطاب صادر").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.navy)
                            Text("يُسجَّل برقمه ويُطبع الرقم أعلى الصفحة الأولى")
                                .font(.system(size: 11)).foregroundStyle(Theme.muted)
                        }
                    }
                    .tint(Theme.gold)
                    .padding(12)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 12))

                    pageEditor(pdf)

                    Text("اسحب الختم والتوقيع إلى موضعهما — كلٌّ وحده")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                }
                .padding(14)
            }

            VStack(spacing: 6) {
                if let errorText {
                    Text(errorText).font(.system(size: 12)).foregroundStyle(Theme.danger)
                        .multilineTextAlignment(.center)
                }
                Button { Task { await confirm(pdf) } } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(.white) } else { Image(systemName: "signature") }
                        Text(busy ? "يوقّع…" : (asLetter ? "وقّع وسجّل في الصادر" : "وقّع وأرسل في الخيط"))
                            .font(.system(size: 16, weight: .bold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .foregroundStyle(.white)
                    .background(Theme.navy)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .disabled(busy || (!useStamp && !useSig))
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)
            .padding(.bottom, 10)
            .background(Theme.ivory)
        }
    }

    @ViewBuilder private func pageEditor(_ pdf: PDFDocument) -> some View {
        let page = pdf.page(at: pageIndex)
        let pt = page.map(SignedPdf.size(of:)) ?? CGSize(width: 595, height: 842)
        VStack(spacing: 8) {
            if pdf.pageCount > 1 {
                // السابقة يميناً والتالية يساراً — اتجاه القراءة العربي
                HStack {
                    Button { setPage(pageIndex - 1, pdf) } label: { pageArrow("chevron.right", enabled: pageIndex > 0) }
                        .disabled(pageIndex == 0)
                    Spacer()
                    Text("صفحة \(pageIndex + 1) من \(pdf.pageCount)")
                        .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.navy)
                    Spacer()
                    Button { setPage(pageIndex + 1, pdf) } label: { pageArrow("chevron.left", enabled: pageIndex < pdf.pageCount - 1) }
                        .disabled(pageIndex >= pdf.pageCount - 1)
                }
                .buttonStyle(.plain)
            }

            GeometryReader { geo in
                let k = geo.size.width / pt.width
                ZStack(alignment: .topLeading) {
                    if let pageImage {
                        Image(uiImage: pageImage).resizable().frame(width: geo.size.width, height: pt.height * k)
                    } else {
                        Rectangle().fill(.white)
                    }
                    if asLetter && pageIndex == 0 {
                        let r = SignedPdf.numberRect(lines: 2)
                        VStack(alignment: .leading, spacing: 0) {
                            // العزل الاتجاهي يمنع النقاط من التبعثر حول الرقم اللاتيني في السطر العربي
                            Text("رقم الصادر: \u{2066}OUT-\(Self.yy)-···\u{2069}")
                            Text("التاريخ: \(SignedPdf.hijriYMD(Date()))")
                        }
                        .font(.system(size: SignedPdf.numberFont * k, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x1F2937))
                        .padding(2 * k)
                        .background(Theme.gold.opacity(0.15))
                        .offset(x: r.minX * k, y: r.minY * k)
                        .allowsHitTesting(false)
                    }
                    if useStamp, let stamp {
                        overlay(stamp, width: SignedPdf.stampWidth, center: stampPos, k: k, pt: pt, opacity: 0.92) { p in
                            // أول سحب للختم يفكّ التوقيع منه — يبقى مكانه (كالويب)
                            if sigPos == nil && useSig { sigPos = effectiveSigPos }
                            stampPos = p
                        }
                    }
                    if useSig, let signature {
                        overlay(signature, width: SignedPdf.signatureWidth, center: effectiveSigPos, k: k, pt: pt, opacity: 0.95) { sigPos = $0 }
                    }
                }
                .frame(width: geo.size.width, height: pt.height * k)
                .clipped()
                .environment(\.layoutDirection, .leftToRight) // إحداثيات الصفحة من اليسار كالورق
            }
            .aspectRatio(pt.width / pt.height, contentMode: .fit)
            .overlay(Rectangle().stroke(Theme.line, lineWidth: 1))
            .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
        }
    }

    private static var yy: String {
        String(Calendar(identifier: .gregorian).component(.year, from: Date()) % 100)
    }

    private func pageArrow(_ icon: String, enabled: Bool) -> some View {
        Image(systemName: icon)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(enabled ? Theme.goldDark : Theme.line)
            .frame(width: 44, height: 36)
            .background(enabled ? Theme.goldPale : .clear)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .contentShape(Rectangle())
    }

    /// موضع التوقيع: المستقل إن سُحب، وإلا فوق الختم بتداخل خفيف (ترتيب الويب القديم)، أو موضع الختم بلا ختم
    private var effectiveSigPos: CGPoint {
        if let sigPos { return sigPos }
        guard useStamp, let stamp, stamp.size.width > 0, let page = pdf?.page(at: pageIndex) else { return stampPos }
        let pt = SignedPdf.size(of: page)
        let stampH = SignedPdf.stampWidth * stamp.size.height / stamp.size.width
        let sigH = SignedPdf.signatureWidth * (signature.map { $0.size.height / max($0.size.width, 1) } ?? 0.4)
        let cyTop = stampPos.y * pt.height
        let bottomFromBottom = pt.height - cyTop - stampH / 2 + max(stampH * 0.55, 30)
        let top = pt.height - bottomFromBottom - sigH
        return CGPoint(x: (stampPos.x * pt.width - 20) / pt.width, y: (top + sigH / 2) / pt.height)
    }

    private func overlay(
        _ img: UIImage, width: CGFloat, center: CGPoint, k: CGFloat, pt: CGSize, opacity: Double,
        set: @escaping (CGPoint) -> Void
    ) -> some View {
        let r = SignedPdf.rect(center: center, width: width, aspect: img.size.height / max(img.size.width, 1), page: pt)
        return Image(uiImage: img)
            .resizable()
            .opacity(opacity)
            .frame(width: r.width * k, height: r.height * k)
            .overlay(RoundedRectangle(cornerRadius: 3).stroke(Theme.gold, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
            .position(x: center.x * pt.width * k, y: center.y * pt.height * k)
            .gesture(
                DragGesture(minimumDistance: 1)
                    .onChanged { g in
                        let start = dragStart ?? center
                        if dragStart == nil { dragStart = center }
                        set(CGPoint(
                            x: min(max(start.x + g.translation.width / (pt.width * k), 0), 1),
                            y: min(max(start.y + g.translation.height / (pt.height * k), 0), 1)
                        ))
                    }
                    .onEnded { _ in dragStart = nil }
            )
    }

    private func setPage(_ i: Int, _ pdf: PDFDocument) {
        guard i >= 0, i < pdf.pageCount else { return }
        pageIndex = i
        renderPage(pdf)
    }

    private func renderPage(_ pdf: PDFDocument) {
        guard let page = pdf.page(at: pageIndex) else { return }
        let pt = SignedPdf.size(of: page)
        let w: CGFloat = 1100
        pageImage = page.thumbnail(of: CGSize(width: w, height: w * pt.height / pt.width), for: .mediaBox)
    }

    private func load() async {
        do {
            guard let u = URL(string: url) else { throw SBError(message: "رابط الملف غير صالح") }
            async let fileData = URLSession.shared.data(from: u)
            async let assets = SignAssets.load(sb: sb)
            let ((data, resp), a) = try await (fileData, assets)
            if let http = resp as? HTTPURLResponse, http.statusCode >= 400 {
                throw SBError(message: "تعذّر تحميل الملف (\(http.statusCode))")
            }
            guard let doc = PDFDocument(data: data) else { throw SBError(message: "تعذّرت قراءة الملف — ليس PDF سليماً") }
            if doc.isLocked { throw SBError(message: "الملف محمي بكلمة مرور فلا يُوقَّع") }
            guard a.stamp != nil || a.signature != nil else {
                throw SBError(message: "لا توقيع محفوظ بعد — ارفع توقيعك (والختم إن شئت) من الإعدادات ← بيانات المكتب في الويب، ثم وقّع.")
            }
            stamp = a.stamp
            signature = a.signature
            mode = a.signature != nil ? (a.stamp != nil ? .both : .signature) : .stamp
            pageIndex = doc.pageCount - 1 // كتلة التوقيع في آخر صفحة عادةً
            pdf = doc
            renderPage(doc)
        } catch {
            loadError = uiErrorText(error) ?? error.localizedDescription
        }
    }

    private func confirm(_ pdf: PDFDocument) async {
        busy = true
        errorText = nil
        struct Letter: Codable { let id: String; let letter_number: String }
        var letter: Letter?
        var posted = false
        do {
            guard let me = sb.member?.id else { throw SBError(message: "لم يُحمَّل ملفك بعد — أعد المحاولة") }
            // ١) الخطاب في الصادر أولاً — رقمه من الخادم
            if asLetter {
                let data = try await sb.rawInsertReturning("outgoing_letters", values: [
                    "subject": name.replacingOccurrences(of: ".pdf", with: "", options: [.caseInsensitive, .anchored, .backwards]),
                    "letter_date": Fmt.todayISO(),
                    "case_id": caseId ?? NSNull(),
                    "created_by": me,
                    "file_url": url,
                    "source_comment_id": messageId,
                    "notes": "وُقّع من نقاش الملف (التطبيق)",
                ])
                letter = try JSONDecoder().decode([Letter].self, from: data).first
                guard letter != nil else { throw SBError(message: "لم يُسجَّل الخطاب في الصادر") }
            }
            // ٢) الدمج
            let signed = try SignedPdf.make(
                pdf: pdf, pageIndex: pageIndex,
                stamp: useStamp ? stamp : nil, stampCenter: stampPos,
                signature: useSig ? signature : nil, sigCenter: effectiveSigPos,
                numberLines: letter.map { SignedPdf.numberLines($0.letter_number) }
            )
            let base = name.replacingOccurrences(of: ".pdf", with: "", options: [.caseInsensitive, .anchored, .backwards])
            let verb = mode == .stamp ? "مختومة" : (useStamp && useSig ? "موقّعة ومختومة" : "موقّعة")
            let signedName = "\(base) - \(mode == .stamp ? "مختوم" : "موقّع")\(letter.map { " - \($0.letter_number)" } ?? "").pdf"
            // ٣) النسخة الموقّعة في الخيط — وفي مستندات الملف
            let doc = try await sb.uploadAttachmentFull(
                data: signed, fileName: signedName, mime: "application/pdf", caseId: caseId,
                description: letter.map { "صادر \($0.letter_number) — نسخة \(verb)" } ?? "نسخة موقّعة من «\(name)»"
            )
            try await sb.postMessage(
                caseId: caseId,
                body: "✍️ نسخة \(verb) من «\(name)»\(letter.map { " — صادر \($0.letter_number)" } ?? "")",
                documentId: doc.id, parentId: parentId, alsoToStream: true
            )
            posted = true
            // ٤) النسخة الموقّعة هي النهائية في الصادر، والاعتماد مسجّل بمن طلب ومن وقّع
            let now = ISO8601DateFormatter().string(from: Date())
            if let letter {
                try? await sb.patch("outgoing_letters", query: [("id", "eq.\(letter.id)")],
                                    values: ["file_url": doc.url, "document_id": doc.id])
                var approval: [String: Any] = [
                    "letter_id": letter.id, "status": "approved",
                    "original_file_url": url, "signed_file_url": doc.url,
                    "requested_by": request?.requested_by ?? me, "requested_at": now,
                    "approved_by": me, "approved_at": now,
                    "apply_mode": useStamp && useSig ? "both" : (useSig ? "signature" : "stamp"),
                    "stamp_page": pageIndex + 1, "stamp_x": stampPos.x, "stamp_y": stampPos.y,
                    "note": request?.note ?? NSNull(),
                ]
                approval["sig_pos"] = useSig ? ["x": effectiveSigPos.x, "y": effectiveSigPos.y] : NSNull()
                try? await sb.insertVoid("outgoing_approvals", values: approval)
            }
            if let request {
                try? await sb.patch("sign_requests", query: [("id", "eq.\(request.id)")], values: [
                    "status": "signed", "letter_id": letter?.id ?? NSNull(), "signed_at": now,
                ])
            }
            busy = false
            await onDone()
            dismiss()
        } catch {
            // خطابٌ سُجّل ولم تُرسَل نسخته الموقّعة لا يبقى رقماً معلّقاً بلا ملف (حذف ليّن)
            if let letter, !posted {
                try? await sb.patch("outgoing_letters", query: [("id", "eq.\(letter.id)")], values: [
                    "deleted_at": ISO8601DateFormatter().string(from: Date()),
                    "deleted_by": "تعذّر التوقيع من التطبيق",
                ])
            }
            errorText = uiErrorText(error) ?? error.localizedDescription
            busy = false
        }
    }
}
