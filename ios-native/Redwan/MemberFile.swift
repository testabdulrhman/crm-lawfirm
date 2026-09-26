import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

// ملف الموظف في الآيفون — مرآة صفحة الموظف في الويب (2026-09-26):
// • المرفقات المطلوبة (الهوية الوطنية · وثيقة البكالوريوس · الترخيص · الصورة الشخصية) ومرفقات أخرى،
//   في مخزن خاص staff-docs تُفتح بروابط موقّتة، واكتمال الملف يحسب البيانات والمرفقات معاً.
// • للمدير: قائمة الموظفين باكتمال ملف كل منهم، وصفحة كل موظف (عمله · بياناته · مرفقاته · إجازاته).
// الصلاحية في القاعدة: المدير لكل موظف، والموظف لنفسه فقط.

struct MemberFull: Codable, Identifiable, Hashable {
    let id: String
    let name: String?
    let short_name: String?
    let role: String?
    let email: String?
    let phone: String?
    let is_director: Bool?
    let is_active: Bool?
    let is_reviewer: Bool?
    let member_type: String?
    let avatar_url: String?
    let avatar_initial: String?
    let date_of_birth: String?
    let id_number: String?
    let national_address: String?
    let join_date: String?
    let bank_name: String?
    let bank_iban: String?
    let qualifications: String?
    let cv_url: String?
    let lawyer_license_url: String?
    let qualification_doc_url: String?
    let emergency_contact_name: String?
    let emergency_contact_phone: String?
    let emergency_contact_relation: String?

    static let select =
        "id,name,short_name,role,email,phone,is_director,is_active,is_reviewer,member_type,avatar_url,avatar_initial," +
        "date_of_birth,id_number,national_address,join_date,bank_name,bank_iban,qualifications,cv_url," +
        "lawyer_license_url,qualification_doc_url,emergency_contact_name,emergency_contact_phone,emergency_contact_relation"
}

struct MemberDoc: Codable, Identifiable, Hashable {
    let id: String
    let member_id: String
    let doc_type: String
    let file_path: String
    let file_name: String?
    let created_at: String?
}

struct MemberMatter: Codable, Identifiable, Hashable {
    let id: String
    let kind: String?
    let office_num: String?
    let title: String?
    let status: String?
}

struct MemberSession: Codable, Identifiable, Hashable {
    let id: String
    let case_id: String?
    let title: String?
    let session_date: String
    let session_time: String?
    let court: String?
}

enum MemberDocLabels {
    static func label(_ t: String) -> String {
        switch t {
        case "national_id": return "الهوية الوطنية"
        case "degree": return "وثيقة البكالوريوس"
        case "license": return "الترخيص"
        case "cv": return "السيرة الذاتية"
        case "contract": return "عقد العمل"
        default: return "مرفق آخر"
        }
    }
    /// المطلوبة — الصورة الشخصية هي صورته في النظام (avatar_url)
    static let required: [(key: String, label: String, icon: String, hint: String)] = [
        ("national_id", "الهوية الوطنية", "person.text.rectangle", "صورة أو PDF للوجهين"),
        ("degree", "وثيقة البكالوريوس", "graduationcap", "الشهادة أو وثيقة التخرج"),
        ("license", "الترخيص", "checkmark.seal", "رخصة المحاماة أو التدريب"),
        ("photo", "الصورة الشخصية", "person.crop.square", "تظهر صورةً له في النظام كله"),
    ]
    static let others: [String] = ["cv", "contract", "other"]
}

struct MemberCompleteness {
    let pct: Int
    let fields: [(label: String, ok: Bool)]
    let docs: [(label: String, ok: Bool)]
    var missing: Int { fields.filter { !$0.ok }.count + docs.filter { !$0.ok }.count }
}

func memberCompleteness(_ m: MemberFull, _ docs: [MemberDoc]) -> MemberCompleteness {
    func has(_ s: String?) -> Bool { !(s ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
    let fields: [(String, Bool)] = [
        ("الجوال", has(m.phone)), ("البريد", has(m.email)), ("رقم الهوية", has(m.id_number)),
        ("تاريخ الميلاد", has(m.date_of_birth)), ("تاريخ التعيين", has(m.join_date)),
        ("العنوان الوطني", has(m.national_address)), ("المؤهلات", has(m.qualifications)),
        ("جهة الطوارئ", has(m.emergency_contact_name)), ("جوال الطوارئ", has(m.emergency_contact_phone)),
        ("البنك", has(m.bank_name)), ("الآيبان", has(m.bank_iban)),
    ]
    let t = Set(docs.map(\.doc_type))
    let d: [(String, Bool)] = [
        ("الهوية الوطنية", t.contains("national_id")),
        ("وثيقة البكالوريوس", t.contains("degree") || has(m.qualification_doc_url)),
        ("الترخيص", t.contains("license") || has(m.lawyer_license_url)),
        ("الصورة الشخصية", has(m.avatar_url)),
    ]
    let total = fields.count + d.count
    let done = fields.filter(\.1).count + d.filter(\.1).count
    return MemberCompleteness(pct: Int((Double(done) / Double(total) * 100).rounded()),
                              fields: fields.map { (label: $0.0, ok: $0.1) },
                              docs: d.map { (label: $0.0, ok: $0.1) })
}

extension SB {
    func memberFull(id: String) async throws -> MemberFull? {
        let rows: [MemberFull] = try await get("team_members", query: [
            ("select", MemberFull.select), ("id", "eq.\(id)"), ("limit", "1")])
        return rows.first
    }

    func teamFull() async throws -> [MemberFull] {
        try await get("team_members", query: [
            ("select", MemberFull.select), ("is_active", "eq.true"),
            ("or", "(is_reviewer.is.null,is_reviewer.eq.false)"), ("order", "name")])
    }

    /// memberId فارغ = كل ما يُسمح لي برؤيته (المدير: الكل)
    func memberDocs(memberId: String? = nil) async throws -> [MemberDoc] {
        var q: [(String, String)] = [("select", "id,member_id,doc_type,file_path,file_name,created_at"),
                                     ("order", "created_at.desc")]
        if let memberId { q.append(("member_id", "eq.\(memberId)")) }
        return try await get("member_documents", query: q)
    }

    func uploadMemberDoc(memberId: String, type: String, data: Data, ext: String, mime: String, fileName: String) async throws {
        let path = "\(memberId)/\(type)-\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
        _ = try await storageUpload(bucket: "staff-docs", path: path, data: data, mime: mime)
        var v: [String: Any] = ["member_id": memberId, "doc_type": type, "file_path": path,
                                "file_name": fileName, "mime": mime, "size_bytes": data.count]
        if let me = member?.id { v["uploaded_by"] = me }
        try await insertVoid("member_documents", values: v)
    }

    func deleteMemberDoc(_ d: MemberDoc) async throws {
        try await delete("member_documents", query: [("id", "eq.\(d.id)")])
        _ = try? await raw(path: "storage/v1/object/staff-docs/\(d.file_path)", method: "DELETE", query: [])
    }

    /// صورة موظف — للمدير لأي موظف، ولصاحبها لنفسه
    func updateMemberAvatar(memberId: String, jpeg: Data) async throws {
        let stamp = Int(Date().timeIntervalSince1970)
        let url = try await storageUpload(bucket: "avatars", path: "staff/\(memberId)/\(stamp).jpg", data: jpeg, mime: "image/jpeg")
        try await patch("team_members", query: [("id", "eq.\(memberId)")], values: ["avatar_url": url])
        if memberId == member?.id { await loadMember() }
    }

    func memberOpenTasks(memberId: String) async throws -> [TaskRow] {
        try await get("tasks", query: [
            ("select", "id,title,status,due_date,priority,is_urgent,notes,description,case_id,assignee_id,cases(title)"),
            ("assignee_id", "eq.\(memberId)"), ("status", "neq.done"), ("deleted_at", "is.null"),
            ("order", "due_date.asc.nullslast"), ("limit", "60")])
    }

    func memberMatters(memberId: String) async throws -> [MemberMatter] {
        try await get("cases", query: [
            ("select", "id,kind,office_num,title,status"),
            ("assignee_id", "eq.\(memberId)"), ("kind", "in.(case,bankruptcy,legal_service,property)"),
            ("deleted_at", "is.null"), ("status", "not.in.(muntahia,delivered,مكتملة)"),
            ("order", "updated_at.desc"), ("limit", "60")])
    }

    func sessionsFor(caseIds: [String]) async throws -> [MemberSession] {
        guard !caseIds.isEmpty else { return [] }
        let until = Fmt.iso(Date().addingTimeInterval(45 * 86400))
        return try await get("sessions", query: [
            ("select", "id,case_id,title,session_date,session_time,court"),
            ("case_id", "in.(\(caseIds.joined(separator: ",")))"),
            ("session_date", "gte.\(Fmt.todayISO())"), ("session_date", "lte.\(until)"),
            ("order", "session_date.asc"), ("limit", "20")])
    }

    func memberHrRequests(memberId: String) async throws -> [HrRequestRow] {
        try await get("hr_requests", query: [
            ("select", SB.HR_SELECT), ("member_id", "eq.\(memberId)"),
            ("order", "created_at.desc"), ("limit", "60")])
    }
}

// MARK: - حلقة الاكتمال

struct CompletenessRing: View {
    let pct: Int
    var size: CGFloat = 56
    var body: some View {
        ZStack {
            Circle().stroke(Theme.line, lineWidth: 6)
            Circle()
                .trim(from: 0, to: CGFloat(pct) / 100)
                .stroke(pct == 100 ? Theme.success : Theme.gold, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(pct)%")
                .font(.system(size: size * 0.26, weight: .bold))
                .foregroundStyle(Theme.navy)
                .environment(\.layoutDirection, .leftToRight)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - قسم المرفقات والاكتمال

struct MemberDocsSection: View {
    let member: MemberFull
    let docs: [MemberDoc]
    let canEdit: Bool
    let onChanged: () async -> Void

    @EnvironmentObject private var sb: SB
    @State private var pickerFor: String?          // نوع المرفق الذي يُختار له مصدر
    @State private var scanFor: String?
    @State private var filesFor: String?
    @State private var photosFor: String?
    @State private var photoItem: PhotosPickerItem?
    @State private var busy: String?
    @State private var alertText: String?
    @State private var preview: PreviewItem?
    @State private var confirmDelete: MemberDoc?

    struct PreviewItem: Identifiable { let id = UUID(); let name: String; let url: String }

    private var c: MemberCompleteness { memberCompleteness(member, docs) }

    var body: some View {
        VStack(spacing: 14) {
            completenessCard
            requiredCard
            if !others.isEmpty || member.cv_url != nil { othersCard }
        }
        .confirmationDialog(pickerTitle, isPresented: Binding(get: { pickerFor != nil }, set: { if !$0 { pickerFor = nil } }),
                            titleVisibility: .visible) {
            if let t = pickerFor {
                if t != "photo" { Button("تصوير المستند") { scanFor = t; pickerFor = nil } }
                Button(t == "photo" ? "اختيار صورة" : "صورة من الألبوم") { photosFor = t; pickerFor = nil }
                if t != "photo" { Button("ملف من «الملفات»") { filesFor = t; pickerFor = nil } }
            }
            Button("إلغاء", role: .cancel) { pickerFor = nil }
        }
        .fullScreenCover(isPresented: Binding(get: { scanFor != nil }, set: { if !$0 { scanFor = nil } })) {
            DocumentScannerView(
                onFinish: { imgs in
                    let t = scanFor
                    scanFor = nil
                    if let t { Task { await upload(t, data: ScanPDF.make(imgs), ext: "pdf", mime: "application/pdf", name: "\(MemberDocLabels.label(t)).pdf") } }
                },
                onCancel: { scanFor = nil }
            )
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: Binding(get: { photosFor != nil }, set: { if !$0 && photoItem == nil { photosFor = nil } }),
                      selection: $photoItem, matching: .images)
        .onChange(of: photoItem) {
            guard let item = photoItem, let t = photosFor else { return }
            Task {
                defer { photoItem = nil; photosFor = nil }
                guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data),
                      let jpeg = img.jpegData(compressionQuality: t == "photo" ? 0.8 : 0.85) else {
                    alertText = "تعذّر تحميل الصورة"; return
                }
                if t == "photo" { await uploadPhoto(jpeg) }
                else { await upload(t, data: jpeg, ext: "jpg", mime: "image/jpeg", name: "\(MemberDocLabels.label(t)).jpg") }
            }
        }
        .fileImporter(isPresented: Binding(get: { filesFor != nil }, set: { if !$0 { filesFor = nil } }),
                      allowedContentTypes: [.pdf, .image]) { result in
            let t = filesFor
            filesFor = nil
            guard let t, case .success(let url) = result else { return }
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let data = try? Data(contentsOf: url) else { alertText = "تعذّرت قراءة الملف"; return }
            let ext = url.pathExtension.lowercased()
            let mime = ext == "pdf" ? "application/pdf" : ext == "png" ? "image/png" : "image/jpeg"
            Task { await upload(t, data: data, ext: ext.isEmpty ? "pdf" : ext, mime: mime, name: url.lastPathComponent) }
        }
        .sheet(item: $preview) { p in FilePreviewSheet(name: p.name, url: p.url) }
        .confirmationDialog("حذف المرفق؟", isPresented: Binding(get: { confirmDelete != nil }, set: { if !$0 { confirmDelete = nil } }),
                            titleVisibility: .visible) {
            Button("حذف", role: .destructive) {
                if let d = confirmDelete {
                    Task {
                        do { try await sb.deleteMemberDoc(d); await onChanged() }
                        catch { alertText = uiErrorText(error) ?? "تعذّر الحذف" }
                    }
                }
            }
            Button("تراجع", role: .cancel) { confirmDelete = nil }
        }
        .alert("تنبيه", isPresented: Binding(get: { alertText != nil }, set: { if !$0 { alertText = nil } })) {
            Button("حسناً", role: .cancel) { alertText = nil }
        } message: { Text(alertText ?? "") }
    }

    private var pickerTitle: String {
        pickerFor.map { $0 == "photo" ? "الصورة الشخصية" : MemberDocLabels.label($0) } ?? ""
    }

    private var others: [MemberDoc] {
        docs.filter { !["national_id", "degree", "license"].contains($0.doc_type) }
    }

    private func latest(_ t: String) -> MemberDoc? { docs.first { $0.doc_type == t } }

    // اكتمال الملف
    private var completenessCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                CompletenessRing(pct: c.pct)
                VStack(alignment: .leading, spacing: 3) {
                    Text(c.pct == 100 ? "الملف الشخصي مكتمل ✓" : "اكتمال الملف الشخصي")
                        .font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.navy)
                    Text(c.pct == 100 ? "البيانات والمرفقات المطلوبة كلها موجودة." : "ينقص \(c.missing) — ما يحتاجه المكتب عند العقد والرواتب والتأمينات والطوارئ.")
                        .font(.system(size: 12)).foregroundStyle(Theme.muted)
                }
                Spacer(minLength: 0)
            }
            if c.pct < 100 {
                chipGroup("المرفقات المطلوبة", c.docs)
                chipGroup("البيانات", c.fields)
            }
        }
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1))
    }

    private func chipGroup(_ title: String, _ items: [(label: String, ok: Bool)]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.navy)
                Spacer()
                Text("\(items.filter(\.ok).count) من \(items.count)").font(.system(size: 11)).foregroundStyle(Theme.muted)
            }
            FlowChips(items: items)
        }
        .padding(10)
        .background(Theme.ivory, in: RoundedRectangle(cornerRadius: 10))
    }

    // المرفقات المطلوبة
    private var requiredCard: some View {
        SectionCard(title: "المرفقات", icon: "paperclip") {
            VStack(spacing: 10) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(MemberDocLabels.required, id: \.key) { r in requiredTile(r) }
                }
                if canEdit {
                    Menu {
                        ForEach(MemberDocLabels.others, id: \.self) { t in
                            Button(MemberDocLabels.label(t)) { pickerFor = t }
                        }
                    } label: {
                        Label("إضافة مرفق آخر", systemImage: "plus")
                            .font(.system(size: 13, weight: .semibold))
                            .frame(maxWidth: .infinity).padding(.vertical, 9)
                            .background(Theme.goldPale).foregroundStyle(Theme.goldDark)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            .padding(.horizontal, 6).padding(.bottom, 6)
        }
    }

    private func requiredTile(_ r: (key: String, label: String, icon: String, hint: String)) -> some View {
        let doc = r.key == "photo" ? nil : latest(r.key)
        let legacy: String? = doc == nil ? (r.key == "degree" ? member.qualification_doc_url : r.key == "license" ? member.lawyer_license_url : nil) : nil
        let present = r.key == "photo" ? member.avatar_url != nil : (doc != nil || legacy != nil)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if r.key == "photo", let u = member.avatar_url, let url = URL(string: u) {
                    AsyncImage(url: url) { img in img.resizable().scaledToFill() } placeholder: { Theme.line }
                        .frame(width: 34, height: 34).clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Image(systemName: r.icon)
                        .font(.system(size: 15))
                        .foregroundStyle(present ? Theme.success : Theme.muted)
                        .frame(width: 34, height: 34)
                        .background((present ? Theme.success : Theme.muted).opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                }
                if present { Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.success).font(.system(size: 14)) }
                Spacer(minLength: 0)
                if busy == r.key { ProgressView().scaleEffect(0.8) }
            }
            Text(r.label).font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.navy).lineLimit(1)
            Text(doc.map { "رُفعت \(Fmt.gregLong(String(($0.created_at ?? "").prefix(10))))" } ?? (legacy != nil ? "من طلب التوظيف" : present ? "موجودة" : r.hint))
                .font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(2)
            HStack(spacing: 12) {
                if let doc {
                    Button { Task { await open(doc) } } label: { Image(systemName: "eye") }
                } else if let legacy {
                    Button { preview = PreviewItem(name: r.label, url: legacy) } label: { Image(systemName: "eye") }
                } else if r.key == "photo", let u = member.avatar_url {
                    Button { preview = PreviewItem(name: r.label, url: u) } label: { Image(systemName: "eye") }
                }
                if canEdit {
                    Button { pickerFor = r.key } label: {
                        Text(present ? "استبدال" : "رفع").font(.system(size: 12, weight: .semibold))
                            .padding(.horizontal, 10).padding(.vertical, 4)
                            .background(present ? Theme.goldPale : Theme.gold, in: Capsule())
                            .foregroundStyle(present ? Theme.goldDark : .white)
                    }
                    .disabled(busy != nil)
                }
                Spacer(minLength: 0)
                if canEdit, let doc {
                    Button { confirmDelete = doc } label: { Image(systemName: "trash").foregroundStyle(Theme.muted) }
                }
            }
            .font(.system(size: 13))
            .foregroundStyle(Theme.goldDark)
            .buttonStyle(.plain)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(present ? Theme.success.opacity(0.04) : Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12)
            .stroke(present ? Theme.success.opacity(0.35) : Theme.line, style: StrokeStyle(lineWidth: 1, dash: present ? [] : [4, 3])))
    }

    private var othersCard: some View {
        SectionCard(title: "مرفقات أخرى", icon: "doc.on.doc", count: others.count + (member.cv_url != nil ? 1 : 0)) {
            VStack(spacing: 0) {
                ForEach(others) { d in
                    HStack(spacing: 10) {
                        Image(systemName: "doc.text").foregroundStyle(Theme.goldDark)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(MemberDocLabels.label(d.doc_type)).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                            // اسم الملف معزول الاتجاه — وإلا قفز «.pdf» إلى أوله
                            Text("\u{2068}\(d.file_name ?? "")\u{2069} · \(Fmt.gregLong(String((d.created_at ?? "").prefix(10))))")
                                .font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        Button { Task { await open(d) } } label: { Image(systemName: "eye") }.foregroundStyle(Theme.goldDark)
                        if canEdit {
                            Button { confirmDelete = d } label: { Image(systemName: "trash") }.foregroundStyle(Theme.muted)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 8)
                }
                if let cv = member.cv_url {
                    HStack(spacing: 10) {
                        Image(systemName: "doc.text").foregroundStyle(Theme.muted)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("السيرة الذاتية").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                            Text("من طلب التوظيف").font(.system(size: 11)).foregroundStyle(Theme.muted)
                        }
                        Spacer(minLength: 0)
                        Button { preview = PreviewItem(name: "السيرة الذاتية", url: cv) } label: { Image(systemName: "eye") }
                            .foregroundStyle(Theme.goldDark).buttonStyle(.plain)
                    }
                    .padding(.vertical, 8)
                }
            }
            .padding(.horizontal, 6).padding(.bottom, 4)
        }
    }

    private func open(_ d: MemberDoc) async {
        do {
            let url = try await sb.signedStorageURL(bucket: "staff-docs", path: d.file_path)
            preview = PreviewItem(name: d.file_name ?? MemberDocLabels.label(d.doc_type), url: url)
        } catch {
            alertText = uiErrorText(error) ?? "تعذّر فتح المرفق"
        }
    }

    private func upload(_ t: String, data: Data, ext: String, mime: String, name: String) async {
        guard data.count <= 20 * 1024 * 1024 else { alertText = "الملف أكبر من 20 م.ب"; return }
        busy = t
        defer { busy = nil }
        do {
            try await sb.uploadMemberDoc(memberId: member.id, type: t, data: data, ext: ext, mime: mime, fileName: name)
            Usage.shared.action("رفع مرفق موظف")
            await onChanged()
        } catch {
            alertText = uiErrorText(error) ?? "تعذّر رفع المرفق"
        }
    }

    private func uploadPhoto(_ jpeg: Data) async {
        busy = "photo"
        defer { busy = nil }
        do {
            try await sb.updateMemberAvatar(memberId: member.id, jpeg: jpeg)
            await onChanged()
        } catch {
            alertText = uiErrorText(error) ?? "تعذّر رفع الصورة"
        }
    }
}

/// شرائح تلتفّ على أسطر — للتحقق من الاكتمال
struct FlowChips: View {
    let items: [(label: String, ok: Bool)]
    var body: some View {
        FlowLayout(spacing: 6) {
            ForEach(items, id: \.label) { i in
                HStack(spacing: 3) {
                    Image(systemName: i.ok ? "checkmark.circle.fill" : "circle").font(.system(size: 10))
                    Text(i.label).font(.system(size: 11))
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                .foregroundStyle(i.ok ? Theme.success : Theme.muted)
                .background(i.ok ? Theme.success.opacity(0.1) : Theme.card, in: Capsule())
                .overlay(Capsule().stroke(i.ok ? Color.clear : Theme.line, lineWidth: 1))
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, width: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x > 0 && x + sz.width > maxW { x = 0; y += rowH + spacing; rowH = 0 }
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
            width = max(width, x)
        }
        return CGSize(width: min(width, maxW), height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x > bounds.minX && x + sz.width > bounds.maxX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
        }
    }
}

// MARK: - ملفي الشخصي (للموظف نفسه)

struct MyFileView: View {
    @EnvironmentObject private var sb: SB
    @State private var member: MemberFull?
    @State private var docs: [MemberDoc] = []
    @State private var error: String?
    @State private var cancelled = false

    var body: some View {
        ScrollView {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.padding(16)
            } else if let member {
                MemberDocsSection(member: member, docs: docs, canEdit: true) { await load() }
                    .padding(.horizontal, 12).padding(.vertical, 10)
            } else {
                ProgressView().padding(.top, 60)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("ملفي ومرفقاتي")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("ملفي ومرفقاتي") }
    }

    private func load() async {
        guard let id = sb.member?.id else { return }
        error = nil
        do {
            async let m = sb.memberFull(id: id)
            async let d = sb.memberDocs(memberId: id)
            member = try await m
            docs = try await d
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}

// MARK: - الموظفون (للمدير)

struct TeamListView: View {
    @EnvironmentObject private var sb: SB
    @State private var members: [MemberFull] = []
    @State private var docs: [MemberDoc] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var cancelled = false

    var body: some View {
        List {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.listRowBackground(Color.clear)
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity).listRowBackground(Color.clear)
            } else {
                ForEach(members) { m in
                    let c = memberCompleteness(m, docs.filter { $0.member_id == m.id })
                    NavigationLink { MemberProfileView(memberId: m.id) } label: {
                        HStack(spacing: 12) {
                            MemberAvatarView(url: m.avatar_url, initial: m.avatar_initial ?? String((m.name ?? "؟").prefix(1)), size: 44)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.name ?? "—").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.navy).lineLimit(1)
                                Text(m.role ?? "موظف").font(.system(size: 12)).foregroundStyle(Theme.muted)
                            }
                            Spacer(minLength: 6)
                            Text(c.pct == 100 ? "✓ مكتمل" : "\(c.pct)%")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(c.pct == 100 ? Theme.success : Theme.amber)
                                .padding(.horizontal, 8).padding(.vertical, 4)
                                .background((c.pct == 100 ? Theme.success : Theme.amber).opacity(0.12), in: Capsule())
                                .environment(\.layoutDirection, .leftToRight)
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowBackground(Theme.card)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("الموظفون")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .onAppear { Usage.shared.screen("الموظفون") }
    }

    private func load() async {
        error = nil
        do {
            async let m = sb.teamFull()
            async let d = sb.memberDocs()
            members = try await m
            docs = try await d
            loaded = true
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}

struct MemberAvatarView: View {
    let url: String?
    let initial: String
    var size: CGFloat = 44
    var body: some View {
        Group {
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { img in img.resizable().scaledToFill() } placeholder: { Theme.goldPale }
            } else {
                ZStack {
                    Theme.goldPale
                    Text(initial).font(.system(size: size * 0.4, weight: .bold)).foregroundStyle(Theme.navy)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: size * 0.28))
    }
}

// MARK: - صفحة الموظف (للمدير)

struct MemberProfileView: View {
    let memberId: String

    @EnvironmentObject private var sb: SB
    @State private var member: MemberFull?
    @State private var docs: [MemberDoc] = []
    @State private var tasks: [TaskRow] = []
    @State private var matters: [MemberMatter] = []
    @State private var sessions: [MemberSession] = []
    @State private var balance: LeaveBalance?
    @State private var hr: [HrRequestRow] = []
    @State private var error: String?
    @State private var cancelled = false
    @State private var tab = 0
    @State private var openedTask: TaskRow?
    @State private var openedCase: String?

    var body: some View {
        ScrollView {
            if let error {
                ErrorBox(message: error) { Task { await load() } }.padding(16)
            } else if let m = member {
                VStack(spacing: 14) {
                    hero(m)
                    stats
                    Picker("", selection: $tab) {
                        Text("عمله").tag(0)
                        Text("بياناته").tag(1)
                        Text("المرفقات").tag(2)
                        Text("الإجازات").tag(3)
                    }
                    .pickerStyle(.segmented)
                    switch tab {
                    case 0: workTab
                    case 1: dataTab(m)
                    case 2: MemberDocsSection(member: m, docs: docs, canEdit: true) { await load() }
                    default: hrTab
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
            } else {
                ProgressView().padding(.top, 60)
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle(member?.short_name ?? member?.name ?? "الموظف")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .retryIfCancelled($cancelled) { await load() }
        .navigationDestination(item: $openedTask) { TaskDetailView(task: $0) }
        .navigationDestination(item: $openedCase) { CaseDetailView(caseId: $0) }
    }

    private func tenure(_ join: String?) -> String? {
        guard let j = join, let a = Fmt.date(j) else { return nil }
        let comps = Calendar(identifier: .gregorian).dateComponents([.month], from: a, to: Date())
        guard let months = comps.month, months >= 0 else { return nil }
        if months == 0 { return "أقل من شهر" }
        let y = months / 12, mo = months % 12
        let yl = y == 0 ? "" : y == 1 ? "سنة" : y == 2 ? "سنتين" : y <= 10 ? "\(y) سنوات" : "\(y) سنة"
        let ml = mo == 0 ? "" : mo == 1 ? "شهر" : mo == 2 ? "شهرين" : mo <= 10 ? "\(mo) أشهر" : "\(mo) شهراً"
        return [yl, ml].filter { !$0.isEmpty }.joined(separator: " و")
    }

    private func hero(_ m: MemberFull) -> some View {
        let c = memberCompleteness(m, docs)
        return VStack(spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                LinearGradient(colors: [Theme.navyDeep, Theme.navy, Theme.navySoft], startPoint: .leading, endPoint: .trailing)
                    .frame(height: 70)
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .bottom, spacing: 12) {
                    MemberAvatarView(url: m.avatar_url, initial: m.avatar_initial ?? String((m.name ?? "؟").prefix(1)), size: 76)
                        .overlay(RoundedRectangle(cornerRadius: 76 * 0.28).stroke(Theme.card, lineWidth: 3))
                        .offset(y: -30)
                        .padding(.bottom, -30)
                    Spacer(minLength: 0)
                    Button { tab = 2 } label: {
                        Text(c.pct == 100 ? "✓ الملف مكتمل" : "الملف \u{2066}\(c.pct)%\u{2069}")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(c.pct == 100 ? Theme.success : Theme.amber)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background((c.pct == 100 ? Theme.success : Theme.amber).opacity(0.12), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Text(m.name ?? "—").font(.system(size: 19, weight: .bold)).foregroundStyle(Theme.navy)
                Text([m.role ?? "موظف", tenure(m.join_date).map { "معنا منذ \($0)" }].compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 13)).foregroundStyle(Theme.muted)
                HStack(spacing: 8) {
                    if let p = m.phone, let u = URL(string: "tel:\(p)") {
                        Link(destination: u) { Label("اتصال", systemImage: "phone.fill") }
                    }
                    if let e = m.email, let u = URL(string: "mailto:\(e)") {
                        Link(destination: u) { Label("بريد", systemImage: "envelope.fill") }
                    }
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.goldDark)
                .padding(.top, 2)
            }
            .padding(14)
        }
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1))
    }

    private var stats: some View {
        let overdue = tasks.filter { t in
            guard let d = t.due_date else { return false }
            return d < Fmt.todayISO()
        }.count
        let remaining = balance?.remaining_exact ?? balance.flatMap { $0.remaining.map(Double.init) }
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
            statTile("ملفات بعهدته", "\(matters.count)", "ملفات جارية", Theme.navy) { tab = 0 }
            statTile("مهام مفتوحة", "\(tasks.count)", overdue > 0 ? (overdue == 1 ? "مهمة متأخرة" : "\(overdue) متأخرة") : "لا متأخرات",
                     overdue > 0 ? Theme.danger : Theme.success) { tab = 0 }
            statTile("جلسات قادمة", "\(sessions.count)", "خلال 45 يوماً", Theme.blue) { tab = 0 }
            statTile("رصيد الإجازة", remaining.map { $0 == $0.rounded() ? "\(Int($0))" : String(format: "%.2f", $0) } ?? "—",
                     balance?.missing_join_date == true ? "ينقص تاريخ التعيين" : "يوماً متبقياً", Theme.amber) { tab = 3 }
        }
    }

    private func statTile(_ title: String, _ value: String, _ note: String, _ tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.system(size: 12)).foregroundStyle(Theme.muted)
                Text(value).font(.system(size: 26, weight: .bold)).foregroundStyle(Theme.navy)
                    .environment(\.layoutDirection, .leftToRight)
                Text(note).font(.system(size: 11, weight: .medium)).foregroundStyle(tint).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private var workTab: some View {
        VStack(spacing: 14) {
            SectionCard(title: "المهام المفتوحة", icon: "checklist", count: tasks.count) {
                VStack(spacing: 0) {
                    if tasks.isEmpty {
                        Text("لا مهام مفتوحة").font(.system(size: 12)).foregroundStyle(Theme.muted).padding(.vertical, 8)
                    }
                    ForEach(tasks) { t in
                        Button { openedTask = t } label: {
                            HStack(spacing: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 4) {
                                        if t.is_urgent == true { Image(systemName: "flame.fill").foregroundStyle(Theme.danger).font(.system(size: 11)) }
                                        Text(t.title ?? "مهمة").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy).lineLimit(1)
                                    }
                                    if let c = t.cases?.title {
                                        Text(c).font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 6)
                                if let r = Fmt.relDays(t.due_date) {
                                    Text(r.text).font(.system(size: 11, weight: .semibold))
                                        .foregroundStyle(r.overdue ? Theme.danger : Theme.muted)
                                }
                                Image(systemName: "chevron.left").font(.system(size: 11)).foregroundStyle(Theme.muted)
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 6)
            }
            SectionCard(title: "الجلسات القادمة", icon: "building.columns", count: sessions.count) {
                VStack(spacing: 0) {
                    if sessions.isEmpty {
                        Text("لا جلسات خلال 45 يوماً").font(.system(size: 12)).foregroundStyle(Theme.muted).padding(.vertical, 8)
                    }
                    ForEach(sessions) { s in
                        Button { if let c = s.case_id { openedCase = c } } label: {
                            HStack(spacing: 10) {
                                VStack(spacing: 0) {
                                    Text(String(s.session_date.suffix(2))).font(.system(size: 16, weight: .bold))
                                    Text(Fmt.gregMonthYear(Fmt.date(s.session_date) ?? Date()).components(separatedBy: " ").first ?? "")
                                        .font(.system(size: 10))
                                }
                                .foregroundStyle(Theme.navy)
                                .frame(width: 46, height: 46)
                                .background(Theme.goldPale, in: RoundedRectangle(cornerRadius: 10))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(matters.first { $0.id == s.case_id }?.title ?? s.title ?? "جلسة")
                                        .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy).lineLimit(1)
                                    Text([Fmt.time(s.session_time), s.court].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                        .font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
                                }
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 6)
            }
            SectionCard(title: "ملفاته", icon: "folder", count: matters.count) {
                VStack(spacing: 0) {
                    if matters.isEmpty {
                        Text("لا ملفات جارية بعهدته").font(.system(size: 12)).foregroundStyle(Theme.muted).padding(.vertical, 8)
                    }
                    ForEach(matters) { mt in
                        Button { openedCase = mt.id } label: {
                            HStack(spacing: 8) {
                                Text(matterKindEmoji(mt.kind))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(mt.title ?? "ملف").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy).lineLimit(1)
                                    if let n = mt.office_num {
                                        Text(n).font(.system(size: 11)).foregroundStyle(Theme.muted)
                                    }
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.left").font(.system(size: 11)).foregroundStyle(Theme.muted)
                            }
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 6)
            }
        }
    }

    private func dataTab(_ m: MemberFull) -> some View {
        SectionCard(title: "بياناته", icon: "person.text.rectangle") {
            VStack(spacing: 0) {
                row("الجوال", m.phone, ltr: true)
                row("البريد", m.email, ltr: true)
                row("رقم الهوية", m.id_number, ltr: true, copy: true)
                row("تاريخ الميلاد", m.date_of_birth.map { Fmt.gregLong($0) })
                row("تاريخ التعيين", m.join_date.map { Fmt.gregLong($0) })
                row("العنوان الوطني", m.national_address)
                row("المؤهلات", m.qualifications)
                row("جهة الطوارئ", [m.emergency_contact_name, m.emergency_contact_relation].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " — "))
                row("جوال الطوارئ", m.emergency_contact_phone, ltr: true)
                row("البنك", m.bank_name)
                row("الآيبان", m.bank_iban, ltr: true, copy: true)
            }
            .padding(.horizontal, 6).padding(.bottom, 6)
        }
    }

    private func row(_ label: String, _ value: String?, ltr: Bool = false, copy: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 6) {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.muted)
            Spacer(minLength: 8)
            Text((value ?? "").isEmpty ? "—" : value!)
                .font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.navy)
                .multilineTextAlignment(.trailing)
                .environment(\.layoutDirection, ltr ? .leftToRight : .rightToLeft)
            if copy, let v = value, !v.isEmpty {
                Button {
                    UIPasteboard.general.string = v
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: { Image(systemName: "doc.on.doc").font(.system(size: 11)).foregroundStyle(Theme.muted) }
                    .buttonStyle(.plain)
            }
        }
        .padding(.vertical, 6)
    }

    private var hrTab: some View {
        VStack(spacing: 14) {
            SectionCard(title: "رصيد الإجازة السنوية", icon: "sun.max.fill") {
                VStack(alignment: .leading, spacing: 6) {
                    if let b = balance, b.missing_join_date != true {
                        let accrued = b.accrued ?? Double(b.entitlement ?? 0)
                        let remaining = b.remaining_exact ?? Double(b.remaining ?? 0)
                        Text(remaining == remaining.rounded() ? "\(Int(remaining))" : String(format: "%.2f", remaining))
                            .font(.system(size: 30, weight: .bold)).foregroundStyle(Theme.navy)
                            .environment(\.layoutDirection, .leftToRight)
                        Text("متبقٍّ من \(accrued == accrued.rounded() ? "\(Int(accrued))" : String(format: "%.2f", accrued)) مستحقة · استُخدم \(b.used ?? 0)")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    } else {
                        Text("لم يُسجَّل تاريخ تعيين الموظف — يُحسب الرصيد متى سُجّل.")
                            .font(.system(size: 12)).foregroundStyle(Theme.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 6).padding(.bottom, 6)
            }
            SectionCard(title: "طلبات الإجازة والاستئذان", icon: "calendar", count: hr.count) {
                VStack(spacing: 0) {
                    if hr.isEmpty {
                        Text("لم يقدّم طلباً بعد").font(.system(size: 12)).foregroundStyle(Theme.muted).padding(.vertical, 8)
                    }
                    ForEach(hr) { r in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(HrLabels.kind(r.kind) + (HrLabels.leaveType(r.leave_type).map { " \($0)" } ?? ""))
                                    .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                                Text(hrWhenText(r)).font(.system(size: 11)).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Text(HrLabels.status(r.status))
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(HrLabels.statusColor(r.status))
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(HrLabels.statusColor(r.status).opacity(0.12), in: Capsule())
                        }
                        .padding(.vertical, 7)
                    }
                }
                .padding(.horizontal, 6)
            }
        }
    }

    private func load() async {
        error = nil
        do {
            async let m = sb.memberFull(id: memberId)
            async let d = sb.memberDocs(memberId: memberId)
            async let t = sb.memberOpenTasks(memberId: memberId)
            async let mt = sb.memberMatters(memberId: memberId)
            async let b = try? sb.leaveBalance(memberId: memberId)
            async let h = try? sb.memberHrRequests(memberId: memberId)
            member = try await m
            docs = try await d
            tasks = try await t
            matters = try await mt
            balance = await b
            hr = await h ?? []
            sessions = (try? await sb.sessionsFor(caseIds: matters.map(\.id))) ?? []
        } catch {
            if let t = uiErrorText(error) { self.error = t } else { cancelled = true }
        }
    }
}
