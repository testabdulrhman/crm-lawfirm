// جرس الإشعارات في الشريط العلوي — عدّاد غير المقروء + قائمة بضغطة تنقلك للمكان
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Bell,
  AtSign,
  ListTodo,
  Stamp,
  CalendarDays,
  MessageSquare,
  Globe,
  Users,
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
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDateTime } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import {
  browserNotifSupported,
  browserNotifEnabled,
  setBrowserNotifEnabled,
  showNewBrowserNotifications,
} from '@/lib/browserNotify'
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
  incoming_request: Globe,
  case_shared: Users,
}

function destination(n: AppNotification): string {
  // إشعار مرتبط بمهمة يفتح غرفتها مباشرة — أدق من صفحة القضية
  if (n.task_id) return `/tasks/${n.task_id}`
  // منشن في نقاش: إلى النقاشات نفسها (العامة إن بلا ملف)
  if (n.type === 'mention') {
    // منشن في قضية؟ افتح نقاشها هي لا القائمة (جسر التخزين + حدث حي
    // إن كانت الصفحة مفتوحة أصلاً فلا يعاد تركيبها)
    if (n.case_id) {
      try {
        sessionStorage.setItem('discussions:open-case', n.case_id)
        window.dispatchEvent(
          new CustomEvent('discussions:open-case', { detail: n.case_id })
        )
      } catch {
        /* تخزين معطّل */
      }
    }
    return '/discussions'
  }
  if (n.case_id) return `/cases/${n.case_id}`
  // طلبات الإجازة والاستئذان — صفحتها لا مهمة ولا ملف
  if (n.type === 'hr_request' || n.type === 'hr_result') return '/hr'
  // طلب وصل من نموذج التواصل في الموقع — الوارد لم يُحوَّل لملف بعد
  if (n.type === 'incoming_request') return '/requests'
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
  const [browserNotifs, setBrowserNotifs] = useState(browserNotifEnabled)

  const count = unread ?? 0
  const list = items ?? []

  // إشعار نظام من المتصفح لكل جديد — يظهر والتبويب في الخلفية فقط
  useEffect(() => {
    if (items?.length) showNewBrowserNotifications(items, destination)
  }, [items])

  const toggleBrowserNotifs = async (on: boolean) => {
    const granted = await setBrowserNotifEnabled(on)
    setBrowserNotifs(granted)
    if (on && !granted) {
      toast({
        variant: 'destructive',
        title: 'المتصفح يمنع الإشعارات',
        description:
          'فعّلها من إعدادات الموقع في المتصفح (رمز القفل بجانب العنوان) ثم أعد المحاولة.',
      })
    }
  }

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

        {/* إشعارات المتصفح — تظهر من النظام والتبويب في الخلفية */}
        {browserNotifSupported() && (
          <label className="flex cursor-pointer items-center justify-between border-b px-3 py-2">
            <span className="text-xs text-muted-foreground">
              إشعارات المتصفح (والتبويب في الخلفية)
            </span>
            <Switch checked={browserNotifs} onCheckedChange={toggleBrowserNotifs} />
          </label>
        )}

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
