import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

// مستندات المكتب في الآيفون — مرآة صفحة الويب (طلب المدير 2026-09-26): تراخيص المكتب
// وشهاداته بتواريخ انتهائها، والرفع بالتصوير أو من الملفات يقرؤه النظام (office-doc-extract)
// ويعبّئ بياناته ويطابقه بمستنده المسجّل، ثم تراجعه وتحفظه. التنبيه قبل الانتهاء من القاعدة.

struct OfficeDoc: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let type: String?
    let doc_number: String?
    let issuing_authority: String?
    let issue_date: String?
    let expiry_date: String?
    let file_url: String?
    let file_name: String?
    let notes: String?
    let ai_extracted: Bool?
}

struct OfficeDocExtraction: Codable {
    let name: String?
    let category: String?
    let doc_number: String?
    let issuing_authority: String?
    let issue_date: String?
    let expiry_date: String?
    let hijri_note: String?
    let summary: String?
    let match_id: String?
    let confidence: String?
}

enum OfficeDocLabels {
    static let categories: [(key: String, label: String)] = [
        ("license", "ترخيص"), ("certificate", "شهادة"), ("registration", "سجل وقيد"),
        ("membership", "عضوية"), ("contract", "عقد"), ("other", "أخرى"),
    ]
    static func category(_ k: String?) -> String {
        categories.first { $0.key == k }?.label ?? "مستند"
    }
    static func icon(_ k: String?) -> String {
        switch k {
        case "license": return "checkmark.seal"
        case "registration": return "doc.plaintext"
        case "membership": return "building.2"
        case "contract": return "signature"
        default: return "doc.badge.clock"
        }
    }
}

/// حالة الصلاحية: منتهٍ · قريب (٦٠ يوماً) · سارٍ · بلا تاريخ
enum DocHealth: Int { case expired = 0, soon, valid, none }

extension OfficeDoc {
    var daysLeft: Int? {
        guard let e = expiry_date, let d = Fmt.date(e), let t = Fmt.date(Fmt.todayISO()) else { return nil }
        return Calendar(identifier: .gregorian).dateComponents([.day], from: t, to: d).day
    }
    var health: DocHealth {
        guard let d = daysLeft else { return .none }
        if d <= 0 { return .expired }
        if d <= 60 { return .soon }
        return .valid
    }
    /// صياغة محايدة تصلح للترخيص والشهادة معاً
    var healthText: String {
        guard let d = daysLeft else { return "بلا تاريخ انتهاء" }
        if d == 0 { return "تنتهي الصلاحية اليوم" }
        if d < 0 { return "انتهت الصلاحية منذ \(arDays(-d))" }
        if d <= 60 { return "تنتهي الصلاحية بعد \(arDays(d))" }
        return "الصلاحية حتى \(Fmt.gregLong(expiry_date))"
    }
    var healthColor: Color {
        switch health {
        case .expired: return Theme.danger
        case .soon: return Theme.amber
        case .valid: return Theme.success
        case .none: return Theme.muted
        }
    }
}

extension SB {
    func officeDocs() async throws -> [OfficeDoc] {
        try await get("office_documents", query: [
            ("select", "id,name,type,doc_number,issuing_authority,issue_date,expiry_date,file_url,file_name,notes,ai_extracted"),
            ("order", "name"),
        ])
    }

    func saveOfficeDoc(id: String?, values: [String: Any]) async throws {
        if let id {
            try await patch("office_documents", query: [("id", "eq.\(id)")], values: values)
        } else {
            var v = values
            v["status"] = "active"
            if let me = member?.id { v["created_by"] = me }
            try await insertVoid("office_documents", values: v)
        }
    }

    func deleteOfficeDoc(id: String) async throws {
        try await delete("office_documents", query: [("id", "eq.\(id)")])
    }

    /// يرفع الملف لمجلد office/ ويطلب قراءته — فشل القراءة لا يُضيّع الرفع
    func uploadAndExtractOfficeDoc(data: Data, ext: String, mime: String)
        async throws -> (url: String, x: OfficeDocExtraction?, error: String?)
    {
        let path = "office/\(Int(Date().timeIntervalSince1970 * 1000))_ios.\(ext)"
        let url = try await storageUpload(bucket: "documents", path: path, data: data, mime: mime)
        do {
            let body = try JSONSerialization.data(withJSONObject: ["file_path": path])
            let resp = try await raw(path: "functions/v1/office-doc-extract", method: "POST", query: [], body: body)
            struct R: Codable { let result: OfficeDocExtraction?; let error: String? }
            let r = try JSONDecoder().decode(R.self, from: resp)
            return (url, r.result, r.error)
        } catch {
            return (url, nil, uiErrorText(error) ?? "تعذّرت قراءة الملف")
        }
    }
}

// MARK: - القائمة

struct OfficeDocumentsView: View {
    @EnvironmentObject private var sb: SB
    @State private var docs: [OfficeDoc] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false
    @State private var filter: DocHealth? = nil
    @State private var noFileOnly = false
    @State private var showUpload = false
    @State private var uploadFor: OfficeDoc?
    @State private var editing: OfficeDoc?
    @State private var preview: OfficeDoc?
    @State private var confirmDelete: OfficeDoc?

    private var isDirector: Bool { sb.member?.is_director == true }

    private var sorted: [OfficeDoc] {
        docs.sorted {
            if $0.health != $1.health { return $0.health.rawValue < $1.health.rawValue }
            return ($0.daysLeft ?? 99999) < ($1.daysLeft ?? 99999)
        }
    }
    private var shown: [OfficeDoc] {
        sorted.filter { d in
            if noFileOnly { return d.file_url == nil }
            if let f = filter { return d.health == f }
            return true
        }
    }

    var body: some View {
        ScrollView {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.padding(16)
            } else if !loaded {
                ProgressView().padding(.top, 60)
            } else {
                VStack(spacing: 12) {
                    uploadButton
                    summary
                    if shown.isEmpty {
                        EmptyBox(icon: "doc.badge.clock", text: docs.isEmpty ? "لا مستندات بعد" : "لا مستندات بهذا التصنيف",
                                 subtext: docs.isEmpty ? "صوّر أول ترخيص أو شهادة" : nil)
                            .padding(.top, 20)
                    } else {
                        ForEach(shown) { d in card(d) }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("مستندات المكتب")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("مستندات المكتب") }
        .sheet(isPresented: $showUpload, onDismiss: { Task { await load() } }) {
            OfficeDocUploadSheet(docs: docs, forDoc: nil)
        }
        .sheet(item: $uploadFor, onDismiss: { Task { await load() } }) { d in
            OfficeDocUploadSheet(docs: docs, forDoc: d)
        }
        .sheet(item: $editing, onDismiss: { Task { await load() } }) { d in
            OfficeDocForm(docs: docs, draft: .init(doc: d), lockTarget: true, extraction: nil, readError: nil)
        }
        .sheet(item: $preview) { d in
            FilePreviewSheet(name: d.file_name ?? d.name, url: d.file_url)
        }
        .confirmationDialog("حذف المستند؟", isPresented: Binding(get: { confirmDelete != nil },
                                                                set: { if !$0 { confirmDelete = nil } }),
                            titleVisibility: .visible) {
            Button("حذف", role: .destructive) {
                if let d = confirmDelete {
                    Task {
                        try? await sb.deleteOfficeDoc(id: d.id)
                        await load()
                    }
                }
            }
            Button("تراجع", role: .cancel) { confirmDelete = nil }
        } message: { Text(confirmDelete?.name ?? "") }
    }

    private var uploadButton: some View {
        Button { showUpload = true } label: {
            HStack(spacing: 12) {
                Image(systemName: "doc.viewfinder")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(Theme.goldDark)
                    .frame(width: 46, height: 46)
                    .background(Theme.goldPale, in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    Text("صوّر أو ارفع مستنداً")
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.navy)
                    Text("يقرؤه النظام ويعبّئ بياناته، وتراجعها قبل الحفظ")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
                Image(systemName: "sparkles").foregroundStyle(Theme.goldDark)
            }
            .padding(14)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.gold.opacity(0.5), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4])))
        }
        .buttonStyle(.plain)
    }

    private var summary: some View {
        let expired = docs.filter { $0.health == .expired }.count
        let soon = docs.filter { $0.health == .soon }.count
        let valid = docs.filter { $0.health == .valid }.count
        let noFile = docs.filter { $0.file_url == nil }.count
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            tile("منتهية", expired, Theme.danger, active: filter == .expired && !noFileOnly) { toggle(.expired) }
            tile("تنتهي خلال 60 يوماً", soon, Theme.amber, active: filter == .soon && !noFileOnly) { toggle(.soon) }
            tile("سارية", valid, Theme.success, active: filter == .valid && !noFileOnly) { toggle(.valid) }
            tile("بلا ملف", noFile, Theme.muted, active: noFileOnly) {
                noFileOnly.toggle(); filter = nil
            }
        }
    }

    private func toggle(_ h: DocHealth) {
        noFileOnly = false
        filter = filter == h ? nil : h
    }

    private func tile(_ label: String, _ n: Int, _ tint: Color, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(1)
                Text("\(n)").font(.system(size: 24, weight: .bold)).foregroundStyle(n > 0 ? tint : Theme.navy)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(active ? Theme.gold : Theme.line, lineWidth: active ? 2 : 1))
        }
        .buttonStyle(.plain)
    }

    private func card(_ d: OfficeDoc) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: OfficeDocLabels.icon(d.type))
                    .font(.system(size: 17))
                    .foregroundStyle(d.healthColor)
                    .frame(width: 40, height: 40)
                    .background(d.healthColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text(d.name).font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.navy)
                    Text(d.issuing_authority ?? OfficeDocLabels.category(d.type))
                        .font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(1)
                }
                Spacer(minLength: 0)
                if d.ai_extracted == true {
                    Image(systemName: "sparkles").font(.system(size: 12)).foregroundStyle(Theme.goldDark)
                }
            }
            if let n = d.doc_number, !n.isEmpty {
                HStack(spacing: 6) {
                    Text("الرقم").font(.system(size: 12)).foregroundStyle(Theme.muted)
                    Text(n).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.navy)
                        .environment(\.layoutDirection, .leftToRight)
                    Button {
                        UIPasteboard.general.string = n
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    } label: {
                        Image(systemName: "doc.on.doc").font(.system(size: 11)).foregroundStyle(Theme.muted)
                    }
                    .buttonStyle(.plain)
                }
            }
            HStack(spacing: 6) {
                Text(d.healthText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(d.healthColor)
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(d.healthColor.opacity(0.12), in: Capsule())
                if d.file_url == nil {
                    Text("بلا ملف").font(.system(size: 12)).foregroundStyle(Theme.muted)
                        .padding(.horizontal, 9).padding(.vertical, 4)
                        .background(Theme.line.opacity(0.6), in: Capsule())
                }
            }
            Divider()
            HStack(spacing: 14) {
                if d.file_url != nil {
                    Button { preview = d } label: { Label("معاينة", systemImage: "eye") }
                }
                Button { uploadFor = d } label: {
                    Label(d.file_url == nil ? "رفع الملف" : (d.health == .expired || d.health == .soon ? "النسخة المجدّدة" : "استبدال"),
                          systemImage: d.file_url == nil ? "arrow.up.doc" : "arrow.triangle.2.circlepath")
                }
                .fontWeight(d.file_url == nil || d.health == .expired ? .semibold : .regular)
                Button { editing = d } label: { Label("تعديل", systemImage: "pencil") }
                Spacer(minLength: 0)
                if isDirector {
                    Button { confirmDelete = d } label: { Image(systemName: "trash") }
                        .foregroundStyle(Theme.muted)
                }
            }
            .font(.system(size: 13))
            .foregroundStyle(Theme.goldDark)
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14)
            .stroke(d.health == .expired ? Theme.danger.opacity(0.4) : d.health == .soon ? Theme.amber.opacity(0.4) : Theme.line,
                    lineWidth: 1))
    }

    private func load() async {
        error = nil
        do {
            docs = try await sb.officeDocs()
            loaded = true
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}

// MARK: - الرفع: تصوير أو صورة أو ملف ← قراءة ← مراجعة

struct OfficeDocUploadSheet: View {
    let docs: [OfficeDoc]
    let forDoc: OfficeDoc?

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var showScanner = false
    @State private var showFiles = false
    @State private var photoItem: PhotosPickerItem?
    @State private var reading = false
    @State private var error: String?
    @State private var review: ReviewPayload?

    struct ReviewPayload: Identifiable {
        let id = UUID()
        let draft: OfficeDocDraft
        let x: OfficeDocExtraction?
        let readError: String?
    }

    var body: some View {
        NavigationStack {
            Form {
                if let forDoc {
                    Section { Label(forDoc.name, systemImage: OfficeDocLabels.icon(forDoc.type)).foregroundStyle(Theme.navy) }
                        header: { Text("نسخة جديدة من") }
                }
                if reading {
                    Section {
                        HStack(spacing: 12) {
                            ProgressView()
                            VStack(alignment: .leading, spacing: 2) {
                                Text("يقرأ النظام المستند…").font(.system(size: 14, weight: .semibold))
                                Text("الاسم والرقم والجهة والتواريخ — بضع ثوانٍ").font(.system(size: 12)).foregroundStyle(Theme.muted)
                            }
                        }
                        .padding(.vertical, 6)
                    }
                } else {
                    Section {
                        Button { showScanner = true } label: { Label("تصوير المستند", systemImage: "doc.viewfinder") }
                        PhotosPicker(selection: $photoItem, matching: .images) {
                            Label("صورة من الألبوم", systemImage: "photo")
                        }
                        Button { showFiles = true } label: { Label("ملف من «الملفات» (PDF)", systemImage: "folder") }
                    } footer: {
                        Text("يقرأ النظام المستند ويعبّئ بياناته ويتعرّف على المسجّل منه — ثم تراجعها قبل الحفظ.")
                    }
                }
                if let error {
                    Section { Text(error).foregroundStyle(Theme.danger).font(.system(size: 13)) }
                }
            }
            .navigationTitle("رفع مستند")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إغلاق") { dismiss() }.disabled(reading) }
            }
            .fullScreenCover(isPresented: $showScanner) {
                DocumentScannerView(
                    onFinish: { imgs in
                        showScanner = false
                        Task { await ingest(data: ScanPDF.make(imgs), ext: "pdf", mime: "application/pdf") }
                    },
                    onCancel: { showScanner = false }
                )
                .ignoresSafeArea()
            }
            .fileImporter(isPresented: $showFiles, allowedContentTypes: [.pdf, .image]) { result in
                guard case .success(let url) = result else { return }
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else { error = "تعذّرت قراءة الملف"; return }
                let ext = url.pathExtension.lowercased()
                let mime = ext == "pdf" ? "application/pdf" : ext == "png" ? "image/png" : "image/jpeg"
                Task { await ingest(data: data, ext: ext.isEmpty ? "pdf" : ext, mime: mime) }
            }
            .onChange(of: photoItem) {
                guard let item = photoItem else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self),
                       let img = UIImage(data: data), let jpeg = img.jpegData(compressionQuality: 0.85) {
                        await ingest(data: jpeg, ext: "jpg", mime: "image/jpeg")
                    } else {
                        error = "تعذّر تحميل الصورة"
                    }
                    photoItem = nil
                }
            }
            .sheet(item: $review, onDismiss: { dismiss() }) { r in
                OfficeDocForm(docs: docs, draft: r.draft, lockTarget: forDoc != nil, extraction: r.x, readError: r.readError)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func ingest(data: Data, ext: String, mime: String) async {
        guard data.count <= 10 * 1024 * 1024 else { error = "الملف أكبر من 10 م.ب"; return }
        error = nil
        reading = true
        defer { reading = false }
        do {
            let r = try await sb.uploadAndExtractOfficeDoc(data: data, ext: ext, mime: mime)
            var d = forDoc.map { OfficeDocDraft(doc: $0) } ?? OfficeDocDraft()
            let x = r.x
            if forDoc == nil {
                d.targetId = x?.match_id
                d.name = docs.first { $0.id == x?.match_id }?.name ?? x?.name ?? ""
            }
            if let v = x?.category { d.category = v }
            if let v = x?.doc_number { d.docNumber = v }
            if let v = x?.issuing_authority { d.authority = v }
            if let v = x?.issue_date { d.issueDate = Fmt.date(v); d.hasIssue = true }
            if let v = x?.expiry_date { d.expiryDate = Fmt.date(v); d.hasExpiry = true }
            d.fileURL = r.url
            d.fileName = "مستند \(Fmt.todayISO()).\(ext)"
            d.newFile = true
            d.aiExtracted = x != nil
            review = ReviewPayload(draft: d, x: x, readError: r.error)
        } catch {
            self.error = uiErrorText(error) ?? "تعذّر رفع الملف"
        }
    }
}

// MARK: - المراجعة والتعديل

struct OfficeDocDraft {
    var targetId: String? = nil
    var name = ""
    var category = "certificate"
    var docNumber = ""
    var authority = ""
    var hasIssue = false
    var issueDate: Date? = nil
    var hasExpiry = false
    var expiryDate: Date? = nil
    var notes = ""
    var fileURL: String? = nil
    var fileName: String? = nil
    var newFile = false
    var aiExtracted = false

    init() {}
    init(doc d: OfficeDoc) {
        targetId = d.id
        name = d.name
        category = d.type ?? "certificate"
        docNumber = d.doc_number ?? ""
        authority = d.issuing_authority ?? ""
        issueDate = Fmt.date(d.issue_date); hasIssue = issueDate != nil
        expiryDate = Fmt.date(d.expiry_date); hasExpiry = expiryDate != nil
        notes = d.notes ?? ""
        fileURL = d.file_url
        fileName = d.file_name
    }
}

struct OfficeDocForm: View {
    let docs: [OfficeDoc]
    @State var draft: OfficeDocDraft
    let lockTarget: Bool
    let extraction: OfficeDocExtraction?
    let readError: String?

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var error: String?
    @State private var showFile = false

    var body: some View {
        NavigationStack {
            Form {
                if let x = extraction {
                    Section {
                        Label(x.summary ?? "قرأ النظام الملف", systemImage: "sparkles")
                            .font(.system(size: 13)).foregroundStyle(Theme.navy)
                        if x.confidence != "high" {
                            Text("القراءة \(x.confidence == "low" ? "ضعيفة" : "متوسطة الثقة") — دقّق التواريخ والرقم.")
                                .font(.system(size: 12)).foregroundStyle(Theme.amber)
                        }
                        if let h = x.hijri_note, !h.isEmpty {
                            Text("في المستند: \(h)").font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                } else if let readError {
                    Section { Text("تعذّرت قراءة الملف (\(readError)) — عبّئ البيانات يدوياً، والملف مرفق.")
                        .font(.system(size: 12)).foregroundStyle(Theme.amber) }
                }

                if !lockTarget && draft.newFile {
                    Section {
                        Picker("يُحفظ في", selection: Binding(
                            get: { draft.targetId ?? "new" },
                            set: { id in
                                draft.targetId = id == "new" ? nil : id
                                if let d = docs.first(where: { $0.id == id }) { draft.name = d.name }
                                else if let n = extraction?.name { draft.name = n }
                            })) {
                            Text("➕ مستند جديد").tag("new")
                            ForEach(docs) { d in Text("تحديث: \(d.name)").tag(d.id) }
                        }
                    } footer: {
                        if let t = draft.targetId, t == extraction?.match_id, let d = docs.first(where: { $0.id == t }) {
                            Text("تعرّف النظام عليه نسخةً من «\(d.name)» — سيُحدَّث بدل أن يتكرر.")
                        }
                    }
                }

                Section("المستند") {
                    TextField("اسم المستند (مثال: شهادة الزكاة)", text: $draft.name)
                    Picker("التصنيف", selection: $draft.category) {
                        ForEach(OfficeDocLabels.categories, id: \.key) { c in Text(c.label).tag(c.key) }
                    }
                    TextField("الرقم", text: $draft.docNumber)
                        .keyboardType(.asciiCapable)
                    TextField("جهة الإصدار", text: $draft.authority)
                }

                Section("التواريخ") {
                    Toggle("تاريخ الإصدار", isOn: $draft.hasIssue.animation())
                    if draft.hasIssue {
                        DatePicker("صدر في", selection: Binding(get: { draft.issueDate ?? Date() }, set: { draft.issueDate = $0 }),
                                   displayedComponents: .date)
                            .environment(\.calendar, Calendar(identifier: .gregorian))
                    }
                    Toggle("تاريخ الانتهاء", isOn: $draft.hasExpiry.animation())
                    if draft.hasExpiry {
                        DatePicker("ينتهي في", selection: Binding(get: { draft.expiryDate ?? Date() }, set: { draft.expiryDate = $0 }),
                                   displayedComponents: .date)
                            .environment(\.calendar, Calendar(identifier: .gregorian))
                        if let e = draft.expiryDate {
                            Text(Fmt.hijriLong(Fmt.iso(e))).font(.system(size: 12)).foregroundStyle(Theme.muted)
                        }
                    }
                }

                Section("ملاحظات") {
                    TextField("مثال: يُجدَّد من منصة قوى قبل الانتهاء بشهر", text: $draft.notes, axis: .vertical)
                        .lineLimit(2...5)
                }

                if draft.fileURL != nil {
                    Section {
                        Button { showFile = true } label: { Label("معاينة الملف المرفق", systemImage: "doc.text.magnifyingglass") }
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(Theme.danger).font(.system(size: 13)) }
                }
            }
            .navigationTitle(extraction != nil ? "راجع قبل الحفظ" : (draft.targetId == nil ? "مستند جديد" : "تعديل المستند"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() }.disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    if saving { ProgressView() } else {
                        Button(draft.targetId == nil ? "إضافة" : "حفظ") { Task { await save() } }
                            .fontWeight(.semibold)
                            .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .sheet(isPresented: $showFile) {
                FilePreviewSheet(name: draft.fileName ?? draft.name, url: draft.fileURL)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    private func save() async {
        saving = true
        defer { saving = false }
        error = nil
        let clean = { (s: String) -> Any in
            let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
            return t.isEmpty ? NSNull() : t
        }
        var v: [String: Any] = [
            "name": draft.name.trimmingCharacters(in: .whitespaces),
            "type": draft.category,
            "doc_number": clean(draft.docNumber),
            "issuing_authority": clean(draft.authority),
            "issue_date": draft.hasIssue ? (draft.issueDate.map { Fmt.iso($0) } ?? NSNull()) as Any : NSNull(),
            "expiry_date": draft.hasExpiry ? (draft.expiryDate.map { Fmt.iso($0) } ?? NSNull()) as Any : NSNull(),
            "notes": clean(draft.notes),
        ]
        if draft.newFile {
            v["file_url"] = draft.fileURL ?? NSNull()
            v["file_name"] = draft.fileName ?? NSNull()
            v["ai_extracted"] = draft.aiExtracted
        }
        do {
            try await sb.saveOfficeDoc(id: draft.targetId, values: v)
            Usage.shared.action("حفظ مستند للمكتب")
            dismiss()
        } catch {
            self.error = uiErrorText(error) ?? "تعذّر الحفظ"
        }
    }
}
