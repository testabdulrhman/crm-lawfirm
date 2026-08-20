import SwiftUI

// «محفوظاتي» — الرسائل التي حفظها المستخدم من أي نقاش، بالأحدث حفظاً.
// تحقيق سؤاله القديم: «ما اقدر احط نجمة على بعض الإجابات عشان ارجع لها بعدين؟»

struct BookmarksView: View {
    @EnvironmentObject private var sb: SB
    @State private var rows: [BookmarkRow] = []
    @State private var loaded = false
    @State private var error: String?

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
                    icon: "bookmark",
                    text: "لا محفوظات بعد",
                    subtext: "اضغط مطوّلاً على أي رسالة ثم «حفظ للرجوع إليها»"
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(rows) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Image(systemName: r.case_id == nil ? "megaphone.fill" : "building.columns.fill")
                                    .font(.system(size: 10))
                                    .foregroundStyle(Theme.goldDark)
                                Text(r.case_title ?? "—")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(Theme.goldDark)
                                    .lineLimit(1)
                                Spacer()
                                Text(shortStamp(r.saved_at))
                                    .font(.system(size: 10))
                                    .foregroundStyle(Theme.muted)
                            }
                            Text(r.body ?? "—")
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.navy)
                                .lineLimit(3)
                            Text(r.kind == "ai" ? "الذكاء" : (r.author_name ?? "—"))
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.muted)
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Theme.card)
                        .swipeActions {
                            Button(role: .destructive) {
                                Task {
                                    try? await sb.toggleBookmark(
                                        commentId: r.comment_id, currentlyOn: true
                                    )
                                    await load()
                                }
                            } label: {
                                Label("إزالة", systemImage: "bookmark.slash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
        .background(Theme.ivory.ignoresSafeArea())
        .navigationTitle("محفوظاتي")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        error = nil
        do {
            rows = try await sb.bookmarks()
            loaded = true
        } catch {
            self.error = error.localizedDescription
        }
    }
}
