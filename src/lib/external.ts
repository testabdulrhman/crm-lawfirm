// فتح الروابط الخارجية عبر دالة واحدة.
// على الآيفون نستعمل متصفح النظام (@capacitor/browser) لأن window.open داخل
// WKWebView لا يعطي المستخدم شريط المشاركة/الحفظ — وهو المخرج الوحيد للتنزيل.
import { Capacitor } from '@capacitor/core'

export function openExternal(url: string): void {
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/browser')
      .then(({ Browser }) => Browser.open({ url, presentationStyle: 'popover' }))
      .catch(() => window.open(url, '_blank', 'noopener,noreferrer'))
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
