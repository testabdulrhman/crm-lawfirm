// «مركز المتابعة» — صفحات المدير الأربع تحت تبويب واحد بتبويبات داخلية على اليمين (طلب المدير 2026-10-08:
// «سجل الأخطاء، سجل المساعد الذكي، اقتراحات التعديل، مراقبة الاتصالات — ليه ما تكون بتبويب واحد، بعدين
// التقسيمات تكون تبويبات داخلية على السلايد اليمين»). المسارات القديمة باقية فتعمل الروابط والإشعارات كما هي.
// غير المدير يرى «اقتراحات التعديل» وحدها فلا تُعرض له التبويبات.
import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { Activity, Bug, Lightbulb, Sparkles, type LucideIcon } from 'lucide-react'

import { useIsDirector } from '@/hooks/useIsDirector'
import { useNewChangeRequestsCount } from '@/hooks/useChangeRequests'
import { cn } from '@/lib/utils'

export const MONITOR_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/change-requests', label: 'اقتراحات التعديل', icon: Lightbulb },
  { href: '/errors', label: 'سجل الأخطاء', icon: Bug },
  { href: '/assistant-log', label: 'سجل المساعد الذكي', icon: Sparkles },
  { href: '/hub', label: 'مراقبة الاتصالات', icon: Activity },
]

export const isMonitorPath = (loc: string) => MONITOR_TABS.some((t) => loc.startsWith(t.href))

export function MonitorShell({ children }: { children: ReactNode }) {
  const isDirector = useIsDirector()
  const [location] = useLocation()
  const { data: newRequests } = useNewChangeRequestsCount(isDirector)
  if (!isDirector) return <>{children}</>

  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
      {/* التبويبات الداخلية — عمودية على اليمين في الحاسب، وأفقية تُمرَّر في الجوال */}
      <nav className="lg:sticky lg:top-4 lg:self-start">
        <p className="mb-2 hidden px-2 text-xs font-semibold text-muted-foreground lg:block">مركز المتابعة</p>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {MONITOR_TABS.map((t) => {
            const active = location.startsWith(t.href)
            const Icon = t.icon
            const badge = t.href === '/change-requests' ? (newRequests ?? 0) : 0
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-gold/15 font-semibold text-gold-700 dark:text-gold-300'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{t.label}</span>
                {badge > 0 && (
                  <span className="ms-auto rounded-full bg-gold px-1.5 text-[11px] font-bold text-navy">{badge}</span>
                )}
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
