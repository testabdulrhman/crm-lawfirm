import SwiftUI

// «بانتظار توقيعك» للمدير (طلب المدير 2026-11-03: «نعم، ابنيها» — التوقيع على خطابات الصادر من التطبيق).
// يجمع ما ينتظر توقيعه من مكانين كما في شارة الويب (usePendingOutgoingApprovalsCount):
//  - طلبات اعتماد الصادر (outgoing_approvals) ← تُعتمد وتُوقّع هنا بشاشة التوقيع نفسها، أو تُرفض بسبب.
//  - طلبات التوقيع من النقاشات (sign_requests) ← تفتح الرسالة في نقاشها وتحتها «وقّع».

struct DiscussionSignRow: Codable, Identifiable {
    struct Person: Codable { let name: String?; let short_name: String? }
    struct Matter: Codable { let title: String?; let office_num: String? }
    struct Doc: Codable { let name: String? }
    struct Comment: Codable { let parent_id: String?; let document: Doc? }
    let id: String
    let comment_id: String
    let case_id: String?
    let note: String?
    let requested_at: String?
    let requester: Person?
    let matter: Matter?
    let comment: Comment?
}

extension SB {
    func pendingOutgoingApprovals() async throws -> [OutgoingApprovalRow] {
        try await get("outgoing_approvals", query: [
            ("select", "id,letter_id,note,requested_at,apply_mode,stamp_page,stamp_x,stamp_y,sig_pos,extra_sigs,"
                + "requester:team_members!outgoing_approvals_requested_by_fkey(id,name,short_name,phone),"
                + "letter:outgoing_letters(id,letter_number,subject,letter_date,file_url,recipient)"),
            ("status", "eq.pending"),
            ("order", "requested_at.asc"),
        ])
    }

    func pendingDiscussionSigns() async throws -> [DiscussionSignRow] {
        try await get("sign_requests", query: [
            ("select", "id,comment_id,case_id,note,requested_at,"
                + "requester:team_members!sign_requests_requested_by_fkey(name,short_name),"
                + "matter:cases(title,office_num),"
                + "comment:case_comments!sign_requests_comment_id_fkey(parent_id,document:documents!case_comments_document_id_fkey(name))"),
            ("status", "eq.pending"),
            ("order", "requested_at.asc"),
        ])
    }

    /// عدد ما ينتظر توقيع المدير — بطاقة الرئيسية
    func pendingSignCount() async throws -> Int {
        async let a = pendingOutgoingApprovals()
        async let b = pendingDiscussionSigns()
        let (x, y) = try await (a, b)
        return x.filter { $0.letter != nil }.count + y.count
    }
}

struct SignQueueView: View {
    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var letters: [OutgoingApprovalRow] = []
    @State private var discussion: [DiscussionSignRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var signing: OutgoingApprovalRow?

    var body: some View {
        Group {
            if let error {
                ErrorBox(message: error) { Task { await load() } }
            } else if !loaded {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if letters.isEmpty && discussion.isEmpty {
                EmptyBox(icon: "signature", text: "لا شيء ينتظر توقيعك", subtext: "طلبات الصادر والنقاشات تظهر هنا حين تصل")
                    .padding(.top, 40)
                    .frame(maxHeight: .infinity, alignment: .top)
            } else {
                List {
                    if !letters.isEmpty {
                        Section("خطابات الصادر") {
                            ForEach(letters) { o in
                                Button { signing = o } label: { letterRow(o) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    if !discussion.isEmpty {
                        Section {
                            ForEach(discussion) { d in
                                Button { open(d) } label: { discussionRow(d) }
                                    .buttonStyle(.plain)
                            }
                        } header: {
                            Text("من النقاشات")
                        } footer: {
                            Text("تفتح الرسالة في نقاشها، وتحتها «وقّع».")
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Theme.ivory)
        .navigationTitle("بانتظار توقيعك")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await load() }
        .task { await load() }
        .fullScreenCover(item: $signing) { o in
            SignSheet(name: o.letterTitle, url: o.letter?.file_url ?? "", caseId: nil, messageId: "", parentId: "",
                      request: nil, onDone: { await load() }, outgoing: o)
        }
    }

    private func letterRow(_ o: OutgoingApprovalRow) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "doc.text.fill")
                .font(.system(size: 18))
                .foregroundStyle(Theme.goldDark)
                .frame(width: 36, height: 36)
                .background(Theme.goldPale, in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(o.letterTitle)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(2)
                // الكاتب والرقم عنصران منفصلان، والتاريخ في سطره — كانت تتداخل في سطر عربي واحد
                HStack(spacing: 5) {
                    Text("من \(o.requesterName)")
                    if let n = o.letter?.letter_number, !n.isEmpty {
                        Text("·")
                        Text(n)
                    }
                }
                .font(.system(size: 11))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                if let at = o.requested_at {
                    Text(Fmt.dual(at)).font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1)
                }
                if let n = o.note, !n.isEmpty {
                    Text(n).font(.system(size: 11)).foregroundStyle(Theme.amber).lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.left").font(.system(size: 12)).foregroundStyle(Theme.muted.opacity(0.6))
        }
        .contentShape(Rectangle())
    }

    private func discussionRow(_ d: DiscussionSignRow) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "bubble.left.and.text.bubble.right.fill")
                .font(.system(size: 16))
                .foregroundStyle(Theme.navySoft)
                .frame(width: 36, height: 36)
                .background(Theme.navy.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text((d.comment?.document?.name ?? "ملف").replacingOccurrences(of: ".pdf", with: "", options: [.caseInsensitive, .anchored, .backwards]))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.navy)
                    .lineLimit(2)
                Text([d.matter?.title, "من \(d.requester?.short_name ?? d.requester?.name ?? "موظف")"]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
                if let n = d.note, !n.isEmpty {
                    Text(n).font(.system(size: 11)).foregroundStyle(Theme.amber).lineLimit(2)
                }
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.left").font(.system(size: 12)).foregroundStyle(Theme.muted.opacity(0.6))
        }
        .contentShape(Rectangle())
    }

    /// الرسالة في نقاشها (وخيطها إن كانت ردّاً) — زرّ «وقّع» تحتها
    private func open(_ d: DiscussionSignRow) {
        PushRouter.shared.pendingFocus = DiscussionFocus(messageId: d.comment_id, parentId: d.comment?.parent_id)
        PushRouter.shared.route = d.case_id.map { "/discussions?case=\($0)" } ?? "/discussions"
        dismiss()
    }

    private func load() async {
        do {
            async let a = sb.pendingOutgoingApprovals()
            async let b = sb.pendingDiscussionSigns()
            let (x, y) = try await (a, b)
            letters = x.filter { $0.letter != nil }
            discussion = y
            error = nil
        } catch {
            if let t = uiErrorText(error) { self.error = t }
        }
        loaded = true
    }
}
