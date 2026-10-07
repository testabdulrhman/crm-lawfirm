// تحويل بين الهجري (أم القرى) والميلادي عبر Intl — بدون أي مكتبة/خدمة خارجية (يعمل offline).
// المبدأ: الميلادي هو الأصل المخزّن؛ هذا للإدخال/العرض فقط.

export const HIJRI_MONTHS = [
  'محرّم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوّال',
  'ذو القعدة',
  'ذو الحجّة',
] as const

// نطاق سنوات هجرية معقول للقوائم
export const HIJRI_YEAR_MIN = 1440
export const HIJRI_YEAR_MAX = 1475

export interface HijriParts {
  y: number
  m: number // 1..12
  d: number // 1..30
}

const _fmt = new Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

// ميلادي → أجزاء هجرية
export function gregorianToHijri(date: Date): HijriParts {
  let y = 0
  let m = 0
  let d = 0
  for (const p of _fmt.formatToParts(date)) {
    if (p.type === 'year') y = parseInt(p.value, 10)
    else if (p.type === 'month') m = parseInt(p.value, 10)
    else if (p.type === 'day') d = parseInt(p.value, 10)
  }
  return { y, m, d }
}

// هجري (y,m,d) → تاريخ ميلادي (UTC) عبر تقدير ثم ضبط دقيق بالبحث
export function hijriToGregorian(hy: number, hm: number, hd: number): Date {
  const approxDays = Math.round((hy - 1) * 354.367 + (hm - 1) * 29.53 + hd)
  let guess = new Date(Date.UTC(622, 6, 16) + approxDays * 86400000)
  for (let i = 0; i < 40; i++) {
    const p = gregorianToHijri(guess)
    if (p.y === hy && p.m === hm && p.d === hd) return guess
    const diffMonths = (hy - p.y) * 12 + (hm - p.m)
    let step = Math.round(diffMonths * 29.53 + (hd - p.d))
    if (step === 0)
      step = hd - p.d || (hy > p.y || (hy === p.y && hm > p.m) ? 1 : -1)
    guess = new Date(guess.getTime() + step * 86400000)
  }
  // ضبط نهائي ±4 أيام
  for (let off = -4; off <= 4; off++) {
    const cand = new Date(guess.getTime() + off * 86400000)
    const p = gregorianToHijri(cand)
    if (p.y === hy && p.m === hm && p.d === hd) return cand
  }
  return guess // أفضل تقدير
}

// تاريخ → ISO ميلادي (YYYY-MM-DD) بالـ UTC
export function dateToISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// عدد أيام شهر هجري معيّن (29 أو 30) — للتحقق من صحّة اليوم في القوائم
export function hijriMonthLength(hy: number, hm: number): number {
  const start = hijriToGregorian(hy, hm, 1)
  const nextY = hm === 12 ? hy + 1 : hy
  const nextM = hm === 12 ? 1 : hm + 1
  const next = hijriToGregorian(nextY, nextM, 1)
  return Math.round((next.getTime() - start.getTime()) / 86400000)
}

/**
 * تاريخ هجري كما قرأه النموذج من مستند («1448/04/23 هـ»، «٢٣/٠٤/١٤٤٨هـ»، «1448-4-23») ← ميلادي ISO
 * بتقويم أم القرى. النموذج يقرأ الهجري صحيحاً لكنه يخطئ في تحويله بيوم (بلاغ المدير 2026-10-07:
 * صك 1448/04/23 حُوِّل إلى 2026/10/05 والصحيح 2026/10/04) — فالتحويل هنا لا عنده. null = لا يُفهم.
 */
export function hijriTextToISO(text: string | null | undefined): string | null {
  if (!text) return null
  const latin = text.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
  const nums = latin.match(/\d+/g)?.map(Number) ?? []
  if (nums.length < 3) return null
  // السنة هي العدد الرباعي (1300–1600)، ويكون أول الثلاثة أو آخرها
  let y: number, m: number, d: number
  if (nums[0] >= 1300 && nums[0] <= 1600) [y, m, d] = [nums[0], nums[1], nums[2]]
  else if (nums[2] >= 1300 && nums[2] <= 1600) [d, m, y] = [nums[0], nums[1], nums[2]]
  else return null
  if (m < 1 || m > 12 || d < 1 || d > 30) return null
  const g = hijriToGregorian(y, m, d)
  const back = gregorianToHijri(g)
  if (back.y !== y || back.m !== m || back.d !== d) return null // يوم ٣٠ في شهر من ٢٩ مثلاً
  return dateToISO(g)
}
