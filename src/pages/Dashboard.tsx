import { useState } from 'react'
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
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ThankYouCard } from '@/components/ThankYouCard'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref, fmtTime } from '@/lib/format'
import { taskPriorityBadge, taskPriorityLabel } from '@/lib/caseLabels'
import { typeLabel as requestTypeLabel } from '@/features/requests/labels'
import {
  useDashboardOverview,
  useCompleteTask,
  type DashboardScope,
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
  if (days > 0) return `بعد ${fmtNumber(days)} يوم`
  return `متأخّرة ${fmtNumber(-days)} يوم`
}

export default function Dashboard() {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const [, navigate] = useLocation()

  // النطاق: «متطلباتي» افتراضياً؛ «المكتب» للمدير فقط
  const [scope, setScope] = useState<DashboardScope>('mine')
  const effectiveScope: DashboardScope = isDirector ? scope : 'mine'
  const isAll = effectiveScope === 'all'

  const { data, isLoading, isFetching, refetch } =
    useDashboardOverview(effectiveScope)
  const s = data?.stats
  const completeM = useCompleteTask()

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* الترحيب */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            مرحباً، {teamMember?.name ?? 'بك'} 👋
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isAll
              ? 'نظرة شاملة على أعمال المكتب'
              : 'متطلباتك القادمة: جلساتك ومهامك'}
          </p>
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

      {/* مبدّل النطاق — للمدير فقط */}
      {isDirector && (
        <div className="inline-flex rounded-full bg-muted p-1 text-sm">
          <ScopeBtn
            active={scope === 'mine'}
            onClick={() => setScope('mine')}
            label="متطلباتي"
          />
          <ScopeBtn
            active={scope === 'all'}
            onClick={() => setScope('all')}
            label="المكتب"
          />
        </div>
      )}

      {/* بطاقات KPI */}
      {isLoading || !s ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: isAll ? 8 : 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {/* الأهم دائماً: الجلسات + المهام */}
          <Kpi
            label="الجلسات القادمة"
            value={s.upcoming_sessions}
            icon={CalendarDays}
            tone="gold"
            onClick={() => navigate('/sessions')}
          />
          <Kpi
            label="المهام المفتوحة"
            value={s.open_tasks}
            icon={ListTodo}
            tone={s.overdue_tasks > 0 ? 'red' : 'blue'}
            note={
              s.overdue_tasks > 0
                ? `منها ${fmtNumber(s.overdue_tasks)} متأخرة`
                : undefined
            }
            onClick={() => navigate('/cases')}
          />

          {/* بطاقات إدارية — وضع «المكتب» (المدير) فقط */}
          {isAll && (
            <>
              <Kpi label="إجمالي القضايا" value={s.cases_total} icon={Scale} tone="navy" onClick={() => navigate('/cases')} />
              <Kpi label="القضايا الجارية" value={s.cases_active} icon={Scale} tone="green" onClick={() => navigate('/cases')} />
              <Kpi label="جهات الاتصال" value={s.contacts} icon={BookUser} tone="gold" onClick={() => navigate('/contacts')} />
              <Kpi label="الموظفون النشطون" value={s.staff_active} icon={Users} tone="navy" onClick={() => navigate('/team')} />
              <Kpi
                label="طلبات التوظيف"
                value={s.pending_applications}
                icon={UserPlus}
                tone={s.pending_applications > 0 ? 'gold' : 'navy'}
                onClick={() => navigate('/staff-applications')}
              />
              <Kpi
                label="الطلبات الواردة"
                value={s.pending_requests}
                icon={Inbox}
                tone={s.pending_requests > 0 ? 'blue' : 'navy'}
                onClick={() => navigate('/requests')}
              />
              <Kpi
                label="وكالات تنتهي قريباً"
                value={s.expiring_poas}
                icon={FileSignature}
                tone={s.expiring_poas > 0 ? 'amber' : 'navy'}
                onClick={() => navigate('/poa')}
              />
            </>
          )}
        </div>
      )}

      {/* جلسات تحتاج إغلاق (حسب النطاق) */}
      <SessionsNeedClosureSection scope={effectiveScope} />

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
            <Empty text="لا جلسات قادمة" />
          ) : (
            (data?.upcoming_sessions ?? []).map((x) => (
              <SessionRow
                key={x.id}
                s={x}
                onClick={() => x.case_id && navigate(`/cases/${x.case_id}`)}
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
            <Empty text="لا مهام عليك 🎉" />
          ) : (
            (data?.tasks ?? []).map((t) => (
              <CompletableTaskRow
                key={t.id}
                t={t}
                completing={completeM.isPending && completeM.variables === t.id}
                onComplete={() => completeM.mutate(t.id)}
                onOpen={() => t.case_id && navigate(`/cases/${t.case_id}`)}
              />
            ))
          )}
        </SectionCard>
      </div>

      {/* أقسام ثانوية */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* إجراء سريع: شكر العميل على الزيارة + طلب تقييم */}
        <ThankYouCard />

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
                <Empty text="لا وكالات تنتهي قريباً" />
              ) : (
                (data?.expiring_poas ?? []).map((p) => (
                  <PoaRow key={p.id} p={p} onClick={() => navigate('/poa')} />
                ))
              )}
            </SectionCard>

            <SectionCard icon={UserPlus} title="آخر طلبات التوظيف" loading={isLoading}>
              {(data?.applications ?? []).length === 0 ? (
                <Empty text="لا طلبات جديدة" />
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
                <Empty text="لا طلبات واردة" />
              ) : (
                (data?.requests ?? []).map((r) => (
                  <RequestRow key={r.id} r={r} onClick={() => navigate('/requests')} />
                ))
              )}
            </SectionCard>
          </>
        )}
      </div>
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

const TONES: Record<string, string> = {
  navy: 'text-navy bg-navy/10 dark:text-navy-100 dark:bg-navy-100/10',
  gold: 'text-gold-600 bg-gold/15 dark:text-gold-300',
  green: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300',
  blue: 'text-blue-600 bg-blue-500/10 dark:text-blue-300',
  amber: 'text-amber-600 bg-amber-500/10 dark:text-amber-300',
  red: 'text-destructive bg-destructive/10',
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  note,
  onClick,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: keyof typeof TONES
  note?: string
  onClick: () => void
}) {
  const highlight = tone === 'red' || tone === 'amber'
  return (
    <button
      onClick={onClick}
      className={cn(
        'group rounded-2xl border border-border/70 bg-card p-5 text-right transition-all hover:border-gold/50 hover:shadow-sm',
        highlight && (tone === 'red' ? 'border-destructive/30' : 'border-amber-400/30')
      )}
    >
      <div className="flex items-center gap-3.5">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', TONES[tone])}>
          <Icon className="h-[22px] w-[22px]" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-[28px] font-bold leading-none text-foreground">
            {fmtNumber(value)}
          </p>
          {note && <p className="mt-1 text-xs font-medium text-destructive">{note}</p>}
        </div>
      </div>
    </button>
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

function Empty({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
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
                {fmtNumber(x.days_ago)} يوم
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
        className="group shrink-0 text-muted-foreground transition-colors hover:text-emerald-600 disabled:opacity-60"
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
              {t.overdue ? ` · متأخّرة ${fmtNumber(Math.abs(days ?? 0))} يوم` : ''}
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
        {p.poa_number && <span dir="ltr">وكالة {p.poa_number}</span>}
        <span className={cn('font-medium', urgent ? 'text-destructive' : 'text-amber-600 dark:text-amber-400')}>
          {d === 0 ? 'تنتهي اليوم' : d === 1 ? 'تنتهي غداً' : `تنتهي بعد ${fmtNumber(d ?? 0)} يوم`}
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
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
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
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
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
