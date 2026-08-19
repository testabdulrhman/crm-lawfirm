import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  Gavel,
  ListTodo,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { usePageState } from '@/hooks/usePageState'
import {
  useCalendarRange,
  groupByDate,
  gridDays,
  type CalItem,
  type CalKind,
} from '@/hooks/useCalendar'
import type { DashboardScope } from '@/hooks/useDashboard'
import {
  fmtNumber,
  fmtDate,
  fmtTime,
  hijriDay,
  hijriMonthLabel,
  localISO,
  todayISO,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { Ltr } from '@/components/Ltr'

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const KIND: Record<CalKind, { icon: LucideIcon; label: string; dot: string; chip: string }> = {
  session: {
    icon: Gavel,
    label: 'جلسة',
    dot: 'bg-gold',
    chip: 'bg-gold/15 text-gold-600 dark:text-gold-300',
  },
  appointment: {
    icon: CalendarClock,
    label: 'موعد',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  },
  task: {
    icon: ListTodo,
    label: 'مهمة',
    dot: 'bg-blue-500',
    chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  },
  poa: {
    icon: FileSignature,
    label: 'وكالة',
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  },
}

const gregMonth = (d: Date) =>
  new Intl.DateTimeFormat('ar', { month: 'long', year: 'numeric' }).format(d)

/**
 * الشهر الميلادي يعبر شهرين هجريين غالباً. عرض هجريّ اليوم الأول وحده يكذب
 * على أغلب الشبكة — فنعرض المدى حين يختلف الطرفان.
 */
function hijriSpan(anchor: Date): string {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const a = hijriMonthLabel(first)
  const b = hijriMonthLabel(last)
  if (a === b) return a
  // «صفر – ربيع الأول ١٤٤٨ هـ» حين تتّحد السنة
  const ay = a.match(/\d{3,4}/)?.[0]
  const by = b.match(/\d{3,4}/)?.[0]
  if (ay && ay === by) {
    const aName = a.replace(/\s*\d{3,4}\s*هـ\s*$/, '').trim()
    return `${aName} – ${b}`
  }
  return `${a} – ${b}`
}

export function CalendarPage() {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()

  const [scope, setScope] = usePageState<DashboardScope>('calendar.scope', 'all')
  const effectiveScope: DashboardScope = isDirector ? scope : 'mine'

  // مرساة الشهر المعروض — اليوم الأول منه، ونتنقّل بالأشهر
  const [anchorISO, setAnchorISO] = useState(() => {
    const n = new Date()
    return localISO(new Date(n.getFullYear(), n.getMonth(), 1))
  })
  const anchor = useMemo(() => new Date(`${anchorISO}T00:00:00`), [anchorISO])

  const [selected, setSelected] = useState<string>(todayISO())

  const days = useMemo(() => gridDays(anchor), [anchor])
  const from = days[0]
  const to = days[days.length - 1]

  const { data, isLoading, error, refetch } = useCalendarRange(
    from,
    to,
    effectiveScope,
    teamMember?.id
  )
  const byDate = useMemo(() => groupByDate(data ?? []), [data])

  const shiftMonth = (delta: number) => {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + delta, 1)
    setAnchorISO(localISO(d))
  }
  const goToday = () => {
    const n = new Date()
    setAnchorISO(localISO(new Date(n.getFullYear(), n.getMonth(), 1)))
    setSelected(todayISO())
  }

  const today = todayISO()
  const selectedItems = byDate.get(selected) ?? []

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">التقويم</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            الجلسات والمواعيد والمهام والوكالات في شبكة واحدة
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDirector && (
            <div className="inline-flex rounded-full bg-muted p-1 text-sm">
              <button
                type="button"
                onClick={() => setScope('mine')}
                className={cn(
                  'rounded-full px-4 py-1.5 transition-colors',
                  scope === 'mine'
                    ? 'bg-card font-semibold text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                لي
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={cn(
                  'rounded-full px-4 py-1.5 transition-colors',
                  scope === 'all'
                    ? 'bg-card font-semibold text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                المكتب
              </button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={goToday}>
            <CalendarDays className="h-4 w-4" />
            اليوم
          </Button>
        </div>
      </div>

      {/* شريط الشهر */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5">
        {/* في RTL: «السابق» يمينُه سهم لليمين */}
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          title="الشهر السابق"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div className="text-center">
          <p className="text-base font-bold text-foreground">{hijriSpan(anchor)}</p>
          <p className="text-xs text-muted-foreground">{gregMonth(anchor)}</p>
        </div>

        <button
          type="button"
          onClick={() => shiftMonth(1)}
          title="الشهر التالي"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      </div>

      {error ? (
        <QueryErrorState error={error} onRetry={() => refetch()} />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* الشبكة */}
          <Card>
            <CardContent className="p-2 sm:p-3">
              <div className="grid grid-cols-7 gap-px">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="pb-2 text-center text-[11px] font-semibold text-muted-foreground sm:text-xs"
                  >
                    {w}
                  </div>
                ))}

                {isLoading
                  ? Array.from({ length: 42 }).map((_, i) => (
                      <Skeleton key={i} className="h-[74px] rounded-lg sm:h-[88px]" />
                    ))
                  : days.map((d) => {
                      const iso = localISO(d)
                      const items = byDate.get(iso) ?? []
                      const outside = d.getMonth() !== anchor.getMonth()
                      const isToday = iso === today
                      const isSel = iso === selected
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setSelected(iso)}
                          className={cn(
                            'flex h-[74px] flex-col rounded-lg border p-1.5 text-right transition-colors sm:h-[88px]',
                            isSel
                              ? 'border-gold bg-gold/5'
                              : 'border-transparent hover:border-border hover:bg-muted/50',
                            outside && 'opacity-40'
                          )}
                        >
                          <div className="flex items-baseline justify-between gap-1">
                            <span
                              className={cn(
                                'text-[10px] text-muted-foreground',
                                isToday && 'text-gold'
                              )}
                            >
                              <Ltr>{hijriDay(d)}</Ltr>
                            </span>
                            <span
                              className={cn(
                                'text-sm font-semibold text-foreground',
                                isToday &&
                                  'flex h-6 w-6 items-center justify-center rounded-full bg-gold text-navy'
                              )}
                            >
                              <Ltr>{String(d.getDate())}</Ltr>
                            </span>
                          </div>

                          {/* في المساحة الضيقة: بند مسمّى ثم نقاط للبقية */}
                          <div className="mt-auto space-y-0.5 overflow-hidden">
                            {items.slice(0, 1).map((it) => (
                              <span
                                key={it.id}
                                className={cn(
                                  'block truncate rounded px-1 py-0.5 text-[10px]',
                                  KIND[it.kind].chip
                                )}
                              >
                                {it.title}
                              </span>
                            ))}
                            {items.length > 1 && (
                              <span className="flex items-center gap-0.5">
                                {items.slice(1, 5).map((it) => (
                                  <span
                                    key={it.id}
                                    className={cn('h-1.5 w-1.5 rounded-full', KIND[it.kind].dot)}
                                  />
                                ))}
                                {items.length > 5 && (
                                  <span className="text-[9px] text-muted-foreground">
                                    +{fmtNumber(items.length - 5)}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
              </div>

              {/* مفتاح الألوان */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 px-1 pt-2.5">
                {(Object.keys(KIND) as CalKind[]).map((k) => (
                  <span key={k} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className={cn('h-2 w-2 rounded-full', KIND[k].dot)} />
                    {KIND[k].label}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* تفاصيل اليوم المختار */}
          <Card className="lg:sticky lg:top-4">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-foreground">
                {selected === today ? 'اليوم' : fmtDate(selected)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {selected === today ? fmtDate(selected) : ''}
              </p>

              <div className="mt-3 space-y-1.5">
                {selectedItems.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    لا شيء في هذا اليوم
                  </p>
                ) : (
                  selectedItems.map((it) => <DayRow key={it.id} it={it} onOpen={navigate} />)
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

function DayRow({ it, onOpen }: { it: CalItem; onOpen: (href: string) => void }) {
  const m = KIND[it.kind]
  const Icon = m.icon
  return (
    <button
      type="button"
      onClick={() => onOpen(it.href)}
      className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-right transition-colors hover:bg-muted/60"
    >
      <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md', m.chip)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{it.title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {it.time ? `${fmtTime(it.time)} · ` : ''}
          {it.subtitle || m.label}
        </span>
      </span>
    </button>
  )
}
