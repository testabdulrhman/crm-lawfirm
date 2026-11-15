// «نظّف ملفاتك» — المراجعة الشاملة 2026-11-15 (الدفعة الثانية، اعتمدها المدير):
// جلسات مضى موعدها بلا إغلاق، وقضايا جارية بلا جلسة قادمة ولا مهمة مفتوحة. الدالتان في القاعدة
// (cleanup_items / cleanup_summary) تعملان بصلاحيات المتصل: الموظف ملفاته، والمدير الكل.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { localISO } from '@/lib/format'
import { useAuth } from '@/stores/auth'

export interface CleanupSession {
  id: string
  case_id: string
  title: string | null
  session_number: number | null
  session_date: string
  court: string | null
  days_ago: number
  case_title: string | null
  office_num: string | null
  kind: string | null
}

export interface CleanupCase {
  id: string
  title: string | null
  office_num: string | null
  kind: string | null
  court: string | null
  last_session: string | null
  last_ruling: string | null
  last_activity: string | null
}

export interface CleanupItems {
  sessions: CleanupSession[]
  cases: CleanupCase[]
}

export interface CleanupSummaryRow {
  member_id: string | null
  member_name: string | null
  sessions_n: number
  cases_n: number
}

/** null = ملفاتي؛ 'none' = بلا مسؤول (للمدير)؛ أو معرّف موظف (للمدير) */
export type CleanupTarget = string | null

export const CLEANUP_KEY = ['cleanup'] as const

export function useCleanupItems(target: CleanupTarget = null) {
  const { teamMember } = useAuth()
  return useQuery({
    queryKey: [...CLEANUP_KEY, 'items', target ?? 'me', teamMember?.id ?? null],
    enabled: !!teamMember,
    staleTime: 60_000,
    queryFn: async (): Promise<CleanupItems> => {
      const args =
        target === 'none'
          ? { p_unassigned: true }
          : target
            ? { p_member: target }
            : {}
      const { data, error } = await supabase.rpc('cleanup_items', args)
      if (error) throw error
      const d = (data ?? {}) as Partial<CleanupItems>
      return { sessions: d.sessions ?? [], cases: d.cases ?? [] }
    },
  })
}

export function useCleanupSummary(enabled: boolean) {
  return useQuery({
    queryKey: [...CLEANUP_KEY, 'summary'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CleanupSummaryRow[]> => {
      const { data, error } = await supabase.rpc('cleanup_summary')
      if (error) throw error
      return (data ?? []) as CleanupSummaryRow[]
    },
  })
}

/**
 * «بانتظار الحكم»: مهمة «استلام الحكم» بعد ٣٠ يوماً لمسؤول القضية — نفس ما يفعله إغلاق الجلسة
 * باختيار «انتظار الحكم»؛ فالقضية تصير لها خطوة تالية ولا تُعدّ منسيّة، والمهمة هي التذكير.
 */
export function useMarkAwaitingRuling() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({ caseId }: { caseId: string }) => {
      const { data: kase, error: cErr } = await supabase
        .from('cases')
        .select('assignee_id')
        .eq('id', caseId)
        .maybeSingle()
      if (cErr) throw cErr
      const due = localISO(new Date(Date.now() + 30 * 86_400_000))
      const { error } = await supabase.from('tasks').insert({
        case_id: caseId,
        title: 'استلام الحكم',
        task_type: 'ruling',
        status: 'todo',
        priority: 'med',
        due_date: due,
        assignee_id: kase?.assignee_id ?? teamMember?.id ?? null,
        created_by: teamMember?.id ?? null,
        description: 'القضية محجوزة للحكم — سُجّلت من «نظّف ملفاتك». إن صدر الحكم أضِفه في تبويب الأحكام وأنجز المهمة.',
      })
      if (error) throw error
      return due
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: CLEANUP_KEY })
      qc.invalidateQueries({ queryKey: ['tasks-board'] })
      qc.invalidateQueries({ queryKey: ['my-open-tasks'] })
      qc.invalidateQueries({ queryKey: ['action_queue'] })
      qc.invalidateQueries({ queryKey: ['case_tasks', vars.caseId] })
    },
  })
}
