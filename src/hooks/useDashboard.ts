import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { DashboardOverview } from '@/types/db'

export type DashboardScope = 'all' | 'mine'

// نظرة لوحة التحكم حسب النطاق: 'mine' (متطلباتي) أو 'all' (المكتب).
export function useDashboardOverview(scope: DashboardScope = 'all') {
  return useQuery({
    queryKey: ['dashboard_overview', scope],
    staleTime: 60_000,
    queryFn: async (): Promise<DashboardOverview> => {
      const { data, error } = await supabase.rpc('dashboard_overview', {
        p_scope: scope,
      })
      if (error) throw error
      return data as DashboardOverview
    },
  })
}

// إكمال مهمة من اللوحة — يُبطل كل نطاقات اللوحة + قوائم المهام.
export function useCompleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'done', done_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => toast({ variant: 'success', title: 'تم إنجاز المهمة' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['dashboard_overview'] })
      qc.invalidateQueries({ queryKey: ['action_queue'] })
      qc.invalidateQueries({ queryKey: ['my_tasks'] })
      qc.invalidateQueries({ queryKey: ['my_tasks_stats'] })
    },
    onError: () =>
      toast({ variant: 'destructive', title: 'تعذّر إكمال المهمة' }),
  })
}
