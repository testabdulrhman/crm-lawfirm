import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { todayISO } from '@/lib/format'
import type { Case, CaseInput, CaseStatus } from '@/types/db'
import { errMessage } from '@/lib/errors'

const LIST_KEY = ['cases'] as const

// الـ join المختصر للموكّل والمسؤول
// ⚠️ assignee يسمّي القيد صراحةً دفاعاً: PostgREST يعتبر أي جدول مفتاحه
//    الأساسي مركّبٌ من مفتاحين أجنبيين **جدولَ وصل**، فيصير بين cases و
//    team_members مساران ويفشل الاستعلام كله بـPGRST201 «تعذّر تحميل القضايا».
//    حدث فعلاً عند إضافة case_reads (2026-08-21) وأُصلح جذرياً بمفتاح بديل
//    له؛ والتسمية هنا تبقى حصانةً من أي جدول وصل يُضاف مستقبلاً.
const SELECT =
  '*, contact:contacts(id,name,phone), assignee:team_members!cases_assignee_id_fkey(id,name,short_name), engagement:engagements(id,title,engagement_number)'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function useCases() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<Case[]> => {
      const { data, error } = await supabase
        .from('cases')
        .select(SELECT)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Case[]
    },
  })
}

export function useCase(id: string | null) {
  return useQuery({
    queryKey: ['case', id],
    enabled: !!id,
    queryFn: async (): Promise<Case> => {
      const { data, error } = await supabase
        .from('cases')
        .select(SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as unknown as Case
    },
  })
}

export function useCreateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CaseInput): Promise<Case> => {
      const payload: CaseInput = {
        status: 'jarri',
        progress: 0,
        open_date: input.open_date || todayISO(),
        ...input,
      }
      const { data, error } = await supabase
        .from('cases')
        .insert(payload)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as Case
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      toast({ variant: 'success', title: 'تمت إضافة القضية' })
    },
    onError: errToast('تعذّرت إضافة القضية'),
  })
}

export function useUpdateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<CaseInput>
    }): Promise<Case> => {
      const { data, error } = await supabase
        .from('cases')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as Case
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: ['case', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث القضية' })
    },
    onError: errToast('تعذّر تحديث القضية'),
  })
}

export function useUpdateCaseStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: CaseStatus
    }): Promise<void> => {
      // عند الإنهاء اضبط close_date=اليوم؛ عند العودة لجارية فرّغها.
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (status === 'muntahia') patch.close_date = todayISO()
      else if (status === 'jarri') patch.close_date = null
      const { error } = await supabase.from('cases').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: LIST_KEY })
      qc.invalidateQueries({ queryKey: ['case', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث حالة القضية' })
    },
    onError: errToast('تعذّر تحديث الحالة'),
  })
}
