// المواعيد والالتزامات (deadlines): التزامات العقود والقضايا ذات التاريخ المحدّد.
// الجدول قديم وكان فارغاً تماماً؛ وُسِّع ليقبل engagement_id ومصدر الصف.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

const KEY = 'deadlines'

export type DeadlineSource = 'manual' | 'ai_contract'

export interface Deadline {
  id: string
  case_id: string | null
  engagement_id: string | null
  title: string
  deadline_date: string
  type: string | null
  notes: string | null
  notify_days_before: number
  source: DeadlineSource
  done: boolean | null
  done_at: string | null
  created_at: string | null
}

export interface DeadlineInput {
  case_id?: string | null
  engagement_id?: string | null
  title: string
  deadline_date: string
  type?: string | null
  notes?: string | null
  notify_days_before?: number
  source?: DeadlineSource
  created_by?: string | null
}

const OBLIGATION_TYPES: Record<string, string> = {
  payment: 'دفعة',
  renewal: 'تجديد',
  notice: 'مهلة إشعار',
  delivery: 'تسليم',
  expiry: 'انتهاء سريان',
  other: 'أخرى',
}

export const obligationTypeLabel = (t: string | null) =>
  (t && OBLIGATION_TYPES[t]) || 'التزام'

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [KEY] })
}

/** التزامات عقد بعينه. */
export function useEngagementDeadlines(engagementId: string | null) {
  return useQuery({
    queryKey: [KEY, 'engagement', engagementId],
    enabled: !!engagementId,
    queryFn: async (): Promise<Deadline[]> => {
      const { data, error } = await supabase
        .from('deadlines')
        .select('*')
        .eq('engagement_id', engagementId)
        .is('deleted_at', null)
        .order('deadline_date')
      if (error) throw error
      return (data ?? []) as unknown as Deadline[]
    },
  })
}

/** إضافة عدة التزامات دفعة واحدة (نتيجة الاستخراج بعد إقرار الموظف). */
export function useCreateDeadlines() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: DeadlineInput[]): Promise<number> => {
      if (rows.length === 0) return 0
      const { error } = await supabase.from('deadlines').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: (n) => {
      invalidate(qc)
      toast({
        variant: 'success',
        title: n === 1 ? 'أُضيف الالتزام' : `أُضيف ${n} التزاماً`,
      })
    },
    onError: errToast('تعذّرت إضافة الالتزامات'),
  })
}

/** شطب/إلغاء شطب التزام. */
export function useToggleDeadline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      done,
    }: {
      id: string
      done: boolean
    }): Promise<void> => {
      const { error } = await supabase
        .from('deadlines')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidate(qc),
    onError: errToast('تعذّر تحديث الالتزام'),
  })
}

/** حذف ناعم — مسجَّل كبقية النظام. */
export function useDeleteDeadline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      deletedBy,
    }: {
      id: string
      deletedBy: string | null
    }): Promise<void> => {
      const { error } = await supabase
        .from('deadlines')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'حُذف الالتزام' })
    },
    onError: errToast('تعذّر حذف الالتزام'),
  })
}
