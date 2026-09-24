// كل الإشعارات (طلب المدير 2026-09-25: «ابي يكون فيه طريقة أفتح كل الاشعارات اللي سبق وأن
// وصلتني») — الجرس يعرض آخر ٣٠ وحده، وهنا كل ما وصل منذ البداية: مجمّعاً باليوم، بتصفية
// وبحث، ويُحمَّل المزيد عند الوصول لآخر القائمة. الضغط يفتح الوجهة نفسها التي يفتحها الجرس.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CheckCheck, Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import {
  useMarkRead,
  useNotificationHistory,
  useNotificationTotal,
  useUnreadCount,
  type AppNotification,
  type NotificationFilter,
} from '@/hooks/useNotifications'
import { notificationIcon, useOpenNotification } from '@/lib/notificationNav'
import { fmtDatePref, fmtNumber, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const FILTERS: { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'unread', label: 'غير المقروءة' },
  { value: 'mention', label: 'المنشن' },
  { value: 'tasks', label: 'المهام والاعتمادات' },
  { value: 'sessions', label: 'الجلسات' },
  { value: 'appointments', label: 'المواعيد' },
  { value: 'hr', label: 'الإجازات' },
  { value: 'other', label: 'أخرى' },
]

/** «اليوم» · «أمس» · التاريخ — عنوان مجموعة اليوم */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((start(new Date()) - start(d)) / 864e5)
  if (diff === 0) return 'اليوم'
  if (diff === 1) return 'أمس'
  return fmtDatePref(localYmd(d))
}

/** التاريخ والساعة بتوقيت الجهاز — created_at بتوقيت غرينتش، وقصّه يؤخر الساعة ٣ ويقلب اليوم بعد ٩ مساءً */
function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function localHm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotificationHistory(filter, debounced)
  const { data: total } = useNotificationTotal()
  const { data: unread } = useUnreadCount()
  const markM = useMarkRead()
  const openNotification = useOpenNotification()

  const rows = useMemo(() => data?.pages.flat() ?? [], [data])
  const groups = useMemo(() => {
    const out: { label: string; items: AppNotification[] }[] = []
    for (const n of rows) {
      const label = dayLabel(n.created_at)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(n)
      else out.push({ label, items: [n] })
    }
    return out
  }, [rows])

  // يُحمَّل المزيد تلقائياً حين يظهر آخر القائمة
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) void fetchNextPage()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Bell className="h-6 w-6 text-gold" />
            كل الإشعارات
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {total != null && `${fmtNumber(total)} إشعاراً وصلك`}
            {(unread ?? 0) > 0 && ` · ${fmtNumber(unread ?? 0)} غير مقروء`}
          </p>
        </div>
        {(unread ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={markM.isPending}
            onClick={() => markM.mutate('all')}
          >
            {markM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            تعليم الكل كمقروء
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث في العناوين والنصوص…"
          className="pr-9"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <QueryErrorState title="تعذّر تحميل الإشعارات" error={error} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={debounced || filter !== 'all' ? 'لا إشعارات بهذا البحث' : 'لا إشعارات بعد'}
          description={debounced || filter !== 'all' ? 'جرّب كلمة أخرى أو تصنيفاً آخر.' : undefined}
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.label} className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground">{g.label}</h3>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border/60">
                  {g.items.map((n) => {
                    const Icon = notificationIcon(n.type)
                    const unreadItem = !n.is_read
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => openNotification(n)}
                          className={cn(
                            'flex w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-muted/60',
                            unreadItem && 'bg-gold/5'
                          )}
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                              unreadItem ? 'bg-gold/15' : 'bg-muted'
                            )}
                          >
                            <Icon className={cn('h-4 w-4', unreadItem ? 'text-gold' : 'text-muted-foreground')} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span
                                className={cn(
                                  'text-sm text-foreground',
                                  unreadItem ? 'font-semibold' : 'font-medium'
                                )}
                              >
                                {n.title}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {fmtTime(localHm(n.created_at))}
                              </span>
                            </span>
                            {n.message && (
                              <span className="mt-0.5 block whitespace-pre-wrap text-xs text-muted-foreground">
                                {n.message}
                              </span>
                            )}
                          </span>
                          {unreadItem && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gold" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </div>
          ))}

          <div ref={sentinel} className="flex justify-center py-2">
            {isFetchingNextPage ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : hasNextPage ? (
              <Button variant="ghost" size="sm" onClick={() => fetchNextPage()}>
                تحميل المزيد
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">هذا كل ما وصلك</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
