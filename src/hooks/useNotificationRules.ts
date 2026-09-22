import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

// قواعد الإشعارات: هذا النظام يحدّد **متى ولمن**، والإرسال نفسه يتم عبر نظام الـHub
// بالقالب المذكور في القاعدة (طلب المدير 2026-09-22).

export type NotificationEvent = 'session' | 'appointment' | 'poa' | 'deadline' | 'manual'
export type NotificationRecipient = 'client' | 'assignee' | 'director'

export interface NotificationRule {
  id: string
  key: string
  name: string
  description: string | null
  event_type: NotificationEvent
  source_table: string | null
  date_column: string | null
  offsets_days: number[] | null
  send_at_time: string
  recipient: NotificationRecipient
  channel: string
  template_name: string | null
  template_lang: string
  variables: string[] | null
  is_active: boolean
  updated_at: string | null
}

export interface NotificationRuleUpdate {
  offsets_days?: number[]
  send_at_time?: string
  recipient?: NotificationRecipient
  template_name?: string | null
  variables?: string[]
  is_active?: boolean
}

/** ما استُحق إرساله لكل قاعدة — عدّادات موجزة تظهر بجانبها */
export interface RuleCounts {
  pending: number
  sent: number
  failed: number
  skipped: number
}

export function useNotificationRules() {
  return useQuery({
    queryKey: ['notification_rules'],
    queryFn: async (): Promise<NotificationRule[]> => {
      const { data, error } = await supabase
        .from('notification_rules')
        .select(
          'id, key, name, description, event_type, source_table, date_column, offsets_days, send_at_time, recipient, channel, template_name, template_lang, variables, is_active, updated_at'
        )
        .order('event_type', { ascending: true })
      if (error) throw error
      return (data ?? []) as NotificationRule[]
    },
  })
}

export function useNotificationSendCounts() {
  return useQuery({
    queryKey: ['notification_send_counts'],
    queryFn: async (): Promise<Record<string, RuleCounts>> => {
      const { data, error } = await supabase
        .from('notification_sends')
        .select('rule_id, status')
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      const out: Record<string, RuleCounts> = {}
      for (const row of (data ?? []) as { rule_id: string; status: keyof RuleCounts }[]) {
        const c = (out[row.rule_id] ??= { pending: 0, sent: 0, failed: 0, skipped: 0 })
        if (row.status in c) c[row.status] += 1
      }
      return out
    },
  })
}

export function useUpdateNotificationRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: NotificationRuleUpdate }) => {
      const { error } = await supabase.from('notification_rules').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification_rules'] })
      toast({ variant: 'success', title: 'حُفظت القاعدة' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ القاعدة',
        description: errMessage(e),
      }),
  })
}
