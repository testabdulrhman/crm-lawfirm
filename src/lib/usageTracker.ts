// تتبع استخدام التطبيق — جلسة لكل فتح للتطبيق في جدول usage_sessions (نفس بنية النظام السابق)
// تُحتسب الدقائق التي كانت فيها النافذة ظاهرة فقط (دقة الاستخدام الفعلي لا مجرد ترك التبويب مفتوحاً)
import { supabase } from '@/lib/supabase'

let sessionId: string | null = null
let started = false
let activeMinutes = 0
let lastTick = Date.now()

async function persist() {
  if (!sessionId) return
  try {
    await supabase
      .from('usage_sessions')
      .update({ minutes: activeMinutes, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
  } catch {
    /* التتبع لا يعطل التطبيق */
  }
}

export async function startUsageTracking(userName: string, userRole: string | null) {
  if (started) return
  started = true

  try {
    const { data } = await supabase
      .from('usage_sessions')
      .insert({
        user_name: userName,
        user_role: userRole,
        login_at: new Date().toISOString(),
        minutes: 0,
      })
      .select('id')
      .single()
    sessionId = data?.id ?? null
  } catch {
    return // بدون معرف جلسة لا معنى للاستمرار
  }

  lastTick = Date.now()

  // عدّاد الدقائق النشطة: يحتسب فقط والنافذة ظاهرة
  setInterval(() => {
    const now = Date.now()
    if (document.visibilityState === 'visible') {
      activeMinutes += Math.round((now - lastTick) / 60000)
    }
    lastTick = now
  }, 60000)

  // حفظ دوري كل 3 دقائق + عند إخفاء النافذة/الإغلاق
  setInterval(persist, 180000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void persist()
  })
  window.addEventListener('pagehide', () => void persist())
}
