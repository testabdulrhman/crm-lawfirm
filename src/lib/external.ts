// فتح الروابط الخارجية عبر دالة واحدة.
// على الآيفون نستعمل متصفح النظام (@capacitor/browser) لأن window.open داخل
// WKWebView لا يعطي المستخدم شريط المشاركة/الحفظ — وهو المخرج الوحيد للتنزيل.
// روابط مخزن documents تُفتح موقّعة مؤقتاً (المخزن الخاص — storedUrl.ts).
import { Capacitor } from '@capacitor/core'

import { isStoredUrl, signStoredUrl } from '@/lib/storedUrl'

function openNow(url: string): void {
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/browser')
      .then(({ Browser }) => Browser.open({ url, presentationStyle: 'popover' }))
      .catch(() => window.open(url, '_blank', 'noopener,noreferrer'))
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openExternal(url: string): void {
  if (!isStoredUrl(url)) return openNow(url)
  if (Capacitor.isNativePlatform()) {
    void signStoredUrl(url).then(openNow)
    return
  }
  // مانع النوافذ المنبثقة يرفض window.open بعد انتظار — نفتح التبويب الآن (داخل الضغطة) ثم نوجّهه للموقّع
  const w = window.open('about:blank', '_blank')
  void signStoredUrl(url).then((signed) => {
    if (w && !w.closed) {
      w.opener = null
      w.location.href = signed
    } else {
      window.open(signed, '_blank', 'noopener,noreferrer')
    }
  })
}
