// إيماءات iOS داخل التطبيق: سحب من الحافة للرجوع، وسحب لأسفل للتحديث.
// كلاهما no-op على الويب — لا يتغيّر شيء في المتصفح.
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { isNative, tapFeedback } from '@/lib/push'

/**
 * سحب من حافة الشاشة للرجوع.
 * ⚠️ في واجهة عربية RTL تُعكس الإيماءة كما يفعل iOS: الرجوع **سحبٌ من الحافة
 *    اليمنى نحو اليسار** — عكس الإنجليزية. لا نستعمل الحافة اليسرى لأنها
 *    محجوزة لإيماءة نظام أخرى.
 */
export function useSwipeBack(): void {
  useEffect(() => {
    if (!isNative()) return

    const EDGE = 24 // بكسل من الحافة يبدأ منها السحب
    const MIN_DISTANCE = 70
    const MAX_OFF_AXIS = 45 // سحب مائل = تمرير لا رجوع

    let startX = 0
    let startY = 0
    let tracking = false

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      tracking = window.innerWidth - t.clientX <= EDGE
      startX = t.clientX
      startY = t.clientY
    }

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      const t = e.changedTouches[0]
      if (!t) return
      const dx = startX - t.clientX // موجب = نحو اليسار
      const dy = Math.abs(t.clientY - startY)
      if (dx >= MIN_DISTANCE && dy <= MAX_OFF_AXIS && window.history.length > 1) {
        void tapFeedback('light')
        window.history.back()
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [])
}

/**
 * سحب لأسفل للتحديث — يُطبَّق على حاوية التمرير الرئيسية.
 * يُرجع مقدار السحب لعرض المؤشّر، ويُبطل كل الاستعلامات عند الإفلات.
 */
export function usePullToRefresh(
  scrollRef: React.RefObject<HTMLElement | null>
): { pull: number; refreshing: boolean } {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!isNative() || !el) return

    const THRESHOLD = 70
    const MAX = 110

    const onStart = (e: TouchEvent) => {
      // لا يبدأ إلا والقائمة في أعلاها تماماً
      active.current = el.scrollTop <= 0
      startY.current = e.touches[0]?.clientY ?? 0
    }

    const onMove = (e: TouchEvent) => {
      if (!active.current || refreshing) return
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current
      if (dy <= 0) {
        setPull(0)
        return
      }
      // مقاومة تدريجية — يشبه إحساس iOS بدل السحب الحر
      setPull(Math.min(MAX, dy * 0.5))
    }

    const onEnd = async () => {
      if (!active.current) return
      active.current = false
      if (pull >= THRESHOLD && !refreshing) {
        setRefreshing(true)
        setPull(THRESHOLD)
        void tapFeedback('medium')
        try {
          await qc.invalidateQueries()
        } finally {
          setRefreshing(false)
          setPull(0)
        }
      } else {
        setPull(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [scrollRef, pull, refreshing, qc])

  return { pull, refreshing }
}
