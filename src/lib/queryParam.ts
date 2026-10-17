// معاملات الرابط مع hash routing: wouter 3.10 يضع «?…» قبل «#» (‎/?case=x#/research‎) لا بعده،
// والروابط القديمة/اليدوية قد تضعه بعده (‎#/research?case=x‎) — نقرأ الموضعين.
// ولا يُحذف المعامل من قبل «#» إلا يدوياً: wouter لا يمسّ search حين يكون الهدف بلا «?» فيبقى عالقاً.

export function queryParam(name: string): string | null {
  const fromHash = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get(name)
  return fromHash ?? new URLSearchParams(window.location.search).get(name)
}

/** يزيل المعامل من الموضعين دون تنقّل — حتى لا يعيده التحديث ولا يعلق بصفحة أخرى */
export function clearQueryParam(name: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete(name)
  const [path, q] = url.hash.split('?')
  if (q !== undefined) {
    const hp = new URLSearchParams(q)
    hp.delete(name)
    url.hash = hp.toString() ? `${path}?${hp}` : path
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url.href)
}
