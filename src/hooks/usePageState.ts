import { useState } from 'react'

// حالة صفحة تدوم خلال الجلسة (sessionStorage): البحث والفلاتر والتبويب المفتوح
// لا تضيع عند فتح سجلّ والرجوع للقائمة. تُمسح تلقائياً بإغلاق التبويب/التطبيق.
export function usePageState<T>(key: string, initial: T) {
  const storageKey = 'ps:' + key
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      return raw == null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = (next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const v = next instanceof Function ? next(prev) : next
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(v))
      } catch {
        /* تخزين ممتلئ/معطّل — تكفي الحالة في الذاكرة */
      }
      return v
    })
  }
  return [value, set] as const
}
