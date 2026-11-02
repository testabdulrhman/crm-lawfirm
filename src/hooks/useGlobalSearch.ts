import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

// المستندات (حتى نصّها) والمهام والصادر والأحكام — طلب المدير 2026-11-03: «يبحث عن كل شيء»
export type SearchKind = 'case' | 'contact' | 'poa' | 'document' | 'task' | 'outgoing' | 'ruling' | 'discussion'

export interface GlobalSearchResult {
  kind: SearchKind
  id: string
  title: string
  subtitle: string | null
  status: string | null
  /** الملف المرتبط (للمستند والمهمة والحكم والنقاش) */
  case_id: string | null
  /** رابط الملف نفسه — المستند والخطاب والحكم */
  url: string | null
  /** نوع الملف — يحدّد صفحته (matterHref) */
  matter_kind: string | null
}

// قيمة مؤجّلة (debounce)
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function useGlobalSearch(query: string) {
  const q = useDebouncedValue(query.trim(), 300)
  const enabled = q.length >= 2

  const result = useQuery({
    queryKey: ['global_search', q],
    enabled,
    queryFn: async (): Promise<GlobalSearchResult[]> => {
      const { data, error } = await supabase.rpc('global_search', { q })
      if (error) throw error
      return (data ?? []) as GlobalSearchResult[]
    },
  })

  return { ...result, enabled, debouncedQuery: q }
}
