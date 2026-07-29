// الرسائل الواردة المسجّلة من اختصار الآيفون (sms_log بحالة incoming)
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export interface IncomingSms {
  id: string
  recipient_name: string | null // اسم المرسل (أو اسم جهة الاتصال المطابقة)
  phone: string | null
  message: string | null
  created_at: string
}

export function useIncomingSms() {
  return useQuery({
    queryKey: ['incoming-sms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_log')
        .select('id, recipient_name, phone, message, created_at')
        .eq('status', 'incoming')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as IncomingSms[]
    },
  })
}
