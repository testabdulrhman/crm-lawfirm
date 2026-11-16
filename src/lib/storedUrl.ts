// روابط مخزن documents عبر توقيع مؤقت — المخزن الخاص، المرحلة ١ (المراجعة الشاملة 2026-11-15، الدفعة ٤ البند ١).
// الروابط المحفوظة في القاعدة عامة دائمة (…/object/public/documents/…): من يصله الرابط يفتح الملف بلا دخول.
// كل قراءة في الويب تمرّ من هنا: يُطلب من دالة sign-files رابط موقّع صالح ساعة، بصلاحيات الموظف نفسه
// (تُوقَّع فقط ملفات يرى سجلاتها). التوقيع على دفعات (كل ما يُطلب خلال ٢٥ث.ث في نداء واحد) ويُخزَّن ٥٠ دقيقة.
// ما دام المخزن عاماً: إن تعذّر التوقيع يُستعمل الرابط الأصلي فلا يتعطل شيء؛ وبعد قلبه خاصاً لا يعمل إلا الموقّع.
import { useEffect, useState } from 'react'

import { supabase } from '@/lib/supabase'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const PREFIX = `${SUPABASE_URL}/storage/v1/object/public/documents/`
const TTL_MS = 50 * 60_000

export const isStoredUrl = (u: string | null | undefined): u is string =>
  !!u && !!SUPABASE_URL && u.startsWith(PREFIX)

const cache = new Map<string, { url: string; exp: number }>()
let queue: { url: string; resolve: (u: string) => void }[] = []
let timer: ReturnType<typeof setTimeout> | null = null

async function flush() {
  timer = null
  const batch = queue
  queue = []
  const urls = Array.from(new Set(batch.map((b) => b.url)))
  const signed: Record<string, string> = {}
  for (let i = 0; i < urls.length; i += 100) {
    try {
      const { data, error } = await supabase.functions.invoke('sign-files', { body: { urls: urls.slice(i, i + 100) } })
      if (!error && data?.signed) Object.assign(signed, data.signed)
    } catch {
      /* يُستعمل الأصلي — المخزن ما زال عاماً */
    }
  }
  const exp = Date.now() + TTL_MS
  for (const [u, s] of Object.entries(signed)) cache.set(u, { url: s, exp })
  for (const b of batch) b.resolve(signed[b.url] ?? b.url)
}

/** الرابط الموقّع (أو الأصلي إن لم يكن من المخزن أو تعذّر التوقيع) */
export function signStoredUrl(url: string): Promise<string> {
  if (!isStoredUrl(url)) return Promise.resolve(url)
  const hit = cache.get(url)
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url)
  return new Promise((resolve) => {
    queue.push({ url, resolve })
    if (!timer) timer = setTimeout(flush, 25)
  })
}

/** للصور والصوت والإطارات: يُرجع الرابط الجاهز للعرض (undefined لحظة التوقيع حتى لا يُطلب الأصلي) */
export function useStoredUrl(url: string | null | undefined): string | undefined {
  const cached = isStoredUrl(url) ? cache.get(url) : undefined
  const initial = !url ? undefined : !isStoredUrl(url) ? url : cached && cached.exp > Date.now() ? cached.url : undefined
  const [resolved, setResolved] = useState<string | undefined>(initial)
  useEffect(() => {
    let alive = true
    if (!url) {
      setResolved(undefined)
      return
    }
    if (!isStoredUrl(url)) {
      setResolved(url)
      return
    }
    void signStoredUrl(url).then((u) => alive && setResolved(u))
    return () => {
      alive = false
    }
  }, [url])
  return resolved
}

/** تنزيل/قراءة محتوى ملف مخزّن (pdf.js، الدمغ، Word…) */
export async function fetchStored(url: string, init?: RequestInit): Promise<Response> {
  return fetch(await signStoredUrl(url), init)
}
