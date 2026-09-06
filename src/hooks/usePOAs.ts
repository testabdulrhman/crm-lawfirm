import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { todayISO } from '@/lib/format'
import { SOON_DAYS } from '@/lib/poaLabels'
import type { POAInput, PowerOfAttorney } from '@/types/db'
import { errMessage } from '@/lib/errors'

const LIST_KEY = ['poas'] as const

// لا embed لجهة الاتصال (لا FK)؛ فقط القضية (FK موجود).
const SELECT = '*, case:cases(id,title,office_num,status)'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

function plusDaysISO(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** وكالات مشروع بعينه — بطاقة «الوكالات» في صفحة الملف */
export function useCasePOAs(caseId: string | undefined) {
  return useQuery({
    queryKey: ['poas', 'by_case', caseId ?? ''],
    enabled: !!caseId,
    queryFn: async (): Promise<PowerOfAttorney[]> => {
      const { data, error } = await supabase
        .from('powers_of_attorney')
        .select(SELECT)
        .eq('case_id', caseId!)
        .is('deleted_at', null)
        .order('expiry_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as PowerOfAttorney[]
    },
  })
}

/** ربط/فكّ ربط وكالة بمشروع — من بطاقة الملف بلا فتح نموذج الوكالة كاملاً */
export function useLinkPOAToCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { poaId: string; caseId: string | null }) => {
      const { error } = await supabase
        .from('powers_of_attorney')
        .update({ case_id: args.caseId })
        .eq('id', args.poaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['poas'] })
      toast({ variant: 'success', title: 'حُدّث ربط الوكالة' })
    },
    onError: errToast('تعذّر ربط الوكالة'),
  })
}

export function usePOAs() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async (): Promise<PowerOfAttorney[]> => {
      const { data, error } = await supabase
        .from('powers_of_attorney')
        .select(SELECT)
        .is('deleted_at', null)
        .order('poa_date', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as PowerOfAttorney[]
    },
  })
}

export function usePOA(id: string | null) {
  return useQuery({
    queryKey: ['poa', id],
    enabled: !!id,
    queryFn: async (): Promise<PowerOfAttorney> => {
      const { data, error } = await supabase
        .from('powers_of_attorney')
        .select(SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as unknown as PowerOfAttorney
    },
  })
}

/**
 * عدد السارية التي تنتهي خلال ٣٠ يوماً (شارة الشريط الجانبي).
 *
 * ⚠️ يُقرأ من العرض `poas_needing_renewal` لا من الجدول: العرض يُسقط الوكالات
 *    المربوطة بمشروع **منتهٍ** — تجديدها بلا معنى بعد انتهاء التمثيل.
 */
export function useExpiringPOAsCount() {
  return useQuery({
    queryKey: ['poas', 'expiring_count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('poas_needing_renewal')
        .select('*', { count: 'exact', head: true })
        .gte('expiry_date', todayISO())
        .lte('expiry_date', plusDaysISO(SOON_DAYS))
      if (error) throw error
      return count ?? 0
    },
  })
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['poas'] })
}

export function useCreatePOA() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: POAInput): Promise<PowerOfAttorney> => {
      const { data, error } = await supabase
        .from('powers_of_attorney')
        .insert({ status: 'active', ...input })
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as PowerOfAttorney
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تمت إضافة الوكالة' })
    },
    onError: errToast('تعذّرت إضافة الوكالة'),
  })
}

export function useUpdatePOA() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<POAInput>
    }): Promise<PowerOfAttorney> => {
      const { data, error } = await supabase
        .from('powers_of_attorney')
        .update(input)
        .eq('id', id)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as PowerOfAttorney
    },
    onSuccess: (_d, vars) => {
      invalidateAll(qc)
      qc.invalidateQueries({ queryKey: ['poa', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث الوكالة' })
    },
    onError: errToast('تعذّر تحديث الوكالة'),
  })
}

export function useUpdatePOAStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: string
    }): Promise<void> => {
      const { error } = await supabase
        .from('powers_of_attorney')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidateAll(qc)
      qc.invalidateQueries({ queryKey: ['poa', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث حالة الوكالة' })
    },
    onError: errToast('تعذّر تحديث الحالة'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeletePOA() {
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
        .from('powers_of_attorney')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تم حذف الوكالة (يمكن استرجاعها)' })
    },
    onError: errToast('تعذّر حذف الوكالة'),
  })
}
