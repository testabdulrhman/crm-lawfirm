// سجل الأخطاء (طلب المدير 2026-09-15: «ليه إذا صار فيه خطأ ما يتسجل عندنا وانت تطلع على الأخطاء
// ونصلحها؟»). كل خطأ يظهر لموظف يُحفظ في error_logs بشاشته ووقته وصاحبه ونصّه — لا محتوى النماذج.
//
// أربعة منافذ تغطي الشاشات كلها دون لمسها واحدة واحدة:
//   toast     توست الخطأ (use-toast)          query     جلب فشل بعد إعادة المحاولة (queryClient)
//   crash     عطل يُسقط الصفحة (ErrorBoundary)  unhandled خطأ غير ملتقط في المتصفح (main.tsx)
//
// التسجيل ثانوي: لا يرمي ولا يُظهر شيئاً، ولا يُسجَّل بلا دخول (القاعدة ترفض الزائر أصلاً)،
// والمتكرر نفسه في الشاشة نفسها خلال دقيقة مرة واحدة، وبسقف للجلسة كي لا يغرق السجل.
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { reloadPending } from '@/lib/staleBuild'

export type ErrorKind = 'toast' | 'query' | 'crash' | 'unhandled'

const WINDOW_MS = 60_000
const MAX_PER_SESSION = 80
const recent = new Map<string, number>()
let sent = 0

// ضجيج المتصفح لا يخص النظام
const NOISE = [/ResizeObserver loop/i, /AbortError/i, /The user aborted a request/i]

export function logError(
  kind: ErrorKind,
  message: string | undefined,
  extra: { stack?: string | null; source?: string | null } = {}
): void {
  // المعاينة المحلية لا تملأ سجل الإنتاج
  if (!import.meta.env.PROD) return
  // الصفحة تُعاد لجلب نسخة جديدة — ما يسبق ذلك أثر جانبي لا عطل
  if (reloadPending()) return
  try {
    const text = (message ?? '').trim()
    if (!text || NOISE.some((r) => r.test(text))) return

    const { user, teamMember } = useAuth.getState()
    if (!user) return

    const url = window.location.hash.replace(/^#/, '') || window.location.pathname
    const key = `${kind}|${text}|${url}`
    const now = Date.now()
    if (now - (recent.get(key) ?? 0) < WINDOW_MS) return
    recent.set(key, now)
    if (++sent > MAX_PER_SESSION) return

    void supabase
      .from('error_logs')
      .insert({
        error_type: kind,
        message: text.slice(0, 2000),
        source: (extra.source ?? 'web').slice(0, 200),
        stack: extra.stack ? extra.stack.slice(0, 4000) : null,
        user_id: user.id,
        user_name: teamMember?.short_name || teamMember?.name || null,
        url: url.slice(0, 500),
      })
      .then(
        () => undefined,
        () => undefined
      )
  } catch {
    /* التسجيل لا يُسقط ما يسجّله */
  }
}
