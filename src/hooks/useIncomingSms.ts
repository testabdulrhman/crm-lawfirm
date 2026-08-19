// الرسائل الواردة المسجّلة من اختصار الآيفون (sms_log بحالة incoming).
// الاختصار يرسل **كل** الرسائل، ودالة sms-inbox تصنّفها — فالفلترة هنا لا هناك.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

export type SmsCategory =
  | 'najiz'
  | 'government'
  | 'bank'
  | 'client'
  | 'otp'
  | 'promo'
  | 'personal'
  | 'other'

export interface IncomingSms {
  id: string
  recipient_name: string | null // اسم المرسل (أو اسم جهة الاتصال المطابقة)
  phone: string | null
  message: string | null
  created_at: string
  case_id: string | null
  category: SmsCategory | null
  is_important: boolean | null
  contact_id: string | null
  read_at: string | null
  case?: { id: string; title: string | null } | null
}

export const SMS_CATEGORIES: {
  value: SmsCategory
  label: string
  important: boolean
}[] = [
  { value: 'najiz', label: 'ناجز والمحاكم', important: true },
  { value: 'government', label: 'جهات حكومية', important: true },
  { value: 'bank', label: 'بنوك', important: true },
  { value: 'client', label: 'موكّلون', important: true },
  { value: 'promo', label: 'إعلانات', important: false },
  { value: 'otp', label: 'رموز تحقق', important: false },
  { value: 'personal', label: 'شخصية', important: false },
  { value: 'other', label: 'غير مصنّفة', important: false },
]

export const smsCategoryLabel = (c: string | null): string =>
  SMS_CATEGORIES.find((x) => x.value === c)?.label ?? 'غير مصنّفة'

const KEY = 'incoming-sms'
const SELECT =
  'id, recipient_name, phone, message, created_at, case_id, category, ' +
  'is_important, contact_id, read_at, case:cases(id,title)'

export function useIncomingSms() {
  return useQuery({
    queryKey: [KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_log')
        .select(SELECT)
        .eq('status', 'incoming')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as unknown as IncomingSms[]
    },
  })
}

/** عدّاد الشريط: الوارد المهم غير المقروء */
export function useUnreadImportantSms() {
  return useQuery({
    queryKey: [KEY, 'unread'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('sms_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'incoming')
        .eq('is_important', true)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

/** تعليم رسالة (أو الكل) كمقروءة — بلا توست، إجراء صامت متكرر */
export function useMarkSmsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string | 'all') => {
      let q = supabase
        .from('sms_log')
        .update({ read_at: new Date().toISOString() })
        .eq('status', 'incoming')
        .is('read_at', null)
      if (id !== 'all') q = q.eq('id', id)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر تعليم الرسالة كمقروءة',
        description: errMessage(e),
      }),
  })
}

/** تصحيح تصنيف خاطئ يدوياً — التصنيف الآلي يخطئ، فالموظف يصحّحه */
export function useReclassifySms() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      category,
    }: {
      id: string
      category: SmsCategory
    }) => {
      const important =
        SMS_CATEGORIES.find((c) => c.value === category)?.important ?? false
      const { error } = await supabase
        .from('sms_log')
        .update({ category, is_important: important })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast({ variant: 'success', title: 'صُحّح التصنيف' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر تغيير التصنيف',
        description: errMessage(e),
      }),
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
