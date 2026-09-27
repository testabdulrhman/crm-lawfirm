// احتفالية الشاشة (طلب المدير 2026-09-27: «اذا دخلت التطبيق أو الموقع يكون فيه تفاعل مثل انفجارات»):
// ألعاب نارية بألوان المكتب ثم قصاصات من الزاويتين — ثوانٍ وتختفي. المكتبة تُحمَّل عند الحاجة
// وحدها فلا تثقل الموقع في بقية الأيام، ولا تنطلق لمن طلب «تقليل الحركة» في جهازه.
const COLORS = ['#C9A982', '#E6D29B', '#C9A84C', '#111D3A', '#2A3C63', '#FFFFFF']

export async function celebrate(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const { default: confetti } = await import('canvas-confetti')

  // ألعاب نارية: انفجاران كل ربع ثانية في مواضع عشوائية أعلى الشاشة
  const end = Date.now() + 3200
  const base = { startVelocity: 32, spread: 360, ticks: 70, zIndex: 9999, colors: COLORS, scalar: 1.05 }
  const rand = (a: number, b: number) => Math.random() * (b - a) + a
  await new Promise<void>((resolve) => {
    const timer = window.setInterval(() => {
      const left = end - Date.now()
      if (left <= 0) {
        window.clearInterval(timer)
        resolve()
        return
      }
      const count = Math.round(55 * (left / 3200)) + 15
      confetti({ ...base, particleCount: count, origin: { x: rand(0.1, 0.35), y: rand(0.15, 0.45) } })
      confetti({ ...base, particleCount: count, origin: { x: rand(0.65, 0.9), y: rand(0.15, 0.45) } })
    }, 260)
  })

  // الختام: قصاصات من الزاويتين السفليتين
  const burst = { particleCount: 90, spread: 70, startVelocity: 58, ticks: 220, zIndex: 9999, colors: COLORS }
  confetti({ ...burst, angle: 60, origin: { x: 0, y: 0.9 } })
  confetti({ ...burst, angle: 120, origin: { x: 1, y: 0.9 } })
}

/** مرة واحدة في اليوم لكل مفتاح — لا تتكرر مع كل صفحة */
export function celebrateOncePerDay(key: string): void {
  const k = `celebrated:${key}:${new Date().toDateString()}`
  try {
    if (localStorage.getItem(k)) return
    localStorage.setItem(k, '1')
  } catch {
    /* التخزين محجوب — تنطلق على أي حال */
  }
  // بعد استقرار الصفحة لا فوق التحميل
  window.setTimeout(() => void celebrate(), 600)
}
