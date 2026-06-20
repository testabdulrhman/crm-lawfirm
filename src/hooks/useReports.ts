import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import type { AssigneePerformance, ReportsOverview } from '@/types/db'

export function useReportsOverview() {
  return useQuery({
    queryKey: ['reports_overview'],
    staleTime: 60_000,
    queryFn: async (): Promise<ReportsOverview> => {
      const { data, error } = await supabase.rpc('reports_overview')
      if (error) throw error
      return data as ReportsOverview
    },
  })
}

export function useReportsByAssignee() {
  return useQuery({
    queryKey: ['reports_by_assignee'],
    staleTime: 60_000,
    queryFn: async (): Promise<AssigneePerformance[]> => {
      const { data, error } = await supabase.rpc('reports_by_assignee')
      if (error) throw error
      return (data ?? []) as AssigneePerformance[]
    },
  })
}
