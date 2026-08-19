import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { todayISO } from '@/lib/format'
import type { DashboardOverview } from '@/types/db'

export type DashboardScope = 'all' | 'mine'

// نظرة لوحة التحكم حسب النطاق: 'mine' (متطلباتي) أو 'all' (المكتب).
export function useDashboardOverview(scope: DashboardScope = 'all') {
  return useQuery({
    queryKey: ['dashboard_overview', scope],
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardOverview> => {
      const { data, error } = await supabase.rpc('dashboard_overview', {
        p_scope: scope,
      })
      if (error) throw error
      return data as DashboardOverview
    },
  })
}

// إكمال مهمة من اللوحة — يُبطل كل نطاقات اللوحة + قوائم المهام.
export function useCompleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'done', done_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => toast({ variant: 'success', title: 'تم إنجاز المهمة' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['dashboard_overview'] })
      qc.invalidateQueries({ queryKey: ['my_tasks'] })
      qc.invalidateQueries({ queryKey: ['my_tasks_stats'] })
    },
    onError: () =>
      toast({ variant: 'destructive', title: 'تعذّر إكمال المهمة' }),
  })
}

/* ===================== بانتظار اعتمادك ===================== */

export interface PendingApprovals {
  /** مهام رُفعت للاعتماد وأنا المُراجِع */
  tasks: number
  /** خطابات صادرة بانتظار اعتماد المدير */
  letters: number
  total: number
}

/**
 * ما ينتظر قرارك أنت — لا ما ينتظر قرار غيرك.
 *
 * المصدران مستقلان لأنّ دورتَي الاعتماد مختلفتان:
 *  • المهام: `submitted_at` مملوء و`approved_at` فارغ و`review_by` = أنا
 *  • الصادر: `outgoing_approvals.status = 'pending'` (يعتمده المدير)
 *
 * لا يُحتسب الصادر لغير المدير، فهو لا يملك اعتماده أصلاً.
 */
export function usePendingApprovals(teamMemberId?: string | null, isDirector = false) {
  return useQuery({
    queryKey: ['pending_approvals', teamMemberId ?? null, isDirector],
    enabled: !!teamMemberId,
    staleTime: 60_000,
    queryFn: async (): Promise<PendingApprovals> => {
      const tasksQ = supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .is('approved_at', null)
        .not('submitted_at', 'is', null)
        .eq('review_by', teamMemberId!)

      const lettersQ = isDirector
        ? supabase
            .from('outgoing_approvals')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
        : null

      const [t, l] = await Promise.all([tasksQ, lettersQ ?? Promise.resolve(null)])
      if (t.error) throw t.error
      if (l?.error) throw l.error

      const tasks = t.count ?? 0
      const letters = l?.count ?? 0
      return { tasks, letters, total: tasks + letters }
    },
  })
}

/* ===================== جدول اليوم ===================== */

export type AgendaKind = 'session' | 'appointment' | 'task'

export interface AgendaItem {
  id: string
  kind: AgendaKind
  /** HH:MM أو null لِما ليس له وقت محدّد */
  time: string | null
  title: string
  subtitle: string | null
  /** وجهة الفتح عند النقر */
  href: string
}

/**
 * كل ما يخصّ **اليوم** فقط: جلسات ومواعيد ومهام مستحقة، مدموجة ومرتّبة بالوقت.
 *
 * لماذا استعلام مستقل ولا نشتقّه من dashboard_overview؟ لأن تلك الدالة تقتطع
 * القوائم (٨ جلسات، ٨ مهام، ٥ مواعيد) وترتّب المهام بالأولوية لا بالتاريخ —
 * فقد تسقط مهمة مستحقة اليوم خارج الثمانية إن كثُر المتأخّر. جدول اليوم يجب
 * أن يكون كاملاً وإلا فقد معناه.
 */
export function useTodayAgenda(scope: DashboardScope, teamMemberId?: string | null) {
  const today = todayISO()
  const mine = scope === 'mine'

  return useQuery({
    queryKey: ['today_agenda', scope, teamMemberId ?? null, today],
    enabled: !mine || !!teamMemberId,
    staleTime: 60_000,
    queryFn: async (): Promise<AgendaItem[]> => {
      // الجلسات: في وضع «لوحتي» نقتصر على قضايا المستخدم (join إلزامي)
      let sessionsQ = supabase
        .from('sessions')
        .select('id, case_id, title, session_time, court, cases!inner(title, assignee_id)')
        .eq('session_date', today)
      if (mine) sessionsQ = sessionsQ.eq('cases.assignee_id', teamMemberId!)

      let tasksQ = supabase
        .from('tasks')
        .select('id, title, case_id, cases(title)')
        .eq('status', 'todo')
        .eq('due_date', today)
        .is('deleted_at', null)
      if (mine) tasksQ = tasksQ.eq('assignee_id', teamMemberId!)

      // المواعيد تخصّ المكتب كله في الوضعين — الاستقبال يهم الجميع
      const apptQ = supabase
        .from('appointments')
        .select('id, client_name, appointment_time, meeting_method, status')
        .eq('appointment_date', today)
        .neq('status', 'cancelled')

      const [se, tk, ap] = await Promise.all([sessionsQ, tasksQ, apptQ])
      if (se.error) throw se.error
      if (tk.error) throw tk.error
      if (ap.error) throw ap.error

      const items: AgendaItem[] = [
        ...(se.data ?? []).map((r: any) => ({
          id: `s-${r.id}`,
          kind: 'session' as const,
          time: r.session_time ? String(r.session_time).slice(0, 5) : null,
          title: r.cases?.title || r.title || 'جلسة',
          subtitle: r.court || null,
          href: r.case_id ? `/cases/${r.case_id}` : '/sessions',
        })),
        ...(ap.data ?? []).map((r: any) => ({
          id: `a-${r.id}`,
          kind: 'appointment' as const,
          time: r.appointment_time ? String(r.appointment_time).slice(0, 5) : null,
          title: r.client_name || 'موعد',
          subtitle:
            r.meeting_method === 'remote'
              ? 'اجتماع عن بُعد'
              : r.meeting_method === 'onsite'
                ? 'موعد حضوري'
                : null, // الصفوف القديمة بلا طريقة اجتماع
          href: '/appointments',
        })),
        ...(tk.data ?? []).map((r: any) => ({
          id: `t-${r.id}`,
          kind: 'task' as const,
          time: null, // المهام مستحقّة اليوم بلا ساعة محدّدة
          title: r.title || 'مهمة',
          subtitle: r.cases?.title || null,
          href: `/tasks/${r.id}`,
        })),
      ]

      // بالوقت تصاعدياً، وما لا وقت له في الآخر
      return items.sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time)
        if (a.time) return -1
        if (b.time) return 1
        return 0
      })
    },
  })
}
