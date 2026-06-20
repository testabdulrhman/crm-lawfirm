import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { CaseParty, CasePartyInput } from '@/types/db'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

export function useCaseParties(caseId: string) {
  return useQuery({
    queryKey: ['case_parties', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<CaseParty[]> => {
      const { data, error } = await supabase
        .from('case_parties')
        .select('*')
        .eq('case_id', caseId)
        .order('party_side', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as CaseParty[]
    },
  })
}

export function useAddParty(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CasePartyInput): Promise<void> => {
      const { error } = await supabase.from('case_parties').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_parties', caseId] })
      toast({ variant: 'success', title: 'تمت إضافة الطرف' })
    },
    onError: errToast('تعذّرت إضافة الطرف'),
  })
}

export function useUpdateParty(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<CasePartyInput>
    }): Promise<void> => {
      // لا يوجد عمود updated_at في case_parties
      const { error } = await supabase
        .from('case_parties')
        .update(input)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_parties', caseId] })
      toast({ variant: 'success', title: 'تم تحديث الطرف' })
    },
    onError: errToast('تعذّر تحديث الطرف'),
  })
}

export function useDeleteParty(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('case_parties')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_parties', caseId] })
      toast({ variant: 'success', title: 'تم حذف الطرف' })
    },
    onError: errToast('تعذّر حذف الطرف'),
  })
}
