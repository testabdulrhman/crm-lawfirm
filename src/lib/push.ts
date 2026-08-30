// الإشعارات الفورية على الآيفون (APNs عبر Capacitor).
// على الويب كل الدوال no-op — نفس الكود يعمل في المتصفح دون شروط في الواجهة.
//
// التدفق: تسجيل الجهاز عند الدخول ← رمز APNs يُحفظ في push_devices ←
// دالة push-send ترسل ← الضغط على الإشعار يفتح المهمة مباشرة.
import { Capacitor } from '@capacitor/core'

import { supabase } from '@/lib/supabase'

export const isNative = () => Capacitor.isNativePlatform()

/** أذونات + تسجيل الرمز. تُنادى بعد معرفة هوية الموظف. */
export async function registerPush(
  memberId: string,
  onOpenRoute: (route: string) => void
): Promise<void> {
  if (!isNative()) return
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')

    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return // رفض المستخدم — الإشعار داخل النظام يبقى

    // الرمز يصل عبر حدث لا بقيمة مُرجَعة
    await PushNotifications.removeAllListeners()

    await PushNotifications.addListener('registration', async (t) => {
      try {
        await supabase.from('push_devices').upsert(
          {
            member_id: memberId,
            token: t.value,
            platform: 'ios',
            device_name: navigator.userAgent.slice(0, 80),
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'token' }
        )
      } catch {
        /* تسجيل الجهاز ثانوي — لا يعطّل الدخول */
      }
    })

    await PushNotifications.addListener('registrationError', (e) => {
      console.error('APNs registration error:', e)
    })

    // الضغط على الإشعار وهو خارج التطبيق → افتح الوجهة (مثل /tasks/<id>)
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action) => {
        const route = (action.notification.data as Record<string, unknown>)?.route
        if (typeof route === 'string' && route.startsWith('/'))
          onOpenRoute(resolvePushRoute(route))
      }
    )

    await PushNotifications.register()
  } catch (e) {
    console.error('push init failed:', e)
  }
}

/** عند تسجيل الخروج: لا نُبقي جهازاً يستقبل إشعارات موظف آخر. */
export async function unregisterPush(): Promise<void> {
  if (!isNative()) return
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.removeAllListeners()
  } catch {
    /* تجاهل */
  }
}

/** اهتزاز خفيف عند إنجاز مهمة/اعتماد — إحساس التطبيق الأصيل. */
export async function tapFeedback(
  style: 'light' | 'medium' | 'success' = 'light'
): Promise<void> {
  if (!isNative()) return
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import(
      '@capacitor/haptics'
    )
    if (style === 'success') {
      await Haptics.notification({ type: NotificationType.Success })
    } else {
      await Haptics.impact({
        style: style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light,
      })
    }
  } catch {
    /* الاهتزاز تحسين لا شرط */
  }
}

/**
 * مسار الدفع قد يحمل وجهة داخل صفحة (نقاش قضية بعينها). التوجيه الهاشي
 * لا يمرر query عبر المسارات، فنحوّلها إلى جسر sessionStorage تقرؤه الصفحة.
 */
export function resolvePushRoute(route: string): string {
  const m = route.match(/^\/discussions\?case=([0-9a-f-]+)$/)
  if (m) {
    try {
      sessionStorage.setItem('discussions:open-case', m[1])
    } catch {
      /* تخزين معطّل — تفتح القائمة على الأحدث */
    }
    return '/discussions'
  }
  return route
}
