// الروابط داخل رسائل النقاش: التقاطها لتصير قابلة للضغط في الفقاعة، وجمعها في «الملفات والروابط».

/**
 * رابط يبدأ بـ http(s):// أو www. حتى أول فراغ أو علامة اقتباس. الحروف العربية لا تدخل فيه:
 * «الرابط https://x.comوهذا» شائع في الكتابة بلا فراغ، والعنوان الحقيقي لا يحملها إلا مُرمَّزة.
 */
export const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'«»؀-ۿ]+/giu

// علامات ترقيم تلتصق بآخر الرابط في الكتابة العادية ولا تنتمي إليه
const TRAIL_RE = /[.,،؛:!?؟)\]}"'…]+$/u

/** الرابط بلا علامات الترقيم الملتصقة بآخره */
export const cleanUrl = (raw: string): string => raw.replace(TRAIL_RE, '')

/** عنوان صالح للفتح — «www.» تُكمَّل بـ https:// */
export const hrefOf = (url: string): string => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

/** الروابط في النص بترتيب ورودها بلا تكرار */
export function extractLinks(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  for (const m of text.matchAll(URL_RE)) {
    const url = cleanUrl(m[0])
    if (url.length > 4) seen.add(url)
  }
  return [...seen]
}

/** اسم الموقع للعرض: بلا https:// ولا www. */
export function hostOf(url: string): string {
  try {
    return new URL(hrefOf(url)).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}
