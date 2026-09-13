// أوقات رسائل النقاش — مشتركة بين قائمة النقاشات والفقاعات والخيوط والمحفوظات.
//
// ⚠️ التاريخ من مكوّنات الوقت المحلي لا من toISOString (UTC): رسالة بعد منتصف الليل بتوقيت
//    الرياض كانت تُنسب إلى اليوم السابق (نفس درس صفحة الحجز العامة).
import { fmtDatePref, fmtTime } from '@/lib/format'

const pad = (n: number) => String(n).padStart(2, '0')
const localHHMM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const localISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

const LOCALE = 'ar-SA-u-ca-gregory-nu-latn'
const weekdayF = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const dayMonthF = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long' })
const dayMonthYearF = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
const fullF = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** فرق الأيام التقويمية بين اليوم والتاريخ (٠ = اليوم، ١ = أمس) */
function daysAgo(d: Date, now = new Date()): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000)
}

/** مختصر لقائمة النقاشات والمحفوظات (أسلوب الواتساب): الساعة لليوم، «أمس»، ثم التاريخ */
export function stamp(iso: string | null | undefined): string {
  const d = parse(iso)
  if (!d) return ''
  const ago = daysAgo(d)
  if (ago === 0) return fmtTime(localHHMM(d))
  if (ago === 1) return 'أمس'
  return fmtDatePref(localISODate(d))
}

/**
 * وقت الرسالة داخل الفقاعة — الساعة دائماً، ومعها اليوم إن لم تكن من اليوم
 * (بلاغ المدير: «المناقشات ما تحط ساعة الإرسال في الويب»).
 */
export function msgStamp(iso: string | null | undefined): string {
  const d = parse(iso)
  if (!d) return ''
  const time = fmtTime(localHHMM(d))
  const ago = daysAgo(d)
  if (ago <= 0) return time
  if (ago === 1) return `أمس · ${time}`
  if (ago < 7) return `${weekdayF.format(d)} · ${time}`
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return `${(sameYear ? dayMonthF : dayMonthYearF).format(d)} · ${time}`
}

/** التاريخ والوقت كاملين — تلميح عند التحويم */
export function fullStamp(iso: string | null | undefined): string {
  const d = parse(iso)
  return d ? fullF.format(d) : ''
}
