// تنسيق موحّد للأرقام والتواريخ — أرقام لاتينية (0123456789) دائماً مع واجهة عربية.
// قاعدة: كل عدد/تاريخ يُعرض في التطبيق يمرّ عبر هذه الدوال (لا toLocaleString('ar') مباشرة).

// locale عربي مع نظام أرقام لاتيني
const NUM_LOCALE = 'ar-SA-u-nu-latn'
const DATE_LOCALE = 'ar-SA-u-nu-latn-ca-gregory'

// احتياط: لو أنتجت البيئة أرقاماً هندية رغم الـ locale، نُجبر اللاتينية يدوياً.
const ARABIC_INDIC = /[٠-٩۰-۹]/
function forceLatinDigits(s: string): string {
  if (!ARABIC_INDIC.test(s)) return s
  return s.replace(/[٠-٩]/g, (d) =>
    String(d.charCodeAt(0) - 0x0660)
  ).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
}

function safeFormat(fn: () => string, fallbackInput: number | string): string {
  try {
    return forceLatinDigits(fn())
  } catch {
    return forceLatinDigits(String(fallbackInput))
  }
}

export const fmtNumber = (n: number | null | undefined): string =>
  n == null
    ? '—'
    : safeFormat(() => new Intl.NumberFormat(NUM_LOCALE).format(n), n)

export const fmtCurrency = (n: number | null | undefined): string =>
  n == null
    ? '—'
    : safeFormat(
        () =>
          new Intl.NumberFormat(NUM_LOCALE, {
            style: 'decimal',
            maximumFractionDigits: 2,
          }).format(n) + ' ريال',
        n
      )

// التواريخ: أرقام لاتينية، أسماء أشهر عربية
export const fmtDate = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return safeFormat(
    () =>
      new Intl.DateTimeFormat(DATE_LOCALE, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date),
    date.toISOString()
  )
}

export const fmtDateTime = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return safeFormat(
    () =>
      new Intl.DateTimeFormat(DATE_LOCALE, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date),
    date.toISOString()
  )
}

// قيمة تاريخ لحقول <input type="date"> بصيغة YYYY-MM-DD (أرقام لاتينية)
export const todayISO = (): string => new Date().toISOString().slice(0, 10)

// تطبيع رقم جوال سعودي لصيغة Msegat (9665XXXXXXXX):
// أزل غير الأرقام؛ إن بدأ بـ 0 استبدله بـ 966؛ إن لم يبدأ بـ 966 أضِفها.
export const normalizeSaudiPhone = (raw: string): string => {
  let n = (raw ?? '').replace(/\D/g, '')
  if (!n) return ''
  if (n.startsWith('00966')) n = n.slice(2)
  if (n.startsWith('0')) n = '966' + n.slice(1)
  else if (!n.startsWith('966')) n = '966' + n
  return n
}
