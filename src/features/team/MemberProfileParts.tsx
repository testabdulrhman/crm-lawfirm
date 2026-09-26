// أجزاء صفحة الموظف (تجديد 2026-09-26 — «ودي صفحة الموظف تكون أفضل من كذا بكثير»):
// ترويسة بهوية المكتب، وصفّ أرقام يلخّص حاله، ثم تبويبات: عمله الآن · بياناته · إجازاته · المالية.
import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import {
  Briefcase,
  CalendarClock,
  CalendarDays,
  Cake,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Copy,
  Flame,
  Gavel,
  Landmark,
  Mail,
  Phone,
  ShieldCheck,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Ltr } from '@/components/Ltr'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { arPlural, daysLabel, fmtDatePref, fmtNumber, fmtTime, todayISO } from '@/lib/format'
import { matterHref, matterKindEmoji } from '@/lib/matterHref'
import { caseStatusBadge, caseStatusLabel } from '@/lib/caseLabels'
import {
  hrDays,
  hrKindLabel,
  hrStatusLabel,
  LEAVE_TYPE_LABELS,
  useHrRequests,
  useLeaveBalance,
} from '@/hooks/useHrRequests'
import type { MemberWork } from '@/hooks/useMemberWork'
import { MemberDocumentsSection } from './MemberDocuments'
import type { TeamMember } from '@/types/db'

/* ===== مساعدات ===== */

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const ymd = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
const dayDiff = (s: string) => Math.round((ymd(s).getTime() - ymd(todayISO()).getTime()) / 864e5)

/** «سنة و8 أشهر» · «سنتين وشهرين» · «أقل من شهر» — تُقرأ بعد «منذ» فالمثنى مجرور */
export function tenureLabel(join: string | null): string | null {
  if (!join) return null
  const a = ymd(join)
  const b = ymd(todayISO())
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  if (b.getDate() < a.getDate()) months -= 1
  if (months < 0) return null
  if (months === 0) return 'أقل من شهر'
  const y = Math.floor(months / 12)
  const m = months % 12
  const yl = y === 0 ? '' : y === 1 ? 'سنة' : y === 2 ? 'سنتين' : y <= 10 ? `${fmtNumber(y)} سنوات` : `${fmtNumber(y)} سنة`
  const ml = m === 0 ? '' : m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m <= 10 ? `${fmtNumber(m)} أشهر` : `${fmtNumber(m)} شهراً`
  return [yl, ml].filter(Boolean).join(' و')
}

/** عيد الميلاد القادم: «12 مارس» + بعد كم يوم — اليوم والشهر فقط، بلا سنة ولا عمر */
function nextBirthday(dob: string | null): { label: string; inDays: number } | null {
  if (!dob) return null
  const [, m, d] = dob.slice(0, 10).split('-').map(Number)
  const today = ymd(todayISO())
  let next = new Date(today.getFullYear(), m - 1, d)
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d)
  return { label: `${fmtNumber(d)} ${AR_MONTHS[m - 1]}`, inDays: Math.round((next.getTime() - today.getTime()) / 864e5) }
}

/** «اليوم 10:32 ص» · «أمس» · «الأحد 21 سبتمبر» */
function seenLabel(iso: string): string {
  const d = new Date(iso)
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const diff = -dayDiff(local)
  const hm = fmtTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  if (diff === 0) return `اليوم ${hm}`
  if (diff === 1) return `أمس ${hm}`
  if (diff < 7) return `${AR_DAYS[d.getDay()]} ${hm}`
  return fmtDatePref(local)
}

/** شارة الاستحقاق: متأخرة · اليوم · غداً · يوم وتاريخ */
function dueInfo(due: string | null): { text: string; tone: 'red' | 'amber' | 'muted' } | null {
  if (!due) return null
  const n = dayDiff(due)
  if (n < 0) return { text: `متأخرة ${daysLabel(-n)}`, tone: 'red' }
  if (n === 0) return { text: 'اليوم', tone: 'amber' }
  if (n === 1) return { text: 'غداً', tone: 'amber' }
  const d = ymd(due)
  return { text: `${AR_DAYS[d.getDay()]} ${fmtNumber(d.getDate())} ${AR_MONTHS[d.getMonth()]}`, tone: 'muted' }
}

const TONE_CHIP = {
  red: 'bg-destructive/10 text-destructive',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  muted: 'bg-muted text-muted-foreground',
}

const TILE_TONES = {
  navy: 'bg-navy/10 text-navy dark:bg-navy-100/10 dark:text-navy-100',
  gold: 'bg-gold/15 text-gold-600 dark:text-gold-300',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
}

/* ===== الترويسة ===== */

export function MemberHero({
  member,
  lastSeen,
  actions,
  completeness,
  onCompleteness,
}: {
  member: TeamMember
  lastSeen: MemberWork['lastSeen'] | undefined
  actions: ReactNode
  /** نسبة اكتمال الملف (البيانات + المرفقات) — تُخفى حتى تُحسب */
  completeness?: number
  onCompleteness?: () => void
}) {
  const tenure = tenureLabel(member.join_date)
  const bday = nextBirthday(member.date_of_birth)
  const initial = member.avatar_initial || member.name?.charAt(0) || '؟'

  return (
    <Card className="overflow-hidden">
      {/* شريط الهوية: كحلي المكتب بخيط ذهبي — لا صورة ولا زخرفة ثقيلة */}
      <div className="relative h-24 overflow-hidden bg-gradient-to-l from-navy-800 via-navy to-navy-500 sm:h-28">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 85% 20%, #C9A982 0, transparent 45%), radial-gradient(circle at 10% 90%, #C9A982 0, transparent 35%)',
          }}
        />
        {/* شعار المكتب خافتاً في الطرف — يعطي الشريط هويته بلا ضجيج */}
        <img
          aria-hidden
          alt=""
          src={`${import.meta.env.BASE_URL}brand/emblem-gold.png`}
          className="pointer-events-none absolute -bottom-6 left-6 h-36 w-auto select-none opacity-[0.14] sm:left-10"
        />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-l from-transparent via-gold/70 to-transparent" />
      </div>

      <CardContent className="px-5 pb-5 pt-0 sm:px-6">
        <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
          <div className="relative z-10 -mt-12 shrink-0 sm:-mt-14">
            {member.avatar_url ? (
              <img
                src={member.avatar_url}
                alt={member.name}
                className="h-24 w-24 rounded-2xl object-cover shadow-lg ring-4 ring-card sm:h-28 sm:w-28"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-gold-100 text-4xl font-bold text-navy shadow-lg ring-4 ring-card dark:bg-gold-800 dark:text-gold-100 sm:h-28 sm:w-28">
                {initial}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-3">
            <h2 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
              {member.name}
              {member.is_director && <Badge variant="gold">مدير</Badge>}
              <Badge variant={member.is_active ? 'success' : 'secondary'}>{member.is_active ? 'نشط' : 'موقوف'}</Badge>
              {member.member_type === 'collaborator' && <Badge variant="outline">متعاون خارجي</Badge>}
              {!member.auth_id && <Badge variant="warning">بلا حساب دخول</Badge>}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {member.role || 'موظف'}
              {tenure && <> · معنا منذ {tenure}</>}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-3">{actions}</div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {member.phone && (
            <a href={`tel:${member.phone}`} className={chip}>
              <Phone className="h-3.5 w-3.5 text-gold-600 dark:text-gold-300" />
              <Ltr>{member.phone}</Ltr>
            </a>
          )}
          {member.email && (
            <a href={`mailto:${member.email}`} className={chip}>
              <Mail className="h-3.5 w-3.5 text-gold-600 dark:text-gold-300" />
              <Ltr>{member.email}</Ltr>
            </a>
          )}
          {member.join_date && (
            <span className={chip}>
              <CalendarDays className="h-3.5 w-3.5 text-gold-600 dark:text-gold-300" />
              انضم {fmtDatePref(member.join_date)}
            </span>
          )}
          {bday && (
            <span className={cn(chip, bday.inDays <= 7 && 'border-gold/50 bg-gold/10')}>
              <Cake className="h-3.5 w-3.5 text-gold-600 dark:text-gold-300" />
              {bday.inDays === 0 ? 'عيد ميلاده اليوم 🎉' : `عيد ميلاده ${bday.label}`}
              {bday.inDays > 0 && bday.inDays <= 30 && (
                <span className="text-muted-foreground">(بعد {daysLabel(bday.inDays)})</span>
              )}
            </span>
          )}
          {completeness != null && (
            <button
              type="button"
              onClick={onCompleteness}
              className={cn(
                chip,
                completeness === 100
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              )}
            >
              {completeness === 100 ? (
                '✓ الملف الشخصي مكتمل'
              ) : (
                <>
                  الملف الشخصي <Ltr>{fmtNumber(completeness)}%</Ltr> — أكمله
                </>
              )}
            </button>
          )}
          {lastSeen && (
            <span className={chip}>
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              آخر دخول {seenLabel(lastSeen.login_at)}
              {lastSeen.platform === 'ios' && <span className="text-muted-foreground">· الآيفون</span>}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

const chip =
  'inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/60'

/* ===== صفّ الأرقام ===== */

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  subTone,
  onClick,
}: {
  icon: LucideIcon
  tone: keyof typeof TILE_TONES
  label: string
  value: ReactNode
  sub?: ReactNode
  subTone?: 'red' | 'green'
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-2xl border bg-card p-4 text-right shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', TILE_TONES[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</div>
      {sub && (
        <div
          className={cn(
            'mt-1 truncate text-xs',
            subTone === 'red' ? 'font-medium text-destructive' : subTone === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
          )}
        >
          {sub}
        </div>
      )}
    </button>
  )
}

export function MemberStats({
  memberId,
  work,
  loading,
  onTab,
}: {
  memberId: string
  work: MemberWork | undefined
  loading: boolean
  onTab: (t: string) => void
}) {
  const { data: bal } = useLeaveBalance(memberId)
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-2xl" />
        ))}
      </div>
    )
  }
  const owned = work?.matters.filter((m) => m.role === 'owner').length ?? 0
  const shared = (work?.matters.length ?? 0) - owned
  const tasks = work?.tasks ?? []
  const overdue = tasks.filter((t) => t.due_date && dayDiff(t.due_date) < 0).length
  const next = work?.sessions[0]
  const remaining = bal?.remaining_exact ?? bal?.remaining

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile
        icon={Briefcase}
        tone="navy"
        label="ملفات بعهدته"
        value={fmtNumber(owned)}
        sub={shared > 0 ? `ومشارك في ${shared === 1 ? 'ملف آخر' : shared === 2 ? 'ملفين' : arPlural(shared, { one: 'ملف', two: 'ملفين', many: 'ملفات' })}` : 'ملفات جارية'}
        onClick={() => onTab('work')}
      />
      <StatTile
        icon={ClipboardList}
        tone="gold"
        label="مهام مفتوحة"
        value={fmtNumber(tasks.length)}
        sub={
          overdue > 0
            ? overdue === 1 ? 'مهمة متأخرة' : overdue === 2 ? 'مهمتان متأخرتان' : `${fmtNumber(overdue)} متأخرة`
            : `لا متأخرات · أنجز ${fmtNumber(work?.doneLast30 ?? 0)} خلال ٣٠ يوماً`
        }
        subTone={overdue > 0 ? 'red' : 'green'}
        onClick={() => onTab('work')}
      />
      <StatTile
        icon={Gavel}
        tone="blue"
        label="جلسات قادمة"
        value={fmtNumber(work?.sessions.length ?? 0)}
        sub={next ? `الأقرب ${dueInfo(next.session_date)?.text ?? ''}` : 'خلال ٤٥ يوماً'}
        onClick={() => onTab('work')}
      />
      <StatTile
        icon={Sun}
        tone="amber"
        label="رصيد الإجازة"
        value={
          bal?.missing_join_date || remaining == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={cn(remaining < 0 && 'text-destructive')}>
              {Number.isInteger(remaining) ? fmtNumber(remaining) : remaining.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
          )
        }
        sub={bal?.missing_join_date ? 'ينقص تاريخ التعيين' : 'يوماً متبقياً'}
        subTone={bal?.missing_join_date ? 'red' : undefined}
        onClick={() => onTab('hr')}
      />
    </div>
  )
}

/* ===== تبويب: عمله الآن ===== */

function SectionCard({
  icon: Icon,
  title,
  count,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  count?: number
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <Icon className="h-[18px] w-[18px] text-gold" />
          </span>
          {title}
          {count != null && <span className="text-sm font-normal text-muted-foreground">({fmtNumber(count)})</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Quiet({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

const rowCls =
  'flex w-full items-center gap-3 px-3 py-3 text-right transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function MemberWorkTab({ work, loading, firstName }: { work: MemberWork | undefined; loading: boolean; firstName: string }) {
  const [, navigate] = useLocation()
  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
      </div>
    )
  }
  const tasks = work?.tasks ?? []
  const matterById = new Map((work?.matters ?? []).map((m) => [m.id, m]))

  return (
    <div className="grid items-start gap-4 lg:grid-cols-5">
      <SectionCard icon={ClipboardList} title="المهام المفتوحة" count={tasks.length} className="lg:col-span-3">
        {tasks.length === 0 ? (
          <Quiet icon={CheckCircle2} text={`لا مهام مفتوحة على ${firstName} الآن`} />
        ) : (
          <div className="-mx-3 divide-y divide-border/60">
            {tasks.map((t) => {
              const due = dueInfo(t.due_date)
              return (
                <button key={t.id} type="button" className={rowCls} onClick={() => navigate(`/tasks/${t.id}`)}>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                      {t.is_urgent && <Flame className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                      {t.title || 'مهمة بلا عنوان'}
                    </p>
                    {t.case && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {matterKindEmoji(t.case.kind)} {t.case.office_num && <Ltr>{t.case.office_num}</Ltr>} {t.case.title}
                      </p>
                    )}
                  </div>
                  {t.submitted_at ? (
                    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs', TONE_CHIP.amber)}>بانتظار الاعتماد</span>
                  ) : (
                    due && <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs', TONE_CHIP[due.tone])}>{due.text}</span>
                  )}
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      <div className="space-y-4 lg:col-span-2">
        <SectionCard icon={Gavel} title="الجلسات القادمة" count={work?.sessions.length ?? 0}>
          {(work?.sessions.length ?? 0) === 0 ? (
            <Quiet icon={CalendarClock} text="لا جلسات خلال ٤٥ يوماً" />
          ) : (
            <div className="-mx-3 divide-y divide-border/60">
              {work!.sessions.map((s) => {
                const d = ymd(s.session_date)
                const m = s.case_id ? matterById.get(s.case_id) : undefined
                const soon = dayDiff(s.session_date) <= 1
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={rowCls}
                    onClick={() => s.case_id && navigate(matterHref(m?.kind, s.case_id))}
                  >
                    <div
                      className={cn(
                        'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none',
                        soon ? 'bg-gold/15 text-gold-700 dark:text-gold-200' : 'bg-muted text-foreground'
                      )}
                    >
                      <span className="text-lg font-bold">{fmtNumber(d.getDate())}</span>
                      <span className="mt-0.5 text-xs">{AR_MONTHS[d.getMonth()]}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m?.title || s.title || 'جلسة'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {AR_DAYS[d.getDay()]}
                        {s.session_time && ` · ${fmtTime(s.session_time.slice(0, 5))}`}
                        {(s.court || m?.court) && ` · ${s.court || m?.court}`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Briefcase} title="ملفاته" count={work?.matters.length ?? 0}>
          {(work?.matters.length ?? 0) === 0 ? (
            <Quiet icon={Briefcase} text="لا ملفات جارية بعهدته" />
          ) : (
            <div className="-mx-3 max-h-[420px] divide-y divide-border/60 overflow-y-auto">
              {work!.matters.map((m) => (
                <button key={m.id} type="button" className={rowCls} onClick={() => navigate(matterHref(m.kind, m.id))}>
                  <span className="text-lg leading-none">{matterKindEmoji(m.kind)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{m.title || 'ملف بلا عنوان'}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {m.office_num && <Ltr>{m.office_num}</Ltr>}
                      {m.role === 'member' && ' · مشارك في فريقه'}
                    </p>
                  </div>
                  {m.kind === 'case' && (
                    <Badge variant={caseStatusBadge(m.status)} className="shrink-0">
                      {caseStatusLabel(m.status)}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

/* ===== تبويب: بياناته ===== */

function Field({ label, value, ltr, action }: { label: string; value: string | null | undefined; ltr?: boolean; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5 text-left text-sm font-medium text-foreground">
        {value ? ltr ? <Ltr className="truncate">{value}</Ltr> : <span className="whitespace-pre-wrap text-right">{value}</span> : <span className="text-muted-foreground/60">—</span>}
        {value && action}
      </dd>
    </div>
  )
}

function CopyBtn({ text, what }: { text: string; what: string }) {
  return (
    <button
      type="button"
      title={`نسخ ${what}`}
      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text)
        toast({ title: `نُسخ ${what}` })
      }}
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  )
}

export function MemberInfoTab({
  member,
  isDirector,
  canEdit,
  onEdit,
  onPreview,
}: {
  member: TeamMember
  isDirector: boolean
  /** المدير أو صاحب الصفحة — يرفع المرفقات */
  canEdit: boolean
  onEdit: () => void
  onPreview: (url: string, name: string) => void
}) {
  return (
    <div className="space-y-4">
      <MemberDocumentsSection
        member={member}
        canEdit={canEdit}
        isDirector={isDirector}
        onEdit={onEdit}
        onPreview={onPreview}
      />

      <div className="grid items-start gap-4 md:grid-cols-2">
        <SectionCard icon={UserRound} title="البيانات الشخصية">
          <dl className="divide-y divide-border/60">
            <Field label="الاسم" value={member.name} />
            <Field label="المسمى" value={member.role} />
            <Field label="رقم الهوية" value={member.id_number} ltr action={member.id_number && <CopyBtn text={member.id_number} what="رقم الهوية" />} />
            <Field label="تاريخ الميلاد" value={member.date_of_birth ? fmtDatePref(member.date_of_birth) : null} />
            <Field label="تاريخ التعيين" value={member.join_date ? fmtDatePref(member.join_date) : null} />
            <Field label="العنوان الوطني" value={member.national_address} />
            <Field label="المؤهلات" value={member.qualifications} />
          </dl>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard icon={ShieldCheck} title="التواصل والطوارئ">
            <dl className="divide-y divide-border/60">
              <Field label="الجوال" value={member.phone} ltr />
              <Field label="البريد" value={member.email} ltr />
              <Field
                label="جهة الطوارئ"
                value={
                  member.emergency_contact_name
                    ? `${member.emergency_contact_name}${member.emergency_contact_relation ? ` (${member.emergency_contact_relation})` : ''}`
                    : null
                }
              />
              <Field label="جوال الطوارئ" value={member.emergency_contact_phone} ltr />
            </dl>
          </SectionCard>

          <SectionCard icon={Landmark} title="الحساب البنكي">
            <dl className="divide-y divide-border/60">
              <Field label="البنك" value={member.bank_name} />
              <Field label="الآيبان" value={member.bank_iban} ltr action={member.bank_iban && <CopyBtn text={member.bank_iban} what="الآيبان" />} />
            </dl>
          </SectionCard>
        </div>
      </div>

    </div>
  )
}

/* ===== تبويب: الإجازات والطلبات ===== */

const HR_STATUS_CHIP: Record<string, string> = {
  pending: TONE_CHIP.amber,
  approved: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  rejected: TONE_CHIP.red,
  cancelled: TONE_CHIP.muted,
}

export function MemberHrList({ memberId }: { memberId: string }) {
  const { data, isLoading } = useHrRequests({ scope: 'all', memberId })
  const rows = data ?? []
  return (
    <SectionCard icon={CalendarDays} title="طلبات الإجازة والاستئذان" count={rows.length}>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <Quiet icon={CalendarDays} text="لم يقدّم طلباً بعد" />
      ) : (
        <div className="-mx-3 divide-y divide-border/60">
          {rows.map((r) => {
            const days = hrDays(r)
            const same = r.start_date === r.end_date
            return (
              <div key={r.id} className="flex items-center gap-3 px-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {hrKindLabel(r.kind)}
                    {r.kind === 'leave' && r.leave_type && ` ${LEAVE_TYPE_LABELS[r.leave_type] ?? ''}`}
                    <span className="font-normal text-muted-foreground"> · {daysLabel(days)}</span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {same ? fmtDatePref(r.start_date) : `${fmtDatePref(r.start_date)} ← ${fmtDatePref(r.end_date)}`}
                    {r.reason && ` · ${r.reason}`}
                  </p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs', HR_STATUS_CHIP[r.status] ?? TONE_CHIP.muted)}>
                  {hrStatusLabel(r.status)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

