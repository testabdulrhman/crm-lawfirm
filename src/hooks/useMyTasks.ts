import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

// مهمة مسندة للمستخدم الحالي (من دالة my_tasks)
export interface MyTask {
  id: string
  case_id: string | null
  case_title: string | null
  title: string | null
  description: string | null
  priority: string | null
  status: string | null
  due_date: string | null
  is_urgent: boolean | null
  overdue: boolean | null
  task_type: string | null
}

export interface MyTasksStats {
  todo: number
  overdue: number
  urgent: number
  due_today: number
  done: number
}

// status: 'todo' | 'done' | null (للكل)
export function useMyTasks(status: string | null = 'todo') {
  return useQuery({
    queryKey: ['my_tasks', status],
    queryFn: async (): Promise<MyTask[]> => {
      const { data, error } = await supabase.rpc('my_tasks', { p_status: status })
      if (error) throw error
      return (data ?? []) as MyTask[]
    },
  })
}

const EMPTY_STATS: MyTasksStats = {
  todo: 0,
  overdue: 0,
  urgent: 0,
  due_today: 0,
  done: 0,
}

export function useMyTasksStats() {
  return useQuery({
    queryKey: ['my_tasks_stats'],
    queryFn: async (): Promise<MyTasksStats> => {
      const { data, error } = await supabase.rpc('my_tasks_stats')
      if (error) throw error
      return { ...EMPTY_STATS, ...(data as Partial<MyTasksStats> | null) }
    },
  })
}

function refreshTaskQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['my_tasks'] })
  qc.invalidateQueries({ queryKey: ['my_tasks_stats'] })
  qc.invalidateQueries({ queryKey: ['dashboard_overview'] })
}

// إكمال مهمة (متفائل: تُزال من القوائم فوراً مع تراجع عند الخطأ)
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
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['my_tasks'] })
      const prev = qc.getQueriesData<MyTask[]>({ queryKey: ['my_tasks'] })
      qc.setQueriesData<MyTask[]>({ queryKey: ['my_tasks'] }, (old) =>
        old ? old.filter((t) => t.id !== id) : old
      )
      return { prev }
    },
    onError: (_e, _id, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data))
      toast({ variant: 'destructive', title: 'تعذّر إكمال المهمة' })
    },
    onSuccess: () => toast({ variant: 'success', title: 'تم إنجاز المهمة' }),
    onSettled: () => refreshTaskQueries(qc),
  })
}

// إعادة فتح مهمة منجزة
export function useReopenTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'todo', done_at: null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => toast({ variant: 'success', title: 'أُعيدت المهمة' }),
    onSettled: () => refreshTaskQueries(qc),
  })
}
