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
  CalendarOff,
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
import { useIsCollaborator } from '@/hooks/useIsCollaborator'
import { UserAvatar } from '@/components/UserAvatar'
import { usePendingRequestsCount } from '@/hooks/useRequests'
import { usePendingOutgoingApprovalsCount } from '@/hooks/useOutgoingApprovals'
import { usePendingApplicationsCount } from '@/hooks/useStaffApplications'
import { useExpiringPOAsCount } from '@/hooks/usePOAs'
import { useUpcomingAppointmentsCount } from '@/hooks/useAppointments'
import { useMyOpenTasksCount } from '@/hooks/useTasks'
import { useMyReviewCount } from '@/hooks/useTaskRoom'
import { usePendingHrCount } from '@/hooks/useHrRequests'
import { fmtNumber } from '@/lib/format'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** يظهر للمتعاون الخارجي؟ الافتراضي لا — فهو لا يرى المكتب */
  collab?: true
  badge?:
    | 'pending_requests'
    | 'pending_applications'
    | 'expiring_poas'
    | 'upcoming_appointments'
    | 'pending_out_approvals'
    | 'my_open_tasks'
    | 'pending_hr'
}

// أقسام التنقل: تجميع منطقي بدل قائمة طويلة مسطّحة
const navSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'لوحة التحكم', href: '/', icon: LayoutDashboard , collab: true },
      { label: 'التقويم', href: '/calendar', icon: CalendarRange , collab: true },
      { label: 'النقاشات', href: '/discussions', icon: MessagesSquare , collab: true },
    ],
  },
  {
    title: 'الأعمال',
    items: [
      { label: 'العقود', href: '/engagements', icon: Handshake },
      // «المشاريع» يوحّد القضايا والاستشارات واللوائح والتوثيق العقاري
      // (نموذج Matter — قرار 2026-08-21). المسارات القديمة تعمل للتفاصيل.
      { label: 'المشاريع', href: '/matters', icon: FolderOpen , collab: true },
      { label: 'المهام', href: '/tasks', icon: ListTodo, badge: 'my_open_tasks' , collab: true },
      { label: 'الجلسات', href: '/sessions', icon: CalendarDays , collab: true },
      { label: 'الوكالات', href: '/poa', icon: FileSignature, badge: 'expiring_poas' },
      {
        label: 'مواعيد العملاء',
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
      { label: 'الرسائل', href: '/inbox', icon: MessageSquare },
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
      // إجازة · استئذان · دوام عن بعد — الموظف يقدّم والمدير يعتمد
      { label: 'الإجازات والاستئذان', href: '/hr', icon: CalendarOff, badge: 'pending_hr' },
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
  const isCollaborator = useIsCollaborator()
  const { data: pendingApprovals } = usePendingOutgoingApprovalsCount()
  const { data: pendingCount } = usePendingRequestsCount()
  const { data: pendingApps } = usePendingApplicationsCount()
  const { data: expiringPOAs } = useExpiringPOAsCount()
  const { data: upcomingAppts } = useUpcomingAppointmentsCount()
  const { data: myTasks } = useMyOpenTasksCount()
  // شارة المهام = المستحق عليّ + ما ينتظر اعتمادي
  const { data: myReviews } = useMyReviewCount()
  const { data: pendingHr } = usePendingHrCount(isDirector)

  return (
    <aside className="pt-safe pb-safe flex h-full w-64 flex-col bg-card text-foreground">
      {/* الترويسة: الشعار على لوحة كحلية — يضمن وضوحه أياً كان تصميمه */}
      <div className="px-3 pb-4 pt-4">
        {office?.logo_url ? (
          <div className="rounded-2xl bg-navy px-3 py-3">
            <img
              src={office.logo_url}
              alt="شعار المكتب"
              className="max-h-20 w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2.5 px-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy">
              <Scale className="h-5 w-5 text-gold" />
            </span>
            <span className="truncate text-[15px] font-bold tracking-tight">
              رضوان
            </span>
          </div>
        )}
      </div>

      {/* التنقل */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {navSections.map((section, si) => {
          // المتعاون الخارجي: البنود الموسومة collab فقط، والأقسام التي تفرغ تُسقط
          const items = isCollaborator
            ? section.items.filter((i) => i.collab)
            : section.items
          if (items.length === 0) return null
          return (
          <div key={si}>
            {section.title && !isCollaborator && (
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground/70">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
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
                              : item.badge === 'pending_hr'
                                ? (isDirector ? (pendingHr ?? 0) : 0)
                                : 0
                const showBadge = !!item.badge && badgeCount > 0
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition-colors',
                      active
                        ? 'bg-gold font-semibold text-navy'
                        : 'text-foreground/75 hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <Icon className="h-[17px] w-[17px] shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {showBadge && (
                      <span
                        className={cn(
                          'min-w-5 rounded-md px-1.5 text-center text-[11px] font-bold tabular-nums',
                          active
                            ? 'bg-navy/15 text-navy'
                            : 'bg-muted text-muted-foreground'
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
          )
        })}
      </nav>

      {/* المستخدم الحالي + خروج */}
      <div className="border-t border-border/60 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <UserAvatar member={teamMember} className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-foreground">
              {teamMember?.name ?? 'مستخدم'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {teamMember?.role ?? '—'}
            </p>
          </div>
          <button
            onClick={() => logout()}
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  )
}
