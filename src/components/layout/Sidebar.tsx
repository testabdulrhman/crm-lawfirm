import { Link, useLocation } from 'wouter'
import {
  LayoutDashboard,
  Handshake,
  ListTodo,
  Users,
  BookUser,
  Inbox,
  MessageSquare,
  Mail,
  Settings,
  Scale,
  FileSignature,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  MessagesSquare,
  FolderOpen,
  Send,
  BarChart3,
  LogOut,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useOfficeInfo } from '@/hooks/useSettings'
import { useIsDirector } from '@/hooks/useIsDirector'
import { UserAvatar } from '@/components/UserAvatar'
import { usePendingRequestsCount } from '@/hooks/useRequests'
import { usePendingOutgoingApprovalsCount } from '@/hooks/useOutgoingApprovals'
import { usePendingApplicationsCount } from '@/hooks/useStaffApplications'
import { useExpiringPOAsCount } from '@/hooks/usePOAs'
import { useUpcomingAppointmentsCount } from '@/hooks/useAppointments'
import { useMyOpenTasksCount } from '@/hooks/useTasks'
import { useMyReviewCount } from '@/hooks/useTaskRoom'
import { fmtNumber } from '@/lib/format'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?:
    | 'pending_requests'
    | 'pending_applications'
    | 'expiring_poas'
    | 'upcoming_appointments'
    | 'pending_out_approvals'
    | 'my_open_tasks'
}

// أقسام التنقل: تجميع منطقي بدل قائمة طويلة مسطّحة
const navSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'لوحة التحكم', href: '/', icon: LayoutDashboard },
      { label: 'التقويم', href: '/calendar', icon: CalendarRange },
      { label: 'النقاشات', href: '/discussions', icon: MessagesSquare },
    ],
  },
  {
    title: 'الأعمال',
    items: [
      { label: 'العقود', href: '/engagements', icon: Handshake },
      // «الملفات» يوحّد القضايا والاستشارات واللوائح والتوثيق العقاري
      // (نموذج Matter — قرار 2026-08-21). المسارات القديمة تعمل للتفاصيل.
      { label: 'الملفات', href: '/matters', icon: FolderOpen },
      { label: 'المهام', href: '/tasks', icon: ListTodo, badge: 'my_open_tasks' },
      { label: 'الجلسات', href: '/sessions', icon: CalendarDays },
      { label: 'الوكالات', href: '/poa', icon: FileSignature, badge: 'expiring_poas' },
      {
        label: 'المواعيد',
        href: '/appointments',
        icon: CalendarClock,
        badge: 'upcoming_appointments',
      },
      {
        label: 'الصادر',
        href: '/outgoing',
        icon: Send,
        badge: 'pending_out_approvals',
      },
    ],
  },
  {
    title: 'التواصل',
    items: [
      { label: 'جهات الاتصال', href: '/contacts', icon: BookUser },
      { label: 'الرسائل الواردة', href: '/inbox', icon: MessageSquare },
      { label: 'البريد', href: '/mail', icon: Mail },
      {
        label: 'الطلبات الواردة',
        href: '/requests',
        icon: Inbox,
        badge: 'pending_requests',
      },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      // طلبات التوظيف صارت تبويباً داخل صفحة الموظفين — الشارة انتقلت هنا
      {
        label: 'الموظفون',
        href: '/team',
        icon: Users,
        badge: 'pending_applications',
      },
      { label: 'التقارير', href: '/reports', icon: BarChart3 },
      { label: 'الإعدادات', href: '/settings', icon: Settings },
    ],
  },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation()
  const { teamMember, logout } = useAuth()
  const { data: office } = useOfficeInfo()
  const isDirector = useIsDirector()
  const { data: pendingApprovals } = usePendingOutgoingApprovalsCount()
  const { data: pendingCount } = usePendingRequestsCount()
  const { data: pendingApps } = usePendingApplicationsCount()
  const { data: expiringPOAs } = useExpiringPOAsCount()
  const { data: upcomingAppts } = useUpcomingAppointmentsCount()
  const { data: myTasks } = useMyOpenTasksCount()
  // شارة المهام = المستحق عليّ + ما ينتظر اعتمادي
  const { data: myReviews } = useMyReviewCount()

  return (
    <aside className="pt-safe pb-safe flex h-full w-64 flex-col bg-navy text-navy-50">
      {/* الترويسة: شعار المكتب بكامل العرض (يُرفع من الإعدادات ← بيانات المكتب) */}
      <div className="border-b border-white/10 px-4 py-4">
        {office?.logo_url ? (
          <img
            src={office.logo_url}
            alt="شعار المكتب"
            className="max-h-28 w-full object-contain"
          />
        ) : (
          <div className="flex justify-center py-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 ring-1 ring-gold/30">
              <Scale className="h-6 w-6 text-gold" />
            </div>
          </div>
        )}
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
                    : location.startsWith(item.href) ||
                      // طلبات التوظيف تبويب داخل الموظفين
                      (item.href === '/team' &&
                        location.startsWith('/staff-applications'))
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
                          : item.badge === 'pending_out_approvals'
                            ? (isDirector ? (pendingApprovals ?? 0) : 0)
                            : item.badge === 'my_open_tasks'
                              ? (myTasks ?? 0) + (myReviews ?? 0)
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
          <UserAvatar member={teamMember} className="h-9 w-9 shrink-0" />
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
            aria-label="تسجيل الخروج"
            className="rounded-md p-2 text-navy-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
