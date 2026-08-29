import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

// «قصة الملف» — قراءة العمود الفقري matter_events.
// الجدول يُكتب من مشغّلات القاعدة (بصيغة المتكلم) ومن أفعال بشرية لاحقاً؛
// هنا قراءة فقط. الكتابة البشرية تأتي في مرحلة تالية.

export interface MatterEvent {
  id: string
  matter_id: string
  actor: string | null
  actor_name: string | null
  kind: string
  sentence: string
  payload: Record<string, unknown>
  narrate: boolean
  created_at: string
}

/** أحداث ملف واحد — الأحدث أولاً (الجملة الكبيرة فوق، والتاريخ يهبط) */
export function useMatterEvents(matterId: string | null, limit = 80) {
  return useQuery({
    queryKey: ['matter_events', matterId, limit],
    enabled: !!matterId,
    staleTime: 30_000,
    queryFn: async (): Promise<MatterEvent[]> => {
      const { data, error } = await supabase
        .from('matter_events')
        .select('*')
        .eq('matter_id', matterId!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as MatterEvent[]
    },
  })
}

export interface Narration extends MatterEvent {
  matter_title: string | null
  matter_kind: string | null
}

/**
 * «بينما كنت مشغولاً» — ما فعله النظام مؤخراً على مستوى المكتب.
 * narrate=true فقط، وآخر 48 ساعة، وبسقف صغير: السرد يفقد قيمته إن صار سجلاً.
 */
export function useRecentNarrations(limit = 5) {
  return useQuery({
    queryKey: ['recent_narrations', limit],
    staleTime: 60_000,
    queryFn: async (): Promise<Narration[]> => {
      const now = new Date()
      const since = new Date(now.getTime() - 48 * 3600_000).toISOString()
      const { data, error } = await supabase
        .from('matter_events')
        // انضمام داخلي: أحداث الملفات المرمية في السلة لا تُسرد على المكتب
        .select('*, matter:cases!inner(title, kind, deleted_at)')
        .eq('narrate', true)
        .is('matter.deleted_at', null)
        .gte('created_at', since)
        .lte('created_at', now.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []).map((r: any) => ({
        ...r,
        matter_title: r.matter?.title ?? null,
        matter_kind: r.matter?.kind ?? null,
      }))
    },
  })
}
