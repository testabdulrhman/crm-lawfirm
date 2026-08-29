import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { useAuth } from '@/stores/auth'

// المهل النظامية — المهام المشتقّة تلقائياً من الأحكام والجلسات والوكالات.
// تُفصل عن بقية المهام لأن فوات مهلة الاعتراض **سقوط حق لا تأخير**،
// والوثيقة المرجعية تضع لها المؤشر الوحيد بلا هامش تسامح: المفوَّت = صفر.

export interface DeadlinesOverview {
  overdue: number
  due_3: number
  due_14: number
  unassigned: number
  /** مهل أحكام لم يعتمد احتسابها شخص ثانٍ */
  unconfirmed: number
}

export function useDeadlinesOverview() {
  return useQuery({
    queryKey: ['deadlines_overview'],
    staleTime: 60_000,
    queryFn: async (): Promise<DeadlinesOverview> => {
      const { data, error } = await supabase.rpc('deadlines_overview')
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      return (
        row ?? { overdue: 0, due_3: 0, due_14: 0, unassigned: 0, unconfirmed: 0 }
      )
    },
  })
}

export interface DeadlineRow {
  id: string
  title: string | null
  due_date: string | null
  case_id: string | null
  case_title: string | null
  assignee_name: string | null
  source: 'ruling' | 'session' | 'poa' | 'other'
  confirmed: boolean
}

const sourceOf = (key: string | null): DeadlineRow['source'] => {
  const s = (key ?? '').split(':')[0]
  return s === 'ruling' || s === 'session' || s === 'poa' ? s : 'other'
}

export const DEADLINE_SOURCE_LABEL: Record<DeadlineRow['source'], string> = {
  ruling: 'مهلة اعتراض',
  session: 'تحضير جلسة',
  poa: 'تجديد وكالة',
  other: 'مهلة',
}

/** المهل المفتوحة مرتّبة بالأقرب استحقاقاً — المتأخّرة أولاً */
export function useDeadlines(limit = 8) {
  return useQuery({
    queryKey: ['deadlines_list', limit],
    staleTime: 60_000,
    queryFn: async (): Promise<DeadlineRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          'id, title, due_date, case_id, derived_key, deadline_confirmed_at, ' +
            'case:cases(title), assignee:team_members!tasks_assignee_id_fkey(short_name, name)'
        )
        .not('derived_key', 'is', null)
        .not('due_date', 'is', null)
        .neq('status', 'done')
        .is('deleted_at', null)
        .order('due_date', { ascending: true })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        due_date: r.due_date,
        case_id: r.case_id,
        case_title: r.case?.title ?? null,
        assignee_name: r.assignee?.short_name ?? r.assignee?.name ?? null,
        source: sourceOf(r.derived_key),
        confirmed: !!r.deadline_confirmed_at,
      }))
    },
  })
}

/** الملكية المزدوجة: شخص يحسب المهلة وآخر يعتمد صحتها */
export function useConfirmDeadline() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!teamMember?.id) throw new Error('لم يُعرف المستخدم الحالي.')
      const { error } = await supabase
        .from('tasks')
        .update({
          deadline_confirmed_by: teamMember.id,
          deadline_confirmed_at: new Date().toISOString(),
        })
        .eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deadlines_overview'] })
      qc.invalidateQueries({ queryKey: ['deadlines_list'] })
      qc.invalidateQueries({ queryKey: ['task'] })
      toast({ title: 'اعتُمد احتساب المهلة' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر اعتماد المهلة',
        description: errMessage(e),
      }),
  })
}
