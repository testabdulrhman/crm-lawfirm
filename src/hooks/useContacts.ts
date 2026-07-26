import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type {
  Contact,
  ContactInput,
  ContactWorkLinks,
  HatifCall,
} from '@/types/db'
import { errMessage } from '@/lib/errors'

const KEY = ['contacts'] as const
const WORK_LINKS_KEY = ['contact_work_links'] as const

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

/* ===================== القائمة ===================== */

export function useContacts() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<Contact[]> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contact[]
    },
  })
}

// أعداد ارتباطات العمل لكل جهة (عبر RPC) كـ Map
export function useContactWorkLinks() {
  return useQuery({
    queryKey: WORK_LINKS_KEY,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, ContactWorkLinks>> => {
      const { data, error } = await supabase.rpc('contact_work_links')
      if (error) throw error
      const map = new Map<string, ContactWorkLinks>()
      for (const row of (data ?? []) as ContactWorkLinks[]) {
        map.set(row.contact_id, row)
      }
      return map
    },
  })
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<Contact> => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Contact
    },
  })
}

/* ===================== سجل المكالمات (تبويب التواصل) ===================== */

export function useContactCalls(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['contact_calls', id],
    enabled: !!id && enabled,
    queryFn: async (): Promise<HatifCall[]> => {
      const { data, error } = await supabase.rpc('contact_calls', {
        p_contact_id: id,
      })
      if (error) throw error
      return (data ?? []) as HatifCall[]
    },
  })
}

/* ===================== الارتباطات (تبويب الارتباطات) ===================== */

// عنصر مرتبط قابل للنقر (من دالة contact_linked_items مع المعرّفات)
export type ContactLinkedKind =
  | 'case'
  | 'legal_service'
  | 'appointment'
  | 'request'
  | 'property'

export interface ContactLinkedItem {
  kind: ContactLinkedKind
  id: string
  title: string
  subtitle: string | null
  status: string | null
}

export function useContactLinkedItems(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['contact_linked_items', id],
    enabled: !!id && enabled,
    queryFn: async (): Promise<ContactLinkedItem[]> => {
      const { data, error } = await supabase.rpc('contact_linked_items', {
        p_contact_id: id,
      })
      if (error) throw error
      return (data ?? []) as ContactLinkedItem[]
    },
  })
}

/* ===================== CRUD ===================== */

function invalidateLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: KEY })
  qc.invalidateQueries({ queryKey: WORK_LINKS_KEY })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ContactInput): Promise<Contact> => {
      const { data, error } = await supabase
        .from('contacts')
        .insert({ source: 'manual', ...input })
        .select()
        .single()
      if (error) throw error
      return data as Contact
    },
    onSuccess: () => {
      invalidateLists(qc)
      toast({ variant: 'success', title: 'تمت إضافة جهة الاتصال' })
    },
    onError: errToast('تعذّرت إضافة جهة الاتصال'),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<ContactInput>
    }): Promise<Contact> => {
      const { data, error } = await supabase
        .from('contacts')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Contact
    },
    onSuccess: () => {
      invalidateLists(qc)
      toast({ variant: 'success', title: 'تم تحديث جهة الاتصال' })
    },
    onError: errToast('تعذّر تحديث جهة الاتصال'),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // لا يوجد حذف ناعم على contacts؛ الحماية (منع حذف المرتبط + المدير + تأكيد) في الواجهة.
      const { error } = await supabase.from('contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateLists(qc)
      toast({ variant: 'success', title: 'تم حذف جهة الاتصال' })
    },
    onError: errToast('تعذّر حذف جهة الاتصال'),
  })
}
