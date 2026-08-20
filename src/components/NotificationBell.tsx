// جرس الإشعارات في الشريط العلوي — عدّاد غير المقروء + قائمة بضغطة تنقلك للمكان
import { useLocation } from 'wouter'
import {
  Bell,
  AtSign,
  ListTodo,
  Stamp,
  CalendarDays,
  MessageSquare,
  CheckCheck,
  Loader2,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDateTime } from '@/lib/format'
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  type AppNotification,
} from '@/hooks/useNotifications'

// أيقونة ووجهة كل نوع
const ICONS: Record<string, LucideIcon> = {
  mention: AtSign,
  task_assigned: ListTodo,
  task_due: ListTodo,
  task_comment: MessageSquare,
  task_review: Stamp,
  task_approved: ListTodo,
  task_returned: ListTodo,
  approval_request: Stamp,
  approval_result: Stamp,
  session_soon: CalendarDays,
  incoming_message: MessageSquare,
}

function destination(n: AppNotification): string {
  // إشعار مرتبط بمهمة يفتح غرفتها مباشرة — أدق من صفحة القضية
  if (n.task_id) return `/tasks/${n.task_id}`
  // منشن في نقاش: إلى النقاشات نفسها (العامة إن بلا ملف)
  if (n.type === 'mention') return '/discussions'
  if (n.case_id) return `/cases/${n.case_id}`
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

export function NotificationBell() {
  const [, navigate] = useLocation()
  const { data: items } = useNotifications()
  const { data: unread } = useUnreadCount()
  const markM = useMarkRead()

  const count = unread ?? 0
  const list = items ?? []

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`الإشعارات${count > 0 ? ` (${count} غير مقروء)` : ''}`}
          className="relative rounded-md p-2 text-foreground transition-colors hover:bg-muted"
        >
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -left-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold text-white">
              {count > 99 ? `${fmtNumber(99)}+` : fmtNumber(count)}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold text-foreground">الإشعارات</p>
          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={markM.isPending && markM.variables === 'all'}
              onClick={() => markM.mutate('all')}
            >
              {markM.isPending && markM.variables === 'all' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5" />
              )}
              تعليم الكل كمقروء
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <Bell className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">لا إشعارات بعد</p>
            </div>
          ) : (
            list.map((n) => {
              const Icon = ICONS[n.type ?? ''] ?? Bell
              const unreadItem = !n.is_read
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (unreadItem) markM.mutate(n.id)
                    navigate(destination(n))
                  }}
                  className={cn(
                    'flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-right transition-colors last:border-b-0 hover:bg-accent/10',
                    unreadItem && 'bg-gold/5'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      unreadItem ? 'bg-gold/15' : 'bg-muted'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        unreadItem ? 'text-gold' : 'text-muted-foreground'
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-sm',
                        unreadItem
                          ? 'font-semibold text-foreground'
                          : 'text-foreground'
                      )}
                    >
                      {n.title}
                    </span>
                    {n.message && (
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {n.message}
                      </span>
                    )}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {fmtDateTime(n.created_at)}
                    </span>
                  </span>
                  {unreadItem && (
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
