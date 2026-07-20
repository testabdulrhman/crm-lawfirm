// إرسال رسالة شكر على الزيارة + طلب تقييم، عبر الواتساب و SMS معاً.
// النصّ من قالب «شكر بعد الموعد» (appt_thankyou) القابل للتعديل من الإعدادات.
import { useMutation } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { normalizeSaudiPhone } from '@/lib/format'
import { getTemplate, fillTemplate } from '@/lib/templates'
import { useAuth } from '@/stores/auth'

export interface ThankYouResult {
  phone: string
  name: string
  whatsapp: boolean
  sms: boolean
}

// اسم جهة الاتصال حسب الرقم. الجوالات مخزّنة بصيغ مختلفة (05… / 5…)،
// فآخر ٩ أرقام هي المفتاح الموثوق للمطابقة.
async function lookupName(intl: string): Promise<string | null> {
  const tail = intl.slice(-9) // أرقام فقط — آمن داخل الفلتر
  const { data } = await supabase
    .from('contacts')
    .select('name')
    .or(`phone.ilike.*${tail},phone2.ilike.*${tail}`)
    .limit(1)
  return data?.[0]?.name ?? null
}

export function useSendThankYou() {
  const { teamMember } = useAuth()

  return useMutation({
    mutationFn: async (rawPhone: string): Promise<ThankYouResult> => {
      const intl = normalizeSaudiPhone(rawPhone)
      if (intl.length !== 12 || !intl.startsWith('9665'))
        throw new Error('رقم جوال غير صحيح — أدخل رقماً سعوديّاً مثل 0501234567')

      const body = await getTemplate('appt_thankyou')
      if (!body)
        throw new Error('قالب «شكر بعد الموعد» غير موجود — راجع الإعدادات ← القوالب')

      const name = await lookupName(intl)
      const display = name ?? 'عميلنا الكريم'
      const message = fillTemplate(body, { name: display })

      // القناتان بالتوازي: فشل إحداهما لا يمنع الأخرى
      const [whatsapp, sms] = await Promise.all([
        supabase.functions
          .invoke('whatsapp-send', {
            body: { phone: intl, message, recipient_name: display },
          })
          .then((r) => !r.error && r.data?.success === true)
          .catch(() => false),
        supabase.functions
          .invoke('swift-endpoint', { body: { numbers: intl, msg: message } })
          .then((r) => !r.error && (r.data?.code === '1' || r.data?.code === 1))
          .catch(() => false),
      ])

      // الواتساب يُسجّل نفسه خادميّاً داخل whatsapp-send؛ نسجّل هنا الـ SMS فقط
      await supabase.from('sms_log').insert({
        recipient_name: display,
        phone: intl,
        message,
        status: sms ? 'sent' : 'failed',
        sent_by: teamMember?.name ?? null,
      })

      return { phone: intl, name: display, whatsapp, sms }
    },
  })
}
