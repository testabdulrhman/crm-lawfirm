// المهام على مستوى النظام كله (لا داخل قضية فقط):
// «مهامي» لكل موظف، ولوحة الفريق للمدير، ومهام بلا قضية (إدارية).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { todayISO } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { notify } from '@/hooks/useNotifications'
import type { Task, TaskInput } from '@/types/db'

export interface TaskRow extends Task {
  case?: { id: string; title: string | null; office_num: string | null } | null
  assignee?: { id: string; name: string | null; short_name: string | null } | null
}

// ⚠️ tasks فيه عمودان يشيران إلى team_members (assignee_id و created_by)، فلا بد
//    من تسمية القيد صراحةً. بدونه ترفض PostgREST الاستعلام كاملاً (PGRST201)
//    فتظهر الصفحة فارغة بينما الشارة — التي تَعُدّ بلا embed — تعرض رقماً صحيحاً.
const SELECT =
  '*, case:cases(id,title,office_num), assignee:team_members!tasks_assignee_id_fkey(id,name,short_name)'

const LIST_KEY = 'tasks-board'

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

// إبطال كل ما يعرض المهام: اللوحة + تبويب القضية + العدّاد + لوحة التحكم
function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [LIST_KEY] })
  qc.invalidateQueries({ queryKey: ['case_tasks'] })
  qc.invalidateQueries({ queryKey: ['my-open-tasks'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

/** قائمة المهام: مهامي أنا أو مهام الفريق كله */
export function useTasks(scope: 'mine' | 'all', assigneeId: string | null) {
  const { teamMember } = useAuth()
  const myId = teamMember?.id ?? null

  return useQuery({
    queryKey: [LIST_KEY, scope, scope === 'mine' ? myId : assigneeId],
    enabled: scope === 'all' || !!myId,
    queryFn: async (): Promise<TaskRow[]> => {
      let q = supabase.from('tasks').select(SELECT).limit(500)
      if (scope === 'mine' && myId) q = q.eq('assignee_id', myId)
      if (scope === 'all' && assigneeId) q = q.eq('assignee_id', assigneeId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as TaskRow[]
    },
  })
}

/** عدّاد الشريط الجانبي: المتأخر + المستحق اليوم للموظف الحالي */
export function useMyOpenTasksCount() {
  const { teamMember } = useAuth()
  const myId = teamMember?.id ?? null

  return useQuery({
    queryKey: ['my-open-tasks', myId],
    enabled: !!myId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assignee_id', myId)
        .neq('status', 'done')
        .lte('due_date', todayISO())
      if (error) throw error
      return count ?? 0
    },
  })
}

/** إنجاز/إرجاع المهمة بضغطة واحدة */
export function useToggleTaskDone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: done ? 'done' : 'todo',
          done_at: done ? new Date().toISOString() : null,
        })
        .eq('id', id)
      if (error) throw error
      return done
    },
    onSuccess: (done) => {
      invalidateAll(qc)
      if (done) toast({ variant: 'success', title: 'أُنجزت المهمة ✅' })
    },
    onError: errToast('تعذّر تحديث حالة المهمة'),
  })
}

/** إنشاء أو تعديل مهمة (القضية اختيارية) */
export function useSaveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string | null
      input: TaskInput
    }) => {
      if (id) {
        const { error } = await supabase.from('tasks').update(input).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('tasks')
          .insert({ status: 'todo', ...input })
        if (error) throw error
        // إشعار المسؤول عند إسناد مهمة له (لا تُشعر نفسك)
        if (input.assignee_id && input.assignee_id !== input.created_by) {
          await notify({
            recipientId: input.assignee_id,
            type: 'task_assigned',
            title: 'أُسندت لك مهمة جديدة',
            message: input.title,
            caseId: input.case_id ?? null,
          })
        }
      }
      return !!id
    },
    onSuccess: (wasEdit) => {
      invalidateAll(qc)
      toast({
        variant: 'success',
        title: wasEdit ? 'حُدّثت المهمة' : 'أُضيفت المهمة',
      })
    },
    onError: errToast('تعذّر حفظ المهمة'),
  })
}

export function useRemoveTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'حُذفت المهمة' })
    },
    onError: errToast('تعذّر حذف المهمة'),
  })
}

/* ===== تجميع المهام في مجموعات زمنية (متأخر/اليوم/الأسبوع/لاحقاً/بلا موعد) ===== */

export type BucketKey =
  | 'overdue'
  | 'today'
  | 'week'
  | 'later'
  | 'someday'
  | 'done'

export const BUCKET_LABELS: Record<BucketKey, string> = {
  overdue: 'متأخرة',
  today: 'اليوم',
  week: 'هذا الأسبوع',
  later: 'لاحقاً',
  someday: 'بلا موعد',
  done: 'مكتملة',
}

export function bucketOf(t: TaskRow): BucketKey {
  if (t.status === 'done') return 'done'
  if (!t.due_date) return 'someday'
  const today = todayISO()
  if (t.due_date < today) return 'overdue'
  if (t.due_date === today) return 'today'
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  return t.due_date <= weekEnd ? 'week' : 'later'
}

/** ترتيب داخل المجموعة: العاجل أولاً، ثم الأقرب موعداً، ثم الأولوية */
const PRIORITY_ORDER: Record<string, number> = { high: 0, med: 1, low: 2 }

export function sortTasks(a: TaskRow, b: TaskRow): number {
  const ua = a.is_urgent ? 0 : 1
  const ub = b.is_urgent ? 0 : 1
  if (ua !== ub) return ua - ub
  const da = a.due_date ?? '9999-12-31'
  const db = b.due_date ?? '9999-12-31'
  if (da !== db) return da.localeCompare(db)
  return (
    (PRIORITY_ORDER[a.priority ?? 'med'] ?? 1) -
    (PRIORITY_ORDER[b.priority ?? 'med'] ?? 1)
  )
}
