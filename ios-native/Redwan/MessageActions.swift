import SwiftUI

// إجراءات الرسالة عند الضغط المطوّل: صفّ تفاعل **أفقي** ثم الإجراءات تحته.
//
// لماذا لا contextMenu (بلاغ المستخدم 2026-09-03 بصورة الشاشة): قائمة النظام
// عمودية فقط، فكانت الإيموجي الستة تظهر ستة صفوف يكرّر كلٌّ منها كلمة «تفاعل»
// بأيقونة وجه عامة — ضجيج بصري لا يشبه أي تطبيق محادثة. الحل: منبثقة مخصّصة
// (popover حقيقية على الآيفون بـpresentationCompactAdaptation) نتحكم بتخطيطها.

let QUICK_EMOJIS = ["👍", "❤️", "✅", "😂", "😮", "🙏"]

struct MessageActionsSheet: View {
    let commentId: String
    let messageBody: String?
    let reactions: [Reaction]
    let bookmarked: Bool
    let mine: Bool
    let createdAt: String?
    let onChange: () -> Void
    let onEdit: (() -> Void)?

    @EnvironmentObject private var sb: SB
    @Environment(\.dismiss) private var dismiss

    /// مهلة التعديل والحذف ساعة — القاعدة تفرضها أيضاً (enforce_edit_window)
    ///
    /// ⚠️ `flexible` وحدها تشترط كسور الثواني، وPostgres يحذفها متى كانت صفراً
    /// (…T19:16:00+00:00) — فكانت «تعديل/حذف» تختفي عن رسائل مشروعة بلا سبب
    /// ظاهر. `parse` تجرّب الصيغتين، وهي الموجودة أصلاً لهذا الغرض.
    private var withinEditWindow: Bool {
        guard let d = ISO8601DateFormatter.parse(createdAt) else { return false }
        return Date().timeIntervalSince(d) < 3600
    }

    var body: some View {
        VStack(spacing: 0) {
            reactionRow

            Divider().overlay(Theme.line)

            VStack(spacing: 0) {
                actionRow(
                    bookmarked ? "إزالة من المحفوظات" : "حفظ للرجوع إليها",
                    bookmarked ? "bookmark.slash" : "bookmark"
                ) {
                    Task {
                        try? await sb.toggleBookmark(commentId: commentId, currentlyOn: bookmarked)
                        onChange()
                    }
                }

                if let messageBody, !messageBody.isEmpty {
                    Divider().overlay(Theme.line).padding(.leading, 46)
                    actionRow("نسخ النص", "doc.on.doc") {
                        UIPasteboard.general.string = messageBody
                    }
                }

                if mine && withinEditWindow {
                    if let onEdit {
                        Divider().overlay(Theme.line).padding(.leading, 46)
                        actionRow("تعديل", "pencil") { onEdit() }
                    }
                    Divider().overlay(Theme.line).padding(.leading, 46)
                    actionRow("حذف", "trash", tint: Theme.danger) {
                        Task {
                            try? await sb.deleteMessage(id: commentId)
                            onChange()
                        }
                    }
                }
            }
        }
        .frame(width: 300)
        .background(Theme.card)
    }

    // MARK: - صف التفاعل الأفقي

    private var reactionRow: some View {
        HStack(spacing: 4) {
            ForEach(QUICK_EMOJIS, id: \.self) { e in
                let isMine = reactions.first(where: { $0.e == e })?.me ?? false
                Button {
                    Task {
                        try? await sb.toggleReaction(
                            commentId: commentId, emoji: e, currentlyMine: isMine
                        )
                        onChange()
                    }
                    dismiss()
                } label: {
                    Text(e)
                        .font(.system(size: 23))
                        .frame(width: 42, height: 42)
                        .background(isMine ? Theme.goldPale : Color.clear)
                        .clipShape(Circle())
                        .overlay(
                            Circle().stroke(isMine ? Theme.gold : .clear, lineWidth: 1.5)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
    }

    // MARK: - صف إجراء

    private func actionRow(
        _ label: String, _ icon: String, tint: Color = Theme.navy, action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
            dismiss()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundStyle(tint)
                    .frame(width: 22)
                Text(label)
                    .font(.system(size: 15))
                    .foregroundStyle(tint)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - المُعدِّل: ضغط مطوّل يفتح المنبثقة

private struct MessageActionsModifier: ViewModifier {
    let commentId: String
    let messageBody: String?
    let reactions: [Reaction]
    let bookmarked: Bool
    let mine: Bool
    let createdAt: String?
    let onChange: () -> Void
    let onEdit: (() -> Void)?

    @State private var open = false

    func body(content: Content) -> some View {
        content
            .onLongPressGesture(minimumDuration: 0.35) {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                open = true
            }
            .popover(isPresented: $open) {
                MessageActionsSheet(
                    commentId: commentId,
                    messageBody: messageBody,
                    reactions: reactions,
                    bookmarked: bookmarked,
                    mine: mine,
                    createdAt: createdAt,
                    onChange: onChange,
                    onEdit: onEdit
                )
                // منبثقة حقيقية بسهم على الآيفون لا ورقة تغطي الشاشة
                .presentationCompactAdaptation(.popover)
            }
    }
}

extension View {
    /// ضغط مطوّل على الفقاعة → تفاعل سريع وإجراءات الرسالة
    func messageActions(
        commentId: String,
        messageBody: String?,
        reactions: [Reaction],
        bookmarked: Bool,
        mine: Bool,
        createdAt: String?,
        onChange: @escaping () -> Void,
        onEdit: (() -> Void)?
    ) -> some View {
        modifier(MessageActionsModifier(
            commentId: commentId, messageBody: messageBody, reactions: reactions,
            bookmarked: bookmarked, mine: mine, createdAt: createdAt,
            onChange: onChange, onEdit: onEdit
        ))
    }
}
