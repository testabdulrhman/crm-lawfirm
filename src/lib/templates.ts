// مساعدات قوالب الرسائل (message_templates) وتعبئة المتغيّرات.
// القالب الواحد له ثلاثة نصوص بحسب القناة: نصية (body) وواتساب وبريد،
// والفارغ منها يرث نصَّ النصية — فالقالب القديم يعمل كما هو.
import { supabase } from '@/lib/supabase'

export type TemplateChannel = 'sms' | 'whatsapp' | 'email'

export interface TemplateVariants {
  sms: string | null
  whatsapp: string | null
  email: string | null
  emailSubject: string | null
}

// يجلب نصوص القالب الثلاثة دفعة واحدة (مع الوراثة محسوبة).
export async function getTemplateVariants(
  key: string
): Promise<TemplateVariants | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('body, body_whatsapp, body_email, email_subject, name')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const base = (data.body as string | null) ?? null
  return {
    sms: base,
    whatsapp: (data.body_whatsapp as string | null) || base,
    email: (data.body_email as string | null) || base,
    emailSubject:
      (data.email_subject as string | null) || (data.name as string | null),
  }
}

// يجلب نصّ القالب حسب المفتاح والقناة (الافتراضي: النصية)، أو null إن لم يوجد.
export async function getTemplate(
  key: string,
  channel: TemplateChannel = 'sms'
): Promise<string | null> {
  const v = await getTemplateVariants(key)
  if (!v) return null
  return channel === 'whatsapp' ? v.whatsapp : channel === 'email' ? v.email : v.sms
}

// يستبدل المتغيّرات بصيغة {name} في نصّ القالب.
export function fillTemplate(
  body: string,
  vars: Record<string, string>
): string {
  return body.replace(/\{(\w+)\}/g, (_m, key: string) =>
    key in vars ? vars[key] : `{${key}}`
  )
}
