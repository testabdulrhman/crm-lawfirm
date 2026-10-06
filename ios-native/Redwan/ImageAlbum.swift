import SwiftUI

// الصور في النقاش (اقتراح المدير 2026-10-06: «ودي يكون إذا أرسلت صور جميع تحت بعض تكون مثل طريقة الواتس أب
// تجون مجمّعه»). كانت الصورة تظهر شريحة ملف باسمها؛ صارت تُعرض صورةً، والصور المتتالية من الشخص نفسه
// تتجمّع في ألبوم شبكي (٢×٢ و«+N») يُفتح بملء الشاشة مع التقليب بينها — كالواتساب.

enum ImageFile {
    private static let exts: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif"]
    static func isImage(_ name: String?) -> Bool {
        guard let ext = name?.split(separator: ".").last?.lowercased() else { return false }
        return exts.contains(ext)
    }
}

struct AlbumItem: Identifiable, Hashable {
    let id: String
    let name: String
    let url: String?
}

/// مربّع صورة واحد — يملأ مكانه ويُقصّ
private struct ImageTile: View {
    let item: AlbumItem
    var body: some View {
        // الحجم يأتي من الإطار الخارجي، والصورة تملؤه من فوق دون أن تدفعه (وإلا تفيض فتتفاوت الأعمدة)
        Color.clear
            .overlay {
                AsyncImage(url: item.url.flatMap(URL.init(string:))) { phase in
                    switch phase {
                    case .success(let img):
                        img.resizable().scaledToFill()
                    case .failure:
                        ZStack {
                            Theme.line.opacity(0.4)
                            Image(systemName: "photo").foregroundStyle(Theme.muted)
                        }
                    default:
                        ZStack {
                            Theme.line.opacity(0.25)
                            ProgressView().controlSize(.small)
                        }
                    }
                }
            }
            .clipped()
            .contentShape(Rectangle())
    }
}

/// الألبوم: صورة واحدة كبيرة، أو شبكة ٢×٢ وعلى الرابعة «+N»
struct ImageAlbumView: View {
    let items: [AlbumItem]
    @State private var openAt: Int?

    var body: some View {
        Group {
            if items.count == 1 {
                tile(0).frame(height: 220)
            } else {
                let shown = Array(items.prefix(4))
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)], spacing: 3) {
                    ForEach(Array(shown.enumerated()), id: \.element.id) { i, _ in
                        tile(i)
                            .frame(height: items.count == 2 ? 150 : 115)
                            .overlay {
                                if i == 3 && items.count > 4 {
                                    ZStack {
                                        Color.black.opacity(0.45)
                                        Text("+\(items.count - 4)")
                                            .font(.system(size: 22, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                    .allowsHitTesting(false)
                                }
                            }
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .fullScreenCover(item: Binding(get: { openAt.map { AlbumStart(index: $0) } }, set: { openAt = $0?.index })) { s in
            ImageViewer(items: items, start: s.index)
        }
        .accessibilityLabel(items.count == 1 ? "صورة" : "\(items.count) صور")
    }

    private func tile(_ i: Int) -> some View {
        Button { openAt = i } label: { ImageTile(item: items[i]) }
            .buttonStyle(.plain)
    }
}

private struct AlbumStart: Identifiable { let index: Int; var id: Int { index } }

/// عرض بملء الشاشة مع التقليب، والمشاركة، والإغلاق
private struct ImageViewer: View {
    let items: [AlbumItem]
    let start: Int
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0
    @State private var sharing: ShareFile?
    @State private var busy = false

    var body: some View {
        ZStack(alignment: .top) {
            Color.black.ignoresSafeArea()
            TabView(selection: $page) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
                    AsyncImage(url: item.url.flatMap(URL.init(string:))) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFit()
                        } else {
                            ProgressView().tint(.white)
                        }
                    }
                    .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: items.count > 1 ? .always : .never))
            .ignoresSafeArea()

            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(.black.opacity(0.4), in: Circle())
                }
                .accessibilityLabel("إغلاق")
                Spacer()
                if items.count > 1 {
                    Text("\(page + 1) من \(items.count)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white)
                }
                Spacer()
                Button { Task { await share() } } label: {
                    Group {
                        if busy { ProgressView().tint(.white) }
                        else { Image(systemName: "square.and.arrow.up").font(.system(size: 16, weight: .semibold)) }
                    }
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(.black.opacity(0.4), in: Circle())
                }
                .accessibilityLabel("مشاركة الصورة")
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .onAppear { page = start }
        .sheet(item: $sharing) { f in
            ActivitySheet(url: f.url)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.hidden)
        }
    }

    private func share() async {
        guard !busy, items.indices.contains(page) else { return }
        busy = true
        defer { busy = false }
        let it = items[page]
        if let url = try? await FileFetch.download(url: it.url, name: it.name) {
            sharing = ShareFile(url: url)
        }
    }
}
