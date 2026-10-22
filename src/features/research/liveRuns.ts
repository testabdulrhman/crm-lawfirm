// إجابات «الباحث» الجارية — خارج الصفحة (2026-10-17: «كتبت للباحث وطلعت من الصفحة ورجعت حصلته متوقف»،
// و«يرفض ينتقل لمحادثة أخرى»). كان البث في حالة الصفحة نفسها: يضيع عرضه بمغادرتها، ويمنع التنقّل حتى ينتهي.
// الآن كل سؤال «تشغيلة» في مخزن عام: تكمل وأنت في صفحة أخرى أو محادثة أخرى، وتعود فتجدها حيث وصلت.
// والخادم بدوره يكمل ويحفظ ولو انقطع المتصفح كلياً (تحديث/إغلاق) — فتلتقطها الصفحة من القاعدة.
import { create } from 'zustand'
import type { QueryClient } from '@tanstack/react-query'

import { askResearch, postResearchNote } from '@/hooks/useResearch'
import { supabase } from '@/lib/supabase'
import { errMessage } from '@/lib/errors'

/** ملاحظة كتبها الموظف والباحث يعمل — تُرسل فوراً، ويأخذ بها قبل أن يرسل إجابته */
export interface RunNote {
  key: string
  /** رقمها في المحادثة بعد حفظها؛ null = لم تُرسل بعد (المحادثة الجديدة لم يُعرف رقمها) */
  id: string | null
  text: string
  /** قرأها الباحث */
  seen: boolean
  failed?: boolean
}

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
  /** ضُغط «إيقاف» — ننتظر الخادم يتوقف ويحفظ ما كتبه */
  stopping?: boolean
  notes: RunNote[]
  /** تشغيلة تُجيب ملاحظات وصلت بعد حفظ الإجابة السابقة — سؤالها هو الملاحظات نفسها في المحادثة */
  reuse?: boolean
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

export function startRun(
  qc: QueryClient,
  params: { chatId: string | null; message: string; caseId: string | null; reuseIds?: string[] }
) {
  const key = crypto.randomUUID()
  const { patch, drop } = useResearchRuns.getState()
  // سؤال جديد في المحادثة نفسها يطوي خطأ ما قبله
  useResearchRuns.setState((s) => ({
    runs: {
      ...Object.fromEntries(Object.entries(s.runs).filter(([, r]) => !(r.error && params.chatId && r.chatId === params.chatId))),
      [key]: {
        key, chatId: params.chatId, fromNew: !params.chatId, adopted: false,
        question: params.message, text: '', status: 'يبدأ', error: null,
        notes: [], reuse: !!params.reuseIds?.length,
      },
    },
  }))
  const ctrl = new AbortController()
  controllers.set(key, ctrl)
  void (async () => {
    try {
      const r = await askResearch(
        { ...params, runId: key },
        {
          onMeta: (id) => {
            patch(key, { chatId: id })
            // ملاحظات كُتبت قبل أن يُعرف رقم المحادثة الجديدة
            for (const n of useResearchRuns.getState().runs[key]?.notes ?? []) if (!n.id && !n.failed) void sendNote(qc, key, n.key)
            // ضُغط «إيقاف» قبل أن يُعرف رقم المحادثة
            if (useResearchRuns.getState().runs[key]?.stopping) void requestStop(id, key)
            void qc.invalidateQueries({ queryKey: ['research', 'chats'] })
          },
          onStatus: (st) => patch(key, (run) => ({ status: run.stopping ? 'يوقف' : st })),
          onDelta: (d) => patch(key, (run) => ({ text: run.text + d, status: run.stopping ? 'يوقف' : null })),
          onReset: (t) => patch(key, { text: t, status: 'يعيد الكتابة بملاحظاتك' }),
          onNotes: (ids) =>
            patch(key, (run) => ({ notes: run.notes.map((n) => (n.id && ids.includes(n.id) ? { ...n, seen: true } : n)) })),
        },
        ctrl.signal
      )
      // ملاحظات وصلت بعد آخر فحص قبل الحفظ ⇒ تُجاب الآن في تشغيلة تالية
      const done = new Set(r.notes)
      const left = (useResearchRuns.getState().runs[key]?.notes ?? []).filter((n) => n.id && !n.seen && !done.has(n.id)).map((n) => n.id!)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['research', 'messages', r.chatId] }),
        qc.invalidateQueries({ queryKey: ['research', 'chats'] }),
      ])
      drop(key)
      if (left.length) startRun(qc, { chatId: r.chatId, message: '', caseId: null, reuseIds: left })
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

/** ملاحظة للتشغيلة الجارية — تظهر تحت السؤال فوراً وتُرسل للخادم */
export function addNote(qc: QueryClient, key: string, text: string) {
  const noteKey = crypto.randomUUID()
  useResearchRuns.getState().patch(key, (run) => ({ notes: [...run.notes, { key: noteKey, id: null, text, seen: false }] }))
  if (useResearchRuns.getState().runs[key]?.chatId) void sendNote(qc, key, noteKey)
}

async function sendNote(qc: QueryClient, key: string, noteKey: string) {
  const run = useResearchRuns.getState().runs[key]
  const note = run?.notes.find((n) => n.key === noteKey)
  if (!run?.chatId || !note) return
  const chatId = run.chatId
  try {
    const id = await postResearchNote(chatId, note.text)
    if (useResearchRuns.getState().runs[key]) {
      useResearchRuns.getState().patch(key, (r) => ({ notes: r.notes.map((n) => (n.key === noteKey ? { ...n, id } : n)) }))
      return
    }
    // انتهت التشغيلة قبل أن تُحفظ الملاحظة: تلتقطها تشغيلة جارية في المحادثة، وإلا تُجاب في تشغيلة جديدة
    const other = Object.values(useResearchRuns.getState().runs).find((r) => r.chatId === chatId && !r.error)
    if (other) {
      useResearchRuns.getState().patch(other.key, (r) => ({ notes: [...r.notes, { key: noteKey, id, text: note.text, seen: false }] }))
    } else {
      startRun(qc, { chatId, message: '', caseId: null, reuseIds: [id] })
    }
  } catch {
    useResearchRuns.getState().patch(key, (r) => ({ notes: r.notes.map((n) => (n.key === noteKey ? { ...n, failed: true } : n)) }))
  }
}

async function requestStop(chatId: string, key: string) {
  const { error } = await supabase.from('research_chats').update({ stop_run: key }).eq('id', chatId)
  if (error) controllers.get(key)?.abort() // تعذّر إبلاغ الخادم: نقطع العرض على الأقل
}

/**
 * «إيقاف» يوقف الخادم نفسه (طلب المدير 2026-10-17): نكتب رقم التشغيلة في research_chats.stop_run،
 * فيقطع الخادم البث ويحفظ ما كتبه مع «أُوقفت الإجابة بطلبك» ويُرسل done — فيُغلق البث كالمعتاد.
 * وإن لم يستجب خلال ١٢ ثانية نقطع العرض هنا.
 */
export function stopRun(key: string) {
  const run = useResearchRuns.getState().runs[key]
  if (!run || run.stopping) return
  useResearchRuns.getState().patch(key, { stopping: true, status: 'يوقف' })
  if (run.chatId) void requestStop(run.chatId, key)
  setTimeout(() => controllers.get(key)?.abort(), 12_000)
}

/** تشغيلات «محادثة جديدة» لم يُتبنَّ رقمها — تُعلَّم حين ينتقل الموظف لغيرها */
export function releaseNewRuns() {
  useResearchRuns.setState((s) => ({
    runs: Object.fromEntries(Object.entries(s.runs).map(([k, r]) => [k, r.fromNew ? { ...r, adopted: true } : r])),
  }))
}
