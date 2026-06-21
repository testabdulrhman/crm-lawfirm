import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import type { DashboardOverview } from '@/types/db'

export function useDashboardOverview() {
  return useQuery({
    queryKey: ['dashboard_overview'],
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardOverview> => {
      const { data, error } = await supabase.rpc('dashboard_overview')
      if (error) throw error
      return data as DashboardOverview
    },
  })
}
