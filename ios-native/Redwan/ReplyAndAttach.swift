import SwiftUI

// كالواتساب في النقاشات (طلب المدير 2026-11-03):
//  - «لما ارسل صورة أقدر أكتب تعليق تحت الصورة» ← المرفق يُجهَّز في شريط فوق الحقل ويُرسل بتعليقه.
//  - «أرد على محادثة، وإذا رديت يتسجل الرد في الخيط حق المحادثة» ← الرد ردٌّ في خيط الرسالة يظهر في المجرى
//    أيضاً (also_to_stream) وفوقه اقتباس أصله (case_stream يُرجع parent_*).

/// مرفق مجهّز لم يُرسل بعد
struct PendingAttachment: Identifiable {
    let id = UUID()
    let data: Data
    let name: String
    let mime: String
    let thumb: UIImage?
}

enum StreamQuote {
    static func author(_ m: StreamMsg) -> String {
        m.kind == "ai" ? "الذكاء" : (m.author_name ?? "—")
    }

    /// مقتطف الأصل: نصه، وإلا نوع مرفقه
    static func snippet(body: String?, doc: String?) -> String {
        if let b = body?.trimmingCharacters(in: .whitespacesAndNewlines), !b.isEmpty { return b }
        if VoiceNote.isAudio(doc) { return "🎤 ملاحظة صوتية" }
        if ImageFile.isImage(doc) { return "📷 صورة" }
        if let doc, !doc.isEmpty { return "📎 \(doc)" }
        return "رسالة"
    }
}

/// اقتباس الأصل داخل فقاعة الرد — لمسته تفتح الخيط
struct ReplyQuote: View {
    let author: String?
    let snippet: String
    var onTap: () -> Void = {}

    var body: some View {
        HStack(spacing: 0) {
            Rectangle().fill(Theme.gold).frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(author ?? "—")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Theme.goldDark)
                Text(snippet)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            Spacer(minLength: 0)
        }
        .fixedSize(horizontal: false, vertical: true) // الشريط الذهبي يأخذ ارتفاع النص لا كل ما يُعرض عليه
        .background(Theme.navy.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .contentShape(Rectangle())
        // أولوية على لمسة الفقاعة (التي تفتح خيطها هي) — والضغط المطوّل يبقى للفقاعة
        .highPriorityGesture(TapGesture().onEnded(onTap))
        .accessibilityLabel("ردّ على \(author ?? "رسالة"): \(snippet)")
    }
}

/// لافتة «تردّ على…» فوق حقل الكتابة
struct ReplyBanner: View {
    let author: String
    let snippet: String
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "arrowshape.turn.up.left.fill")
                .font(.system(size: 13))
                .foregroundStyle(Theme.goldDark)
            ReplyQuote(author: "تردّ على \(author)", snippet: snippet)
                .allowsHitTesting(false)
            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Theme.muted.opacity(0.6))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("إلغاء الرد")
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
    }
}

/// المرفقات المجهّزة — تُرسل مع الضغط على الإرسال، والتعليق يُكتب في الحقل تحتها
struct PendingStrip: View {
    let items: [PendingAttachment]
    let onRemove: (UUID) -> Void

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items) { a in
                    ZStack(alignment: .topTrailing) {
                        Group {
                            if let t = a.thumb {
                                Image(uiImage: t).resizable().scaledToFill()
                            } else {
                                VStack(spacing: 4) {
                                    Image(systemName: a.mime == "application/pdf" ? "doc.richtext" : "doc")
                                        .font(.system(size: 22))
                                        .foregroundStyle(Theme.goldDark)
                                    Text(a.name)
                                        .font(.system(size: 9))
                                        .foregroundStyle(Theme.navy)
                                        .lineLimit(2)
                                        .multilineTextAlignment(.center)
                                }
                                .padding(6)
                                .frame(maxWidth: .infinity, maxHeight: .infinity)
                                .background(Theme.goldPale)
                            }
                        }
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line, lineWidth: 1))

                        Button { onRemove(a.id) } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 19))
                                .symbolRenderingMode(.palette)
                                .foregroundStyle(.white, Theme.navy.opacity(0.75))
                        }
                        .buttonStyle(.plain)
                        .offset(x: 6, y: -6)
                        .accessibilityLabel("إزالة المرفق")
                    }
                    .padding(.top, 6)
                }
            }
            .padding(.horizontal, 12)
        }
        .frame(height: 84)
    }
}
