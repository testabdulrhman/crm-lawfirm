// جرس الإشعارات في الشريط العلوي — عدّاد غير المقروء + قائمة بضغطة تنقلك للمكان
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { Bell, CheckCheck, ChevronLeft, Loader2 } from 'lucide-react'

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
import { notificationIcon, useOpenNotification } from '@/lib/notificationNav'
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
} from '@/hooks/useNotifications'

export function NotificationBell() {
  const [, navigate] = useLocation()
  const { data: items } = useNotifications()
  const { data: unread } = useUnreadCount()
  const markM = useMarkRead()
  const [browserNotifs, setBrowserNotifs] = useState(browserNotifEnabled)
  // القائمة تُغلق عند الضغط على إشعار — عناصرها أزرار عادية لا تغلقها وحدها
  const [open, setOpen] = useState(false)

  const count = unread ?? 0
  const list = items ?? []

  /**
   * فتح إشعار من الجرس أو من إشعار المتصفح. المنشن يحمل معه رسالته فتفتح الصفحة
   * نقاشها وخيطها وتُبرزها — كان يكتفي باختيار النقاش، فإن كان مفتوحاً أصلاً
   * لم يتغير شيء وبدا الضغط كأنه لا يعمل (بلاغ المدير 2026-09-15).
   */
  const openNotification = useOpenNotification()

  // إشعار نظام من المتصفح لكل جديد — يظهر والتبويب في الخلفية فقط، ووجهته تُحسب عند الضغط
  useEffect(() => {
    if (items?.length)
      showNewBrowserNotifications(items, (n) => (n ? openNotification(n) : navigate('/')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <DropdownMenu dir="rtl" open={open} onOpenChange={setOpen}>
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
              const Icon = notificationIcon(n.type)
              const unreadItem = !n.is_read
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false)
                    openNotification(n)
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

        {/* كل ما وصل منذ البداية — الجرس يعرض الأحدث وحده (طلب المدير 2026-09-25) */}
        <button
          type="button"
          onClick={() => {
            setOpen(false)
            navigate('/notifications')
          }}
          className="flex w-full items-center justify-center gap-1 border-t px-3 py-2.5 text-xs font-medium text-gold-600 transition-colors hover:bg-muted dark:text-gold-300"
        >
          عرض كل الإشعارات
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
