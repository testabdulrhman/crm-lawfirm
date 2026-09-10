import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { todayISO } from '@/lib/format'
import type { LegalService, LegalServiceInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

// ⚠️ تسمية العلاقة إلزامية: منذ إضافة case_members (2026-09-06) صار بين الملفات
//    والموظفين أكثر من مسار، وبلا التسمية يرفض PostgREST الاستعلام (PGRST201)
const SELECT = '*, assignee:team_members!cases_assignee_id_fkey(id,name,short_name)'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function useLegalServices(filterType: string = 'all') {
  return useQuery({
    queryKey: ['legal_services', filterType],
    queryFn: async (): Promise<LegalService[]> => {
      let q = supabase
        .from('legal_services')
        .select(SELECT)
        .is('deleted_at', null)
        .order('service_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (filterType !== 'all') q = q.eq('type', filterType)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as LegalService[]
    },
  })
}

export function useLegalService(id: string | null) {
  return useQuery({
    queryKey: ['legal_service', id],
    enabled: !!id,
    queryFn: async (): Promise<LegalService> => {
      const { data, error } = await supabase
        .from('legal_services')
        .select(SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as unknown as LegalService
    },
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['legal_services'] })
}

export function useCreateLegalService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: LegalServiceInput): Promise<LegalService> => {
      const { data, error } = await supabase
        .from('legal_services')
        .insert({ status: 'draft', ...input })
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as LegalService
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تمت إضافة الخدمة' })
    },
    onError: errToast('تعذّرت إضافة الخدمة'),
  })
}

export function useUpdateLegalService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<LegalServiceInput>
    }): Promise<LegalService> => {
      const { data, error } = await supabase
        .from('legal_services')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as LegalService
    },
    onSuccess: (_d, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['legal_service', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث الخدمة' })
    },
    onError: errToast('تعذّر تحديث الخدمة'),
  })
}

export function useUpdateLegalServiceStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: string
    }): Promise<void> => {
      const patch: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      }
      if (status === 'delivered') patch.delivered_date = todayISO()
      const { error } = await supabase
        .from('legal_services')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['legal_service', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث الحالة' })
    },
    onError: errToast('تعذّر تحديث الحالة'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeleteLegalService() {
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
        .from('legal_services')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تم حذف الخدمة (يمكن استرجاعها)' })
    },
    onError: errToast('تعذّر حذف الخدمة'),
  })
}
