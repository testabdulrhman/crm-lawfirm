// بيانات اللوحة الجديدة: «المطلوب مني» و«جدولي». استعلامات مستقلة كاملة، لأن
// dashboard_overview تقتطع القوائم ولا تستبعد المحذوف ولا تفصل المهل عن المهام.
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import type { DashboardScope } from '@/hooks/useDashboard'
import type { SessionNeedingClosure } from '@/types/db'
import {
  KIND_META,
  addDaysISO,
  kindOfDerived,
  type ActionItem,
  type ScheduleItem,
} from './queue'

const who = (m: { short_name?: string | null; name?: string | null } | null | undefined) =>
  m?.short_name || m?.name || null

/**
 * كل ما ينتظر تحرّكاً، من أربعة مصادر:
 *  • المهام المفتوحة غير المحذوفة — ومنها المهل المشتقة (اعتراض/تحضير/وكالة)
 *  • مهام رُفعت لاعتمادي (review_by = أنا) — تظهر اعتماداً لا مهمة
 *  • خطابات صادرة تنتظر الختم — للمدير وحده
 *  • جلسات فات موعدها ولم تُغلق
 * «لوحتي» = ما أُسند إليّ، و«لوحة المكتب» = الكل؛ وRLS يحكم الحالتين.
 */
export function useActionQueue(
  scope: DashboardScope,
  memberId: string | null | undefined,
  isDirector: boolean
) {
  const mine = scope === 'mine'
  return useQuery({
    queryKey: ['action_queue', scope, memberId ?? null, isDirector],
    enabled: !!memberId,
    staleTime: 60_000,
    queryFn: async (): Promise<ActionItem[]> => {
      let tasksQ = supabase
        .from('tasks')
        .select(
          'id, title, due_date, is_urgent, derived_key, deadline_confirmed_at, submitted_at, approved_at, ' +
            'case:cases(title), assignee:team_members!tasks_assignee_id_fkey(short_name, name)'
        )
        .eq('status', 'todo')
        .is('deleted_at', null)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(500)
      if (mine) tasksQ = tasksQ.eq('assignee_id', memberId!)

      const reviewQ = supabase
        .from('tasks')
        .select(
          'id, title, case:cases(title), assignee:team_members!tasks_assignee_id_fkey(short_name, name)'
        )
        .is('deleted_at', null)
        .is('approved_at', null)
        .not('submitted_at', 'is', null)
        .eq('review_by', memberId!)

      const lettersQ = isDirector
        ? supabase
            .from('outgoing_letters')
            .select('id, subject, recipient, approval:outgoing_approvals!inner(status)')
            .eq('approval.status', 'pending')
            .is('deleted_at', null)
        : null

      const closureQ = supabase.rpc('sessions_need_closure', { p_scope: scope })

      const [tk, rv, lt, cl] = await Promise.all([
        tasksQ,
        reviewQ,
        lettersQ ?? Promise.resolve(null),
        closureQ,
      ])
      if (tk.error) throw tk.error
      if (rv.error) throw rv.error
      if (lt?.error) throw lt.error
      if (cl.error) throw cl.error

      const reviewing = new Set<string>(((rv.data ?? []) as any[]).map((r) => r.id))
      const items: ActionItem[] = []

      for (const r of (tk.data ?? []) as any[]) {
        if (reviewing.has(r.id)) continue // يظهر اعتماداً لا مهمة — مرة واحدة
        const kind = kindOfDerived(r.derived_key)
        items.push({
          key: `t-${r.id}`,
          kind,
          taskId: r.id,
          title: r.title || KIND_META[kind].label,
          matter: r.case?.title ?? null,
          assignee: who(r.assignee),
          due: r.due_date ?? null,
          urgent: !!r.is_urgent,
          needsSecondEye: kind === 'objection' && !r.deadline_confirmed_at,
          awaitingReview: !!r.submitted_at && !r.approved_at,
          href: `/tasks/${r.id}`,
        })
      }

      for (const r of (rv.data ?? []) as any[]) {
        items.push({
          key: `r-${r.id}`,
          kind: 'approval',
          taskId: r.id,
          title: r.title || 'مهمة مرفوعة للاعتماد',
          matter: r.case?.title ?? null,
          assignee: who(r.assignee),
          due: null,
          urgent: false,
          needsSecondEye: false,
          awaitingReview: false,
          href: `/tasks/${r.id}`,
        })
      }

      for (const r of (lt?.data ?? []) as any[]) {
        items.push({
          key: `l-${r.id}`,
          kind: 'letter',
          title: r.subject || 'خطاب صادر',
          matter: r.recipient ? `إلى ${r.recipient}` : null,
          assignee: null,
          due: null,
          urgent: false,
          needsSecondEye: false,
          awaitingReview: false,
          href: `/outgoing/${r.id}`,
        })
      }

      for (const s of (cl.data ?? []) as SessionNeedingClosure[]) {
        items.push({
          key: `c-${s.id}`,
          kind: 'session_close',
          title: s.title || 'جلسة',
          matter: s.case_title,
          assignee: null,
          due: s.session_date,
          daysAgo: s.days_ago,
          urgent: false,
          needsSecondEye: false,
          awaitingReview: false,
          href: `/cases/${s.case_id}`,
        })
      }

      return items
    },
  })
}

/**
 * الجلسات والمواعيد من اليوم إلى أسبوعين في خط زمني واحد — بدل «جدول اليوم» و«القادم».
 * الجلسات في «لوحتي» مقصورة على ملفاتي؛ والمواعيد تخصّ المكتب كله في الحالتين
 * (الاستقبال يهمّ الجميع — القرار القائم في جدول اليوم).
 */
export function useSchedule(
  scope: DashboardScope,
  memberId: string | null | undefined,
  days = 14
) {
  const today = todayISO()
  const mine = scope === 'mine'
  return useQuery({
    queryKey: ['schedule', scope, memberId ?? null, today, days],
    enabled: !mine || !!memberId,
    staleTime: 60_000,
    queryFn: async (): Promise<ScheduleItem[]> => {
      const until = addDaysISO(today, days)

      let sessionsQ = supabase
        .from('sessions')
        .select('id, case_id, title, session_date, session_time, court, cases!inner(title, assignee_id)')
        .gte('session_date', today)
        .lte('session_date', until)
        .order('session_date', { ascending: true })
        .limit(100)
      if (mine) sessionsQ = sessionsQ.eq('cases.assignee_id', memberId!)

      const apptQ = supabase
        .from('appointments')
        .select('id, client_name, appointment_date, appointment_time, meeting_method, status')
        .gte('appointment_date', today)
        .lte('appointment_date', until)
        .neq('status', 'cancelled')
        .order('appointment_date', { ascending: true })
        .limit(100)

      const [se, ap] = await Promise.all([sessionsQ, apptQ])
      if (se.error) throw se.error
      if (ap.error) throw ap.error

      const items: ScheduleItem[] = [
        ...((se.data ?? []) as any[]).map((r) => ({
          key: `s-${r.id}`,
          kind: 'session' as const,
          date: r.session_date as string,
          time: r.session_time ? String(r.session_time).slice(0, 5) : null,
          title: r.cases?.title || r.title || 'جلسة',
          subtitle: r.court || (r.cases?.title && r.title ? r.title : null),
          href: r.case_id ? `/cases/${r.case_id}` : '/sessions',
        })),
        ...((ap.data ?? []) as any[]).map((r) => ({
          key: `a-${r.id}`,
          kind: 'appointment' as const,
          date: r.appointment_date as string,
          time: r.appointment_time ? String(r.appointment_time).slice(0, 5) : null,
          title: r.client_name || 'موعد',
          subtitle:
            r.meeting_method === 'remote'
              ? 'عن بُعد'
              : r.meeting_method === 'onsite'
                ? 'حضوري'
                : null,
          href: `/appointments/${r.id}`,
        })),
      ]

      return items.sort((a, b) =>
        `${a.date} ${a.time ?? '99'}`.localeCompare(`${b.date} ${b.time ?? '99'}`)
      )
    },
  })
}
