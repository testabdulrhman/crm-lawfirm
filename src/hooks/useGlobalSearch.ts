import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'

export type SearchKind = 'case' | 'contact' | 'poa'

export interface GlobalSearchResult {
  kind: SearchKind
  id: string
  title: string
  subtitle: string | null
  status: string | null
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
