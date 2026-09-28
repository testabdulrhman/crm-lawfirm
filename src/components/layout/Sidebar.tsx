import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  Activity,
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
  Bug,
  Lightbulb,
  LogOut,
  type LucideIcon,
  FileBadge,
  ChevronDown,
  Pin,
  PinOff,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useOfficeInfo } from '@/hooks/useSettings'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useNewChangeRequestsCount } from '@/hooks/useChangeRequests'
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
import { useUnreadDiscussionsCount } from '@/hooks/useDiscussions'
import { fmtNumber } from '@/lib/format'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** يظهر للمتعاون الخارجي؟ الافتراضي لا — فهو لا يرى المكتب */
  collab?: true
  /** للمدير وحده — يُخفى عن غيره */
  director?: true
  /** يظهر للموظف في القائمة الأساسية؛ وما سواه تحت «المزيد» (المدير يرى الكل) */
  primary?: true
  badge?:
    | 'pending_requests'
    | 'pending_applications'
    | 'expiring_poas'
    | 'upcoming_appointments'
    | 'pending_out_approvals'
    | 'my_open_tasks'
    | 'pending_hr'
    | 'unread_discussions'
    | 'new_change_requests'
}

// أقسام التنقل: تجميع منطقي بدل قائمة طويلة مسطّحة.
//
// القائمة حسب الدور (مراجعة 2026-09-28: «احسه كثير بيانات بس شوي صعب»): ٢٤ عنصراً والموظفون
// يقضون ٧٠٪ من وقتهم في ثلاث صفحات. فالموظف يرى الأساسي (primary) — ما يفتحه فعلاً في سجل
// الاستخدام — والباقي تحت «المزيد» مطوياً، ويثبّت منه ما يحتاجه (يُحفظ في متصفحه). المدير يرى الكل.
const PINS_KEY = 'nav:pinned'
const MORE_KEY = 'nav:more-open'
const readPins = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(PINS_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
const store = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* التخزين محجوب — يبقى الاختيار لهذه الجلسة */
  }
}

const isActive = (href: string, location: string) =>
  href === '/'
    ? location === '/'
    : location.startsWith(href) ||
      // طلبات التوظيف تبويب داخل الموظفين
      (href === '/team' && location.startsWith('/staff-applications'))

const navSections: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'لوحة التحكم', href: '/', icon: LayoutDashboard, collab: true, primary: true },
      { label: 'التقويم', href: '/calendar', icon: CalendarRange, collab: true, primary: true },
      { label: 'النقاشات', href: '/discussions', icon: MessagesSquare, badge: 'unread_discussions', collab: true, primary: true },
    ],
  },
  {
    title: 'الأعمال',
    items: [
      { label: 'العقود', href: '/engagements', icon: Handshake },
      // «المشاريع» يوحّد القضايا والاستشارات واللوائح والتوثيق العقاري
      // (نموذج Matter — قرار 2026-08-21). المسارات القديمة تعمل للتفاصيل.
      { label: 'المشاريع', href: '/matters', icon: FolderOpen, collab: true, primary: true },
      { label: 'المهام', href: '/tasks', icon: ListTodo, badge: 'my_open_tasks', collab: true, primary: true },
      { label: 'الجلسات', href: '/sessions', icon: CalendarDays, collab: true, primary: true },
      { label: 'الوكالات', href: '/poa', icon: FileSignature, badge: 'expiring_poas', primary: true },
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
        primary: true,
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
      { label: 'مستندات المكتب', href: '/office-documents', icon: FileBadge },
      { label: 'التقارير', href: '/reports', icon: BarChart3 },
      { label: 'الإعدادات', href: '/settings', icon: Settings },
      // كل خطأ ظهر لموظف (طلب المدير 2026-09-15)
      { label: 'سجل الأخطاء', href: '/errors', icon: Bug, director: true },
      // «اقترح تعديلاً» من أي صفحة — والردود عليها (2026-09-24)
      { label: 'اقتراحات التعديل', href: '/change-requests', icon: Lightbulb, badge: 'new_change_requests' },
      { label: 'مراقبة الاتصالات', href: '/hub', icon: Activity, director: true },
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
  const { data: unreadDisc } = useUnreadDiscussionsCount()
  // الشارة للمدير وحده: ما ينتظر النظر من اقتراحات الفريق
  const { data: newChangeReqs } = useNewChangeRequestsCount(isDirector)

  // القائمة المختصرة للموظف (لا المدير ولا المتعاون — فقائمته مختصرة أصلاً)
  const compact = !isDirector && !isCollaborator
  const [pins, setPins] = useState<string[]>(readPins)
  const [moreOpen, setMoreOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MORE_KEY) === '1'
    } catch {
      return false
    }
  })
  const togglePin = (href: string) => {
    const next = pins.includes(href) ? pins.filter((h) => h !== href) : [...pins, href]
    setPins(next)
    store(PINS_KEY, JSON.stringify(next))
  }
  const toggleMore = () => {
    setMoreOpen(!moreOpen)
    store(MORE_KEY, moreOpen ? '0' : '1')
  }

  const badgeOf = (item: NavItem): number =>
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
                  : item.badge === 'unread_discussions'
                    ? (unreadDisc ?? 0)
                    : item.badge === 'new_change_requests'
                      ? (isDirector ? (newChangeReqs ?? 0) : 0)
                      : 0

  const visible = (items: NavItem[]) =>
    (isCollaborator ? items.filter((i) => i.collab) : items).filter((i) => !i.director || isDirector)
  const inMain = (i: NavItem) => !compact || !!i.primary || pins.includes(i.href)
  // ما تحت «المزيد» بأقسامه — وإن كانت الصفحة المفتوحة منه يُفتح تلقائياً فلا يضيع موضعها
  const moreSections = compact
    ? navSections
        .map((sec) => ({ title: sec.title, items: visible(sec.items).filter((i) => !inMain(i)) }))
        .filter((sec) => sec.items.length > 0)
    : []
  const moreItems = moreSections.flatMap((sec) => sec.items)
  const moreHasActive = moreItems.some((i) => isActive(i.href, location))
  const moreShown = moreOpen || moreHasActive
  const moreBadge = moreItems.reduce((n, i) => n + badgeOf(i), 0)

  const renderItem = (item: NavItem, opts: { pinnable?: 'pin' | 'unpin' } = {}) => {
    const active = isActive(item.href, location)
    const Icon = item.icon
    const badgeCount = badgeOf(item)
    const showBadge = !!item.badge && badgeCount > 0
    return (
      <div key={item.href} className="group relative">
        <Link
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
                active ? 'bg-navy/15 text-navy' : 'bg-muted text-muted-foreground'
              )}
            >
              {fmtNumber(badgeCount)}
            </span>
          )}
        </Link>
        {opts.pinnable && (
          <button
            type="button"
            onClick={() => togglePin(item.href)}
            title={opts.pinnable === 'pin' ? 'ثبّت في القائمة' : 'أزل من القائمة'}
            aria-label={opts.pinnable === 'pin' ? `ثبّت ${item.label} في القائمة` : `أزل ${item.label} من القائمة`}
            className={cn(
              'absolute left-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
              showBadge && 'hidden'
            )}
          >
            {opts.pinnable === 'pin' ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    )
  }

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
          const items = visible(section.items).filter(inMain)
          if (items.length === 0) return null
          return (
            <div key={si}>
              {section.title && !isCollaborator && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground/70">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) =>
                  renderItem(item, compact && !item.primary ? { pinnable: 'unpin' } : {})
                )}
              </div>
            </div>
          )
        })}

        {moreItems.length > 0 && (
          <div>
            <button
              type="button"
              onClick={toggleMore}
              aria-expanded={moreShown}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', !moreShown && 'rotate-90')} />
              <span className="flex-1 text-start">المزيد</span>
              {!moreShown && moreBadge > 0 && (
                <span className="min-w-5 rounded-md bg-muted px-1.5 text-center text-[11px] font-bold tabular-nums">
                  {fmtNumber(moreBadge)}
                </span>
              )}
            </button>
            {moreShown && (
              <div className="mt-1 space-y-3">
                {moreSections.map((sec, i) => (
                  <div key={i}>
                    {sec.title && (
                      <p className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground/60">
                        {sec.title}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {sec.items.map((item) => renderItem(item, { pinnable: 'pin' }))}
                    </div>
                  </div>
                ))}
                <p className="px-3 text-[11px] leading-relaxed text-muted-foreground/70">
                  ثبّت ما تستعمله كثيراً بالدبوس ليظهر في قائمتك.
                </p>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* المستخدم الحالي + خروج */}
      <div className="border-t border-border/60 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          {/* الاسم يفتح ملف الموظف نفسه — بياناته ومرفقاته وإجازاته (لا «صفحتي» في الويب) */}
          <Link
            href={teamMember?.id ? `/team/${teamMember.id}` : '/'}
            onClick={onNavigate}
            title="ملفي"
            className="-m-1 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-muted"
          >
            <UserAvatar member={teamMember} className="h-8 w-8 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                {teamMember?.name ?? 'مستخدم'}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {teamMember?.role ?? '—'}
              </p>
            </div>
          </Link>
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
