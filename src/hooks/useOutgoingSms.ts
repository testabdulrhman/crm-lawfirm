// الرسائل الصادرة من النظام (sms_log بحالة sent/failed) — تذكيرات، رموز
// دخول، إرسال يدوي… النوع يُشتق من sent_by لأن الجدول لا يحمل عمود نوع.
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export interface OutgoingSms {
  id: string
  recipient_name: string | null
  phone: string | null
  message: string | null
  status: 'sent' | 'failed'
  sent_by: string | null
  created_at: string
  case_id: string | null
  case?: { id: string; title: string | null } | null
}

export type OutgoingType =
  | 'session_reminder'
  | 'otp'
  | 'recruitment'
  | 'whatsapp'
  | 'auto_confirm'
  | 'manual'

export const OUTGOING_TYPES: { value: OutgoingType; label: string }[] = [
  { value: 'session_reminder', label: 'تذكير جلسة' },
  { value: 'otp', label: 'رمز دخول' },
  { value: 'recruitment', label: 'توظيف' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'auto_confirm', label: 'تأكيد تلقائي' },
  { value: 'manual', label: 'يدوي' },
]

export const outgoingTypeLabel = (t: OutgoingType): string =>
  OUTGOING_TYPES.find((x) => x.value === t)?.label ?? 'يدوي'

export function outgoingTypeOf(sentBy: string | null): OutgoingType {
  const s = sentBy ?? ''
  if (s === 'otp') return 'otp'
  if (s.startsWith('تذكير جلسات')) return 'session_reminder'
  if (s.includes('تقديم وظيفة')) return 'recruitment'
  if (s === 'whatsapp') return 'whatsapp'
  if (s.includes('تأكيد')) return 'auto_confirm'
  return 'manual'
}

/** رموز التحقق تُعرض مطموسة — لا داعي لبقائها مقروءة في السجل */
export function maskOtp(message: string): string {
  return message.replace(/\d{4,8}/g, '••••')
}

export function useOutgoingSms() {
  return useQuery({
    queryKey: ['outgoing-sms'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_log')
        .select(
          'id, recipient_name, phone, message, status, sent_by, created_at, case_id, case:cases(id,title)'
        )
        .in('status', ['sent', 'failed'])
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as unknown as OutgoingSms[]
    },
  })
}
