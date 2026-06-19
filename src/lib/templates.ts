// مساعدات قوالب الرسائل (message_templates) وتعبئة المتغيّرات.
import { supabase } from '@/lib/supabase'

// يجلب نصّ القالب حسب المفتاح (body)، أو null إن لم يوجد.
export async function getTemplate(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('body')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  return (data?.body as string | undefined) ?? null
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
