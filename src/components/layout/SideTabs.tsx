// تبويبات داخلية على يمين الصفحة — نمط «مركز المتابعة» نفسه للإعدادات والتقارير (طلب المدير 2026-10-08).
// عمود ثابت في الحاسب بمجموعات معنونة، وشريط أفقي يُمرَّر في الجوال.
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export interface SideTab {
  value: string
  label: string
  icon: LucideIcon
}
export interface SideTabGroup {
  key: string
  label?: string
  tabs: SideTab[]
}

export function SideTabsLayout({
  groups,
  value,
  onChange,
  children,
}: {
  groups: SideTabGroup[]
  value: string
  onChange: (v: string) => void
  children: ReactNode
}) {
  return (
    <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav className="lg:sticky lg:top-4 lg:self-start">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-4 lg:overflow-visible lg:px-0">
          {groups.map((g) => (
            <div key={g.key} className="flex shrink-0 gap-1 lg:flex-col">
              {g.label && (
                <p className="hidden px-2 pb-1 text-xs font-semibold text-muted-foreground lg:block">{g.label}</p>
              )}
              {g.tabs.map((t) => {
                const Icon = t.icon
                const active = t.value === value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => onChange(t.value)}
                    className={cn(
                      'flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-start text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-gold/15 font-semibold text-gold-700 dark:text-gold-300'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="whitespace-nowrap">{t.label}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </nav>
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  )
}
