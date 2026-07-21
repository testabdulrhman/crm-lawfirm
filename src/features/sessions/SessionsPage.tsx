import { useMemo } from 'react'
import { useLocation } from 'wouter'
import { Search, CalendarDays, Gavel, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtNumber, fmtDatePref, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAllSessions } from '@/hooks/useCaseSessions'
import { usePageState } from '@/hooks/usePageState'
import type { SessionWithCase } from '@/hooks/useCaseSessions'
import {
  sessionDisplayStatus,
  sessionDisplayBadge,
  type SessionDisplayStatus,
} from '@/lib/caseLabels'

const FILTERS: { value: SessionDisplayStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'قادمة', label: 'قادمة' },
  { value: 'منعقدة', label: 'منعقدة' },
  { value: 'منتهية', label: 'منتهية' },
  { value: 'مؤجّلة', label: 'مؤجّلة' },
]

// مفتاح الترتيب الزمني (تاريخ + وقت)
const sortKey = (s: SessionWithCase) =>
  `${s.session_date ?? ''} ${s.session_time ?? ''}`

function daysFromToday(d: string | null): number | null {
  if (!d) return null
  const x = new Date(d)
  if (isNaN(x.getTime())) return null
  x.setHours(0, 0, 0, 0)
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return Math.round((x.getTime() - t.getTime()) / 86400000)
}

function countdownText(days: number | null): string {
  if (days == null || days < 0) return ''
  if (days === 0) return 'اليوم'
  if (days === 1) return 'غداً'
  return `بعد ${fmtNumber(days)} يوم`
}

export function SessionsPage() {
  const { data, isLoading } = useAllSessions()
  const [, navigate] = useLocation()
  const [search, setSearch] = usePageState('sessions:q', '')
  const [filter, setFilter] = usePageState<SessionDisplayStatus | 'all'>(
    'sessions:filter',
    'all'
  )

  // احسب الحالة التلقائية لكل جلسة مرة واحدة
  const withStatus = useMemo(
    () =>
      (data ?? []).map((s) => ({ s, st: sessionDisplayStatus(s) })),
    [data]
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: withStatus.length }
    for (const { st } of withStatus) c[st] = (c[st] ?? 0) + 1
    return c
  }, [withStatus])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return withStatus.filter(({ s, st }) => {
      if (filter !== 'all' && st !== filter) return false
      if (q) {
        const hay = [s.case?.title, s.title, s.court]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [withStatus, search, filter])

  // المجموعات: القادمة/المنعقدة تصاعدياً، السابقة تنازلياً
  const { upcoming, past } = useMemo(() => {
    const up = filtered
      .filter(({ st }) => st === 'قادمة' || st === 'منعقدة')
      .sort((a, b) => sortKey(a.s).localeCompare(sortKey(b.s)))
    const pa = filtered
      .filter(({ st }) => st === 'منتهية' || st === 'مؤجّلة')
      .sort((a, b) => sortKey(b.s).localeCompare(sortKey(a.s)))
    return { upcoming: up, past: pa }
  }, [filtered])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        الجلسات{' '}
        <span className="text-base font-normal text-muted-foreground">
          ({fmtNumber(data?.length ?? 0)})
        </span>
      </h2>

      {/* البحث */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم القضية أو المحكمة…"
          className="pr-9"
        />
      </div>

      {/* فلاتر الحالة */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            <span
              className={cn(
                'mr-1 rounded-full px-1.5 text-xs',
                filter === f.value ? 'bg-white/20' : 'bg-muted text-muted-foreground'
              )}
            >
              {counts[f.value] ?? 0}
            </span>
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-none" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <Group title="القادمة والمنعقدة" count={upcoming.length}>
              {upcoming.map(({ s, st }) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  st={st}
                  onClick={() => s.case_id && navigate(`/cases/${s.case_id}`)}
                />
              ))}
            </Group>
          )}
          {past.length > 0 && (
            <Group title="الجلسات السابقة" count={past.length}>
              {past.map(({ s, st }) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  st={st}
                  onClick={() => s.case_id && navigate(`/cases/${s.case_id}`)}
                />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  )
}

function Group({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">
        {title}{' '}
        <span className="font-normal">({fmtNumber(count)})</span>
      </h3>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {children}
      </div>
    </div>
  )
}

function SessionRow({
  s,
  st,
  onClick,
}: {
  s: SessionWithCase
  st: SessionDisplayStatus
  onClick: () => void
}) {
  const days = st === 'قادمة' ? daysFromToday(s.session_date) : null
  const cd =
    st === 'منعقدة' ? 'منعقدة الآن' : days != null ? countdownText(days) : ''
  const soon = days != null && days <= 3

  return (
    <button
      onClick={onClick}
      className="block w-full px-4 py-3 text-right transition-colors hover:bg-accent/10"
    >
      {/* السطر العلوي: عنوان القضية + الحالة */}
      <div className="flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate font-semibold leading-snug text-foreground">
          {s.case?.title || s.title || 'جلسة'}
        </h4>
        {cd && (
          <span
            className={cn(
              'shrink-0 text-xs font-medium',
              st === 'منعقدة'
                ? 'text-emerald-600 dark:text-emerald-400'
                : soon
                  ? 'text-destructive'
                  : 'text-amber-600 dark:text-amber-400'
            )}
          >
            {cd}
          </span>
        )}
        <Badge variant={sessionDisplayBadge(st)} className="shrink-0">
          {st}
        </Badge>
      </div>

      {/* السطر السفلي: التاريخ/الوقت/المحكمة */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {s.session_number != null && (
          <span className="font-medium text-foreground">
            جلسة رقم {fmtNumber(s.session_number)}
          </span>
        )}
        {s.session_date && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0" />
            {fmtDatePref(s.session_date)}
          </span>
        )}
        {s.session_time && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 shrink-0" />
            {fmtTime(s.session_time)}
          </span>
        )}
        {s.court && (
          <span className="flex min-w-0 items-center gap-1">
            <Gavel className="h-3 w-3 shrink-0" />
            <span className="truncate">{s.court}</span>
          </span>
        )}
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <CalendarDays className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد جلسات</p>
      <p className="text-sm text-muted-foreground">
        تُضاف الجلسات من داخل صفحة القضية.
      </p>
    </div>
  )
}
