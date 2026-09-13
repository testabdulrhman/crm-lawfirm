import SwiftUI

// إيصالات القراءة في النقاشات (طلب المدير 2026-09-13: «ودي في صفحة النقاش يكون مثل الواتس أب
// مُرسل الرسالة يعرف من قرأ المحادثة»). مثل مجموعات الواتساب:
//   ✓ رمادية  = لم يقرأها أحد بعد
//   ✓✓ رمادية وعدد = قرأها بعضهم
//   ✓✓ زرقاء = قرأها كل من يُنتظر أن يقرأ (الفريق في العامة، الأعضاء في المُسمّى،
//              والمسؤول والفريق والمدير في نقاش الملف)
// «قرأها» = فتح النقاش بعد إرسالها. تظهر لمُرسل الرسالة وحده — والقاعدة تفرض ذلك.

struct ReadTicks: View {
    let count: ReadCount

    var body: some View {
        let all = count.readers > 0 && count.pending == 0
        HStack(spacing: 3) {
            HStack(spacing: -5) {
                Image(systemName: "checkmark")
                if count.readers > 0 { Image(systemName: "checkmark") }
            }
            .font(.system(size: 9, weight: .bold))
            if count.readers > 0 && !all {
                Text("\(count.readers)").font(.system(size: 10, weight: .medium))
            }
        }
        .foregroundStyle(all ? Theme.blue : Theme.muted.opacity(0.85))
        .environment(\.layoutDirection, .leftToRight)
        .padding(.horizontal, 3)
        .contentShape(Rectangle())
        .accessibilityLabel(all ? "قرأها الجميع" : count.readers == 0 ? "لم يقرأها أحد بعد" : "قرأها \(count.readers)")
    }
}

struct ReadReceiptsSheet: View {
    let commentId: String
    let preview: String?

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss
    @State private var data: ReadReceipts?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                if let preview, !preview.isEmpty {
                    Section {
                        Text(preview)
                            .font(.system(size: 13)).foregroundStyle(Theme.navy).lineLimit(3)
                    }
                }
                if let error {
                    Section { Text(error).font(.system(size: 13)).foregroundStyle(Theme.danger) }
                } else if let d = data {
                    Section {
                        if d.readers.isEmpty {
                            Text("لم يفتح أحدٌ النقاش منذ إرسالها")
                                .font(.system(size: 13)).foregroundStyle(Theme.muted)
                        }
                        ForEach(d.readers) { p in row(p, time: p.read_at) }
                    } header: {
                        HStack(spacing: 4) {
                            HStack(spacing: -5) { Image(systemName: "checkmark"); Image(systemName: "checkmark") }
                                .font(.system(size: 10, weight: .bold))
                                .environment(\.layoutDirection, .leftToRight)
                            Text("قرأها · \(d.readers.count)")
                        }
                        .foregroundStyle(Theme.blue)
                    } footer: {
                        if !d.readers.isEmpty { Text("الوقت هو آخر فتح له للنقاش.") }
                    }
                    if !d.not_read.isEmpty {
                        Section {
                            ForEach(d.not_read) { p in row(p, time: nil) }
                        } header: {
                            Label("لم يقرأها بعد · \(d.not_read.count)", systemImage: "clock")
                        }
                    }
                } else {
                    HStack { Spacer(); ProgressView(); Spacer() }
                }
            }
            .navigationTitle("معلومات القراءة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("تمّ") { dismiss() } }
            }
            .task { await load() }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(_ p: ReadReceipts.Person, time: String?) -> some View {
        HStack(spacing: 10) {
            AvatarCircle(member: p.asTeamMember, size: 32)
            Text(p.name ?? p.short_name ?? "—")
                .font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.navy)
            Spacer(minLength: 8)
            if let time {
                Text(msgStamp(time)).font(.system(size: 12)).foregroundStyle(Theme.muted)
            }
        }
    }

    private func load() async {
        do {
            data = try await sb.readReceipts(commentId: commentId)
        } catch {
            if let t = uiErrorText(error) { self.error = t }
        }
    }
}
