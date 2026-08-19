// غرفة عمل المهمة: الفريق + نسخ ملف العمل + التعليقات بمنشن + سلسلة الاعتماد.
//
// دورة الاعتماد (بتصميم المستخدم 2026-08-11):
//   عمل ← «رفع للاعتماد» ← بانتظار الاعتماد ← المعتمِد إما:
//     • اعتماد نهائي  → المهمة تُنجز
//     • اعتماد وإحالة → تسجَّل موافقته وتنتقل لمدير آخر (اعتماد متسلسل)
//     • إرجاع بملاحظة → تعود للعمل
//   review_by = من بيده الاعتماد الآن (null = أي مدير).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { uploadFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { notify, notifyMany } from '@/hooks/useNotifications'
import { tapFeedback } from '@/lib/push'
import type {
  Task,
  TaskParticipant,
  TaskFile,
  TaskComment,
  TaskApproval,
} from '@/types/db'

// ⚠️ أكثر من عمود يشير إلى team_members في كل جدول — سمِّ القيد صراحةً
//    وإلا رفضت PostgREST الاستعلام كاملاً (PGRST201، درس صفحة المهام).
const MEMBER_MINI = 'id,name,short_name,avatar_color,avatar_initial'

export interface TaskDetail extends Task {
  case?: { id: string; title: string | null; office_num: string | null } | null
  assignee?: {
    id: string
    name: string | null
    short_name: string | null
    avatar_color: string | null
    avatar_initial: string | null
  } | null
  reviewer?: { id: string; name: string | null; short_name: string | null } | null
  creator?: { id: string; name: string | null; short_name: string | null } | null
}

const DETAIL_SELECT =
  '*, case:cases(id,title,office_num), ' +
  `assignee:team_members!tasks_assignee_id_fkey(${MEMBER_MINI}), ` +
  'reviewer:team_members!tasks_review_by_fkey(id,name,short_name), ' +
  'creator:team_members!tasks_created_by_fkey(id,name,short_name)'

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

// إبطال كل ما يعرض هذه المهمة: الغرفة + اللوحة + تبويب القضية + العدّادات
function invalidateRoom(qc: ReturnType<typeof useQueryClient>, taskId: string) {
  qc.invalidateQueries({ queryKey: ['task-room', taskId] })
  qc.invalidateQueries({ queryKey: ['tasks-board'] })
  qc.invalidateQueries({ queryKey: ['case_tasks'] })
  qc.invalidateQueries({ queryKey: ['my-open-tasks'] })
  qc.invalidateQueries({ queryKey: ['review-count'] })
  qc.invalidateQueries({ queryKey: ['dashboard'] })
}

/* ===================== القراءة ===================== */

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ['task-room', taskId, 'detail'],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskDetail> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(DETAIL_SELECT)
        .eq('id', taskId)
        .single()
      if (error) throw error
      return data as unknown as TaskDetail
    },
  })
}

export function useTaskParticipants(taskId: string | null) {
  return useQuery({
    queryKey: ['task-room', taskId, 'participants'],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskParticipant[]> => {
      const { data, error } = await supabase
        .from('task_participants')
        .select(`*, member:team_members!task_participants_member_id_fkey(${MEMBER_MINI})`)
        .eq('task_id', taskId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as TaskParticipant[]
    },
  })
}

export function useTaskFiles(taskId: string | null) {
  return useQuery({
    queryKey: ['task-room', taskId, 'files'],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskFile[]> => {
      const { data, error } = await supabase
        .from('task_files')
        .select('*, uploader:team_members!task_files_uploaded_by_fkey(id,name,short_name)')
        .eq('task_id', taskId)
        .order('version', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as TaskFile[]
    },
  })
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: ['task-room', taskId, 'comments'],
    enabled: !!taskId,
    // نقاش حي — تحديث دوري خفيف كالإشعارات
    refetchInterval: 30_000,
    queryFn: async (): Promise<TaskComment[]> => {
      const { data, error } = await supabase
        .from('task_comments')
        .select(`*, author:team_members!task_comments_author_id_fkey(${MEMBER_MINI})`)
        .eq('task_id', taskId)
        .is('deleted_at', null)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as TaskComment[]
    },
  })
}

export function useTaskApprovals(taskId: string | null) {
  return useQuery({
    queryKey: ['task-room', taskId, 'approvals'],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskApproval[]> => {
      const { data, error } = await supabase
        .from('task_approvals')
        .select(
          '*, actor:team_members!task_approvals_actor_id_fkey(id,name,short_name), ' +
            'forwardee:team_members!task_approvals_forwarded_to_fkey(id,name,short_name)'
        )
        .eq('task_id', taskId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as TaskApproval[]
    },
  })
}

/** شارة «بانتظار اعتمادك»: محالة لي، أو لأي مدير وأنا مدير */
export function useMyReviewCount() {
  const { teamMember } = useAuth()
  const myId = teamMember?.id ?? null
  const isDirector = !!teamMember?.is_director

  return useQuery({
    queryKey: ['review-count', myId, isDirector],
    enabled: !!myId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      let q = supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'review')
      q = isDirector
        ? q.or(`review_by.eq.${myId},review_by.is.null`)
        : q.eq('review_by', myId)
      const { count, error } = await q
      if (error) throw error
      return count ?? 0
    },
  })
}

/* ===================== الفريق ===================== */

export function useAddParticipant(taskId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({
      memberId,
      taskTitle,
    }: {
      memberId: string
      taskTitle: string | null
    }) => {
      const { error } = await supabase.from('task_participants').insert({
        task_id: taskId,
        member_id: memberId,
        added_by: teamMember?.id ?? null,
      })
      if (error) throw error
      if (memberId !== teamMember?.id) {
        await notify({
          recipientId: memberId,
          type: 'task_assigned',
          title: 'أُضفت لفريق مهمة',
          message: taskTitle,
          taskId,
        })
      }
    },
    onSuccess: () => invalidateRoom(qc, taskId),
    onError: (e: unknown) => {
      const msg = errMessage(e) ?? ''
      toast({
        variant: 'destructive',
        title: 'تعذّرت الإضافة',
        description: msg.includes('duplicate') ? 'الموظف في الفريق أصلاً.' : msg,
      })
    },
  })
}

export function useRemoveParticipant(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (participantId: string) => {
      const { error } = await supabase
        .from('task_participants')
        .delete()
        .eq('id', participantId)
      if (error) throw error
    },
    onSuccess: () => invalidateRoom(qc, taskId),
    onError: errToast('تعذّر الحذف من الفريق'),
  })
}

/* ===================== نسخ ملف العمل ===================== */

export function useUploadTaskVersion(taskId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({
      file,
      note,
    }: {
      file: File
      note: string | null
    }): Promise<number> => {
      const { publicUrl } = await uploadFile(file, { folder: `tasks/${taskId}` })
      // version يملؤه مشغّل القاعدة ذرّياً؛ عند سباق نادر يصطدم القيد الفريد
      // فنعيد المحاولة مرة واحدة
      const insert = () =>
        supabase
          .from('task_files')
          .insert({
            task_id: taskId,
            file_url: publicUrl,
            file_name: file.name,
            file_size: file.size,
            note: note?.trim() || null,
            uploaded_by: teamMember?.id ?? null,
          })
          .select('version')
          .single()
      let { data, error } = await insert()
      if (error && error.code === '23505') ({ data, error } = await insert())
      if (error) throw error
      return (data?.version as number) ?? 1
    },
    onSuccess: (version) => {
      invalidateRoom(qc, taskId)
      toast({ variant: 'success', title: `رُفعت النسخة ${version}` })
    },
    onError: errToast('تعذّر رفع الملف'),
  })
}

/* ===================== التعليقات والمنشن ===================== */

export function useAddComment(taskId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({
      body,
      mentions,
      taskTitle,
    }: {
      body: string
      mentions: string[]
      taskTitle: string | null
    }) => {
      const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        author_id: teamMember?.id ?? null,
        body: body.trim(),
        mentions,
      })
      if (error) throw error
      // المذكورون يصلهم إشعار داخلي (قرار المستخدم: بلا SMS)
      const others = mentions.filter((m) => m !== teamMember?.id)
      if (others.length > 0) {
        await notifyMany(others, {
          type: 'mention',
          title: `ذكرك ${teamMember?.short_name || teamMember?.name || 'زميل'} في مهمة`,
          message: taskTitle ? `${taskTitle}: ${body.slice(0, 80)}` : body.slice(0, 80),
          taskId,
        })
      }
    },
    onSuccess: () => invalidateRoom(qc, taskId),
    onError: errToast('تعذّر إرسال التعليق'),
  })
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('task_comments')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: teamMember?.name ?? null,
        })
        .eq('id', commentId)
      if (error) throw error
    },
    onSuccess: () => invalidateRoom(qc, taskId),
    onError: errToast('تعذّر حذف التعليق'),
  })
}

/* ===================== دورة الاعتماد ===================== */

/** رفع للاعتماد: لمدير محدّد أو لأي مدير (reviewerId = null) */
export function useSubmitForReview(taskId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({
      reviewerId,
      fileId,
      note,
      taskTitle,
      directorIds,
    }: {
      reviewerId: string | null
      fileId: string | null
      note: string | null
      taskTitle: string | null
      /** كل المدراء النشطين — لإشعارهم عندما يكون الاعتماد مفتوحاً لأي مدير */
      directorIds: string[]
    }) => {
      const { error } = await supabase
        .from('tasks')
        .update({
          status: 'review',
          submitted_at: new Date().toISOString(),
          submitted_by: teamMember?.id ?? null,
          review_by: reviewerId,
        })
        .eq('id', taskId)
      if (error) throw error

      const { error: e2 } = await supabase.from('task_approvals').insert({
        task_id: taskId,
        file_id: fileId,
        action: 'submitted',
        actor_id: teamMember?.id ?? null,
        note: note?.trim() || null,
        forwarded_to: reviewerId,
      })
      if (e2) throw e2

      const recipients = reviewerId ? [reviewerId] : directorIds
      await notifyMany(
        recipients.filter((id) => id !== teamMember?.id),
        {
          type: 'task_review',
          title: 'مهمة بانتظار اعتمادك',
          message: taskTitle,
          taskId,
        }
      )
    },
    onSuccess: () => {
      invalidateRoom(qc, taskId)
      toast({ variant: 'success', title: 'رُفعت للاعتماد ✓' })
    },
    onError: errToast('تعذّر رفع المهمة للاعتماد'),
  })
}

/** الاعتماد: نهائي (تُنجز) أو اعتماد وإحالة لمدير آخر (اعتماد متسلسل) */
export function useApproveTask(taskId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({
      forwardTo,
      fileId,
      note,
      taskTitle,
      notifyIds,
    }: {
      /** null = اعتماد نهائي · معرّف مدير = اعتماد وإحالة له */
      forwardTo: string | null
      fileId: string | null
      note: string | null
      taskTitle: string | null
      /** من يُبلَّغ بالنتيجة النهائية (الرافع + الفريق) */
      notifyIds: string[]
    }) => {
      const final = !forwardTo
      const { error } = await supabase
        .from('tasks')
        .update(
          final
            ? {
                status: 'done',
                done_at: new Date().toISOString(),
                approved_at: new Date().toISOString(),
                approved_by: teamMember?.id ?? null,
                review_by: null,
              }
            : { review_by: forwardTo }
        )
        .eq('id', taskId)
      if (error) throw error

      const { error: e2 } = await supabase.from('task_approvals').insert({
        task_id: taskId,
        file_id: fileId,
        action: final ? 'approved' : 'forwarded',
        actor_id: teamMember?.id ?? null,
        note: note?.trim() || null,
        forwarded_to: forwardTo,
      })
      if (e2) throw e2

      if (final) {
        await notifyMany(
          notifyIds.filter((id) => id !== teamMember?.id),
          {
            type: 'task_approved',
            title: `اعتمد ${teamMember?.short_name || teamMember?.name || 'المدير'} المهمة ✓`,
            message: taskTitle,
            taskId,
          }
        )
      } else {
        await notify({
          recipientId: forwardTo,
          type: 'task_review',
          title: `اعتمدها ${teamMember?.short_name || teamMember?.name || 'مدير'} وأحالها لاعتمادك`,
          message: taskTitle,
          taskId,
        })
      }
      return final
    },
    onSuccess: (final) => {
      invalidateRoom(qc, taskId)
      void tapFeedback('success')
      toast({
        variant: 'success',
        title: final ? 'اعتُمدت المهمة وأُنجزت ✓' : 'اعتُمدت وأُحيلت للاعتماد الثاني',
      })
    },
    onError: errToast('تعذّر الاعتماد'),
  })
}

/** إرجاع للعمل بملاحظة */
export function useReturnTask(taskId: string) {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({
      note,
      taskTitle,
      notifyIds,
    }: {
      note: string
      taskTitle: string | null
      notifyIds: string[]
    }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'todo', review_by: null })
        .eq('id', taskId)
      if (error) throw error

      const { error: e2 } = await supabase.from('task_approvals').insert({
        task_id: taskId,
        action: 'returned',
        actor_id: teamMember?.id ?? null,
        note: note.trim() || null,
      })
      if (e2) throw e2

      await notifyMany(
        notifyIds.filter((id) => id !== teamMember?.id),
        {
          type: 'task_returned',
          title: 'أُرجعت المهمة للعمل',
          message: taskTitle ? `${taskTitle}${note ? ` — ${note.slice(0, 60)}` : ''}` : note,
          taskId,
        }
      )
    },
    onSuccess: () => {
      invalidateRoom(qc, taskId)
      toast({ title: 'أُرجعت المهمة للعمل مع الملاحظة' })
    },
    onError: errToast('تعذّر إرجاع المهمة'),
  })
}

/* ===================== قائمة التحقق (المهام الفرعية) ===================== */

export interface TaskSubtask {
  id: string
  task_id: string
  title: string
  is_done: boolean
  created_at: string
}

export function useTaskSubtasks(taskId: string | null) {
  return useQuery({
    queryKey: ['task-room', taskId, 'subtasks'],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskSubtask[]> => {
      const { data, error } = await supabase
        .from('task_subtasks')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as TaskSubtask[]
    },
  })
}

export function useAddSubtask(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase
        .from('task_subtasks')
        .insert({ task_id: taskId, title: title.trim(), is_done: false })
      if (error) throw error
    },
    onSuccess: () => invalidateRoom(qc, taskId),
    onError: errToast('تعذّرت إضافة البند'),
  })
}

export function useToggleSubtask(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('task_subtasks')
        .update({ is_done: done })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateRoom(qc, taskId),
    onError: errToast('تعذّر تحديث البند'),
  })
}

export function useDeleteSubtask(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_subtasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidateRoom(qc, taskId),
    onError: errToast('تعذّر حذف البند'),
  })
}

/* ===================== الخط الزمني الموحّد ===================== */

export type TimelineItem =
  | { kind: 'comment'; at: string; comment: TaskComment }
  | { kind: 'file'; at: string; file: TaskFile }
  | { kind: 'approval'; at: string; approval: TaskApproval }

/** دمج التعليقات والنسخ وأحداث الاعتماد في قصة واحدة بترتيب حدوثها */
export function buildTimeline(
  comments: TaskComment[],
  files: TaskFile[],
  approvals: TaskApproval[]
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...comments.map((c) => ({ kind: 'comment' as const, at: c.created_at, comment: c })),
    ...files.map((f) => ({ kind: 'file' as const, at: f.created_at, file: f })),
    ...approvals.map((a) => ({ kind: 'approval' as const, at: a.created_at, approval: a })),
  ]
  return items.sort((a, b) => a.at.localeCompare(b.at))
}

export const APPROVAL_ACTION_LABELS: Record<string, string> = {
  submitted: 'رفعها للاعتماد',
  approved: 'اعتمدها نهائياً ✓',
  forwarded: 'اعتمدها وأحالها',
  returned: 'أرجعها للعمل',
}
