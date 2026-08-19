// شريط التبويبات السفلي — داخل التطبيق فقط (isNative).
// أوضح فارق بين «موقع في قشرة» و«تطبيق»: الإبهام يصل للتنقّل بلا فتح قائمة.
// أربع وجهات يومية + «المزيد» يفتح بقية النظام في لوحة منزلقة.
import { useLocation } from 'wouter'
import {
  LayoutDashboard,
  Scale,
  ListTodo,
  CalendarDays,
  Menu,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { tapFeedback } from '@/lib/push'
import { useMyOpenTasksCount } from '@/hooks/useTasks'
import { useMyReviewCount } from '@/hooks/useTaskRoom'

interface Tab {
  label: string
  href: string
  icon: LucideIcon
}

// الوجهات الأربع الأكثر استخداماً يومياً — والباقي في «المزيد»
const TABS: Tab[] = [
  { label: 'الرئيسية', href: '/', icon: LayoutDashboard },
  { label: 'القضايا', href: '/cases', icon: Scale },
  { label: 'المهام', href: '/tasks', icon: ListTodo },
  { label: 'الجلسات', href: '/sessions', icon: CalendarDays },
]

export function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  const [location, navigate] = useLocation()
  const { data: myTasks } = useMyOpenTasksCount()
  const { data: myReviews } = useMyReviewCount()
  const tasksBadge = (myTasks ?? 0) + (myReviews ?? 0)

  const isActive = (href: string) =>
    href === '/' ? location === '/' : location.startsWith(href)

  return (
    <nav
      // pb-safe: الشريط يلامس حافة الشاشة ويحترم شريط الإيماءات السفلي
      className="pb-safe z-30 shrink-0 border-t border-border/70 bg-card/95 backdrop-blur-lg"
      aria-label="التنقّل السريع"
    >
      <div className="flex items-stretch justify-around px-1">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = isActive(t.href)
          const badge = t.href === '/tasks' ? tasksBadge : 0
          return (
            <button
              key={t.href}
              onClick={() => {
                if (!active) {
                  void tapFeedback('light')
                  navigate(t.href)
                }
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // min-h-[3.25rem] = هدف لمس مريح للإبهام
                'relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pt-1.5 transition-colors',
                active ? 'text-gold' : 'text-muted-foreground active:bg-muted/60'
              )}
            >
              <span className="relative">
                <Icon className={cn('h-[22px] w-[22px]', active && 'stroke-[2.4]')} />
                {badge > 0 && (
                  <span className="absolute -left-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-xs font-bold leading-none text-white">
                    {fmtNumber(badge > 99 ? 99 : badge)}
                  </span>
                )}
              </span>
              <span className={cn('text-xs', active && 'font-semibold')}>
                {t.label}
              </span>
            </button>
          )
        })}

        <button
          onClick={() => {
            void tapFeedback('light')
            onOpenMore()
          }}
          className="flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 pt-1.5 text-muted-foreground transition-colors active:bg-muted/60"
          aria-label="المزيد من الأقسام"
        >
          <Menu className="h-[22px] w-[22px]" />
          <span className="text-xs">المزيد</span>
        </button>
      </div>
    </nav>
  )
}
