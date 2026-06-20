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
