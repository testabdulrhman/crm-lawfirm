import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { PropertyTransfer, PropertyTransferInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

// لا embed: يوجد FK لكلٍّ من seller_id/buyer_id → contacts (FK مزدوج لنفس الجدول).
// نعتمد seller_name/buyer_name المخزّنين، ونربط عبر seller_id/buyer_id للروابط.

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function usePropertyTransfers() {
  return useQuery({
    queryKey: ['property_transfers'],
    queryFn: async (): Promise<PropertyTransfer[]> => {
      const { data, error } = await supabase
        .from('property_transfers')
        .select('*')
        .is('deleted_at', null)
        .order('transfer_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PropertyTransfer[]
    },
  })
}

export function usePropertyTransfer(id: string | null) {
  return useQuery({
    queryKey: ['property_transfer', id],
    enabled: !!id,
    queryFn: async (): Promise<PropertyTransfer> => {
      const { data, error } = await supabase
        .from('property_transfers')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as PropertyTransfer
    },
  })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['property_transfers'] })
}

export function useCreatePropertyTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: PropertyTransferInput
    ): Promise<PropertyTransfer> => {
      const { data, error } = await supabase
        .from('property_transfers')
        .insert({ status: 'قيد التنفيذ', ...input })
        .select('*')
        .single()
      if (error) throw error
      return data as PropertyTransfer
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تمت إضافة المعاملة' })
    },
    onError: errToast('تعذّرت إضافة المعاملة'),
  })
}

export function useUpdatePropertyTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<PropertyTransferInput>
    }): Promise<PropertyTransfer> => {
      const { data, error } = await supabase
        .from('property_transfers')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data as PropertyTransfer
    },
    onSuccess: (_d, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['property_transfer', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث المعاملة' })
    },
    onError: errToast('تعذّر تحديث المعاملة'),
  })
}

export function useUpdatePropertyTransferStatus() {
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
        .from('property_transfers')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['property_transfer', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث الحالة' })
    },
    onError: errToast('تعذّر تحديث الحالة'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeletePropertyTransfer() {
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
        .from('property_transfers')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تم حذف المعاملة (يمكن استرجاعها)' })
    },
    onError: errToast('تعذّر حذف المعاملة'),
  })
}
