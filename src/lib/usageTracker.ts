// تتبع استخدام التطبيق:
// 1) جلسة لكل فتح (usage_sessions — نفس بنية النظام السابق) بدقائق النافذة الظاهرة.
// 2) تفاصيل يومية (usage_daily): فتحات كل صفحة وثواني المكوث فيها وضغطات الأزرار،
//    تُجمَّع في الذاكرة وتُدفَع كل دقيقتين وعند إخفاء النافذة — بلا إغراق للقاعدة.
import { supabase } from '@/lib/supabase'

let sessionId: string | null = null
let started = false
let activeMinutes = 0
let lastTick = Date.now()

let userName = ''
let curPage = '/'
let pageVisibleSince = Date.now()

// مفتاح التجميع: نوع|صفحة|زر
interface Bucket {
  type: 'page' | 'click'
  page: string
  label: string | null
  hits: number
  seconds: number
}
const buf = new Map<string, Bucket>()

// تطبيع المسار: إزالة المعرفات (uuid/أرقام) → /cases/:id
function normPath(): string {
  const raw = (window.location.hash || '#/').replace(/^#/, '').split('?')[0]
  const segs = raw.split('/').map((s) =>
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(s) || /^\d+$/.test(s) ? ':id' : s
  )
  return segs.join('/') || '/'
}

function bump(
  type: 'page' | 'click',
  page: string,
  label: string | null,
  dHits: number,
  dSeconds: number
) {
  const key = `${type}|${page}|${label ?? ''}`
  const b = buf.get(key) ?? { type, page, label, hits: 0, seconds: 0 }
  b.hits += dHits
  b.seconds += dSeconds
  buf.set(key, b)
}

// إضافة زمن المكوث المنقضي للصفحة الحالية (والنافذة ظاهرة)
function accumulatePageTime() {
  const now = Date.now()
  if (document.visibilityState === 'visible') {
    const secs = Math.round((now - pageVisibleSince) / 1000)
    if (secs > 0) bump('page', curPage, null, 0, secs)
  }
  pageVisibleSince = now
}

// دفع التفاصيل المجمّعة: قراءة صف اليوم وزيادته أو إنشاؤه
async function flushDetails() {
  accumulatePageTime()
  if (buf.size === 0 || !userName) return
  const entries = [...buf.values()]
  buf.clear()
  const day = new Date().toISOString().slice(0, 10)
  await Promise.all(
    entries.map(async (e) => {
      try {
        let q = supabase
          .from('usage_daily')
          .select('id, hits, seconds')
          .eq('day', day)
          .eq('user_name', userName)
          .eq('event_type', e.type)
          .eq('page', e.page)
        q = e.label == null ? q.is('label', null) : q.eq('label', e.label)
        const { data } = await q.maybeSingle()
        if (data) {
          await supabase
            .from('usage_daily')
            .update({
              hits: (data.hits ?? 0) + e.hits,
              seconds: (data.seconds ?? 0) + e.seconds,
              updated_at: new Date().toISOString(),
            })
            .eq('id', data.id)
        } else {
          await supabase.from('usage_daily').insert({
            day,
            platform: 'web',
            user_name: userName,
            event_type: e.type,
            page: e.page,
            label: e.label,
            hits: e.hits,
            seconds: e.seconds,
          })
        }
      } catch {
        /* التتبع لا يعطل التطبيق */
      }
    })
  )
}

async function persistSession() {
  if (!sessionId) return
  try {
    await supabase
      .from('usage_sessions')
      .update({ minutes: activeMinutes, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
  } catch {
    /* التتبع لا يعطل التطبيق */
  }
}

// استخراج تسمية الزر المضغوط (نص الزر أو aria-label)
function clickLabel(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  const el = target.closest('button, [role="button"], a')
  if (!el) return null
  const label =
    el.getAttribute('aria-label') ||
    el.getAttribute('title') ||
    (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!label) return null
  return label.slice(0, 40)
}

export async function startUsageTracking(name: string, userRole: string | null) {
  if (started) return
  started = true
  userName = name

  try {
    const { data } = await supabase
      .from('usage_sessions')
      .insert({
        user_name: name,
        user_role: userRole,
        login_at: new Date().toISOString(),
        minutes: 0,
        platform: 'web',
      })
      .select('id')
      .single()
    sessionId = data?.id ?? null
  } catch {
    /* نكمل التفاصيل حتى لو فشلت الجلسة */
  }

  lastTick = Date.now()
  curPage = normPath()
  pageVisibleSince = Date.now()
  bump('page', curPage, null, 1, 0) // فتحة الصفحة الأولى

  // تغيّر الصفحة (hash routing)
  window.addEventListener('hashchange', () => {
    accumulatePageTime()
    curPage = normPath()
    bump('page', curPage, null, 1, 0)
  })

  // ضغطات الأزرار (التقاط عام)
  document.addEventListener(
    'click',
    (e) => {
      const label = clickLabel(e.target)
      if (label) bump('click', curPage, label, 1, 0)
    },
    { capture: true, passive: true }
  )

  // عدّاد الدقائق النشطة: يحتسب فقط والنافذة ظاهرة
  setInterval(() => {
    const now = Date.now()
    if (document.visibilityState === 'visible') {
      activeMinutes += Math.round((now - lastTick) / 60000)
    }
    lastTick = now
  }, 60000)

  // حفظ دوري + عند إخفاء النافذة/الإغلاق
  setInterval(persistSession, 180000)
  setInterval(() => void flushDetails(), 120000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void persistSession()
      void flushDetails()
    } else {
      pageVisibleSince = Date.now()
    }
  })
  window.addEventListener('pagehide', () => {
    void persistSession()
    void flushDetails()
  })
}
