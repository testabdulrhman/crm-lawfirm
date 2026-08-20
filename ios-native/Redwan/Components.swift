import SwiftUI

// مكوّنات مشتركة — نفس لغة «Clean UI» في الويب: بطاقات بيضاء بحواف ناعمة
// على خلفية عاجية، والذهبي للتمييز لا للزينة.

enum StatTone { case plain, danger, warn }

struct StatCard: View {
    let label: String
    let value: Int
    var tone: StatTone = .plain
    var note: String? = nil

    private var valueColor: Color {
        switch tone {
        case .danger: return value > 0 ? Theme.danger : Theme.navy
        case .warn: return value > 0 ? Theme.amber : Theme.navy
        case .plain: return Theme.navy
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
            Text("\(value)")
                .font(.system(size: 30, weight: .bold))
                .foregroundStyle(valueColor)
            if let note {
                Text(note)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(
                    tone == .danger && value > 0 ? Theme.danger.opacity(0.3)
                        : tone == .warn && value > 0 ? Theme.amber.opacity(0.35)
                        : Theme.line,
                    lineWidth: 1
                )
        )
    }
}

struct SectionCard<Content: View>: View {
    let title: String
    let icon: String
    var count: Int? = nil
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Theme.goldDark)
                    .frame(width: 30, height: 30)
                    .background(Theme.goldPale)
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.navy)
                if let count, count > 0 {
                    Text("\(count)")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
                Spacer()
            }
            .padding(.horizontal, 14)
            .padding(.top, 14)
            .padding(.bottom, 8)

            content
                .padding(.horizontal, 8)
                .padding(.bottom, 8)
        }
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1))
    }
}

struct EmptyBox: View {
    let icon: String
    let text: String
    var subtext: String? = nil

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(Theme.muted.opacity(0.5))
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.navy)
            if let subtext {
                Text(subtext)
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.muted)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 28)
    }
}

struct ErrorBox: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 24))
                .foregroundStyle(Theme.danger)
            Text(message)
                .font(.system(size: 14))
                .foregroundStyle(Theme.navy)
                .multilineTextAlignment(.center)
            Button(action: retry) {
                Text("إعادة المحاولة")
                    .font(.system(size: 14, weight: .semibold))
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(Theme.navy)
                    .foregroundStyle(.white)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .padding(.horizontal, 16)
    }
}

struct PriorityBadge: View {
    let priority: String?
    var urgent: Bool = false

    var body: some View {
        HStack(spacing: 4) {
            if urgent {
                HStack(spacing: 3) {
                    Image(systemName: "flame.fill").font(.system(size: 9))
                    Text("عاجلة").font(.system(size: 11, weight: .semibold))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Theme.danger)
                .foregroundStyle(.white)
                .clipShape(Capsule())
            }
            Text(priorityLabel(priority))
                .font(.system(size: 11, weight: .medium))
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(badgeBg)
                .foregroundStyle(badgeFg)
                .clipShape(Capsule())
        }
    }

    private var badgeBg: Color {
        switch priority {
        case "high": return Theme.danger.opacity(0.12)
        case "med": return Theme.goldPale
        default: return Theme.ivory
        }
    }

    private var badgeFg: Color {
        switch priority {
        case "high": return Theme.danger
        case "med": return Theme.goldDark
        default: return Theme.muted
        }
    }
}

struct AvatarCircle: View {
    let member: TeamMember?
    var size: CGFloat = 32

    var body: some View {
        ZStack {
            Circle().fill(bgColor)
            Text(initialText)
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
    }

    private var initialText: String {
        if let i = member?.avatar_initial, !i.isEmpty { return i }
        return String((member?.name ?? "؟").prefix(1))
    }

    private var bgColor: Color {
        guard let hexStr = member?.avatar_color,
              let v = UInt32(hexStr.replacingOccurrences(of: "#", with: ""), radix: 16)
        else { return Theme.navySoft }
        return Color(hex: v)
    }
}

/// نقطة/رقاقة نوع في التقويم
struct KindDot: View {
    let kind: CalKind
    var body: some View {
        Circle().fill(kindColor(kind)).frame(width: 6, height: 6)
    }
}

func kindColor(_ k: CalKind) -> Color {
    switch k {
    case .session: return Theme.gold
    case .appointment: return Theme.success
    case .task: return Theme.blue
    case .poa: return Theme.amber
    }
}

func kindIcon(_ k: CalKind) -> String {
    switch k {
    case .session: return "building.columns.fill"
    case .appointment: return "clock.fill"
    case .task: return "checklist"
    case .poa: return "doc.text.fill"
    }
}
