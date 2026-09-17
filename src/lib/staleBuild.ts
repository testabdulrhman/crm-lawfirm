// بعد كل نشر تتغيّر أسماء ملفات التطبيق، والصفحة المفتوحة من قبله تطلب جزءاً حُذف (ختم الخطاب،
// معاينة PDF، قالب العقد…) فيُرجع الخادم صفحة HTML مكانه ويفشل التحميل:
// «Failed to fetch dynamically imported module» (بلاغ المدير 2026-09-17).
// العلاج هنا مرة واحدة لا في كل شاشة:
//   (1) فشل تحميل جزء = إعادة تحميل تلقائية للصفحة (مرة كل دقيقة على الأكثر).
//   (2) كشف النشر الجديد والصفحة مفتوحة، ثم إعادة التحميل بصمت عند أول تنقّل.

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk \S+ failed|is not a valid JavaScript MIME type|Unable to preload CSS/i

const RELOAD_KEY = 'build:auto-reload-at'
const RELOAD_GUARD_MS = 60_000
const CHECK_EVERY_MS = 10 * 60_000

let reloading = false
let newBuild = false

/** خطأ تحميل جزء من التطبيق — لا خطأ في منطقه */
export function isChunkLoadError(err: unknown): boolean {
  const message =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : ''
  return CHUNK_ERROR_RE.test(message)
}

/** إعادة التحميل جارية — الأخطاء الجانبية التي تسبقها لا تُسجَّل */
export const reloadPending = (): boolean => reloading

/**
 * إعادة تحميل الصفحة لجلب النسخة الجديدة، مرة كل دقيقة على الأكثر كي لا تدور الصفحة إن كان
 * العطل حقيقياً (انقطاع شبكة مثلاً) لا نشراً جديداً. تُرجع true إن بدأت إعادة التحميل.
 */
export function reloadForNewBuild(): boolean {
  if (reloading) return true
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last < RELOAD_GUARD_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // بلا تخزين لا حارس من الدوران — يبقى زرّ إعادة التحميل في شاشة الخطأ
    return false
  }
  reloading = true
  window.location.reload()
  return true
}

/** اسم ملف التطبيق الرئيسي (assets/index-XXXX.js) في نص HTML أو في مسار */
const entryOf = (text: string): string | null => text.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null

/** نُشرت نسخة أحدث من المحمّلة في هذه الصفحة؟ (يبقى الجواب حتى إعادة التحميل) */
export const hasNewBuild = (): boolean => newBuild

export async function checkForNewBuild(): Promise<boolean> {
  if (newBuild || import.meta.env.DEV || !/^https?:$/.test(window.location.protocol)) return newBuild
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]')
  const mine = script ? entryOf(script.getAttribute('src') ?? '') : null
  if (!mine) return false
  try {
    const res = await fetch(`./index.html?build-check=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return false
    const live = entryOf(await res.text())
    newBuild = !!live && live !== mine
  } catch {
    /* بلا شبكة — تكفي المحاولة القادمة */
  }
  return newBuild
}

/** يُنادى مرة في main.tsx قبل رسم التطبيق */
export function installStaleBuildRecovery(): void {
  // مُحمِّل Vite يطلق هذا الحدث حين يفشل استيراد جزء — الخطأ يكمل طريقه والصفحة تُعاد
  window.addEventListener('vite:preloadError', () => {
    reloadForNewBuild()
  })
  const check = () => void checkForNewBuild()
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
  window.setInterval(check, CHECK_EVERY_MS)
}
