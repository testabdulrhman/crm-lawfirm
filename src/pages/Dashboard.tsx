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
  Clock,
  Timer,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { usePageState } from '@/hooks/usePageState'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref, fmtTime, daysLabel, arPlural, todayISO } from '@/lib/format'
import { Ltr } from '@/components/Ltr'
import { taskPriorityBadge, taskPriorityLabel } from '@/lib/caseLabels'
import { typeLabel as requestTypeLabel } from '@/features/requests/labels'
import { FeedContent } from '@/features/feed/FeedPage'
import { BirthdayCard } from '@/components/BirthdayCard'
import {
  useDashboardOverview,
  useCompleteTask,
  usePendingApprovals,
  useTodayAgenda,
  type DashboardScope,
  type AgendaItem,
} from '@/hooks/useDashboard'
import { useSessionsNeedClosure } from '@/hooks/useCaseSessions'
import { useRecentNarrations } from '@/hooks/useMatterEvents'
import { matterHref } from '@/lib/matterHref'
import { errMessage } from '@/lib/errors'
import {
  useDeadlines,
  useDeadlinesOverview,
  useConfirmDeadline,
  DEADLINE_SOURCE_LABEL,
} from '@/hooks/useDeadlineLoop'
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

  // تحية بتوقيتها — لمسة البطل
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* ===== لوحة البطل — الافتتاحية: هوية كحلية، سدو ذهبي، والمؤشرات مدمجة ===== */}
      <div className="relative overflow-hidden rounded-3xl bg-navy bg-[linear-gradient(130deg,#1a2a55_0%,#111D3A_52%,#0c142d_100%)] p-6 text-white shadow-[0_10px_34px_-12px_rgba(17,29,58,0.55)] sm:p-7">
        {/* نقش سدو خافت — معيّنات متداخلة من هوية الشعار */}
        <svg
          aria-hidden
          className="pointer-events-none absolute -start-8 top-1/2 h-[210%] w-56 -translate-y-1/2 text-gold opacity-[0.07]"
          viewBox="0 0 100 300"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          {[0, 60, 120, 180, 240].map((y) => (
            <g key={y}>
              <path d={`M50 ${y}l28 30-28 30-28-30z`} />
              <path d={`M50 ${y + 14}l15 16-15 16-15-16z`} />
              <circle cx="50" cy={y + 30} r="3.5" fill="currentColor" stroke="none" />
            </g>
          ))}
        </svg>

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[26px] font-bold leading-snug tracking-tight">
              {greeting}
              {teamMember?.short_name || teamMember?.name
                ? `، ${teamMember.short_name || teamMember.name}`
                : ''}
            </h2>
            <p className="mt-1 text-sm text-white/60">{fmtDatePref(todayISO())}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-white/10 p-1 text-sm backdrop-blur-sm">
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
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="grid h-9 w-9 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title="تحديث"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* المؤشرات الأربعة — بلورات داخل البطل لا شريط منفصل */}
        <div className="relative mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {isLoading || !s ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[86px] animate-pulse rounded-2xl bg-white/[0.06]" />
            ))
          ) : (
            <>
              <HeroStat
                icon={Gavel}
                label={isAll ? 'جلسات قادمة' : 'جلساتي القادمة'}
                value={s.upcoming_sessions}
                onClick={() => navigate('/sessions')}
              />
              <HeroStat
                icon={Flame}
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
              <HeroStat
                icon={Stamp}
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
              <HeroStat
                icon={Scale}
                label="قضايا جارية"
                value={s.cases_active}
                note={
                  s.cases_total > 0
                    ? `من ${fmtNumber(s.cases_total)} قضية`
                    : undefined
                }
                onClick={() => navigate('/cases')}
              />
            </>
          )}
        </div>
      </div>

      {isFeed ? (
        <FeedContent />
      ) : (
        <>
      <BirthdayCard />

      {/* ===== جدول اليوم + ما يحتاج انتباهك ===== */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <TodayAgendaCard
          items={agenda}
          loading={agendaLoading}
          onOpen={(href) => navigate(href)}
        />

        <div className="space-y-5">
          <DeadlinesPanel />
          <WhileYouWereBusy />
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
          ? 'bg-gold font-semibold text-navy shadow-sm'
          : 'text-white/60 hover:text-white'
      )}
    >
      {label}
    </button>
  )
}

/* ===================== المؤشّرات ===================== */

// مؤشر بلوري داخل لوحة البطل — زجاج أبيض خافت وأيقونة ذهبية
function HeroStat({
  icon: Icon,
  label,
  value,
  note,
  tone = 'plain',
  onClick,
}: {
  icon: LucideIcon
  label: string
  value: number
  note?: string
  tone?: 'plain' | 'danger' | 'warn'
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-start transition-colors hover:bg-white/[0.12]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-2xl font-bold leading-tight tabular-nums',
            tone === 'danger' && value > 0
              ? 'text-rose-300'
              : tone === 'warn' && value > 0
                ? 'text-amber-300'
                : 'text-white'
          )}
        >
          {fmtNumber(value)}
        </span>
        <span className="block truncate text-xs text-white/60">{label}</span>
        {note && (
          <span className="block truncate text-[11px] text-white/40">{note}</span>
        )}
      </span>
    </button>
  )
}

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
        'inline-flex items-center gap-2 rounded-full border bg-card py-1.5 pe-1.5 ps-3.5 text-sm transition-all hover:border-gold/50 hover:shadow-sm',
        alert ? 'border-amber-400/50' : 'border-border/60'
      )}
    >
      <Icon className={cn('h-4 w-4', alert ? 'text-amber-500' : 'text-muted-foreground')} />
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
          alert
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            : 'bg-muted text-foreground'
        )}
      >
        {fmtNumber(value)}
      </span>
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
    <Panel icon={Sun} title="جدول اليوم" count={items.length}>
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] w-full rounded-2xl" />
        ))
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border/60 py-9 text-center">
          <p className="text-sm text-foreground">لا شيء مجدول اليوم</p>
          <p className="text-xs text-muted-foreground">
            لا جلسات ولا مواعيد ولا مهام مستحقة
          </p>
        </div>
      ) : (
        <>
          {items.map((it) => {
              const m = AGENDA_META[it.kind]
              const Icon = m.icon
              return (
                <button
                  key={it.id}
                  onClick={() => onOpen(it.href)}
                  className="group flex w-full items-center gap-3.5 rounded-2xl bg-card px-4 py-3.5 text-right shadow-[0_1px_3px_rgba(17,29,58,0.06)] transition-all hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(17,29,58,0.10)]"
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
        </>
      )}
    </Panel>
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
    <Panel
      icon={Stamp}
      title={isAll ? 'بانتظار الاعتماد' : 'بانتظار اعتمادك'}
      count={approvals.total}
      tone="warn"
    >
      <>
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
      </>
    </Panel>
  )
}

// «صينية» القسم: خلفية رمادية ناعمة تحتضن بطاقات بيضاء — تفصل الأقسام
// بالطبقة لا بالخط، فتهدأ الصفحة ويبرز محتوى كل قسم.
function Panel({
  icon: Icon,
  title,
  count,
  hint,
  tone = 'plain',
  children,
}: {
  icon: LucideIcon
  title: string
  count?: number
  /** تلميح صغير في أقصى الترويسة — سياق لا إجراء */
  hint?: string
  tone?: 'plain' | 'warn'
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-[26px] p-3',
        tone === 'warn'
          ? 'bg-amber-100/70 dark:bg-amber-950/25'
          : 'bg-muted dark:bg-muted/50'
      )}
    >
      <header className="flex items-center gap-2.5 px-3 pb-3 pt-1.5">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-xl',
            tone === 'warn' ? 'bg-amber-400/25' : 'bg-card'
          )}
        >
          <Icon
            className={cn(
              'h-4 w-4',
              tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gold'
            )}
          />
        </span>
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {count != null && count > 0 && (
          <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {fmtNumber(count)}
          </span>
        )}
        {hint && (
          <span className="ms-auto truncate text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function SectionCard({
  icon,
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
    <Panel icon={icon} title={title} count={count}>
      {loading
        ? Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] w-full rounded-2xl" />
          ))
        : children}
    </Panel>
  )
}

// لوحة ألوان هادئة للدوائر — تعطي الصفوف حياة بدل رتابة لون واحد.
// اللون مشتق من النص نفسه فيثبت للاسم الواحد عبر الصفحات.
const AVATAR_TONES = [
  'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300',
]

function toneOf(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_TONES[h % AVATAR_TONES.length]
}

// دائرة الحرف الأول — بديل الأيقونة الرمادية المكرّرة
function RowAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold',
        toneOf(name),
        className
      )}
    >
      {name.trim().charAt(0) || '؟'}
    </span>
  )
}

// شارة معلومة صغيرة في ذيل الصف (وقت، محكمة، رقم مرجعي)
function MetaChip({
  icon: Icon,
  children,
  tone = 'plain',
}: {
  icon?: LucideIcon
  children: React.ReactNode
  tone?: 'plain' | 'warn' | 'danger'
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium',
        tone === 'danger'
          ? 'bg-destructive/10 text-destructive'
          : tone === 'warn'
            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            : 'bg-muted text-muted-foreground'
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
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
      className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3.5 text-right shadow-[0_1px_3px_rgba(17,29,58,0.06)] transition-all hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(17,29,58,0.10)]"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5 group-hover:text-gold" />
    </button>
  )
}

function Empty({ text, icon: Icon }: { text: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 py-7 text-center">
      {Icon && <Icon className="h-6 w-6 text-muted-foreground/50" />}
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

/* ===================== بينما كنت مشغولاً ===================== */

// النظام يحكي ما فعله نيابةً عنك — بصيغة المتكلم، من matter_events مباشرة.
// السرد مُقنَّن (narrate=true فقط وبسقف صغير): سردٌ كثير = سجلّ لا يُقرأ.
function WhileYouWereBusy() {
  const [, navigate] = useLocation()
  const { data: rows = [], isError, error } = useRecentNarrations(5)
  if (isError)
    return (
      <Panel icon={Sparkles} title="بينما كنت مشغولاً">
        <p className="rounded-2xl border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
          تعذّر تحميل السرد: {errMessage(error)}
        </p>
      </Panel>
    )
  if (!rows.length) return null

  return (
    <Panel icon={Sparkles} title="بينما كنت مشغولاً" hint="آخر 48 ساعة">
      {rows.map((r) => (
        <RowShell key={r.id} onClick={() => navigate(matterHref(r.matter_kind, r.matter_id))}>
          <p className="text-[13px] leading-relaxed text-foreground">
            {r.sentence}
          </p>
          {r.matter_title && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {r.matter_title}
            </p>
          )}
        </RowShell>
      ))}
    </Panel>
  )
}

/* ===================== المهل النظامية ===================== */

// المهل المشتقّة (اعتراض/جلسة/وكالة) تُعرض وحدها لا مع بقية المهام:
// فوات مهلة الاعتراض **سقوط حق لا تأخير**، والوثيقة المرجعية تجعل
// المفوَّت منها مؤشراً بلا هامش تسامح.
function DeadlinesPanel() {
  const [, navigate] = useLocation()
  const { data: o } = useDeadlinesOverview()
  const { data: rows = [] } = useDeadlines(5)
  const confirm = useConfirmDeadline()

  // لا نعرض القسم إن لم تكن هناك مهلة مفتوحة أصلاً
  if (!o || rows.length === 0) return null
  const alarming = o.overdue > 0

  return (
    <Panel
      icon={Timer}
      title="المهل النظامية"
      count={rows.length}
      tone={alarming ? 'warn' : 'plain'}
      hint={alarming ? `${fmtNumber(o.overdue)} فائتة` : 'لا فائت'}
    >
      {rows.map((d) => {
        const days = daysFromToday(d.due_date)
        const late = days != null && days < 0
        const needsConfirm = d.source === 'ruling' && !d.confirmed
        return (
          <RowShell
            key={d.id}
            onClick={() => navigate(`/tasks/${d.id}`)}
          >
            <div className="flex items-center gap-3.5">
              <RowAvatar name={d.case_title || d.title || 'مهلة'} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {d.case_title || d.title || 'مهلة'}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {DEADLINE_SOURCE_LABEL[d.source]}
                  {d.assignee_name ? ` · ${d.assignee_name}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <MetaChip icon={Clock} tone={late ? 'danger' : 'plain'}>
                    {countdownText(days)}
                  </MetaChip>
                  {needsConfirm && (
                    <button
                      type="button"
                      disabled={confirm.isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        confirm.mutate(d.id)
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/25 disabled:opacity-60 dark:text-amber-300"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      تحتاج اعتماداً ثانياً
                    </button>
                  )}
                </div>
              </div>
            </div>
          </RowShell>
        )
      })}
    </Panel>
  )
}

/* ===================== جلسات تحتاج إغلاق ===================== */

function SessionsNeedClosureSection({ scope }: { scope: DashboardScope }) {
  const [, navigate] = useLocation()
  const { data } = useSessionsNeedClosure(scope)
  const list = data ?? []
  if (list.length === 0) return null // تنبيه يظهر فقط عند وجود جلسات

  return (
    <Panel
      icon={AlertTriangle}
      title="جلسات تحتاج إغلاق"
      count={list.length}
      tone="warn"
    >
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
    </Panel>
  )
}

/* ===================== صفوف ===================== */

function SessionRow({ s, onClick }: { s: DashSession; onClick: () => void }) {
  const days = daysFromToday(s.session_date)
  const soon = days != null && days <= 2
  return (
    <RowShell onClick={onClick}>
      <div className="flex items-center gap-3.5">
        <RowAvatar name={s.case_title || s.title || 'جلسة'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {s.case_title || s.title || 'جلسة'}
          </p>
          {s.case_title && s.title && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.title}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MetaChip icon={CalendarDays}>{fmtDatePref(s.session_date)}</MetaChip>
            {s.session_time && (
              <MetaChip icon={Clock}>{fmtTime(s.session_time)}</MetaChip>
            )}
            <MetaChip tone={soon ? 'danger' : 'warn'}>{countdownText(days)}</MetaChip>
          </div>
        </div>
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
    <div className="flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-3.5 shadow-[0_1px_3px_rgba(17,29,58,0.06)] transition-all hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(17,29,58,0.10)]">
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
        <p className="truncate text-sm font-semibold text-foreground">
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
            <MetaChip icon={Clock} tone={t.overdue ? 'danger' : 'plain'}>
              {fmtDatePref(t.due_date)}
              {t.overdue ? ` · متأخّرة ${daysLabel(Math.abs(days ?? 0))}` : ''}
            </MetaChip>
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
      <div className="flex items-center gap-3.5">
        <RowAvatar name={p.client_name || 'موكّل'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {p.client_name || 'موكّل'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {p.poa_number && (
              <MetaChip icon={FileSignature}>
                وكالة <Ltr>{p.poa_number}</Ltr>
              </MetaChip>
            )}
            <MetaChip icon={Clock} tone={urgent ? 'danger' : 'warn'}>
              {d === 0 ? 'تنتهي اليوم' : d === 1 ? 'تنتهي غداً' : `تنتهي بعد ${daysLabel(d ?? 0)}`}
            </MetaChip>
          </div>
        </div>
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
      <div className="flex items-center gap-3.5">
        <RowAvatar name={ap.client_name || 'موعد'} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {ap.client_name || 'موعد'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <MetaChip icon={CalendarClock}>{fmtDatePref(ap.appointment_date)}</MetaChip>
            {ap.appointment_time && (
              <MetaChip icon={Clock}>{fmtTime(ap.appointment_time)}</MetaChip>
            )}
          </div>
        </div>
      </div>
    </RowShell>
  )
}
