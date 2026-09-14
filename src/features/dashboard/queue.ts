// «المطلوب مني» — قائمة عمل واحدة بدل أقسام متفرقة (المدير 2026-09-14: «احس فيه حوسه،
// كذا ملخبط كثير»). تجمع المهل النظامية والمهام والاعتمادات والجلسات غير المغلقة،
// فيظهر كل عنصر مرة واحدة في مجموعة إلحاحه: فائت · اليوم · هذا الأسبوع · لاحقاً.
// المهل لا تفقد صرامتها: مهلة الاعتراض أول مجموعتها دائماً، ولا تُنجز بنقرة من
// اللوحة — فواتها سقوط حق لا تأخير.
import { todayISO } from '@/lib/format'

export type ActionKind =
  | 'objection' // مهلة اعتراض مشتقة من حكم
  | 'session_prep' // تحضير جلسة مشتق
  | 'poa' // وكالة جديدة مشتقة
  | 'task' // مهمة عادية
  | 'approval' // مهمة رُفعت لاعتمادي
  | 'letter' // خطاب صادر ينتظر الختم (للمدير)
  | 'session_close' // جلسة فات موعدها ولم تُغلق

export type ActionGroup = 'overdue' | 'today' | 'week' | 'later'

export type Tone = 'danger' | 'warn' | 'violet' | 'blue' | 'gold' | 'emerald' | 'plain'

export interface ActionItem {
  key: string
  kind: ActionKind
  /** معرّف المهمة حين يكون العنصر مهمة — للإنجاز والاعتماد الثاني */
  taskId?: string
  title: string
  matter: string | null
  assignee: string | null
  /** YYYY-MM-DD */
  due: string | null
  /** للجلسة غير المغلقة: كم يوماً مضى على موعدها */
  daysAgo?: number
  urgent: boolean
  /** مهلة اعتراض لم يعتمد احتسابها شخص ثانٍ */
  needsSecondEye: boolean
  /** مهمة رفعها صاحبها وتنتظر الاعتماد */
  awaitingReview: boolean
  href: string
}

export interface ScheduleItem {
  key: string
  kind: 'session' | 'appointment'
  /** YYYY-MM-DD */
  date: string
  time: string | null
  title: string
  subtitle: string | null
  href: string
}

export const KIND_META: Record<ActionKind, { label: string; tone: Tone }> = {
  objection: { label: 'مهلة اعتراض', tone: 'danger' },
  session_prep: { label: 'تحضير جلسة', tone: 'warn' },
  // الوكالة لا تُجدَّد — تُستخرج وكالة جديدة (تصحيح المدير 2026-09-08)
  poa: { label: 'وكالة جديدة', tone: 'violet' },
  task: { label: 'مهمة', tone: 'blue' },
  approval: { label: 'اعتماد مهمة', tone: 'gold' },
  letter: { label: 'ختم خطاب', tone: 'gold' },
  session_close: { label: 'إغلاق جلسة', tone: 'warn' },
}

export const GROUP_ORDER: ActionGroup[] = ['overdue', 'today', 'week', 'later']

export const GROUP_META: Record<ActionGroup, { label: string; hint: string }> = {
  overdue: { label: 'فائت', hint: 'تجاوز موعده' },
  today: { label: 'اليوم', hint: 'مستحق اليوم أو ينتظر قرارك' },
  week: { label: 'هذا الأسبوع', hint: 'خلال 7 أيام' },
  later: { label: 'لاحقاً', hint: 'بعد أسبوع أو بلا موعد' },
}

/** نوع المهمة المشتقة من مفتاح اشتقاقها (ruling:… · session:… · poa:…) */
export function kindOfDerived(derivedKey: string | null): ActionKind {
  const src = (derivedKey ?? '').split(':')[0]
  if (src === 'ruling') return 'objection'
  if (src === 'session') return 'session_prep'
  if (src === 'poa') return 'poa'
  return 'task'
}

// حساب الأيام على تواريخ YYYY-MM-DD خالصة — بلا ساعات ولا مناطق زمنية
const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** الأيام من اليوم إلى التاريخ (سالب = مضى)، أو null */
export function daysUntil(iso: string | null | undefined, today = todayISO()): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  return dayNumber(iso) - dayNumber(today)
}

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function groupOf(it: ActionItem, today = todayISO()): ActionGroup {
  // جلسة لم تُغلق بعد موعدها متأخرة بطبيعتها، والاعتماد ينتظر الآن
  if (it.kind === 'session_close') return 'overdue'
  if (it.kind === 'approval' || it.kind === 'letter') return 'today'
  const d = daysUntil(it.due, today)
  if (d == null) return 'later'
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d <= 7) return 'week'
  return 'later'
}

// داخل المجموعة: مهلة الاعتراض أولاً، ثم الجلسة غير المغلقة، ثم الاعتمادات، ثم البقية
const KIND_RANK: Record<ActionKind, number> = {
  objection: 0,
  session_close: 1,
  letter: 2,
  approval: 2,
  session_prep: 3,
  poa: 3,
  task: 3,
}

export function sortActions(a: ActionItem, b: ActionItem): number {
  const k = KIND_RANK[a.kind] - KIND_RANK[b.kind]
  if (k) return k
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
  if (a.due !== b.due) {
    if (!a.due) return 1
    if (!b.due) return -1
    return a.due.localeCompare(b.due)
  }
  return a.title.localeCompare(b.title, 'ar')
}

export function groupActions(
  items: ActionItem[],
  today = todayISO()
): Record<ActionGroup, ActionItem[]> {
  const groups: Record<ActionGroup, ActionItem[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
  }
  for (const it of items) groups[groupOf(it, today)].push(it)
  for (const g of GROUP_ORDER) groups[g].sort(sortActions)
  return groups
}
