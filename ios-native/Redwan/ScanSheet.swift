import SwiftUI
import PhotosUI

// ورقة «تصوير مستند»: تصوير (أو اختيار صورة) → رفع PDF → الذكاء يصنّفه
// (trigger document_ai_trg → classify-doc يكتب category/description/suggested_case_id)
// → تأكيد الملف الذي يخصه → حفظ. من داخل ملف قضية يُثبَّت الملف مسبقاً؛
// ومن تبويب المشاريع يقترح الذكاء الملف ويؤكده المحامي.

struct ScanSheet: View {
    let caseId: String?
    let caseTitle: String?
    let onSaved: () -> Void

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss

    @State private var showScanner = false
    @State private var photoItem: PhotosPickerItem?
    @State private var pages: [UIImage] = []
    @State private var name = ""
    @State private var nameTouched = false

    @State private var phase: Phase = .capture
    @State private var docId: String?
    @State private var category: String?
    @State private var summary: String?
    @State private var chosenCase: MatterLite?
    @State private var suggested = false
    @State private var showPicker = false
    @State private var error: String?

    enum Phase { case capture, uploading, classifying, confirm, saving }

    private var defaultName: String { "مستند ممسوح — \(Fmt.gregLong(Fmt.todayISO()))" }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section { Text(error).foregroundStyle(Theme.danger).font(.system(size: 13)) }
                }
                switch phase {
                case .capture: captureSection
                case .uploading, .classifying: progressSection
                case .confirm, .saving: confirmSection
                }
            }
            .navigationTitle("تصوير مستند")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("إغلاق") { dismiss() }.disabled(phase == .uploading || phase == .saving)
                }
            }
            .fullScreenCover(isPresented: $showScanner) {
                DocumentScannerView(
                    onFinish: { imgs in pages = imgs; showScanner = false },
                    onCancel: { showScanner = false }
                )
                .ignoresSafeArea()
            }
            .sheet(isPresented: $showPicker) {
                MatterPicker { m in
                    chosenCase = m
                    suggested = false
                    showPicker = false
                }
            }
            .onChange(of: photoItem) {
                guard let item = photoItem else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                        pages.append(img)
                    }
                    photoItem = nil
                }
            }
        }
        .task {
            name = defaultName
            if let caseId { chosenCase = MatterLite(id: caseId, title: caseTitle, office_num: nil, kind: nil) }
            if pages.isEmpty, DocumentScannerView.isSupported { showScanner = true }
        }
    }

    // MARK: - التقاط

    private var captureSection: some View {
        Group {
            Section("الصفحات") {
                if pages.isEmpty {
                    Text("لا صفحات بعد").foregroundStyle(Theme.muted).font(.system(size: 13))
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Array(pages.enumerated()), id: \.offset) { i, img in
                                Image(uiImage: img)
                                    .resizable().scaledToFill()
                                    .frame(width: 70, height: 96).clipped()
                                    .clipShape(RoundedRectangle(cornerRadius: 6))
                                    .overlay(alignment: .topTrailing) {
                                        Button {
                                            pages.remove(at: i)
                                        } label: {
                                            Image(systemName: "xmark.circle.fill")
                                                .foregroundStyle(.white, Theme.danger)
                                        }
                                        .padding(2)
                                    }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
                if DocumentScannerView.isSupported {
                    Button {
                        showScanner = true
                    } label: {
                        Label(pages.isEmpty ? "افتح الكاميرا" : "صفحات أخرى بالكاميرا", systemImage: "camera.fill")
                    }
                }
                PhotosPicker(selection: $photoItem, matching: .images) {
                    Label("من الصور", systemImage: "photo.on.rectangle")
                }
            }

            Section("اسم المستند") {
                TextField("الاسم", text: $name)
                    .onChange(of: name) { nameTouched = name != defaultName }
                Text("الذكاء سيقترح عنواناً أدق بعد القراءة إن تركت الاسم كما هو")
                    .font(.system(size: 12)).foregroundStyle(Theme.muted)
            }

            Section {
                Button {
                    Task { await upload() }
                } label: {
                    Label("رفع وتصنيف", systemImage: "sparkles")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity)
                }
                .disabled(pages.isEmpty || name.trimmingCharacters(in: .whitespaces).isEmpty)
                .tint(Theme.goldDark)
            }
        }
    }

    private var progressSection: some View {
        Section {
            HStack(spacing: 12) {
                ProgressView()
                Text(phase == .uploading ? "جارٍ رفع \(pages.count) صفحة…" : "الذكاء يقرأ المستند ويصنّفه…")
                    .font(.system(size: 14)).foregroundStyle(Theme.navy)
            }
            .padding(.vertical, 6)
        }
    }

    // MARK: - التأكيد

    private var confirmSection: some View {
        Group {
            Section("ما قرأه الذكاء") {
                if let category {
                    HStack {
                        Text("النوع").foregroundStyle(Theme.muted)
                        Spacer()
                        Text(category).font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.goldDark)
                    }
                    if let summary, !summary.isEmpty {
                        Text(summary).font(.system(size: 13)).foregroundStyle(Theme.navy)
                    }
                } else {
                    Text("لم يكتمل التصنيف بعد — يمكنك الحفظ وسيُصنَّف لاحقاً")
                        .font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
            }

            Section(caseId != nil ? "الملف" : (suggested ? "الملف المقترح" : "الملف")) {
                if let m = chosenCase {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(m.title ?? "ملف").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
                        if let n = m.office_num { Text(n).font(.system(size: 12)).foregroundStyle(Theme.muted) }
                        if suggested {
                            Text("اقترحه الذكاء من محتوى المستند — أكّده أو اختر غيره")
                                .font(.system(size: 12)).foregroundStyle(Theme.goldDark)
                        }
                    }
                } else {
                    Text("بلا ملف — يبقى في المستندات العامة").font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
                if caseId == nil {
                    Button { showPicker = true } label: {
                        Label(chosenCase == nil ? "اختر الملف" : "ملف آخر", systemImage: "folder")
                    }
                    if chosenCase != nil {
                        Button("بلا ملف", role: .destructive) { chosenCase = nil; suggested = false }
                    }
                }
            }

            Section {
                Button {
                    Task { await save() }
                } label: {
                    HStack {
                        if phase == .saving { ProgressView() }
                        Text("حفظ").font(.system(size: 15, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                }
                .disabled(phase == .saving)
                .tint(Theme.goldDark)
            }
        }
    }

    // MARK: - المنطق

    private func upload() async {
        error = nil
        phase = .uploading
        let pdf = ScanPDF.make(pages)
        guard pdf.count > 0, pdf.count <= 8 * 1024 * 1024 else {
            error = "الملف كبير جداً (\(pdf.count / 1_048_576) م.ب) — قلّل الصفحات"
            phase = .capture
            return
        }
        do {
            let id = try await sb.uploadDocument(
                data: pdf, name: name.trimmingCharacters(in: .whitespaces), mime: "application/pdf", caseId: caseId
            )
            docId = id
        } catch {
            self.error = error.localizedDescription
            phase = .capture
            return
        }
        phase = .classifying
        // التصنيف يجري خادميّاً بعد الإدراج — نستطلع الصف حتى تظهر النتيجة (≤ ٣٠ ثانية)
        for _ in 0..<15 {
            try? await Task.sleep(for: .seconds(2))
            if let d = try? await sb.document(id: docId!), let cat = d.category {
                category = cat
                summary = d.description
                if caseId == nil, let sid = d.suggested_case_id, let m = try? await sb.matterLite(id: sid) {
                    chosenCase = m
                    suggested = true
                }
                break
            }
        }
        phase = .confirm
    }

    private func save() async {
        guard let docId else { return }
        phase = .saving
        error = nil
        var values: [String: Any] = ["case_id": chosenCase?.id ?? NSNull()]
        // الاسم الافتراضي يُستبدل بعنوان الذكاء (الجزء قبل « — » في الوصف)
        if !nameTouched, let s = summary, let title = s.components(separatedBy: " — ").first, !title.isEmpty {
            values["name"] = String(title.prefix(120))
        }
        do {
            try await sb.patch("documents", query: [("id", "eq.\(docId)")], values: values)
            onSaved()
            dismiss()
        } catch {
            self.error = error.localizedDescription
            phase = .confirm
        }
    }
}
