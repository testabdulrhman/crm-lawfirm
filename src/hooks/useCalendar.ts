import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { localISO } from '@/lib/format'
import type { DashboardScope } from '@/hooks/useDashboard'

export type CalKind = 'session' | 'appointment' | 'task' | 'poa'

export interface CalItem {
  id: string
  kind: CalKind
  /** YYYY-MM-DD — مفتاح التجميع في الشبكة */
  date: string
  /** HH:MM أو null لما ليس له ساعة (مهمة، انتهاء وكالة) */
  time: string | null
  title: string
  subtitle: string | null
  href: string
}

/** أول يوم يظهر في شبكة الشهر: الأحد السابق لبداية الشهر (أو نفسه) */
export function gridStart(anchor: Date): Date {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const d = new Date(first)
  d.setDate(first.getDate() - first.getDay()) // getDay: 0 = الأحد
  return d
}

/** ٤٢ خلية (٦ أسابيع) تغطي أي شهر مهما وقع بدايته */
export function gridDays(anchor: Date): Date[] {
  const start = gridStart(anchor)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/**
 * كل ما له تاريخ في نطاق معيّن، مدموجاً في قائمة واحدة.
 *
 * أربعة مصادر لأن حياة المكتب موزّعة عليها: جلسات المحاكم، مواعيد الموكّلين،
 * استحقاق المهام، وانتهاء الوكالات. الأخيرة تحديداً لا تُرى في أي شاشة
 * زمنية اليوم رغم أن فواتها يُعطّل التمثيل أمام المحكمة.
 *
 * النطاق «لوحتي» يقصر الجلسات على قضايا المستخدم والمهام على المُسندة إليه؛
 * المواعيد والوكالات تخصّ المكتب كله في الوضعين.
 */
export function useCalendarRange(
  from: Date,
  to: Date,
  scope: DashboardScope,
  teamMemberId?: string | null
) {
  const fromISO = localISO(from)
  const toISO = localISO(to)
  const mine = scope === 'mine'

  return useQuery({
    queryKey: ['calendar', fromISO, toISO, scope, teamMemberId ?? null],
    enabled: !mine || !!teamMemberId,
    staleTime: 60_000,
    queryFn: async (): Promise<CalItem[]> => {
      let sessionsQ = supabase
        .from('sessions')
        .select('id, case_id, title, session_date, session_time, court, cases!inner(title, assignee_id)')
        .gte('session_date', fromISO)
        .lte('session_date', toISO)
      if (mine) sessionsQ = sessionsQ.eq('cases.assignee_id', teamMemberId!)

      let tasksQ = supabase
        .from('tasks')
        .select('id, title, due_date, status, cases(title)')
        .eq('status', 'todo')
        .is('deleted_at', null)
        .gte('due_date', fromISO)
        .lte('due_date', toISO)
      if (mine) tasksQ = tasksQ.eq('assignee_id', teamMemberId!)

      const apptQ = supabase
        .from('appointments')
        .select('id, client_name, appointment_date, appointment_time, meeting_method, status')
        .neq('status', 'cancelled')
        .gte('appointment_date', fromISO)
        .lte('appointment_date', toISO)

      const poaQ = supabase
        .from('powers_of_attorney')
        .select('id, poa_number, client_name, expiry_date')
        .is('deleted_at', null)
        .eq('status', 'active')
        .gte('expiry_date', fromISO)
        .lte('expiry_date', toISO)

      const [se, tk, ap, poa] = await Promise.all([sessionsQ, tasksQ, apptQ, poaQ])
      if (se.error) throw se.error
      if (tk.error) throw tk.error
      if (ap.error) throw ap.error
      if (poa.error) throw poa.error

      const hhmm = (v: unknown) => (v ? String(v).slice(0, 5) : null)

      return [
        ...(se.data ?? []).map((r: any) => ({
          id: `s-${r.id}`,
          kind: 'session' as const,
          date: r.session_date,
          time: hhmm(r.session_time),
          title: r.cases?.title || r.title || 'جلسة',
          subtitle: r.court || null,
          href: r.case_id ? `/cases/${r.case_id}` : '/sessions',
        })),
        ...(ap.data ?? []).map((r: any) => ({
          id: `a-${r.id}`,
          kind: 'appointment' as const,
          date: r.appointment_date,
          time: hhmm(r.appointment_time),
          title: r.client_name || 'موعد',
          subtitle:
            r.meeting_method === 'remote'
              ? 'عن بُعد'
              : r.meeting_method === 'onsite'
                ? 'حضوري'
                : null,
          href: '/appointments',
        })),
        ...(tk.data ?? []).map((r: any) => ({
          id: `t-${r.id}`,
          kind: 'task' as const,
          date: r.due_date,
          time: null,
          title: r.title || 'مهمة',
          subtitle: r.cases?.title || null,
          href: `/tasks/${r.id}`,
        })),
        ...(poa.data ?? []).map((r: any) => ({
          id: `p-${r.id}`,
          kind: 'poa' as const,
          date: r.expiry_date,
          time: null,
          title: `انتهاء وكالة — ${r.client_name || 'موكّل'}`,
          subtitle: r.poa_number ? `وكالة ${r.poa_number}` : null,
          href: '/poa',
        })),
      ].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return 0
      })
    },
  })
}

/** تجميع بالتاريخ — الشبكة تقرأ خلية بمفتاح YYYY-MM-DD */
export function groupByDate(items: CalItem[]): Map<string, CalItem[]> {
  const m = new Map<string, CalItem[]>()
  for (const it of items) {
    const list = m.get(it.date)
    if (list) list.push(it)
    else m.set(it.date, [it])
  }
  return m
}
