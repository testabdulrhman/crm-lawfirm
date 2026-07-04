import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { normalizeSaudiPhone } from '@/lib/format'
import type { Note } from '@/types/db'

const APP_URL = 'https://app.redwan.sa'

// عضو مذكور في الملاحظة (للإشعار عبر SMS)
export interface MentionTarget {
  id: string
  name: string
  phone: string | null
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

function key(caseId: string) {
  return ['case_notes', caseId]
}

export function useCaseNotes(caseId: string) {
  return useQuery({
    queryKey: key(caseId),
    enabled: !!caseId,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from('notes')
        .select('*, author:team_members(id,name,short_name)')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Note[]
    },
  })
}

export function useAddNote(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      content,
      authorId,
      authorName,
      caseTitle,
      mentions,
    }: {
      content: string
      authorId: string | null
      authorName?: string | null
      caseTitle?: string | null
      mentions?: MentionTarget[]
    }): Promise<{ notified: number }> => {
      const { error } = await supabase
        .from('notes')
        .insert({ case_id: caseId, content, author_id: authorId })
      if (error) throw error

      // إشعار المذكورين عبر SMS (غير قاتل — فشله لا يُفشل الملاحظة)
      let notified = 0
      for (const m of mentions ?? []) {
        if (!m.phone) continue
        const numbers = normalizeSaudiPhone(m.phone)
        if (!numbers) continue
        const excerpt =
          content.length > 120 ? `${content.slice(0, 120)}…` : content
        const msg = `ذكرك ${authorName || 'زميلك'} في محادثة قضية «${caseTitle || ''}»:\n${excerpt}\n${APP_URL}/#/cases/${caseId}`
        try {
          const { data, error: smsErr } = await supabase.functions.invoke(
            'swift-endpoint',
            { body: { numbers, msg } }
          )
          const ok = !smsErr && (data?.code === '1' || data?.code === 1)
          if (ok) notified++
          await supabase.from('sms_log').insert({
            recipient_name: m.name,
            phone: numbers,
            message: msg,
            status: ok ? 'sent' : 'failed',
            sent_by: authorName ?? null,
          })
        } catch {
          /* تجاهل — الإشعار ليس حرجاً */
        }
      }
      return { notified }
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      if (res.notified > 0) {
        toast({ variant: 'success', title: 'أُرسل تنبيه للمذكورين' })
      }
    },
    onError: errToast('تعذّرت إضافة الملاحظة'),
  })
}

export function useDeleteNote(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم حذف الملاحظة' })
    },
    onError: errToast('تعذّر حذف الملاحظة'),
  })
}
