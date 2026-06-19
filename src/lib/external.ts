// فتح الروابط الخارجية عبر دالة واحدة (جاهزية Capacitor — القسم 1.1 بند 8).
// عند التغليف نستبدل التنفيذ بـ @capacitor/browser دون لمس مكوّنات الواجهة.

export function openExternal(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}
