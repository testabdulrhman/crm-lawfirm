import { Link, useLocation } from 'wouter'
import {
  LayoutDashboard,
  Users,
  Settings,
  Scale,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { COMPANY_NAME_SHORT } from '@/lib/constants'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { label: 'لوحة التحكم', href: '/', icon: LayoutDashboard },
  { label: 'الموظفون', href: '/team', icon: Users },
  { label: 'الإعدادات', href: '/settings', icon: Settings },
  /* مواقع وحدات قادمة: القضايا، جهات الاتصال، الوكالات... */
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation()
  const { teamMember, logout } = useAuth()

  return (
    <aside className="pt-safe pb-safe flex h-full w-64 flex-col bg-navy text-navy-50">
      {/* الترويسة */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30">
          <Scale className="h-5 w-5 text-gold" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gold">CRM</p>
          <p className="truncate text-xs text-navy-200">{COMPANY_NAME_SHORT}</p>
        </div>
      </div>

      {/* التنقل */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const active =
            item.href === '/'
              ? location === '/'
              : location.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-gold text-navy'
                  : 'text-navy-100 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* المستخدم الحالي + خروج */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold text-sm font-bold text-navy">
            {teamMember?.avatar_initial ||
              teamMember?.name?.charAt(0) ||
              '؟'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {teamMember?.name ?? 'مستخدم'}
            </p>
            <p className="truncate text-xs text-navy-200">
              {teamMember?.role ?? '—'}
            </p>
          </div>
          <button
            onClick={() => logout()}
            title="تسجيل الخروج"
            className="rounded-md p-2 text-navy-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
