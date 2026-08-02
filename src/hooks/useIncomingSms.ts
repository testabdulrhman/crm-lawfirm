// الرسائل الواردة المسجّلة من اختصار الآيفون (sms_log بحالة incoming)
// + ربط الرسالة بقضية يدوياً (case_id)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

export interface IncomingSms {
  id: string
  recipient_name: string | null // اسم المرسل (أو اسم جهة الاتصال المطابقة)
  phone: string | null
  message: string | null
  created_at: string
  case_id: string | null
  case?: { id: string; title: string | null } | null
}

const KEY = 'incoming-sms'

export function useIncomingSms() {
  return useQuery({
    queryKey: [KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_log')
        .select('id, recipient_name, phone, message, created_at, case_id, case:cases(id,title)')
        .eq('status', 'incoming')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as unknown as IncomingSms[]
    },
  })
}

// ربط/فك الرسالة بقضية
export function useLinkSmsToCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ smsId, caseId }: { smsId: string; caseId: string | null }) => {
      const { error } = await supabase
        .from('sms_log')
        .update({ case_id: caseId })
        .eq('id', smsId)
      if (error) throw error
      return caseId
    },
    onSuccess: (caseId) => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast({
        variant: 'success',
        title: caseId ? 'رُبطت الرسالة بالقضية' : 'فُك ربط الرسالة',
      })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر ربط الرسالة',
        description: errMessage(e),
      }),
  })
}
