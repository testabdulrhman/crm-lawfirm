import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/stores/auth'
import { toast } from '@/hooks/use-toast'
import { TASK_PRIORITY_ORDER } from '@/lib/caseLabels'
import type { Task, TaskInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

function key(caseId: string) {
  return ['case_tasks', caseId]
}

export function useCaseTasks(caseId: string) {
  return useQuery({
    queryKey: key(caseId),
    enabled: !!caseId,
    queryFn: async (): Promise<Task[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, subtasks:task_subtasks(*)')
        .is('deleted_at', null)
        .eq('case_id', caseId)
      if (error) throw error
      const tasks = (data ?? []) as unknown as Task[]
      // ترتيب: غير المكتملة أولاً، ثم الأولوية (high→low)، ثم due_date
      return tasks.sort((a, b) => {
        const da = a.status === 'done' ? 1 : 0
        const db = b.status === 'done' ? 1 : 0
        if (da !== db) return da - db
        const pa = TASK_PRIORITY_ORDER[a.priority ?? 'med'] ?? 1
        const pb = TASK_PRIORITY_ORDER[b.priority ?? 'med'] ?? 1
        if (pa !== pb) return pa - pb
        return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
      })
    },
  })
}

export function useAddTask(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TaskInput): Promise<void> => {
      const { error } = await supabase
        .from('tasks')
        .insert({ status: 'todo', ...input })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تمت إضافة المهمة' })
    },
    onError: errToast('تعذّرت إضافة المهمة'),
  })
}

export function useUpdateTask(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<TaskInput>
    }): Promise<void> => {
      const { error } = await supabase.from('tasks').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم تحديث المهمة' })
    },
    onError: errToast('تعذّر تحديث المهمة'),
  })
}

export function useToggleTask(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      done,
    }: {
      id: string
      done: boolean
    }): Promise<void> => {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: done ? 'done' : 'todo',
          done_at: done ? new Date().toISOString() : null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
    },
    onError: errToast('تعذّر تحديث حالة المهمة'),
  })
}

export function useDeleteTask(caseId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  const byName = teamMember?.name ?? null
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // ⚠️ حذف ناعم — نفس سلوك صفحة المهام العامة (انظر useTasks.ts)
      const { data: row } = await supabase
        .from('tasks').select('title').eq('id', id).maybeSingle()

      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString(), deleted_by: byName })
        .eq('id', id)
      if (error) throw error

      try {
        await supabase.from('activity_log').insert({
          type: 'delete', entity: 'task',
          title: `حذف مهمة: ${row?.title ?? ''}`,
          case_id: caseId, user_name: byName,
        })
      } catch {
        /* التسجيل ثانوي */
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم حذف المهمة' })
    },
    onError: errToast('تعذّر حذف المهمة'),
  })
}

/* ===== المهام الفرعية ===== */

export function useAddSubtask(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      title,
    }: {
      taskId: string
      title: string
    }): Promise<void> => {
      const { error } = await supabase
        .from('task_subtasks')
        .insert({ task_id: taskId, title, is_done: false })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
    },
    onError: errToast('تعذّرت إضافة المهمة الفرعية'),
  })
}

export function useToggleSubtask(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      done,
    }: {
      id: string
      done: boolean
    }): Promise<void> => {
      const { error } = await supabase
        .from('task_subtasks')
        .update({ is_done: done })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
    },
    onError: errToast('تعذّر تحديث المهمة الفرعية'),
  })
}

export function useDeleteSubtask(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('task_subtasks')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
    },
    onError: errToast('تعذّر حذف المهمة الفرعية'),
  })
}
