import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { Ruling, RulingInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function useCaseRulings(caseId: string) {
  return useQuery({
    queryKey: ['case_rulings', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<Ruling[]> => {
      const { data, error } = await supabase
        .from('rulings')
        .select('*')
        .eq('case_id', caseId)
        .order('ruling_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Ruling[]
    },
  })
}

export function useAddRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RulingInput): Promise<void> => {
      const { error } = await supabase.from('rulings').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تمت إضافة الحكم' })
    },
    onError: errToast('تعذّرت إضافة الحكم'),
  })
}

export function useUpdateRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<RulingInput>
    }): Promise<void> => {
      const { error } = await supabase.from('rulings').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تم تحديث الحكم' })
    },
    onError: errToast('تعذّر تحديث الحكم'),
  })
}

export function useDeleteRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('rulings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تم حذف الحكم' })
    },
    onError: errToast('تعذّر حذف الحكم'),
  })
}

export function useDropRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dropDate,
      dropReason,
      dropDocumentUrl,
      droppedByName,
    }: {
      id: string
      dropDate: string
      dropReason: string
      dropDocumentUrl?: string | null
      droppedByName: string | null
    }): Promise<void> => {
      const { error } = await supabase
        .from('rulings')
        .update({
          is_dropped: true,
          drop_date: dropDate,
          drop_reason: dropReason,
          drop_document_url: dropDocumentUrl ?? null,
          dropped_by_name: droppedByName,
          drop_uploaded_at: dropDocumentUrl ? new Date().toISOString() : null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تم إسقاط الحكم' })
    },
    onError: errToast('تعذّر إسقاط الحكم'),
  })
}

export function useUndropRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('rulings')
        .update({
          is_dropped: false,
          drop_date: null,
          drop_reason: null,
          drop_document_url: null,
          dropped_by_name: null,
          drop_uploaded_at: null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تم إلغاء إسقاط الحكم' })
    },
    onError: errToast('تعذّر إلغاء الإسقاط'),
  })
}
