import { Link, useLocation } from 'wouter'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  BookUser,
  Inbox,
  Settings,
  Scale,
  FileSignature,
  BookOpen,
  Landmark,
  CalendarClock,
  CalendarDays,
  Send,
  BarChart3,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { usePendingRequestsCount } from '@/hooks/useRequests'
import { usePendingApplicationsCount } from '@/hooks/useStaffApplications'
import { useExpiringPOAsCount } from '@/hooks/usePOAs'
import { useUpcomingAppointmentsCount } from '@/hooks/useAppointments'
import { fmtNumber } from '@/lib/format'
import { COMPANY_NAME_SHORT } from '@/lib/constants'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?:
    | 'pending_requests'
    | 'pending_applications'
    | 'expiring_poas'
    | 'upcoming_appointments'
}

// أقسام التنقل: تجميع منطقي بدل قائمة طويلة مسطّحة
const navSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [{ label: 'لوحة التحكم', href: '/', icon: LayoutDashboard }],
  },
  {
    title: 'الأعمال',
    items: [
      { label: 'القضايا', href: '/cases', icon: Scale },
      { label: 'الجلسات', href: '/sessions', icon: CalendarDays },
      { label: 'الوكالات', href: '/poa', icon: FileSignature, badge: 'expiring_poas' },
      { label: 'الاستشارات واللوائح', href: '/legal-services', icon: BookOpen },
      { label: 'التوثيق العقاري', href: '/property', icon: Landmark },
      {
        label: 'المواعيد',
        href: '/appointments',
        icon: CalendarClock,
        badge: 'upcoming_appointments',
      },
      { label: 'الصادر', href: '/outgoing', icon: Send },
    ],
  },
  {
    title: 'التواصل',
    items: [
      { label: 'جهات الاتصال', href: '/contacts', icon: BookUser },
      {
        label: 'الطلبات الواردة',
        href: '/requests',
        icon: Inbox,
        badge: 'pending_requests',
      },
      {
        label: 'طلبات التوظيف',
        href: '/staff-applications',
        icon: UserPlus,
        badge: 'pending_applications',
      },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      { label: 'الموظفون', href: '/team', icon: Users },
      { label: 'التقارير', href: '/reports', icon: BarChart3 },
      { label: 'الإعدادات', href: '/settings', icon: Settings },
    ],
  },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation()
  const { teamMember, logout } = useAuth()
  const { data: pendingCount } = usePendingRequestsCount()
  const { data: pendingApps } = usePendingApplicationsCount()
  const { data: expiringPOAs } = useExpiringPOAsCount()
  const { data: upcomingAppts } = useUpcomingAppointmentsCount()

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
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navSections.map((section, si) => (
          <div key={si} className={cn(si > 0 && 'mt-4')}>
            {section.title && (
              <p className="px-3 pb-1.5 text-xs font-semibold text-navy-300">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const active =
                  item.href === '/'
                    ? location === '/'
                    : location.startsWith(item.href)
                const Icon = item.icon
                const badgeCount =
                  item.badge === 'pending_requests'
                    ? (pendingCount ?? 0)
                    : item.badge === 'pending_applications'
                      ? (pendingApps ?? 0)
                      : item.badge === 'expiring_poas'
                        ? (expiringPOAs ?? 0)
                        : item.badge === 'upcoming_appointments'
                          ? (upcomingAppts ?? 0)
                          : 0
                const showBadge = !!item.badge && badgeCount > 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-gold text-navy shadow-sm'
                        : 'text-navy-100 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {showBadge && (
                      <span
                        className={cn(
                          'min-w-5 rounded-full px-1.5 py-0.5 text-center text-xs font-bold',
                          active ? 'bg-navy text-gold' : 'bg-gold text-navy'
                        )}
                      >
                        {fmtNumber(badgeCount)}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
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
