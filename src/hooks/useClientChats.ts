import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'

// صندوق «العملاء» — محادثات الواتساب مع العملاء (قرار المدير 2026-10-06).
// الفهرس والربط من القاعدة (wa_threads)، والنص نفسه من الـHub عبر دالة wa-inbox عند الفتح.
// يرى المحادثة مسؤول ملفها وفريقه؛ والمدير وراكان يرون الكل، و«غير المصنّف» لهما وحدهما.

export interface ClientThread {
  phone_e164: string
  contact_id: string | null
  case_id: string | null
  display_name: string | null
  last_message_at: string | null
  last_in_at: string | null
  last_preview: string | null
  last_direction: string | null
  linked_at: string | null
  contact: { name: string | null } | null
  matter: { office_num: string | null; title: string | null; kind: string | null } | null
  unread: boolean
}

export interface ClientMsg {
  id: string
  at: string
  direction: 'in' | 'out'
  /** client · member (موظف من النظام) · hatif_staff (من لوحة هاتف) · bot · system */
  who: 'client' | 'member' | 'hatif_staff' | 'bot' | 'system'
  member_id: string | null
  member_name: string | null
  body: string | null
  type: string | null
  media: string | null
  mime: string | null
  status: string | null
  template: string | null
}

export interface ClientThreadDetail {
  window_open: boolean
  window_expires_at: string | null
  messages: ClientMsg[]
}

export const localPhone = (e164: string) => (e164.startsWith('9665') ? `0${e164.slice(3)}` : `+${e164}`)
export const threadName = (t: Pick<ClientThread, 'contact' | 'display_name' | 'phone_e164'>) =>
  t.contact?.name?.trim() || t.display_name?.trim() || localPhone(t.phone_e164)

// ---------- القفز من الإشعار إلى المحادثة ----------
let pendingPhone: string | null = null
export const CLIENT_CHAT_EVENT = 'client-chat-open'
export function requestClientChat(phone: string) {
  pendingPhone = phone
  window.dispatchEvent(new CustomEvent(CLIENT_CHAT_EVENT, { detail: phone }))
}
export function takeClientChat(): string | null {
  const p = pendingPhone
  pendingPhone = null
  return p
}

export function useClientThreads() {
  const myId = useAuth((s) => s.teamMember?.id)
  return useQuery({
    queryKey: ['client_threads', myId],
    enabled: !!myId,
    refetchInterval: 20_000,
    queryFn: async (): Promise<ClientThread[]> => {
      const [threads, reads] = await Promise.all([
        supabase
          .from('wa_threads')
          .select(
            'phone_e164, contact_id, case_id, display_name, last_message_at, last_in_at, last_preview, last_direction, linked_at, contact:contacts(name), matter:cases(office_num, title, kind)'
          )
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(300),
        supabase.from('wa_inbox_reads').select('phone_e164, read_at').eq('member_id', myId!),
      ])
      if (threads.error) throw threads.error
      const readAt = new Map((reads.data ?? []).map((r) => [r.phone_e164, r.read_at as string]))
      return ((threads.data ?? []) as unknown as Omit<ClientThread, 'unread'>[]).map((t) => {
        const r = readAt.get(t.phone_e164)
        return { ...t, unread: !!t.last_in_at && (!r || Date.parse(t.last_in_at) > Date.parse(r)) }
      })
    },
  })
}

export function useUnreadClientChatsCount() {
  const { data } = useClientThreads()
  return data?.filter((t) => t.unread).length ?? 0
}

export function useClientThread(phone: string | null) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['client_thread', phone],
    enabled: !!phone,
    refetchInterval: 12_000,
    queryFn: async (): Promise<ClientThreadDetail> => {
      const { data, error } = await supabase.functions.invoke('wa-inbox', { body: { action: 'thread', phone } })
      if (error) throw error
      // الفتح يعلّم المحادثة مقروءة — تُحدَّث الشارة
      qc.invalidateQueries({ queryKey: ['client_threads'] })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      return data as ClientThreadDetail
    },
  })
}

export function useSendClientMessage(phone: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { body: string; mode: 'text' | 'template'; clientId: string }) => {
      const { data, error } = await supabase.functions.invoke('wa-inbox', {
        body: { action: 'send', phone, body: v.body, mode: v.mode, client_id: v.clientId },
      })
      if (error) throw error
      return data
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['client_thread', phone] })
      qc.invalidateQueries({ queryKey: ['client_threads'] })
    },
  })
}

export function useLinkClientThread() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { phone: string; caseId: string | null }) => {
      const { error } = await supabase.rpc('wa_link_thread', { p_phone: v.phone, p_case_id: v.caseId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client_threads'] }),
  })
}

/** بطاقة «محادثة الموكّل» في صفحة الملف */
export function useMatterClientThreads(caseId: string | null | undefined) {
  return useQuery({
    queryKey: ['client_threads_of', caseId],
    enabled: !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_threads')
        .select('phone_e164, display_name, last_message_at, last_preview, last_direction, contact:contacts(name)')
        .eq('case_id', caseId!)
        .order('last_message_at', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as Pick<
        ClientThread,
        'phone_e164' | 'display_name' | 'last_message_at' | 'last_preview' | 'last_direction' | 'contact'
      >[]
    },
  })
}

/** ملفات للربط — بحث برقم الملف أو عنوانه أو اسم الموكّل */
export function useLinkableMatters(q: string) {
  return useQuery({
    queryKey: ['linkable_matters', q],
    queryFn: async () => {
      let req = supabase
        .from('cases')
        .select('id, office_num, title, kind, status, contact:contacts(name)')
        .is('deleted_at', null)
        .in('kind', ['case', 'legal_service', 'property', 'bankruptcy'])
        .order('created_at', { ascending: false })
        .limit(30)
      const s = q.trim().replace(/[%,()]/g, ' ')
      if (s) req = req.or(`office_num.ilike.%${s}%,title.ilike.%${s}%`)
      const { data, error } = await req
      if (error) throw error
      return (data ?? []) as unknown as {
        id: string
        office_num: string | null
        title: string | null
        kind: string | null
        status: string | null
        contact: { name: string | null } | null
      }[]
    },
  })
}
