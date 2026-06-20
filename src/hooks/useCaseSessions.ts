import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { CaseSession, CaseSessionInput } from '@/types/db'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

function invalidate(qc: ReturnType<typeof useQueryClient>, caseId: string) {
  qc.invalidateQueries({ queryKey: ['case_sessions', caseId] })
  // hearing_date في بطاقة القضية قد تتأثّر
  qc.invalidateQueries({ queryKey: ['cases'] })
  qc.invalidateQueries({ queryKey: ['case', caseId] })
}

export function useCaseSessions(caseId: string) {
  return useQuery({
    queryKey: ['case_sessions', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<CaseSession[]> => {
      // public.sessions فقط (عميل supabase-js يستهدف public افتراضياً)
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('case_id', caseId)
        .order('session_date', { ascending: true })
        .order('session_time', { ascending: true })
      if (error) throw error
      return (data ?? []) as CaseSession[]
    },
  })
}

export function useAddSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CaseSessionInput): Promise<void> => {
      // الكتابة الجديدة تستخدم القيم العربية للحالة
      const { error } = await supabase
        .from('sessions')
        .insert({ status: 'قادمة', ...input })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تمت إضافة الجلسة' })
    },
    onError: errToast('تعذّرت إضافة الجلسة'),
  })
}

export function useUpdateSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<CaseSessionInput>
    }): Promise<void> => {
      const { error } = await supabase.from('sessions').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تم تحديث الجلسة' })
    },
    onError: errToast('تعذّر تحديث الجلسة'),
  })
}

// تسجيل نتيجة: الحالة «منعقدة» + outcome
export function useSetSessionOutcome(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      outcome,
    }: {
      id: string
      outcome: string
    }): Promise<void> => {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'منعقدة', outcome })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تم تسجيل نتيجة الجلسة' })
    },
    onError: errToast('تعذّر تسجيل النتيجة'),
  })
}

export function useDeleteSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تم حذف الجلسة' })
    },
    onError: errToast('تعذّر حذف الجلسة'),
  })
}
