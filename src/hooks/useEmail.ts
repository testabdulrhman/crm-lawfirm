// البريد الرسمي (Gmail API): قراءة الوارد/الصادر + الإرسال عبر دالة email-send
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import type { EmailMessage } from '@/types/db'

const KEY = 'email-messages'

export function useEmailMessages(direction: 'incoming' | 'outgoing') {
  return useQuery({
    queryKey: [KEY, direction],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_messages')
        .select('*, contact:contacts(id,name), case:cases(id,title)')
        .eq('direction', direction)
        .order('internal_date', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as EmailMessage[]
    },
  })
}

// إضافة الرسالة ومرفقاتها لملف قضية (عبر دالة email-attach)
export function useAttachEmailToCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      email_id: string
      case_id: string
      uploaded_by_name: string | null
    }) => {
      const { data, error } = await supabase.functions.invoke('email-attach', {
        body: input,
      })
      if (error) {
        let detail = errMessage(error)
        try {
          const ctx = await (error as { context?: Response }).context?.json()
          if (ctx?.error) detail = ctx.error
        } catch {
          /* نكتفي بالرسالة العامة */
        }
        throw new Error(detail)
      }
      if (data?.error) throw new Error(data.error)
      return data as { ok: boolean; attachments: number }
    },
    onSuccess: (d, vars) => {
      qc.invalidateQueries({ queryKey: [KEY] })
      qc.invalidateQueries({ queryKey: ['case_documents', vars.case_id] })
      toast({
        title: 'أُضيفت الرسالة لملف القضية',
        description:
          d.attachments > 0
            ? `نُقل ${d.attachments} مرفق + نص الرسالة إلى مستندات القضية.`
            : 'نُقل نص الرسالة إلى مستندات القضية (لا مرفقات).',
      })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّرت الإضافة للقضية',
        description: errMessage(e),
      }),
  })
}

export function useSendEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      to: string
      subject: string
      text: string
      contact_id?: string | null
      sent_by?: string | null
    }) => {
      const { data, error } = await supabase.functions.invoke('email-send', {
        body: input,
      })
      if (error) {
        // خطأ الدالة يصل كنص JSON داخل context أحياناً — أظهر أوضح رسالة متاحة
        let detail = errMessage(error)
        try {
          const ctx = await (error as { context?: Response }).context?.json()
          if (ctx?.error) detail = ctx.error
        } catch {
          /* نكتفي بالرسالة العامة */
        }
        throw new Error(detail)
      }
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, 'outgoing'] })
      toast({ title: 'تم إرسال البريد' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر إرسال البريد',
        description: errMessage(e),
      }),
  })
}
