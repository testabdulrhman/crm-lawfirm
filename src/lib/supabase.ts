import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
if (!url || !key) throw new Error('Missing Supabase env vars')

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})

// ردّ دالة الخادم بغير 2xx: تعطي المكتبة رسالة عامة «Edge Function returned a non-2xx status
// code» ويبقى السبب العربي الذي كتبته الدالة ({error, detail}) في جسم الرد — فظهر للموظفة
// «تعذّر تحليل المستند — Edge Function returned…» بلا سبب. يُقرأ الجسم هنا مرة لكل الاستدعاءات.
type InvokeResult = { data: unknown; error: (Error & { context?: Response }) | null }
const fnProto = Object.getPrototypeOf(supabase.functions) as {
  invoke: (...args: unknown[]) => Promise<InvokeResult>
}
const rawInvoke = fnProto.invoke
fnProto.invoke = async function (this: unknown, ...args: unknown[]) {
  const res = await rawInvoke.apply(this, args)
  const ctx = res?.error?.context
  if (res.error && ctx && typeof ctx.clone === 'function') {
    try {
      const body = (await ctx.clone().json()) as Record<string, unknown>
      const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
      const reason = pick(body?.error) ?? pick(body?.message)
      const detail = pick(body?.detail)
      if (reason) res.error.message = detail && detail !== reason ? `${reason} — ${detail}` : reason
    } catch {
      // جسم ليس JSON — تبقى رسالة المكتبة
    }
  }
  return res
}

export const DOCS_BUCKET = 'documents'
export const publicUrl = (path: string, bucket: string = DOCS_BUCKET) =>
  `${url}/storage/v1/object/public/${bucket}/${path}`
