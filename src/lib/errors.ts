// استخراج رسالة الخطأ من أي مصدر — لعرض السبب الحقيقي للمستخدم بدل «تعذّر» مجردة.
// مهم: أخطاء Supabase/PostgREST كائنات عادية { message, details, hint, code }
// وليست instances من Error، فاختبار `instanceof Error` وحده يبتلع السبب.
export function errMessage(e: unknown): string | undefined {
  if (!e) return undefined
  if (typeof e === 'string') return e.trim() || undefined
  if (e instanceof Error) return e.message

  if (typeof e === 'object') {
    const o = e as Record<string, unknown>
    const parts: string[] = []
    const push = (v: unknown) => {
      if (typeof v === 'string' && v.trim() !== '') parts.push(v.trim())
    }
    push(o.message)
    // تفاصيل PostgREST المساعدة (تظهر بعد الرسالة الأساسية)
    push(o.details)
    push(o.hint)
    if (parts.length > 0) {
      const code = typeof o.code === 'string' && o.code ? ` [${o.code}]` : ''
      return parts.join(' — ') + code
    }
  }
  return undefined
}
