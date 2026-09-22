// صفحة مراقبة الـ Hub — القراءة عبر دالة hub-monitor وحدها.
// المتصفح لا يلمس قاعدة الـ Hub: الدالة تتحقق من الجلسة ومن أن صاحبها مدير،
// ثم تنادي الـ Hub بمفتاح قراءة لا يغادر الخادم.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hub-monitor', { body })
  if (error) {
    // رسالة الدالة أوضح من رسالة الشبكة العامة (403 للمدير وحده مثلاً)
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null)
      if (body?.message) throw new Error(body.message)
      if (body?.error) throw new Error(body.error)
    }
    throw error
  }
  if (data?.error) throw new Error(data.message ?? data.error)
  return data.data as T
}

export interface DayCounts {
  total: number
  answered?: number
  missed?: number
  law?: number
  bankruptcy?: number
  both?: number
  internal?: number
  undecided?: number
  bot?: number
  sent?: number
  failed?: number
}

export interface HubAlerts {
  rejected_signatures: number
  stuck_events: number
  failed_notifications: number
  pending_notifications_old: number
  failed_outbound: number
  stuck_outbound: number
  rate_limited_phones: number
  last_worker_run: string | null
  worker_minutes_ago: number | null
  last_full_sync: string | null
  full_sync_hours_ago: number | null
  index_rows: number
}

export interface HubSummary {
  generated_at: string
  today: string
  calls: { today?: DayCounts; yesterday?: DayCounts }
  whatsapp_in: { today?: DayCounts; yesterday?: DayCounts }
  whatsapp_out: { today?: DayCounts; yesterday?: DayCounts }
  alerts: HubAlerts
  new_contacts: { phone: string; name: string | null; last_at: string; state: string | null; messages: number }[]
  bot_requests: {
    at: string; phone: string | null; name: string | null; request_label: string | null
    city: string | null; partial: boolean; status: string; request_id: string | null
  }[]
  stalled_intakes: { phone: string; step: string | null; name: string | null; since: string; hours: number }[]
}

export interface TimelineItem {
  kind: 'message' | 'call'
  at: string
  direction: string | null
  sender?: string | null
  system?: string | null
  type?: string | null
  body?: string | null
  media?: string | null
  status?: string | null
  duration?: string | null
  agent?: string | null
  summary?: string | null
  recording?: string | null
  routed?: string | null
  event_id: number | null
}

export interface PhoneReport {
  phone: string | null
  not_found?: boolean
  display_name?: string | null
  flags?: { law: boolean; law_client: boolean; bankruptcy: boolean }
  staff?: { name: string; role: string | null; active: boolean } | null
  index: { system: string; external_id: string; name: string | null; kind: string | null
           via: string | null; matter_ref: string | null; source?: string; synced_at?: string }[]
  conversation?: {
    state: string; assigned_system: string | null; bound_external_id: string | null
    tags: string[] | null; window_expires_at: string | null; human_until: string | null
  } | null
  timeline?: TimelineItem[]
  decisions?: {
    at: string; channel: string; system: string | null; reason: string; confidence: number | null
    external_id: string | null; requested_by: string | null; detail: Record<string, unknown>; event_id: number | null
  }[]
}

export interface StaffRow {
  phone: string
  name: string
  role: string | null
  systems: string[]
  active: boolean
  note: string | null
  changed_by: string | null
  changed_at: string | null
}

export function useHubSummary() {
  return useQuery({
    queryKey: ['hub', 'summary'],
    queryFn: () => call<HubSummary>({ action: 'summary' }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false, // 403 لغير المدير: لا فائدة من التكرار
  })
}

export function useHubPhone(phone: string | null) {
  return useQuery({
    queryKey: ['hub', 'phone', phone],
    queryFn: () => call<PhoneReport>({ action: 'phone', phone }),
    enabled: Boolean(phone && phone.replace(/\D/g, '').length >= 9),
    retry: false,
  })
}

export function useHubEvent(eventId: number | null) {
  return useQuery({
    queryKey: ['hub', 'event', eventId],
    queryFn: () => call<Record<string, unknown>>({ action: 'event', event_id: eventId }),
    enabled: Boolean(eventId),
    retry: false,
  })
}

export function useHubStaff() {
  return useQuery({
    queryKey: ['hub', 'staff'],
    queryFn: () => call<StaffRow[]>({ action: 'staff_list' }),
    retry: false,
  })
}

export function useHubStaffSet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { phone: string; name: string; role?: string | null; active: boolean }) =>
      call<{ ok?: boolean; error?: string; phone?: string }>({ action: 'staff_set', ...v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hub', 'staff'] })
      qc.invalidateQueries({ queryKey: ['hub', 'summary'] })
    },
  })
}
