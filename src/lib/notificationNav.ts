// أيقونة كل إشعار ووجهته عند الضغط — مشتركة بين الجرس وصفحة «كل الإشعارات»
import { useLocation } from 'wouter'
import {
  AtSign,
  Bell,
  CalendarClock,
  CalendarDays,
  Globe,
  Lightbulb,
  ListTodo,
  MessageSquare,
  Stamp,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { requestDiscussionJump } from '@/lib/discussionJump'
import { useMarkRead, type AppNotification } from '@/hooks/useNotifications'

const ICONS: Record<string, LucideIcon> = {
  mention: AtSign,
  task_assigned: ListTodo,
  task_due: ListTodo,
  task_comment: MessageSquare,
  task_review: Stamp,
  task_approved: ListTodo,
  task_returned: ListTodo,
  task: ListTodo,
  approval_request: Stamp,
  approval_result: Stamp,
  session_soon: CalendarDays,
  session_reminder: CalendarDays,
  session_auto: CalendarDays,
  session_brief: CalendarDays,
  incoming_message: MessageSquare,
  incoming_request: Globe,
  case_shared: Users,
  hr_request: Sun,
  hr_result: Sun,
  change_request: Lightbulb,
}

export function notificationIcon(type: string | null): LucideIcon {
  const t = type ?? ''
  if (ICONS[t]) return ICONS[t]
  if (t.startsWith('appointment')) return CalendarClock
  if (t.startsWith('session')) return CalendarDays
  if (t.startsWith('task')) return ListTodo
  return Bell
}

/** مسار وجهة الإشعار — بلا آثار جانبية */
export function notificationDestination(n: AppNotification): string {
  // إشعار مرتبط بمهمة يفتح غرفتها مباشرة — أدق من صفحة القضية
  if (n.task_id) return `/tasks/${n.task_id}`
  // منشن في نقاش: صفحة النقاشات، والرسالة نفسها يحملها جسر النقاشات عند الفتح
  if (n.type === 'mention') return '/discussions'
  if (n.case_id) return `/cases/${n.case_id}`
  // طلبات الإجازة والاستئذان — صفحتها لا مهمة ولا ملف
  if (n.type === 'hr_request' || n.type === 'hr_result') return '/hr'
  // طلب وصل من نموذج التواصل في الموقع — الوارد لم يُحوَّل لملف بعد
  if (n.type === 'incoming_request') return '/requests'
  // اقتراح تعديل جديد (للمدير) أو ردّ عليه (لصاحبه)
  if (n.type === 'change_request') return '/change-requests'
  // حجز من الموقع، وإسناد موعد أو إشراك فيه — كوجهة إشعار الدفع
  if (n.type?.startsWith('appointment')) return '/appointments'
  switch (n.type) {
    case 'task_assigned':
    case 'task_due':
    case 'task_comment':
    case 'task_review':
    case 'task_approved':
    case 'task_returned':
      return '/tasks'
    case 'approval_request':
    case 'approval_result':
      return '/outgoing'
    case 'incoming_message':
      return '/inbox'
    case 'session_soon':
      return '/sessions'
    default:
      return '/'
  }
}

/**
 * فتح إشعار: يُعلَّم مقروءاً ثم يُنتقل لوجهته. المنشن يحمل معه رسالته فتفتح الصفحة
 * نقاشها وخيطها وتُبرزها (بلاغ المدير 2026-09-15).
 */
export function useOpenNotification() {
  const [, navigate] = useLocation()
  const markM = useMarkRead()
  return (n: AppNotification) => {
    if (!n.is_read) markM.mutate(n.id)
    if (n.type === 'mention' && !n.task_id) {
      requestDiscussionJump({ caseId: n.case_id, at: n.created_at })
    }
    navigate(notificationDestination(n))
  }
}
