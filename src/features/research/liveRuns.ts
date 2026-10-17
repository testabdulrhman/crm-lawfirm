// إجابات «الباحث» الجارية — خارج الصفحة (2026-10-17: «كتبت للباحث وطلعت من الصفحة ورجعت حصلته متوقف»،
// و«يرفض ينتقل لمحادثة أخرى»). كان البث في حالة الصفحة نفسها: يضيع عرضه بمغادرتها، ويمنع التنقّل حتى ينتهي.
// الآن كل سؤال «تشغيلة» في مخزن عام: تكمل وأنت في صفحة أخرى أو محادثة أخرى، وتعود فتجدها حيث وصلت.
// والخادم بدوره يكمل ويحفظ ولو انقطع المتصفح كلياً (تحديث/إغلاق) — فتلتقطها الصفحة من القاعدة.
import { create } from 'zustand'
import type { QueryClient } from '@tanstack/react-query'

import { askResearch } from '@/hooks/useResearch'
import { errMessage } from '@/lib/errors'

export interface Run {
  key: string
  /** يُعرف من أول حدث (meta) — قبله تكون محادثة جديدة لم تُنشأ */
  chatId: string | null
  /** بدأت من «محادثة جديدة»؛ adopted = انتقل الموظف عنها فلا تسحبه إليها حين يُعرف رقمها */
  fromNew: boolean
  adopted: boolean
  question: string
  text: string
  status: string | null
  error: string | null
}

interface State {
  runs: Record<string, Run>
  patch: (key: string, p: Partial<Run> | ((r: Run) => Partial<Run>)) => void
  drop: (key: string) => void
}

export const useResearchRuns = create<State>((set) => ({
  runs: {},
  patch: (key, p) =>
    set((s) => {
      const r = s.runs[key]
      if (!r) return s
      return { runs: { ...s.runs, [key]: { ...r, ...(typeof p === 'function' ? p(r) : p) } } }
    }),
  drop: (key) =>
    set((s) => {
      const { [key]: _, ...rest } = s.runs
      return { runs: rest }
    }),
}))

const controllers = new Map<string, AbortController>()

export function startRun(qc: QueryClient, params: { chatId: string | null; message: string; caseId: string | null }) {
  const key = crypto.randomUUID()
  const { patch, drop } = useResearchRuns.getState()
  // سؤال جديد في المحادثة نفسها يطوي خطأ ما قبله
  useResearchRuns.setState((s) => ({
    runs: {
      ...Object.fromEntries(Object.entries(s.runs).filter(([, r]) => !(r.error && params.chatId && r.chatId === params.chatId))),
      [key]: {
        key, chatId: params.chatId, fromNew: !params.chatId, adopted: false,
        question: params.message, text: '', status: 'يبدأ', error: null,
      },
    },
  }))
  const ctrl = new AbortController()
  controllers.set(key, ctrl)
  void (async () => {
    try {
      const r = await askResearch(
        params,
        {
          onMeta: (id) => {
            patch(key, { chatId: id })
            void qc.invalidateQueries({ queryKey: ['research', 'chats'] })
          },
          onStatus: (st) => patch(key, { status: st }),
          onDelta: (d) => patch(key, (run) => ({ text: run.text + d, status: null })),
        },
        ctrl.signal
      )
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['research', 'messages', r.chatId] }),
        qc.invalidateQueries({ queryKey: ['research', 'chats'] }),
      ])
      drop(key)
    } catch (e) {
      void qc.invalidateQueries({ queryKey: ['research'] })
      // انقطاع الشبكة (TypeError) ليس فشلاً: الخادم يكمل ويحفظ، والصفحة تلتقطها من القاعدة («يكمل الكتابة…»)
      if (e instanceof TypeError) {
        drop(key)
        return
      }
      const aborted = (e as Error).name === 'AbortError'
      // الإيقاف يقطع العرض هنا؛ والخادم قد يكملها ويحفظها فتظهر في المحادثة
      patch(key, { status: null, error: aborted ? 'أُوقف العرض' : (errMessage(e) ?? 'تعذّرت الإجابة') })
    } finally {
      controllers.delete(key)
    }
  })()
  return key
}

export function stopRun(key: string) {
  controllers.get(key)?.abort()
}

/** تشغيلات «محادثة جديدة» لم يُتبنَّ رقمها — تُعلَّم حين ينتقل الموظف لغيرها */
export function releaseNewRuns() {
  useResearchRuns.setState((s) => ({
    runs: Object.fromEntries(Object.entries(s.runs).map(([k, r]) => [k, r.fromNew ? { ...r, adopted: true } : r])),
  }))
}
