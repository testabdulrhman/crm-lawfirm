import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type {
  Contact,
  ContactInput,
  ContactWorkLinks,
  HatifCall,
} from '@/types/db'

const KEY = ['contacts'] as const
const WORK_LINKS_KEY = ['contact_work_links'] as const

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
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

export interface ContactRelations {
  cases: { id: string; title: string | null; office_num: string | null; court_num: string | null; status: string | null }[]
  services: { id: string; title: string | null; type: string | null; service_date: string | null; status: string | null }[]
  appointments: { id: string; appointment_date: string | null; appointment_time: string | null; status: string | null }[]
  requests: { id: string; request_type: string | null; status: string | null; received_at: string | null }[]
  properties: { id: string; transfer_type: string | null; property_type: string | null; deed_number: string | null; transfer_date: string | null; status: string | null; seller_id: string | null; buyer_id: string | null }[]
}

export function useContactRelations(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['contact_relations', id],
    enabled: !!id && enabled,
    queryFn: async (): Promise<ContactRelations> => {
      const [cases, services, appts, requests, props] = await Promise.all([
        supabase
          .from('cases')
          .select('id, title, office_num, court_num, status')
          .eq('contact_id', id),
        supabase
          .from('legal_services')
          .select('id, title, type, service_date, status')
          .eq('client_id', id),
        supabase
          .from('appointments')
          .select('id, appointment_date, appointment_time, status')
          .eq('client_id', id),
        supabase
          .from('incoming_requests')
          .select('id, request_type, status, received_at')
          .eq('client_id', id),
        supabase
          .from('property_transfers')
          .select(
            'id, transfer_type, property_type, deed_number, transfer_date, status, seller_id, buyer_id'
          )
          .or(`seller_id.eq.${id},buyer_id.eq.${id}`),
      ])
      const firstErr =
        cases.error || services.error || appts.error || requests.error || props.error
      if (firstErr) throw firstErr
      return {
        cases: (cases.data ?? []) as ContactRelations['cases'],
        services: (services.data ?? []) as ContactRelations['services'],
        appointments: (appts.data ?? []) as ContactRelations['appointments'],
        requests: (requests.data ?? []) as ContactRelations['requests'],
        properties: (props.data ?? []) as ContactRelations['properties'],
      }
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
