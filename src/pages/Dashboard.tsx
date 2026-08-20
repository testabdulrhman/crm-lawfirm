import { useLocation } from 'wouter'
import {
  Scale,
  BookUser,
  Users,
  CalendarDays,
  ListTodo,
  UserPlus,
  Inbox,
  FileSignature,
  CalendarClock,
  RefreshCw,
  ChevronLeft,
  Paperclip,
  Flame,
  Circle,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Gavel,
  Stamp,
  Sun,
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { usePageState } from '@/hooks/usePageState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref, fmtTime, daysLabel, arPlural, todayISO } from '@/lib/format'
import { Ltr } from '@/components/Ltr'
import { taskPriorityBadge, taskPriorityLabel } from '@/lib/caseLabels'
import { typeLabel as requestTypeLabel } from '@/features/requests/labels'
import { FeedContent } from '@/features/feed/FeedPage'
import {
  useDashboardOverview,
  useCompleteTask,
  usePendingApprovals,
  useTodayAgenda,
  type DashboardScope,
  type AgendaItem,
} from '@/hooks/useDashboard'
import { useSessionsNeedClosure } from '@/hooks/useCaseSessions'
import type {
  DashApplication,
  DashPOA,
  DashRequest,
  DashSession,
  DashTask,
  DashAppointment,
} from '@/types/db'

// عدد الأيام من اليوم (موجب=مستقبلي)، أو null
function daysFromToday(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

function countdownText(days: number | null): string {
  if (days == null) return ''
  if (days === 0) return 'اليوم'
  if (days === 1) return 'غداً'
  if (days > 0) return `بعد ${daysLabel(days)}`
  return `متأخّرة ${daysLabel(-days)}`
}

export default function Dashboard() {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const [, navigate] = useLocation()

  // تبويبات نمط كليو: لوحتي · لوحة المكتب (للمدير) · آخر النشاط
  const [tab, setTab] = usePageState<'mine' | 'all' | 'feed'>('dashboard.tab', 'mine')
  const scope: DashboardScope = tab === 'all' ? 'all' : 'mine'
  const effectiveScope: DashboardScope = isDirector ? scope : 'mine'
  const isAll = effectiveScope === 'all'
  const isFeed = tab === 'feed'

  const { data, isLoading, isFetching, refetch } =
    useDashboardOverview(effectiveScope)
  const s = data?.stats
  const completeM = useCompleteTask()

  const { data: agenda = [], isLoading: agendaLoading } = useTodayAgenda(
    effectiveScope,
    teamMember?.id
  )
  const { data: approvals } = usePendingApprovals(teamMember?.id, isDirector)

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* ===== الترحيب + التبويب ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {teamMember?.name ? `مرحباً، ${teamMember.name}` : 'مرحباً بك'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {fmtDatePref(todayISO())}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-muted p-1 text-sm">
            <ScopeBtn
              active={tab === 'mine'}
              onClick={() => setTab('mine')}
              label="لوحتي"
            />
            {isDirector && (
              <ScopeBtn
                active={tab === 'all'}
                onClick={() => setTab('all')}
                label="لوحة المكتب"
              />
            )}
            <ScopeBtn
              active={tab === 'feed'}
              onClick={() => setTab('feed')}
              label="آخر النشاط"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-muted-foreground"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            تحديث
          </Button>
        </div>
      </div>

      {isFeed ? (
        <FeedContent />
      ) : (
        <>
      {/* ===== شريط المؤشّرات — الأرقام أولاً ===== */}
      {isLoading || !s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[86px] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label={isAll ? 'جلسات قادمة' : 'جلساتي القادمة'}
            value={s.upcoming_sessions}
            onClick={() => navigate('/sessions')}
          />
          <Stat
            label="مهام متأخرة"
            value={s.overdue_tasks}
            tone={s.overdue_tasks > 0 ? 'danger' : 'plain'}
            note={
              s.open_tasks > 0
                ? `من ${fmtNumber(s.open_tasks)} مفتوحة`
                : undefined
            }
            onClick={() => navigate('/tasks')}
          />
          <Stat
            label={isAll ? 'بانتظار الاعتماد' : 'بانتظار اعتمادي'}
            value={approvals?.total ?? 0}
            tone={(approvals?.total ?? 0) > 0 ? 'warn' : 'plain'}
            note={
              approvals && approvals.letters > 0
                ? `منها ${fmtNumber(approvals.letters)} خطاب صادر`
                : undefined
            }
            onClick={() =>
              navigate(
                approvals && approvals.letters > 0 && approvals.tasks === 0
                  ? '/outgoing'
                  : '/tasks'
              )
            }
          />
          <Stat
            label="قضايا جارية"
            value={s.cases_active}
            onClick={() => navigate('/cases')}
          />
        </div>
      )}

      {/* ===== جدول اليوم + ما يحتاج انتباهك ===== */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TodayAgendaCard
          items={agenda}
          loading={agendaLoading}
          onOpen={(href) => navigate(href)}
        />

        <div className="space-y-4">
          <SessionsNeedClosureSection scope={effectiveScope} />
          <ApprovalsCard
            approvals={approvals}
            isAll={isAll}
            onTasks={() => navigate('/tasks')}
            onLetters={() => navigate('/outgoing')}
          />
        </div>
      </div>

      {/* ===== مؤشّرات إدارية ثانوية — «لوحة المكتب» فقط ===== */}
      {isAll && s && (
        <div className="flex flex-wrap gap-2">
          <MiniStat label="إجمالي القضايا" value={s.cases_total} icon={Scale} onClick={() => navigate('/cases')} />
          <MiniStat label="جهات الاتصال" value={s.contacts} icon={BookUser} onClick={() => navigate('/contacts')} />
          <MiniStat label="الموظفون" value={s.staff_active} icon={Users} onClick={() => navigate('/team')} />
          <MiniStat label="طلبات التوظيف" value={s.pending_applications} icon={UserPlus} alert={s.pending_applications > 0} onClick={() => navigate('/staff-applications')} />
          <MiniStat label="الطلبات الواردة" value={s.pending_requests} icon={Inbox} alert={s.pending_requests > 0} onClick={() => navigate('/requests')} />
          <MiniStat label="وكالات تنتهي قريباً" value={s.expiring_poas} icon={FileSignature} alert={s.expiring_poas > 0} onClick={() => navigate('/poa')} />
        </div>
      )}

      {/* القسمان الأبرز: الجلسات + المهام */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* 📅 الجلسات القادمة */}
        <SectionCard
          icon={CalendarDays}
          title="الجلسات القادمة"
          count={data?.upcoming_sessions?.length}
          loading={isLoading}
        >
          {(data?.upcoming_sessions ?? []).length === 0 ? (
            <Empty icon={CalendarDays} text="لا جلسات قادمة" />
          ) : (
            (data?.upcoming_sessions ?? []).map((x) => (
              <SessionRow
                key={x.id}
                s={x}
                onClick={() =>
                  navigate(x.case_id ? `/cases/${x.case_id}` : '/sessions')
                }
              />
            ))
          )}
        </SectionCard>

        {/* ✅ المهام */}
        <SectionCard
          icon={ListTodo}
          title="المهام"
          count={data?.tasks?.length}
          loading={isLoading}
        >
          {(data?.tasks ?? []).length === 0 ? (
            <Empty icon={ListTodo} text="لا مهام عليك 🎉" />
          ) : (
            (data?.tasks ?? []).map((t) => (
              <CompletableTaskRow
                key={t.id}
                t={t}
                completing={completeM.isPending && completeM.variables === t.id}
                onComplete={() => completeM.mutate(t.id)}
                onOpen={() => navigate(`/tasks/${t.id}`)}
              />
            ))
          )}
        </SectionCard>
      </div>

      {/* أقسام ثانوية */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* المواعيد القادمة — تظهر إن وُجدت (في كلا النطاقين) */}
        {(data?.appointments ?? []).length > 0 && (
          <SectionCard icon={CalendarClock} title="المواعيد القادمة" loading={false}>
            {(data?.appointments ?? []).map((ap) => (
              <AppointmentRow
                key={ap.id}
                ap={ap}
                onClick={() => navigate('/appointments')}
              />
            ))}
          </SectionCard>
        )}

        {/* الإدارية — «المكتب» (المدير) فقط */}
        {isAll && (
          <>
            <SectionCard icon={FileSignature} title="وكالات تنتهي قريباً" loading={isLoading}>
              {(data?.expiring_poas ?? []).length === 0 ? (
                <Empty icon={FileSignature} text="لا وكالات تنتهي قريباً" />
              ) : (
                (data?.expiring_poas ?? []).map((p) => (
                  <PoaRow key={p.id} p={p} onClick={() => navigate('/poa')} />
                ))
              )}
            </SectionCard>

            <SectionCard icon={UserPlus} title="آخر طلبات التوظيف" loading={isLoading}>
              {(data?.applications ?? []).length === 0 ? (
                <Empty icon={UserPlus} text="لا طلبات جديدة" />
              ) : (
                (data?.applications ?? []).map((a) => (
                  <ApplicationRow
                    key={a.id}
                    a={a}
                    onClick={() => navigate('/staff-applications')}
                  />
                ))
              )}
            </SectionCard>

            <SectionCard icon={Inbox} title="الطلبات الواردة" loading={isLoading}>
              {(data?.requests ?? []).length === 0 ? (
                <Empty icon={Inbox} text="لا طلبات واردة" />
              ) : (
                (data?.requests ?? []).map((r) => (
                  <RequestRow key={r.id} r={r} onClick={() => navigate('/requests')} />
                ))
              )}
            </SectionCard>
          </>
        )}
      </div>
        </>
      )}
    </div>
  )
}

/* ===================== مكوّنات ===================== */

function ScopeBtn({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-5 py-1.5 transition-colors',
        active
          ? 'bg-card font-semibold text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

/* ===================== المؤشّرات ===================== */

// بطاقة مؤشّر: عنوان صغير هادئ فوق رقم كبير. لا أيقونة — الرقم هو البطل.
function Stat({
  label,
  value,
  note,
  tone = 'plain',
  onClick,
}: {
  label: string
  value: number
  note?: string
  tone?: 'plain' | 'danger' | 'warn'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-2xl border bg-card p-4 text-right transition-all hover:border-gold/50 hover:shadow-sm',
        tone === 'danger' && value > 0
          ? 'border-destructive/30'
          : tone === 'warn' && value > 0
            ? 'border-amber-400/40'
            : 'border-border/70'
      )}
    >
      <p className="truncate text-[13px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-[30px] font-bold leading-none',
          tone === 'danger' && value > 0
            ? 'text-destructive'
            : tone === 'warn' && value > 0
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-foreground'
        )}
      >
        {fmtNumber(value)}
      </p>
      {note && (
        <p className="mt-1.5 truncate text-xs text-muted-foreground">{note}</p>
      )}
    </button>
  )
}

// مؤشّر إداري مضغوط — معلومة تحت الطلب، لا تزاحم الأربعة الكبار
function MiniStat({
  label,
  value,
  icon: Icon,
  alert,
  onClick,
}: {
  label: string
  value: number
  icon: LucideIcon
  alert?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-2 text-sm transition-colors hover:border-gold/50',
        alert ? 'border-amber-400/40' : 'border-border/70'
      )}
    >
      <Icon className={cn('h-4 w-4', alert ? 'text-amber-500' : 'text-muted-foreground')} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{fmtNumber(value)}</span>
    </button>
  )
}

/* ===================== جدول اليوم ===================== */

const AGENDA_META: Record<
  AgendaItem['kind'],
  { icon: LucideIcon; label: string; cls: string }
> = {
  session: { icon: Gavel, label: 'جلسة', cls: 'text-gold-600 bg-gold/15 dark:text-gold-300' },
  appointment: { icon: CalendarClock, label: 'موعد', cls: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300' },
  task: { icon: ListTodo, label: 'مهمة', cls: 'text-blue-600 bg-blue-500/10 dark:text-blue-300' },
}

function TodayAgendaCard({
  items,
  loading,
  onOpen,
}: {
  items: AgendaItem[]
  loading: boolean
  onOpen: (href: string) => void
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 px-5 pb-3 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
          <Sun className="h-[18px] w-[18px] text-gold" />
        </span>
        <CardTitle className="text-[15px] font-semibold">
          جدول اليوم
          {items.length > 0 && (
            <span className="mr-1.5 text-sm font-normal text-muted-foreground">
              {fmtNumber(items.length)}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="px-2.5 pb-3">
        {loading ? (
          <div className="space-y-2 px-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <p className="text-sm text-foreground">لا شيء مجدول اليوم</p>
            <p className="text-xs text-muted-foreground">
              لا جلسات ولا مواعيد ولا مهام مستحقة
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map((it) => {
              const m = AGENDA_META[it.kind]
              const Icon = m.icon
              return (
                <button
                  key={it.id}
                  onClick={() => onOpen(it.href)}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right transition-colors hover:bg-muted/60"
                >
                  <span className="w-12 shrink-0 text-center">
                    {it.time ? (
                      <Ltr className="text-[13px] font-semibold tabular-nums text-foreground">
                        {it.time}
                      </Ltr>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">اليوم</span>
                    )}
                  </span>

                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', m.cls)}>
                    <Icon className="h-4 w-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {it.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {it.subtitle ? `${m.label} · ${it.subtitle}` : m.label}
                    </span>
                  </span>

                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5 group-hover:text-gold" />
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ===================== بانتظار الاعتماد ===================== */

function ApprovalsCard({
  approvals,
  isAll,
  onTasks,
  onLetters,
}: {
  approvals?: { tasks: number; letters: number; total: number }
  isAll: boolean
  onTasks: () => void
  onLetters: () => void
}) {
  // لا نعرض البطاقة فارغة — الصفر يظهر في شريط المؤشّرات أعلاه
  if (!approvals || approvals.total === 0) return null

  return (
    <Card className="border-amber-300/70 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 px-5 pb-3 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/20">
          <Stamp className="h-[18px] w-[18px] text-amber-500" />
        </span>
        <CardTitle className="text-[15px] font-semibold">
          {isAll ? 'بانتظار الاعتماد' : 'بانتظار اعتمادك'}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2.5 pb-2.5">
        <div className="divide-y divide-amber-300/30">
          {approvals.tasks > 0 && (
            <RowShell onClick={onTasks}>
              <p className="text-sm font-medium text-foreground">
                {arPlural(approvals.tasks, {
                  one: 'مهمة مرفوعة للاعتماد',
                  two: 'مهمتان مرفوعتان للاعتماد',
                  many: `${fmtNumber(approvals.tasks)} مهام مرفوعة للاعتماد`,
                })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                راجع ملف العمل ثم اعتمد أو أعِد للتعديل
              </p>
            </RowShell>
          )}
          {approvals.letters > 0 && (
            <RowShell onClick={onLetters}>
              <p className="text-sm font-medium text-foreground">
                {arPlural(approvals.letters, {
                  one: 'خطاب صادر ينتظر الختم',
                  two: 'خطابان صادران ينتظران الختم',
                  many: `${fmtNumber(approvals.letters)} خطابات صادرة تنتظر الختم`,
                })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                معاينة مختومة قبل الاعتماد
              </p>
            </RowShell>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SectionCard({
  icon: Icon,
  title,
  count,
  loading,
  children,
}: {
  icon: LucideIcon
  title: string
  count?: number
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 px-5 pb-3 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
          <Icon className="h-[18px] w-[18px] text-gold" />
        </span>
        <CardTitle className="text-[15px] font-semibold">
          {title}
          {count != null && count > 0 && (
            <span className="mr-1.5 text-sm font-normal text-muted-foreground">
              {fmtNumber(count)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2.5 pb-2.5">
        {loading ? (
          <div className="space-y-2 px-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/60">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

function RowShell({
  onClick,
  children,
}: {
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-right transition-colors hover:bg-muted/60"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5 group-hover:text-gold" />
    </button>
  )
}

function Empty({ text, icon: Icon }: { text: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
      {Icon && <Icon className="h-6 w-6 text-muted-foreground/50" />}
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

/* ===================== جلسات تحتاج إغلاق ===================== */

function SessionsNeedClosureSection({ scope }: { scope: DashboardScope }) {
  const [, navigate] = useLocation()
  const { data } = useSessionsNeedClosure(scope)
  const list = data ?? []
  if (list.length === 0) return null // تنبيه يظهر فقط عند وجود جلسات

  return (
    <Card className="border-amber-300/70 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
      <CardHeader className="flex-row items-center gap-2.5 space-y-0 px-5 pb-3 pt-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/20">
          <AlertTriangle className="h-[18px] w-[18px] text-amber-500" />
        </span>
        <CardTitle className="text-[15px] font-semibold">
          جلسات تحتاج إغلاق{' '}
          <span className="mr-1 text-sm font-normal text-muted-foreground">
            {fmtNumber(list.length)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2.5 pb-2.5">
        <div className="divide-y divide-amber-300/30">
          {list.map((x) => (
            <RowShell key={x.id} onClick={() => navigate(`/cases/${x.case_id}`)}>
              <p className="truncate text-sm font-medium text-foreground">
                {x.case_title || x.title || 'جلسة'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fmtDatePref(x.session_date)} · فات موعدها منذ{' '}
                {daysLabel(x.days_ago)}
              </p>
            </RowShell>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/* ===================== صفوف ===================== */

function SessionRow({ s, onClick }: { s: DashSession; onClick: () => void }) {
  const days = daysFromToday(s.session_date)
  const soon = days != null && days <= 2
  return (
    <RowShell onClick={onClick}>
      <p className="truncate text-sm font-medium text-foreground">
        {s.case_title || s.title || 'جلسة'}
      </p>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>{fmtDatePref(s.session_date)}</span>
        {s.session_time && <span>{fmtTime(s.session_time)}</span>}
        <span className={cn('font-medium', soon ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')}>
          {countdownText(days)}
        </span>
      </div>
    </RowShell>
  )
}

// صف مهمة قابل للإكمال (مربّع إكمال + نقر على المهمة لفتح قضيتها)
function CompletableTaskRow({
  t,
  completing,
  onComplete,
  onOpen,
}: {
  t: DashTask
  completing: boolean
  onComplete: () => void
  onOpen: () => void
}) {
  const days = daysFromToday(t.due_date)
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60">
      {/* مربّع الإكمال */}
      <button
        type="button"
        title="إنجاز المهمة"
        disabled={completing}
        onClick={onComplete}
        className="group -m-1 shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:text-emerald-600 disabled:opacity-60"
      >
        {completing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Circle className="h-5 w-5 group-hover:hidden" />
            <CheckCircle2 className="hidden h-5 w-5 text-emerald-600 group-hover:block" />
          </>
        )}
      </button>

      {/* محتوى المهمة */}
      <button onClick={onOpen} className="min-w-0 flex-1 text-right">
        <p className="truncate text-sm font-medium text-foreground">
          {t.title || 'مهمة'}
        </p>
        {t.case_title && (
          <p className="truncate text-xs text-muted-foreground">{t.case_title}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {t.is_urgent && (
            <Badge variant="destructive" className="gap-1">
              <Flame className="h-3 w-3" />
              عاجلة
            </Badge>
          )}
          <Badge variant={taskPriorityBadge(t.priority)}>
            {taskPriorityLabel(t.priority)}
          </Badge>
          {t.due_date && (
            <span
              className={cn(
                'text-xs',
                t.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
              )}
            >
              {fmtDatePref(t.due_date)}
              {t.overdue ? ` · متأخّرة ${daysLabel(Math.abs(days ?? 0))}` : ''}
            </span>
          )}
        </div>
      </button>
    </div>
  )
}

function PoaRow({ p, onClick }: { p: DashPOA; onClick: () => void }) {
  const d = p.days_left ?? null
  const urgent = d != null && d <= 7
  return (
    <RowShell onClick={onClick}>
      <p className="truncate text-sm font-medium text-foreground">{p.client_name || 'موكّل'}</p>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {p.poa_number && (
          <span>
            وكالة <Ltr>{p.poa_number}</Ltr>
          </span>
        )}
        <span className={cn('font-medium', urgent ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')}>
          {d === 0 ? 'تنتهي اليوم' : d === 1 ? 'تنتهي غداً' : `تنتهي بعد ${daysLabel(d ?? 0)}`}
        </span>
      </div>
    </RowShell>
  )
}

function ApplicationRow({ a, onClick }: { a: DashApplication; onClick: () => void }) {
  return (
    <RowShell onClick={onClick}>
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-foreground">{a.full_name}</p>
        {a.has_cv && (
          <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            سيرة
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {a.qualifications && <span className="truncate">{a.qualifications}</span>}
        <span>{fmtDatePref(a.created_at)}</span>
      </div>
    </RowShell>
  )
}

function RequestRow({ r, onClick }: { r: DashRequest; onClick: () => void }) {
  return (
    <RowShell onClick={onClick}>
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-foreground">{r.client_name}</p>
        <Badge variant="outline" className="px-1.5 py-0 text-xs">
          {requestTypeLabel(r.request_type)}
        </Badge>
      </div>
      {r.description && (
        <p className="line-clamp-1 text-xs text-muted-foreground">{r.description}</p>
      )}
    </RowShell>
  )
}

function AppointmentRow({ ap, onClick }: { ap: DashAppointment; onClick: () => void }) {
  return (
    <RowShell onClick={onClick}>
      <p className="truncate text-sm font-medium text-foreground">{ap.client_name || 'موعد'}</p>
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span>{fmtDatePref(ap.appointment_date)}</span>
        {ap.appointment_time && <span>{fmtTime(ap.appointment_time)}</span>}
      </div>
    </RowShell>
  )
}
