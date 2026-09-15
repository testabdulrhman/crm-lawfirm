// إشعارات المتصفح (Notification API) — تظهر من النظام والتبويب في الخلفية.
// تعمل ما دام التطبيق مفتوحاً في أي تبويب؛ الدفع والمتصفح مغلق يخص APNs في الجوال.
import type { AppNotification } from '@/hooks/useNotifications'

const ENABLED_KEY = 'browser-notif:enabled'
const SEEN_KEY = 'browser-notif:last-seen'

export const browserNotifSupported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window

export const browserNotifEnabled = (): boolean =>
  browserNotifSupported() &&
  Notification.permission === 'granted' &&
  localStorage.getItem(ENABLED_KEY) === '1'

/** تفعيل/إيقاف — التفعيل يطلب إذن المتصفح (يتطلب نقرة مستخدم) */
export async function setBrowserNotifEnabled(on: boolean): Promise<boolean> {
  if (!browserNotifSupported()) return false
  if (!on) {
    localStorage.setItem(ENABLED_KEY, '0')
    return false
  }
  const perm =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  const ok = perm === 'granted'
  localStorage.setItem(ENABLED_KEY, ok ? '1' : '0')
  // لا نعيد عرض ما سبق وصوله قبل التفعيل
  if (ok && !localStorage.getItem(SEEN_KEY)) {
    localStorage.setItem(SEEN_KEY, new Date().toISOString())
  }
  return ok
}

/**
 * عرض الجديد فقط: يقارن بآخر وقت معروض (localStorage — يمنع التكرار عبر
 * التبويبات المفتوحة معاً تقريباً) ولا يعرض والتبويب ظاهر (الجرس يكفي حينها).
 */
export function showNewBrowserNotifications(
  items: AppNotification[],
  /**
   * يُنادى عند الضغط (null = الإشعار المجمّع). الوجهة تُحسب عند الضغط لا عند الظهور:
   * كانت تُحسب عند الظهور، ووجهة المنشن تحمل أثراً (فتح نقاشه) فيتبدّل النقاش المفتوح بلا ضغط
   */
  onOpen: (n: AppNotification | null) => void
): void {
  if (!browserNotifEnabled()) return

  const lastSeen = localStorage.getItem(SEEN_KEY) ?? new Date().toISOString()
  const fresh = items.filter(
    (n) => !n.is_read && n.created_at > lastSeen
  )
  if (fresh.length === 0) return

  // قدّم المؤشر أولاً — لو تبويب آخر سبقنا خلال هذه اللحظة فالتكرار نادر ومقبول
  const newest = fresh.reduce(
    (max, n) => (n.created_at > max ? n.created_at : max),
    lastSeen
  )
  localStorage.setItem(SEEN_KEY, newest)

  // والتبويب ظاهر أمام المستخدم يكفيه الجرس — لا نزعجه بإشعار نظام
  if (document.visibilityState === 'visible') return

  // أكثر من ثلاثة: إشعار واحد مجمّع بدل قصف المستخدم
  if (fresh.length > 3) {
    spawn('إشعارات جديدة', `لديك ${fresh.length} إشعارات جديدة`, () => onOpen(null))
    return
  }
  for (const n of fresh) {
    spawn(n.title ?? 'إشعار جديد', n.message ?? '', () => onOpen(n))
  }
}

function spawn(title: string, body: string, onClick: () => void): void {
  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      dir: 'rtl',
      lang: 'ar',
    })
    notification.onclick = () => {
      window.focus()
      onClick()
      notification.close()
    }
  } catch {
    /* بعض المتصفحات تمنع الإنشاء المباشر — نتجاهل بصمت */
  }
}
