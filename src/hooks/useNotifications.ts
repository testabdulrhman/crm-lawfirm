// مركز الإشعارات داخل النظام — جدول notifications (كان جاهزاً في القاعدة وغير مستخدم).
// أي حدث يهم الموظف يُكتب هنا، ويُقرأ في جرس الشريط العلوي.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'

export interface AppNotification {
  id: string
  type: string | null
  title: string | null
  message: string | null
  recipient_id: string | null
  case_id: string | null
  task_id: string | null
  is_read: boolean | null
  created_at: string
}

const KEY = 'notifications'

/** أنواع الإشعارات ووجهة كل نوع عند الضغط */
export const NOTIFICATION_TYPES = {
  mention: 'منشن',
  task_assigned: 'مهمة جديدة',
  task_due: 'مهمة مستحقة',
  task_comment: 'تعليق على مهمة',
  task_review: 'مهمة بانتظار اعتمادك',
  task_approved: 'اعتُمدت المهمة',
  task_returned: 'أُرجعت المهمة',
  approval_request: 'طلب اعتماد',
  approval_result: 'نتيجة اعتماد',
  session_soon: 'جلسة قريبة',
  incoming_message: 'رسالة واردة',
} as const

export function useNotifications(limit = 30) {
  const { teamMember } = useAuth()
  const myId = teamMember?.id ?? null

  return useQuery({
    queryKey: [KEY, myId],
    enabled: !!myId,
    // تحديث دوري خفيف حتى تصل الإشعارات بلا إعادة تحميل
    refetchInterval: 60_000,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', myId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as AppNotification[]
    },
  })
}

export function useUnreadCount() {
  const { teamMember } = useAuth()
  const myId = teamMember?.id ?? null

  return useQuery({
    queryKey: [KEY, 'unread', myId],
    enabled: !!myId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', myId)
        .eq('is_read', false)
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (id: string | 'all') => {
      let q = supabase.from('notifications').update({ is_read: true })
      q = id === 'all' ? q.eq('recipient_id', teamMember?.id ?? '') : q.eq('id', id)
      const { error } = await q
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر تحديث الإشعار',
        description: errMessage(e),
      }),
  })
}

/**
 * إنشاء إشعار لموظف — تُستدعى من أي مكان في النظام.
 * صامتة عمداً: فشل الإشعار يجب ألا يُفشل العملية الأصلية.
 */
export async function notify(args: {
  recipientId: string | null | undefined
  type: keyof typeof NOTIFICATION_TYPES
  title: string
  message?: string | null
  caseId?: string | null
  taskId?: string | null
}): Promise<void> {
  if (!args.recipientId) return
  try {
    await supabase.from('notifications').insert({
      recipient_id: args.recipientId,
      type: args.type,
      title: args.title,
      message: args.message ?? null,
      case_id: args.caseId ?? null,
      task_id: args.taskId ?? null,
      is_read: false,
      channels: ['app'],
    })
  } catch {
    /* الإشعار ثانوي — لا يعطّل شيئاً */
  }
}

/** إشعار لعدة مستلمين دفعة واحدة */
export async function notifyMany(
  recipientIds: (string | null | undefined)[],
  args: Omit<Parameters<typeof notify>[0], 'recipientId'>
): Promise<void> {
  await Promise.all(
    recipientIds.filter(Boolean).map((id) => notify({ ...args, recipientId: id }))
  )
}
