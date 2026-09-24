// مركز الإشعارات داخل النظام — جدول notifications (كان جاهزاً في القاعدة وغير مستخدم).
// أي حدث يهم الموظف يُكتب هنا، ويُقرأ في جرس الشريط العلوي.
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

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

/** تصنيفات صفحة «كل الإشعارات» — بادئة النوع كما في notification_category في القاعدة */
export type NotificationFilter =
  | 'all' | 'unread' | 'mention' | 'tasks' | 'sessions' | 'appointments' | 'hr' | 'other'

const PAGE = 50

/**
 * كل ما وصل الموظف منذ البداية، صفحةً بعد صفحة (طلب المدير 2026-09-25: «ابي أفتح كل
 * الإشعارات اللي سبق وأن وصلتني») — الجرس يعرض آخر ٣٠ فقط. لا يُحذف من الجدول شيء.
 */
export function useNotificationHistory(filter: NotificationFilter, search: string) {
  const { teamMember } = useAuth()
  const myId = teamMember?.id ?? null
  const q = search.trim().replace(/[,()%*]/g, ' ').trim()

  return useInfiniteQuery({
    queryKey: [KEY, 'history', myId, filter, q],
    enabled: !!myId,
    initialPageParam: 0,
    getNextPageParam: (last: AppNotification[], all) =>
      last.length === PAGE ? all.length * PAGE : undefined,
    queryFn: async ({ pageParam }): Promise<AppNotification[]> => {
      let req = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', myId)
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE - 1)
      if (filter === 'unread') req = req.eq('is_read', false)
      else if (filter === 'mention') req = req.eq('type', 'mention')
      else if (filter === 'tasks') req = req.or('type.like.task%,type.like.approval%')
      else if (filter === 'sessions') req = req.like('type', 'session%')
      else if (filter === 'appointments') req = req.like('type', 'appointment%')
      else if (filter === 'hr') req = req.like('type', 'hr%')
      else if (filter === 'other')
        req = req.not('type', 'in', '(mention)')
          .not('type', 'like', 'task%').not('type', 'like', 'approval%')
          .not('type', 'like', 'session%').not('type', 'like', 'appointment%')
          .not('type', 'like', 'hr%')
      if (q) req = req.or(`title.ilike.%${q}%,message.ilike.%${q}%`)
      const { data, error } = await req
      if (error) throw error
      return (data ?? []) as AppNotification[]
    },
  })
}

/** إجمالي ما وصلني — لعنوان الصفحة */
export function useNotificationTotal() {
  const { teamMember } = useAuth()
  const myId = teamMember?.id ?? null
  return useQuery({
    queryKey: [KEY, 'total', myId],
    enabled: !!myId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', myId)
      if (error) throw error
      return count ?? 0
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
  await notifyMany([args.recipientId], args)
}

/** وجهة الإشعار داخل التطبيق — يفتحها الضغط على الإشعار الفوري */
function routeOf(a: { taskId?: string | null; caseId?: string | null }): string | null {
  if (a.taskId) return `/tasks/${a.taskId}`
  if (a.caseId) return `/cases/${a.caseId}`
  return null
}

/**
 * إشعار لعدة مستلمين: يُحفظ داخل النظام ثم يُدفع لجوالاتهم (APNs).
 * صامتة عمداً تجاه المُستدعي: فشل الإشعار لا يُفشل العملية الأصلية — لكن
 * سبب فشل الدفع يُسجَّل في notifications.push_error فلا يضيع بلا أثر.
 */
export async function notifyMany(
  recipientIds: (string | null | undefined)[],
  args: Omit<Parameters<typeof notify>[0], 'recipientId'>
): Promise<void> {
  const ids = recipientIds.filter((v): v is string => !!v)
  if (ids.length === 0) return

  let inserted: { id: string }[] = []
  try {
    const { data } = await supabase
      .from('notifications')
      .insert(
        ids.map((id) => ({
          recipient_id: id,
          type: args.type,
          title: args.title,
          message: args.message ?? null,
          case_id: args.caseId ?? null,
          task_id: args.taskId ?? null,
          is_read: false,
          channels: ['app', 'push'],
        }))
      )
      .select('id')
    inserted = data ?? []
  } catch {
    return /* لم يُحفظ شيء — لا معنى لدفع إشعار بلا سجل */
  }

  // الدفع للجوالات — طبقة فوق الإشعار المحفوظ، فشلها لا يُلغيه
  try {
    await supabase.functions.invoke('push-send', {
      body: {
        member_ids: ids,
        title: args.title,
        message: args.message ?? '',
        route: routeOf(args),
        notification_ids: inserted.map((n) => n.id),
      },
    })
  } catch {
    /* بلا إنترنت أو الدالة غير مُعدّة — الإشعار داخل النظام قائم */
  }
}
