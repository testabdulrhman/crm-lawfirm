import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type {
  LookupValue,
  LookupValueInput,
  OfficeInfo,
  OfficeInfoInput,
} from '@/types/db'

/* ===================== بيانات المكتب ===================== */

const OFFICE_KEY = ['office_info'] as const

export function useOfficeInfo() {
  return useQuery({
    queryKey: OFFICE_KEY,
    queryFn: async (): Promise<OfficeInfo | null> => {
      const { data, error } = await supabase
        .from('office_info')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as OfficeInfo) ?? null
    },
  })
}

export function useUpdateOfficeInfo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string | null
      input: OfficeInfoInput
    }): Promise<OfficeInfo> => {
      // إن وُجد صف نُحدّثه، وإلا نُنشئ صفاً جديداً
      if (id) {
        const { data, error } = await supabase
          .from('office_info')
          .update(input)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data as OfficeInfo
      }
      const { data, error } = await supabase
        .from('office_info')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as OfficeInfo
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OFFICE_KEY })
      toast({ variant: 'success', title: 'تم حفظ بيانات المكتب' })
    },
    onError: (e: unknown) => {
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ بيانات المكتب',
        description: e instanceof Error ? e.message : undefined,
      })
    },
  })
}

/* ===================== التصنيفات (lookup_values) ===================== */

const LOOKUP_KEY = ['lookup_values'] as const

export function useLookups() {
  return useQuery({
    queryKey: LOOKUP_KEY,
    queryFn: async (): Promise<LookupValue[]> => {
      const { data, error } = await supabase
        .from('lookup_values')
        .select('*')
        .order('type', { ascending: true })
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []) as LookupValue[]
    },
  })
}

export function useCreateLookup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: LookupValueInput): Promise<LookupValue> => {
      const { data, error } = await supabase
        .from('lookup_values')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as LookupValue
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOOKUP_KEY })
      toast({ variant: 'success', title: 'تمت إضافة التصنيف' })
    },
    onError: (e: unknown) => {
      toast({
        variant: 'destructive',
        title: 'تعذّرت إضافة التصنيف',
        description: e instanceof Error ? e.message : undefined,
      })
    },
  })
}

export function useUpdateLookup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<LookupValueInput>
    }): Promise<LookupValue> => {
      const { data, error } = await supabase
        .from('lookup_values')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as LookupValue
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOOKUP_KEY })
      toast({ variant: 'success', title: 'تم تحديث التصنيف' })
    },
    onError: (e: unknown) => {
      toast({
        variant: 'destructive',
        title: 'تعذّر تحديث التصنيف',
        description: e instanceof Error ? e.message : undefined,
      })
    },
  })
}

export function useDeleteLookup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('lookup_values')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LOOKUP_KEY })
      toast({ variant: 'success', title: 'تم حذف التصنيف' })
    },
    onError: (e: unknown) => {
      toast({
        variant: 'destructive',
        title: 'تعذّر حذف التصنيف',
        description: e instanceof Error ? e.message : undefined,
      })
    },
  })
}
