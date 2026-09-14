// أقسام اللوحة الجديدة: «المطلوب مني» · «جدولي» · «المكتب» — ومؤشرات لوحة البطل.
// مكوّنات عرض خالصة (البيانات والنداءات من الصفحة) كي تُعايَن ببيانات وهمية بلا دخول.
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  BookUser,
  Building2,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock,
  FileSignature,
  Flame,
  Gavel,
  Inbox,
  ListChecks,
  ListTodo,
  Loader2,
  Scale,
  ShieldCheck,
  Sparkles,
  Stamp,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { daysLabel, fmtDatePref, fmtNumber, fmtTime, todayISO } from '@/lib/format'
import { errMessage } from '@/lib/errors'
import { matterHref } from '@/lib/matterHref'
import { useRecentNarrations } from '@/hooks/useMatterEvents'
import type { DashApplication, DashPOA, DashRequest, DashboardStats } from '@/types/db'
import {
  GROUP_META,
  GROUP_ORDER,
  KIND_META,
  daysUntil,
  groupActions,
  type ActionGroup,
  type ActionItem,
  type ActionKind,
  type ScheduleItem,
  type Tone,
} from './queue'

const TONE_CLS: Record<Tone, string> = {
  danger: 'bg-destructive/10 text-destructive',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  gold: 'bg-gold/15 text-gold-700 dark:text-gold',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  plain: 'bg-muted text-muted-foreground',
}

// بطاقة الصف البيضاء داخل «صينية» القسم — نفس لغة اللوحة القائمة
const CARD =
  'rounded-2xl bg-card shadow-[0_1px_3px_rgba(17,29,58,0.06)] transition-all hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(17,29,58,0.10)]'

/* ===================== لبنات مشتركة ===================== */

export function Panel({
  id,
  icon: Icon,
  title,
  count,
  hint,
  children,
}: {
  id?: string
  icon: LucideIcon
  title: string
  count?: number
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-4 rounded-[26px] bg-muted p-3 dark:bg-muted/50">
      <header className="flex items-center gap-2.5 px-3 pb-3 pt-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-card">
          <Icon className="h-4 w-4 text-gold" />
        </span>
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        {count != null && count > 0 && (
          <span className="rounded-md bg-card px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {fmtNumber(count)}
          </span>
        )}
        {hint && <span className="ms-auto truncate text-xs text-muted-foreground">{hint}</span>}
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function Chip({
  tone = 'plain',
  icon: Icon,
  children,
}: {
  tone?: Tone
  icon?: LucideIcon
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 py-0.5 text-[11px] font-medium',
        TONE_CLS[tone]
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  )
}

function MoreBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-1 rounded-xl py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
    >
      {label}
      <ChevronLeft className="h-3.5 w-3.5" />
    </button>
  )
}

function Empty({ text, icon: Icon }: { text: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 py-8 text-center">
      {Icon && <Icon className="h-6 w-6 text-muted-foreground/50" />}
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function RowShell({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('group flex w-full items-center justify-between gap-3 px-4 py-3.5 text-right', CARD)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5 group-hover:text-gold" />
    </button>
  )
}

/* ===================== لوحة البطل ===================== */

export function ScopeBtn({
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
        active ? 'bg-gold font-semibold text-navy shadow-sm' : 'text-white/60 hover:text-white'
      )}
    >
      {label}
    </button>
  )
}

// مؤشر بلوري داخل لوحة البطل — ملخّص للقائمة لا قائمة ثانية
export function HeroStat({
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
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold/15 text-gold sm:h-10 sm:w-10">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
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
        {/* على الجوال يلتف النص سطرين بدل أن يُقصّ «مطلوب اليـ…» */}
        <span className="line-clamp-2 block text-xs leading-snug text-white/60">{label}</span>
        {note && <span className="line-clamp-2 block text-[11px] leading-snug text-white/45">{note}</span>}
      </span>
    </button>
  )
}

/* ===================== المطلوب مني ===================== */

const KIND_ICON: Record<ActionKind, LucideIcon> = {
  objection: Scale,
  session_prep: Gavel,
  poa: FileSignature,
  task: ListTodo,
  approval: Stamp,
  letter: Stamp,
  session_close: Gavel,
}

// مهلة الاعتراض لا تُنجز بنقرة من اللوحة — تُفتح ويُتأكد منها (سقوط حق)
const COMPLETABLE: ActionKind[] = ['task', 'session_prep', 'poa']

const GROUP_LIMIT: Record<ActionGroup, number> = { overdue: 6, today: 6, week: 5, later: 0 }

function whenText(it: ActionItem, d: number | null): string {
  if (it.kind === 'session_close')
    return it.daysAgo ? `فاتت منذ ${daysLabel(it.daysAgo)}` : 'فات موعدها'
  if (it.kind === 'approval' || it.kind === 'letter') return 'ينتظر قرارك'
  if (d == null) return 'بلا موعد'
  if (d === 0) return 'اليوم'
  if (d === 1) return 'غداً'
  if (d > 0) return `بعد ${daysLabel(d)}`
  return it.kind === 'objection' ? `فاتت منذ ${daysLabel(-d)}` : `متأخرة ${daysLabel(-d)}`
}

function GroupHeader({ group, count }: { group: ActionGroup; count: number }) {
  const m = GROUP_META[group]
  return (
    <div className="flex items-center gap-2 px-2 pt-1.5">
      <span
        className={cn(
          'h-2 w-2 shrink-0 rounded-full',
          group === 'overdue'
            ? 'bg-destructive'
            : group === 'today'
              ? 'bg-amber-500'
              : group === 'week'
                ? 'bg-gold'
                : 'bg-muted-foreground/40'
        )}
      />
      <span
        className={cn(
          'text-[13px] font-semibold',
          group === 'overdue' ? 'text-destructive' : 'text-foreground'
        )}
      >
        {m.label}
      </span>
      <span className="text-xs tabular-nums text-muted-foreground">{fmtNumber(count)}</span>
      <span className="ms-auto truncate text-[11px] text-muted-foreground">{m.hint}</span>
    </div>
  )
}

function ActionRow({
  it,
  showAssignee,
  completing,
  confirming,
  onOpen,
  onComplete,
  onConfirm,
}: {
  it: ActionItem
  showAssignee: boolean
  completing: boolean
  confirming: boolean
  onOpen: (href: string) => void
  onComplete: (taskId: string) => void
  onConfirm: (taskId: string) => void
}) {
  const meta = KIND_META[it.kind]
  const Icon = KIND_ICON[it.kind]
  const d = daysUntil(it.due)
  const late = it.kind === 'session_close' || (d != null && d < 0)
  const canComplete = !!it.taskId && COMPLETABLE.includes(it.kind)
  // مهلة اعتراض فاتت أو بقي عليها ثلاثة أيام فأقل: إطار أحمر لا يُتجاهل
  const alarm = it.kind === 'objection' && d != null && d <= 3
  const sub = [it.matter, showAssignee ? it.assignee : null].filter(Boolean).join(' · ')
  const decision = it.kind === 'approval' || it.kind === 'letter'

  const when = (
    <Chip tone={late ? 'danger' : d === 0 ? 'warn' : decision ? 'gold' : 'plain'} icon={Clock}>
      {whenText(it, d)}
    </Chip>
  )
  const secondEye =
    it.needsSecondEye && it.taskId ? (
      <button
        type="button"
        title="شخص ثانٍ يعتمد صحة احتساب المهلة"
        disabled={confirming}
        onClick={() => onConfirm(it.taskId!)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/25 disabled:opacity-60 dark:text-amber-300"
      >
        {confirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
        اعتماد ثانٍ
      </button>
    ) : null

  // على الجوال يُطوى عمود الموعد تحت العنوان كي لا يختنق النص؛ وعلى الشاشة العريضة يبقى يساراً
  return (
    <div className={cn('px-3 py-3', CARD, alarm && 'ring-1 ring-destructive/40')}>
      <div className="flex items-center gap-2.5">
      {canComplete ? (
        <button
          type="button"
          title="إنجاز"
          disabled={completing}
          onClick={() => onComplete(it.taskId!)}
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
      ) : (
        <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-xl', TONE_CLS[meta.tone])}>
          <Icon className="h-4 w-4" />
        </span>
      )}

      <button type="button" onClick={() => onOpen(it.href)} className="min-w-0 flex-1 text-right">
        <p className="truncate text-sm font-semibold text-foreground">{it.title}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-nowrap">
          <Chip tone={meta.tone}>{meta.label}</Chip>
          {it.urgent && (
            <Chip tone="danger" icon={Flame}>
              عاجلة
            </Chip>
          )}
          {it.awaitingReview && <Chip>مرفوعة للاعتماد</Chip>}
          <span className="sm:hidden">{when}</span>
          {sub && (
            <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:block">{sub}</span>
          )}
        </div>
        {sub && <p className="mt-1 truncate text-xs text-muted-foreground sm:hidden">{sub}</p>}
      </button>

      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        {when}
        {secondEye}
      </div>
      </div>
      {secondEye && <div className="mt-2 flex justify-end sm:hidden">{secondEye}</div>}
    </div>
  )
}

export function ActionQueueCard({
  items,
  loading,
  error,
  office,
  completingId,
  confirmingId,
  onOpen,
  onComplete,
  onConfirm,
}: {
  items: ActionItem[] | undefined
  loading: boolean
  error?: unknown
  /** «لوحة المكتب»: يُظهر المكلَّف في كل صف */
  office: boolean
  completingId?: string
  confirmingId?: string
  onOpen: (href: string) => void
  onComplete: (taskId: string) => void
  onConfirm: (taskId: string) => void
}) {
  const [open, setOpen] = useState<Partial<Record<ActionGroup, boolean>>>({})
  const groups = useMemo(() => groupActions(items ?? []), [items])
  const total = items?.length ?? 0

  return (
    <Panel
      id="queue"
      icon={ListChecks}
      title={office ? 'المطلوب في المكتب' : 'المطلوب مني'}
      count={total}
      hint={
        groups.overdue.length > 0
          ? `${fmtNumber(groups.overdue.length)} فائت`
          : total > 0
            ? 'لا فائت'
            : undefined
      }
    >
      {loading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] w-full rounded-2xl" />
        ))
      ) : error ? (
        <Empty text={`تعذّر تحميل القائمة: ${errMessage(error)}`} />
      ) : total === 0 ? (
        <Empty
          icon={CheckCheck}
          text={office ? 'لا شيء ينتظر التحرّك في المكتب' : 'لا شيء ينتظرك الآن'}
        />
      ) : (
        GROUP_ORDER.map((g) => {
          const list = groups[g]
          if (list.length === 0) return null
          const limit = GROUP_LIMIT[g]
          const expanded = open[g] || list.length <= limit
          const rows = expanded ? list : list.slice(0, limit)
          return (
            <div key={g} className="space-y-2">
              <GroupHeader group={g} count={list.length} />
              {rows.map((it) => (
                <ActionRow
                  key={it.key}
                  it={it}
                  showAssignee={office}
                  completing={!!it.taskId && completingId === it.taskId}
                  confirming={!!it.taskId && confirmingId === it.taskId}
                  onOpen={onOpen}
                  onComplete={onComplete}
                  onConfirm={onConfirm}
                />
              ))}
              {!expanded && (
                <MoreBtn
                  label={
                    limit === 0
                      ? `عرض ${GROUP_META[g].label} (${fmtNumber(list.length)})`
                      : `عرض الباقي (${fmtNumber(list.length - limit)})`
                  }
                  onClick={() => setOpen((o) => ({ ...o, [g]: true }))}
                />
              )}
            </div>
          )
        })
      )}
    </Panel>
  )
}

/* ===================== جدولي ===================== */

const weekdayF = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', {
  weekday: 'long',
  timeZone: 'UTC',
})

function dayHeading(date: string, today: string): string {
  const d = daysUntil(date, today)
  if (d === 0) return 'اليوم'
  if (d === 1) return 'غداً'
  const [y, m, dd] = date.split('-').map(Number)
  return `${weekdayF.format(new Date(Date.UTC(y, m - 1, dd)))} · ${fmtDatePref(date)}`
}

const SCHEDULE_LIMIT = 8

function ScheduleRow({ it, onOpen }: { it: ScheduleItem; onOpen: (href: string) => void }) {
  const session = it.kind === 'session'
  const Icon = session ? Gavel : CalendarClock
  return (
    <button
      type="button"
      onClick={() => onOpen(it.href)}
      className={cn('group flex w-full items-center gap-3 px-3.5 py-3 text-right', CARD)}
    >
      <span className="w-14 shrink-0 text-center text-[12px] font-semibold tabular-nums text-foreground">
        {it.time ? fmtTime(it.time) : <span className="font-normal text-muted-foreground">—</span>}
      </span>
      <span
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
          TONE_CLS[session ? 'gold' : 'emerald']
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{it.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {session ? 'جلسة' : 'موعد'}
          {it.subtitle ? ` · ${it.subtitle}` : ''}
        </span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5 group-hover:text-gold" />
    </button>
  )
}

export function ScheduleCard({
  items,
  loading,
  error,
  days = 14,
  onOpen,
  onCalendar,
}: {
  items: ScheduleItem[] | undefined
  loading: boolean
  error?: unknown
  days?: number
  onOpen: (href: string) => void
  onCalendar: () => void
}) {
  const today = todayISO()
  const all = items ?? []
  const shown = all.slice(0, SCHEDULE_LIMIT)
  const byDay: [string, ScheduleItem[]][] = []
  for (const it of shown) {
    const last = byDay[byDay.length - 1]
    if (last && last[0] === it.date) last[1].push(it)
    else byDay.push([it.date, [it]])
  }

  return (
    <Panel
      id="schedule"
      icon={CalendarClock}
      title="جدولي"
      count={all.length}
      hint={`خلال ${fmtNumber(days)} يوماً`}
    >
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[58px] w-full rounded-2xl" />
        ))
      ) : error ? (
        <Empty text={`تعذّر تحميل الجدول: ${errMessage(error)}`} />
      ) : all.length === 0 ? (
        <Empty icon={CalendarClock} text="لا جلسات ولا مواعيد خلال أسبوعين" />
      ) : (
        <>
          {byDay.map(([date, list]) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-2 px-2 pt-1.5">
                <span
                  className={cn(
                    'truncate text-[13px] font-semibold',
                    date === today ? 'text-gold-700 dark:text-gold' : 'text-foreground'
                  )}
                >
                  {dayHeading(date, today)}
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {fmtNumber(list.length)}
                </span>
              </div>
              {list.map((it) => (
                <ScheduleRow key={it.key} it={it} onOpen={onOpen} />
              ))}
            </div>
          ))}
          {all.length > shown.length && (
            <MoreBtn label={`كل الجدول (${fmtNumber(all.length)}) في التقويم`} onClick={onCalendar} />
          )}
        </>
      )}
    </Panel>
  )
}

/* ===================== المكتب (للمدير) ===================== */

export function OfficeCard({
  stats,
  requests,
  applications,
  poas,
  onOpen,
}: {
  stats: DashboardStats
  requests: DashRequest[] | null
  applications: DashApplication[] | null
  poas: DashPOA[] | null
  onOpen: (href: string) => void
}) {
  const poa = poas?.[0]
  const poaWhen =
    poa?.days_left == null
      ? ''
      : poa.days_left === 0
        ? 'تنتهي اليوم'
        : poa.days_left === 1
          ? 'تنتهي غداً'
          : `تنتهي بعد ${daysLabel(poa.days_left)}`

  const tiles: {
    icon: LucideIcon
    label: string
    value: number
    alert?: boolean
    preview?: string | null
    href: string
  }[] = [
    {
      icon: Inbox,
      label: 'طلبات واردة',
      value: stats.pending_requests,
      alert: stats.pending_requests > 0,
      preview: requests?.[0]?.client_name ? `آخرها: ${requests[0].client_name}` : null,
      href: '/requests',
    },
    {
      icon: UserPlus,
      label: 'طلبات توظيف',
      value: stats.pending_applications,
      alert: stats.pending_applications > 0,
      preview: applications?.[0]?.full_name ? `آخرها: ${applications[0].full_name}` : null,
      href: '/staff-applications',
    },
    {
      icon: FileSignature,
      label: 'وكالات تنتهي خلال 30 يوماً',
      value: stats.expiring_poas,
      alert: stats.expiring_poas > 0,
      preview: poa?.client_name ? `${poa.client_name}${poaWhen ? ` · ${poaWhen}` : ''}` : null,
      href: '/poa',
    },
    {
      icon: Scale,
      label: 'قضايا جارية',
      value: stats.cases_active,
      preview: stats.cases_total > 0 ? `من ${fmtNumber(stats.cases_total)} قضية` : null,
      href: '/cases',
    },
    { icon: BookUser, label: 'جهات الاتصال', value: stats.contacts, href: '/contacts' },
    { icon: Users, label: 'الموظفون', value: stats.staff_active, href: '/team' },
  ]

  return (
    <Panel icon={Building2} title="المكتب" hint="أرقام تفتح صفحاتها">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.href}
            type="button"
            onClick={() => onOpen(t.href)}
            className={cn('flex items-center gap-3 px-3.5 py-3 text-right', CARD)}
          >
            <span
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                t.alert ? TONE_CLS.warn : TONE_CLS.gold
              )}
            >
              <t.icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-bold leading-tight tabular-nums text-foreground">
                {fmtNumber(t.value)}
              </span>
              <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">{t.label}</span>
              {t.preview && (
                <span className="block truncate text-[11px] text-muted-foreground/80">{t.preview}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </Panel>
  )
}

/* ===================== بينما كنت مشغولاً (في «آخر النشاط») ===================== */

// النظام يحكي ما فعله نيابةً عنك — بصيغة المتكلم، من matter_events مباشرة.
export function WhileYouWereBusy() {
  const [, navigate] = useLocation()
  const { data: all = [], isError, error } = useRecentNarrations(5)
  const [showAll, setShowAll] = useState(false)
  const rows = showAll ? all : all.slice(0, 3)
  if (isError)
    return (
      <Panel icon={Sparkles} title="بينما كنت مشغولاً">
        <p className="rounded-2xl border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
          تعذّر تحميل السرد: {errMessage(error)}
        </p>
      </Panel>
    )
  if (!all.length) return null

  return (
    <Panel icon={Sparkles} title="بينما كنت مشغولاً" hint="آخر 48 ساعة">
      {rows.map((r) => (
        <RowShell key={r.id} onClick={() => navigate(matterHref(r.matter_kind, r.matter_id))}>
          <p className="text-[13px] leading-relaxed text-foreground">{r.sentence}</p>
          {r.matter_title && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{r.matter_title}</p>
          )}
        </RowShell>
      ))}
      {!showAll && all.length > 3 && (
        <MoreBtn label={`عرض الكل (${fmtNumber(all.length)})`} onClick={() => setShowAll(true)} />
      )}
    </Panel>
  )
}
