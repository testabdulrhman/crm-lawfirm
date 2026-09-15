// جسر «افتح هذا النقاش عند هذه الرسالة» من خارج صفحة النقاشات: الجرس، إشعار المتصفح، الدفع.
// التوجيه الهاشي لا يمرّر query بين المسارات، فالوجهة تُحفظ في sessionStorage لصفحة ستُفتح،
// ويُبثّ حدث حيّ لصفحة مفتوحة أصلاً — وأيهما قرأها يمسحها كي لا تُفتح مرة ثانية لاحقاً.

export interface DiscussionJump {
  /** النقاش: معرّف الملف أو القناة، وnull = «عام — المكتب» */
  caseId: string | null
  /**
   * وقت الرسالة المقصودة. إشعار المنشن يُكتب بمشغّل داخل معاملة الرسالة نفسها،
   * فوقته يطابق created_at الرسالة حرفياً — فتُعرف الرسالة بلا عمود جديد.
   */
  at?: string | null
}

const KEY = 'discussions:jump'
export const DISCUSSION_JUMP_EVENT = 'discussions:jump'

export function requestDiscussionJump(jump: DiscussionJump): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(jump))
  } catch {
    /* تخزين معطّل — الحدث الحي يكفي الصفحة المفتوحة */
  }
  window.dispatchEvent(new CustomEvent<DiscussionJump>(DISCUSSION_JUMP_EVENT, { detail: jump }))
}

/** يقرأ الوجهة المعلّقة ويمسحها */
export function takeDiscussionJump(): DiscussionJump | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    sessionStorage.removeItem(KEY)
    const j = JSON.parse(raw) as DiscussionJump | null
    return j && (typeof j.caseId === 'string' || j.caseId === null) ? j : null
  } catch {
    return null
  }
}
