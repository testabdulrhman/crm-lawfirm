import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { arPlural } from '@/lib/format'

export interface ErrorLogRow {
  id: string
  error_type: string | null
  message: string | null
  source: string | null
  stack: string | null
  user_name: string | null
  user_id: string | null
  url: string | null
  created_at: string
}

const KEY = ['error_logs'] as const

/** آخر الأخطاء — المدير يرى الكل، والقاعدة تحصر غيره في أخطائه */
export function useErrorLogs(limit = 1000) {
  return useQuery({
    queryKey: [...KEY, limit],
    staleTime: 30_000,
    queryFn: async (): Promise<ErrorLogRow[]> => {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as ErrorLogRow[]
    },
  })
}

/** مسح سجلات (بعد إصلاح سببها) — للمدير وحده، تفرضه القاعدة */
export function useDeleteErrorLogs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      // على دفعات: رابط الطلب يطول مع المعرّفات
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase
          .from('error_logs')
          .delete()
          .in('id', ids.slice(i, i + 100))
        if (error) throw error
      }
    },
    onSuccess: (_d, ids) => {
      qc.invalidateQueries({ queryKey: KEY })
      toast({
        variant: 'success',
        title: `مُسح من السجل ${
          ids.length === 1
            ? 'خطأ واحد'
            : arPlural(ids.length, { one: 'خطأً', two: 'خطآن', many: 'أخطاء' })
        }`,
      })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر مسح السجل', description: errMessage(e) }),
  })
}
