import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { OutgoingLetter, OutgoingLetterInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

const SELECT =
  '*, case:cases(id,title,office_num,contact:contacts(name,phone)), approval:outgoing_approvals(*, requester:team_members!outgoing_approvals_requested_by_fkey(id,name,phone), approver:team_members!outgoing_approvals_approved_by_fkey(id,name))'

// PostgREST يرجع الاعتماد كمصفوفة (علاقة 1-1 عملياً بقيد unique) — نسطّحه
function normalize(row: Record<string, unknown>): OutgoingLetter {
  const a = row.approval
  return {
    ...row,
    approval: Array.isArray(a) ? (a[0] ?? null) : (a ?? null),
  } as OutgoingLetter
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function useOutgoingLetters() {
  return useQuery({
    queryKey: ['outgoing_letters'],
    queryFn: async (): Promise<OutgoingLetter[]> => {
      const { data, error } = await supabase
        .from('outgoing_letters')
        .select(SELECT)
        .is('deleted_at', null)
        .order('letter_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalize)
    },
  })
}

export function useOutgoingLetter(id: string | null) {
  return useQuery({
    queryKey: ['outgoing_letter', id],
    enabled: !!id,
    queryFn: async (): Promise<OutgoingLetter> => {
      const { data, error } = await supabase
        .from('outgoing_letters')
        .select(SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return normalize(data as Record<string, unknown>)
    },
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['outgoing_letters'] })
}

export function useCreateOutgoingLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: OutgoingLetterInput
    ): Promise<OutgoingLetter> => {
      const { data, error } = await supabase
        .from('outgoing_letters')
        .insert(input)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as OutgoingLetter
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تمت إضافة الخطاب' })
    },
    onError: errToast('تعذّرت إضافة الخطاب'),
  })
}

export function useUpdateOutgoingLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<OutgoingLetterInput>
    }): Promise<OutgoingLetter> => {
      // لا يوجد عمود updated_at
      const { data, error } = await supabase
        .from('outgoing_letters')
        .update(input)
        .eq('id', id)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as OutgoingLetter
    },
    onSuccess: (_d, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['outgoing_letter', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث الخطاب' })
    },
    onError: errToast('تعذّر تحديث الخطاب'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeleteOutgoingLetter() {
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
        .from('outgoing_letters')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تم حذف الخطاب (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف الخطاب'),
  })
}
