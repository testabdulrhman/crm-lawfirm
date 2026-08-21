import SwiftUI

// شاشة المهام: قائمة المهام المفتوحة مع تفاصيل كل مهمة ونقاشها

// MARK: - تبويب «المهام»

struct TasksView: View {
    @EnvironmentObject private var sb: SB

    @State private var mineOnly = true
    @State private var tasks: [TaskRow] = []
    @State private var loading = true
    @State private var loadedOnce = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("نطاق المهام", selection: $mineOnly) {
                    Text("مهامي").tag(true)
                    Text("الكل").tag(false)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)

                ScrollView {
                    content
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                }
                .refreshable {
                    // السحب للتحديث لا يمسح القائمة حتى لا تختفي أثناء الجلب
                    await load(showSpinner: false)
                }
            }
            .background(Theme.ivory)
            .navigationTitle("المهام")
            .onAppear { Usage.shared.screen("المهام") }
            // تغيير النطاق يعيد تشغيل المهمة تلقائياً لأن التصفية تتم من الخادم
            .task(id: mineOnly) {
                await load(showSpinner: true)
            }
            .onAppear {
                // عند الرجوع من التفاصيل قد تكون مهمة أُنجزت — نحدّث بصمت
                guard loadedOnce else { return }
                Task { await load(showSpinner: false) }
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if loading {
            ProgressView()
                .padding(.top, 60)
        } else if let errorMessage {
            ErrorBox(message: errorMessage) {
                Task { await load(showSpinner: true) }
            }
            .padding(.top, 20)
        } else if tasks.isEmpty {
            EmptyBox(icon: "checklist", text: "لا مهام مفتوحة", subtext: "كل شيء منجز")
                .padding(.top, 20)
        } else {
            LazyVStack(spacing: 10) {
                ForEach(tasks) { task in
                    NavigationLink {
                        TaskDetailView(task: task)
                    } label: {
                        TaskCardRow(task: task)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func load(showSpinner: Bool) async {
        if showSpinner {
            loading = true
            tasks = []
        }
        errorMessage = nil
        do {
            tasks = try await sb.openTasks(mineOnly: mineOnly)
            loadedOnce = true
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }
}

// MARK: - بطاقة مهمة في القائمة

private struct TaskCardRow: View {
    let task: TaskRow

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(task.title ?? "بلا عنوان")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.navy)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            if let caseTitle = task.cases?.title, !caseTitle.isEmpty {
                Text(caseTitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                PriorityBadge(priority: task.priority, urgent: task.is_urgent ?? false)

                if let due = task.due_date, !due.isEmpty {
                    if let rel = Fmt.relDays(due) {
                        Text(rel.text)
                            .font(.system(size: 12, weight: rel.overdue ? .semibold : .regular))
                            .foregroundStyle(rel.overdue ? Theme.danger : Theme.muted)
                    }
                    Text(Fmt.gregLong(due))
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                }

                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Theme.line, lineWidth: 1)
        )
    }
}

// MARK: - تفاصيل المهمة

struct TaskDetailView: View {
    let task: TaskRow

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss

    @State private var completing = false
    @State private var confirmComplete = false
    @State private var completeError: String?

    // التأجيل (طلب المستخدم 2026-08-22: «ما اقدر أأجلها»)
    @State private var showPostpone = false
    @State private var showDatePicker = false
    @State private var pickedDate = Date()
    @State private var postponing = false

    @State private var comments: [CommentRow] = []
    @State private var commentsLoading = true
    @State private var commentsError: String?

    @State private var draft = ""
    @State private var sending = false
    @State private var sendError: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                infoCard
                completeButton
                discussionSection
            }
            .padding(16)
        }
        .background(Theme.ivory)
        .navigationTitle("تفاصيل المهمة")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadComments() }
        .refreshable { await loadComments() }
    }

    // MARK: بطاقة المعلومات

    private var infoCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(task.title ?? "بلا عنوان")
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.navy)
                .multilineTextAlignment(.leading)

            if let caseTitle = task.cases?.title, !caseTitle.isEmpty {
                Text(caseTitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.muted)
            }

            HStack(spacing: 10) {
                PriorityBadge(priority: task.priority, urgent: task.is_urgent ?? false)

                if let due = task.due_date, !due.isEmpty {
                    Text(Fmt.gregLong(due))
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                    if let rel = Fmt.relDays(due) {
                        Text(rel.text)
                            .font(.system(size: 13, weight: rel.overdue ? .semibold : .regular))
                            .foregroundStyle(rel.overdue ? Theme.danger : Theme.muted)
                    }
                }
            }

            if let details = detailsText {
                Divider()
                Text(details)
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.navy)
                    .multilineTextAlignment(.leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Theme.line, lineWidth: 1)
        )
    }

    // نعرض الملاحظات إن وُجدت وإلا الوصف — أحدهما يكفي لسياق المهمة
    private var detailsText: String? {
        for candidate in [task.notes, task.description] {
            if let text = candidate,
               !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return text
            }
        }
        return nil
    }

    // MARK: زر الإنجاز

    private var completeButton: some View {
        VStack(spacing: 8) {
            Button {
                confirmComplete = true
            } label: {
                HStack(spacing: 8) {
                    if completing {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 17, weight: .semibold))
                    }
                    Text("إنجاز المهمة")
                        .font(.system(size: 16, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.success)
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .disabled(completing)

            Button {
                showPostpone = true
            } label: {
                HStack(spacing: 8) {
                    if postponing {
                        ProgressView().tint(Theme.goldDark)
                    } else {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.system(size: 15, weight: .semibold))
                    }
                    Text("تأجيل المهمة")
                        .font(.system(size: 15, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(Theme.goldPale)
                .foregroundStyle(Theme.goldDark)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            }
            .disabled(postponing)
            .confirmationDialog("تأجيل إلى", isPresented: $showPostpone, titleVisibility: .visible) {
                Button("غداً") { Task { await postpone(days: 1, label: "غد") } }
                Button("بعد ٣ أيام") { Task { await postpone(days: 3, label: "بعد ٣ أيام") } }
                Button("الأسبوع القادم") { Task { await postpone(days: 7, label: "الأسبوع القادم") } }
                Button("اختيار تاريخ…") { showDatePicker = true }
                Button("إلغاء", role: .cancel) {}
            }
            .sheet(isPresented: $showDatePicker) {
                VStack(spacing: 12) {
                    DatePicker("التاريخ الجديد", selection: $pickedDate,
                               in: Date()..., displayedComponents: .date)
                        .datePickerStyle(.graphical)
                        .environment(\.locale, Locale(identifier: "ar_SA@numbers=latn"))
                    Button {
                        showDatePicker = false
                        Task { await postpone(date: pickedDate) }
                    } label: {
                        Text("تأجيل")
                            .font(.system(size: 16, weight: .bold))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(Theme.gold)
                            .foregroundStyle(Theme.navy)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .padding(16)
                .presentationDetents([.medium, .large])
            }
            .confirmationDialog(
                "إنجاز المهمة",
                isPresented: $confirmComplete,
                titleVisibility: .visible
            ) {
                Button("تأكيد الإنجاز") {
                    Task { await complete() }
                }
                Button("إلغاء", role: .cancel) {}
            } message: {
                Text("هل أنت متأكد من إتمام هذه المهمة؟")
            }

            if let completeError {
                Text(completeError)
                    .font(.system(size: 13))
                    .foregroundStyle(Theme.danger)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func postpone(days: Int = 0, label: String? = nil, date: Date? = nil) async {
        Usage.shared.action("تأجيل مهمة")
        let target = date ?? Calendar.current.date(byAdding: .day, value: days, to: Date())!
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        let iso = df.string(from: target)
        postponing = true
        completeError = nil
        do {
            try await sb.postponeTask(id: task.id, toISO: iso, label: label ?? iso)
            dismiss()
        } catch {
            completeError = error.localizedDescription
        }
        postponing = false
    }

    private func complete() async {
        Usage.shared.action("إنجاز مهمة")
        completing = true
        completeError = nil
        do {
            try await sb.completeTask(id: task.id)
            dismiss()
        } catch {
            completeError = error.localizedDescription
        }
        completing = false
    }

    // MARK: قسم النقاش

    private var discussionSection: some View {
        SectionCard(
            title: "النقاش",
            icon: "bubble.right",
            count: comments.isEmpty ? nil : comments.count
        ) {
            VStack(alignment: .leading, spacing: 12) {
                if commentsLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                    .padding(.vertical, 20)
                } else if let commentsError {
                    ErrorBox(message: commentsError) {
                        Task {
                            commentsLoading = true
                            await loadComments()
                        }
                    }
                } else if comments.isEmpty {
                    EmptyBox(icon: "bubble.right", text: "لا نقاش بعد", subtext: "أول تعليق يبدأ الحوار")
                } else {
                    ForEach(comments) { comment in
                        commentView(comment)
                    }
                }

                composer
            }
        }
    }

    private func commentView(_ comment: CommentRow) -> some View {
        HStack(alignment: .top, spacing: 8) {
            AvatarCircle(member: comment.author, size: 30)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(comment.author?.name ?? comment.author?.short_name ?? "غير معروف")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Theme.navy)
                    // التاريخ يصل بطابع زمني كامل — نأخذ جزء اليوم فقط للعرض
                    Text(Fmt.gregLong(comment.created_at.map { String($0.prefix(10)) }))
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                }

                Text(comment.body ?? "")
                    .font(.system(size: 14))
                    .foregroundStyle(Theme.navy)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Theme.line, lineWidth: 1)
                    )
            }
        }
    }

    // MARK: مُرسِل التعليقات

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 8) {
                TextField("اكتب تعليقاً…", text: $draft, axis: .vertical)
                    .font(.system(size: 14))
                    .lineLimit(1...4)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Theme.card)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Theme.line, lineWidth: 1)
                    )
                    .disabled(sending)

                Button {
                    Task { await send() }
                } label: {
                    Group {
                        if sending {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 15, weight: .semibold))
                        }
                    }
                    .frame(width: 40, height: 40)
                    .background(Theme.gold)
                    .foregroundStyle(.white)
                    .clipShape(Circle())
                    .opacity(sending || trimmedDraft.isEmpty ? 0.55 : 1)
                }
                .disabled(sending || trimmedDraft.isEmpty)
            }

            if let sendError {
                Text(sendError)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.danger)
            }
        }
    }

    private func send() async {
        let text = trimmedDraft
        guard !text.isEmpty else { return }
        sending = true
        sendError = nil
        do {
            try await sb.addComment(taskId: task.id, body: text)
            draft = ""
            // إعادة الجلب بعد الإرسال حتى يظهر التعليق بهوية كاتبه من الخادم
            await loadComments()
        } catch {
            sendError = error.localizedDescription
        }
        sending = false
    }

    private func loadComments() async {
        commentsError = nil
        do {
            comments = try await sb.comments(taskId: task.id)
        } catch {
            commentsError = error.localizedDescription
        }
        commentsLoading = false
    }
}
