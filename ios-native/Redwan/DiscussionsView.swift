import SwiftUI

// تبويب «النقاشات» — بديل مجموعات الواتساب.
//
// المشكلة بكلام المستخدم: «واحد يرسل بالخاص وواحد بالقروب، وملف هنا وملف
// هناك… أدوّر الملفات ما ألقاها». السبب أن العمل بلا عنوان ثابت.
//
// الشكل مقصود أن يشبه قائمة محادثات الواتساب — مرتّبة بالأحدث وعدّاد أحمر —
// لأن نقل العادة أسهل حين تجد اليد نفس الحركة. الفرق أن كل محادثة هنا لها
// عنوان دائم: قضيتها.

private let stampF: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "ar_SA@numbers=latn")
    f.calendar = Calendar(identifier: .gregorian)
    return f
}()

/// طابع مختصر بأسلوب الواتساب: الساعة لليوم، «أمس»، ثم اسم اليوم، ثم التاريخ
func shortStamp(_ iso: String?) -> String {
    guard let iso, let d = ISO8601DateFormatter.flexible.date(from: iso) else { return "" }
    let cal = Calendar(identifier: .gregorian)
    if cal.isDateInToday(d) {
        stampF.dateFormat = "h:mm a"
        return stampF.string(from: d)
    }
    if cal.isDateInYesterday(d) { return "أمس" }
    if let days = cal.dateComponents([.day], from: d, to: Date()).day, days < 7 {
        stampF.dateFormat = "EEEE"
        return stampF.string(from: d)
    }
    stampF.dateFormat = "d MMM"
    return stampF.string(from: d)
}

extension ISO8601DateFormatter {
    /// طوابع Postgres قد تحمل كسور ثانية أو لا — صيغة واحدة لا تكفي
    static let flexible: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func parse(_ s: String?) -> Date? {
        guard let s else { return nil }
        if let d = flexible.date(from: s) { return d }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: s)
    }
}

struct DiscussionsView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [DiscussionRow] = []
    @State private var loaded = false
    @State private var error: String?
    @State private var search = ""

    private var filtered: [DiscussionRow] {
        let q = search.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return rows }
        return rows.filter {
            ($0.case_title ?? "").localizedCaseInsensitiveContains(q)
                || ($0.last_body ?? "").localizedCaseInsensitiveContains(q)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let error {
                    ErrorBox(message: error) { Task { await load() } }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .padding(16)
                } else if !loaded {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if rows.isEmpty {
                    EmptyBox(
                        icon: "bubble.left.and.bubble.right",
                        text: "لا نقاشات بعد",
                        subtext: "افتح أي قضية وابدأ الكلام فيها — يبقى مربوطاً بها إلى الأبد"
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(filtered) { row in
                        NavigationLink {
                            CaseStreamView(caseId: row.case_id, title: row.case_title ?? "قضية")
                        } label: {
                            DiscussionRowView(row: row)
                        }
                        .listRowBackground(Theme.card)
                    }
                    .listStyle(.plain)
                    .searchable(text: $search, prompt: "ابحث في النقاشات")
                    .refreshable { await load() }
                }
            }
            .background(Theme.ivory.ignoresSafeArea())
            .navigationTitle("النقاشات")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await load() }
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.discussions()
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct DiscussionRowView: View {
    let row: DiscussionRow

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "building.columns.fill")
                .font(.system(size: 15))
                .foregroundStyle(Theme.goldDark)
                .frame(width: 38, height: 38)
                .background(Theme.goldPale)
                .clipShape(RoundedRectangle(cornerRadius: 10))

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(row.case_title ?? "قضية")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(Theme.navy)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Text(shortStamp(row.last_at))
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.muted)
                }

                HStack(spacing: 5) {
                    if row.has_file == true {
                        Image(systemName: "paperclip")
                            .font(.system(size: 10))
                            .foregroundStyle(Theme.muted)
                    }
                    Text(preview)
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.muted)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    if let n = row.unread, n > 0 {
                        Text("\(n)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Theme.danger)
                            .clipShape(Capsule())
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    private var preview: String {
        let who = row.last_author.map { "\($0): " } ?? ""
        let body = row.last_body ?? (row.has_file == true ? "مرفق" : "")
        return who + body
    }
}
