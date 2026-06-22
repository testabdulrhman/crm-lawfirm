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
  type LucideIcon,
} from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref, fmtTime } from '@/lib/format'
import { taskPriorityBadge, taskPriorityLabel } from '@/lib/caseLabels'
import { typeLabel as requestTypeLabel } from '@/features/requests/labels'
import { useDashboardOverview } from '@/hooks/useDashboard'
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
  const [, navigate] = useLocation()
  const { data, isLoading, isFetching, refetch } = useDashboardOverview()
  const s = data?.stats

  return (
    <div className="space-y-6">
      {/* الترحيب */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground">
            مرحباً، {teamMember?.name ?? 'بك'} 👋
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نظرة شاملة على مهام اليوم ونشاط المكتب
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          تحديث
        </Button>
      </div>

      {/* بطاقات KPI */}
      {isLoading || !s ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
          <Kpi label="إجمالي القضايا" value={s.cases_total} icon={Scale} tone="navy" onClick={() => navigate('/cases')} />
          <Kpi label="القضايا الجارية" value={s.cases_active} icon={Scale} tone="green" onClick={() => navigate('/cases')} />
          <Kpi label="جهات الاتصال" value={s.contacts} icon={BookUser} tone="gold" onClick={() => navigate('/contacts')} />
          <Kpi label="الموظفون النشطون" value={s.staff_active} icon={Users} tone="navy" onClick={() => navigate('/team')} />
          <Kpi label="الجلسات القادمة" value={s.upcoming_sessions} icon={CalendarDays} tone="gold" onClick={() => navigate('/sessions')} />
          <Kpi
            label="المهام المفتوحة"
            value={s.open_tasks}
            icon={ListTodo}
            tone={s.overdue_tasks > 0 ? 'red' : 'blue'}
            note={s.overdue_tasks > 0 ? `منها ${fmtNumber(s.overdue_tasks)} متأخرة` : undefined}
            onClick={() => navigate('/cases')}
          />
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
        </div>
      )}

      {/* البطاقات التفصيلية */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* الجلسات القادمة */}
        <SectionCard icon={CalendarDays} title="الجلسات القادمة" loading={isLoading}>
          {(data?.upcoming_sessions ?? []).length === 0 ? (
            <Empty text="لا جلسات قادمة" />
          ) : (
            (data?.upcoming_sessions ?? []).map((x) => (
              <SessionRow key={x.id} s={x} onClick={() => x.case_id && navigate(`/cases/${x.case_id}`)} />
            ))
          )}
        </SectionCard>

        {/* المهام */}
        <SectionCard icon={ListTodo} title="المهام العاجلة والمتأخرة" loading={isLoading}>
          {(data?.tasks ?? []).length === 0 ? (
            <Empty text="لا مهام مفتوحة" />
          ) : (
            (data?.tasks ?? []).map((t) => (
              <TaskRow key={t.id} t={t} onClick={() => t.case_id && navigate(`/cases/${t.case_id}`)} />
            ))
          )}
        </SectionCard>

        {/* وكالات تنتهي قريباً */}
        <SectionCard icon={FileSignature} title="وكالات تنتهي قريباً" loading={isLoading}>
          {(data?.expiring_poas ?? []).length === 0 ? (
            <Empty text="لا وكالات تنتهي قريباً" />
          ) : (
            (data?.expiring_poas ?? []).map((p) => (
              <PoaRow key={p.id} p={p} onClick={() => navigate('/poa')} />
            ))
          )}
        </SectionCard>

        {/* آخر طلبات التوظيف */}
        <SectionCard icon={UserPlus} title="آخر طلبات التوظيف" loading={isLoading}>
          {(data?.applications ?? []).length === 0 ? (
            <Empty text="لا طلبات جديدة" />
          ) : (
            (data?.applications ?? []).map((a) => (
              <ApplicationRow key={a.id} a={a} onClick={() => navigate('/staff-applications')} />
            ))
          )}
        </SectionCard>

        {/* الطلبات الواردة */}
        <SectionCard icon={Inbox} title="الطلبات الواردة" loading={isLoading}>
          {(data?.requests ?? []).length === 0 ? (
            <Empty text="لا طلبات واردة" />
          ) : (
            (data?.requests ?? []).map((r) => (
              <RequestRow key={r.id} r={r} onClick={() => navigate('/requests')} />
            ))
          )}
        </SectionCard>

        {/* المواعيد القادمة — تظهر فقط إن وُجدت */}
        {(data?.appointments ?? []).length > 0 && (
          <SectionCard icon={CalendarClock} title="المواعيد القادمة" loading={false}>
            {(data?.appointments ?? []).map((ap) => (
              <AppointmentRow key={ap.id} ap={ap} onClick={() => navigate('/appointments')} />
            ))}
          </SectionCard>
        )}
      </div>
    </div>
  )
}

/* ===================== مكوّنات ===================== */

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
        'rounded-xl border bg-card p-4 text-right shadow-sm transition-colors hover:bg-accent/5',
        highlight && (tone === 'red' ? 'border-destructive/40' : 'border-amber-400/40')
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{fmtNumber(value)}</p>
          {note && <p className="text-[11px] font-medium text-destructive">{note}</p>}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </button>
  )
}

function SectionCard({
  icon: Icon,
  title,
  loading,
  children,
}: {
  icon: LucideIcon
  title: string
  loading: boolean
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="h-4 w-4 text-gold" />
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          children
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
      className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-right transition-colors hover:bg-accent/10"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
  )
}

function SessionRow({ s, onClick }: { s: DashSession; onClick: () => void }) {
  const days = daysFromToday(s.session_date)
  const soon = days != null && days <= 3
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

function TaskRow({ t, onClick }: { t: DashTask; onClick: () => void }) {
  return (
    <RowShell onClick={onClick}>
      <div className="flex items-center gap-2">
        <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
        {t.is_urgent && (
          <Badge variant="destructive" className="gap-0.5 px-1.5 py-0 text-[10px]">
            <Flame className="h-2.5 w-2.5" />
            عاجلة
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <Badge variant={taskPriorityBadge(t.priority)} className="px-1.5 py-0 text-[10px]">
          {taskPriorityLabel(t.priority)}
        </Badge>
        {t.case_title && <span className="truncate">{t.case_title}</span>}
        {t.due_date && (
          <span className={cn('font-medium', t.overdue && 'text-destructive')}>
            {fmtDatePref(t.due_date)}
          </span>
        )}
      </div>
    </RowShell>
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
