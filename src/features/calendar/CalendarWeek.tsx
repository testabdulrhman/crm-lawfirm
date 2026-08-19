import { useEffect, useMemo, useRef, useState } from 'react'

import { localISO, fmtTime, hijriDay, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Ltr } from '@/components/Ltr'
import type { CalItem, CalKind } from '@/hooks/useCalendar'

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** ارتفاع الساعة الواحدة بالبكسل — يحدّد دقّة وضع الأحداث */
const HOUR_PX = 52

/**
 * ساعات العمل افتراضياً بدل ٢٤ ساعة.
 *
 * السبب عملي: عرض اليوم كاملاً يجعل ثلثيه فارغاً ويدفع الجلسات إلى شريط
 * ضيّق في الوسط. المكتب يعمل ٨–١٨، ومن أراد ما خرج عنها فتح العرض الكامل.
 */
const WORK_FROM = 8
const WORK_TO = 18

function minutesOf(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h)) return null
  return h * 60 + (m || 0)
}

export function CalendarWeek({
  days,
  byDate,
  kindMeta,
  onOpen,
  onCreate,
}: {
  days: Date[]
  byDate: Map<string, CalItem[]>
  kindMeta: Record<CalKind, { label: string; chip: string; dot: string }>
  onOpen: (href: string) => void
  /** نقر على خانة فارغة: (تاريخ، ساعة HH:MM) */
  onCreate: (date: string, time: string) => void
}) {
  const [fullDay, setFullDay] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const from = fullDay ? 0 : WORK_FROM
  const to = fullDay ? 24 : WORK_TO
  const hours = useMemo(
    () => Array.from({ length: to - from }, (_, i) => from + i),
    [from, to]
  )

  const today = todayISO()

  // خط الساعة الحالية — يُحدَّث كل دقيقة
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      setNowMin(n.getHours() * 60 + n.getMinutes())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  // ينزل إلى الساعة الحالية عند الفتح بدل البدء من أعلى اليوم
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const top = ((nowMin - from * 60) / 60) * HOUR_PX - 120
    if (top > 0) el.scrollTop = top
    // مرة واحدة عند التركيب أو تبديل المدى
  }, [fullDay]) // eslint-disable-line react-hooks/exhaustive-deps

  const nowTop = ((nowMin - from * 60) / 60) * HOUR_PX
  const nowVisible = nowMin >= from * 60 && nowMin <= to * 60

  // ما لا ساعة له (مهام، انتهاء وكالات) يعلو الشبكة في صفّ «طوال اليوم»
  const allDayOf = (iso: string) =>
    (byDate.get(iso) ?? []).filter((x) => !x.time)
  const timedOf = (iso: string) => (byDate.get(iso) ?? []).filter((x) => x.time)

  const hasAllDay = days.some((d) => allDayOf(localISO(d)).length > 0)

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      {/* ترويسة الأيام */}
      <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))] border-b border-border/60">
        <div />
        {days.map((d) => {
          const iso = localISO(d)
          const isToday = iso === today
          return (
            <div
              key={iso}
              className={cn(
                'border-r border-border/40 px-1 py-2 text-center first:border-r-0',
                isToday && 'bg-gold/5'
              )}
            >
              <p className="text-[11px] text-muted-foreground">{DAY_NAMES[d.getDay()]}</p>
              <p
                className={cn(
                  'mt-0.5 text-sm font-semibold text-foreground',
                  isToday &&
                    'mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-gold text-navy'
                )}
              >
                <Ltr>{String(d.getDate())}</Ltr>
              </p>
              <p className="text-[10px] text-muted-foreground">
                <Ltr>{hijriDay(d)}</Ltr>
              </p>
            </div>
          )
        })}
      </div>

      {/* صفّ «طوال اليوم» — يظهر فقط عند وجود بنود بلا ساعة */}
      {hasAllDay && (
        <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))] border-b border-border/60 bg-muted/30">
          <div className="flex items-center justify-center py-1 text-[10px] text-muted-foreground">
            طوال اليوم
          </div>
          {days.map((d) => {
            const iso = localISO(d)
            return (
              <div key={iso} className="space-y-0.5 border-r border-border/40 p-1 first:border-r-0">
                {allDayOf(iso).map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onOpen(it.href)}
                    className={cn(
                      'block w-full truncate rounded px-1 py-0.5 text-right text-[10px]',
                      kindMeta[it.kind].chip
                    )}
                  >
                    {it.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* شبكة الساعات */}
      <div ref={scrollRef} className="relative max-h-[560px] overflow-y-auto">
        <div className="grid grid-cols-[46px_repeat(7,minmax(0,1fr))]">
          {/* عمود الساعات */}
          <div>
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_PX }}
                className="relative border-b border-border/30"
              >
                <span className="absolute -top-2 left-1 text-[10px] text-muted-foreground">
                  <Ltr>{fmtTime(`${String(h).padStart(2, '0')}:00`)}</Ltr>
                </span>
              </div>
            ))}
          </div>

          {/* أعمدة الأيام */}
          {days.map((d) => {
            const iso = localISO(d)
            const isToday = iso === today
            return (
              <div
                key={iso}
                className={cn(
                  'relative border-r border-border/40 first:border-r-0',
                  isToday && 'bg-gold/[0.03]'
                )}
              >
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    title={`إضافة موعد ${fmtTime(`${String(h).padStart(2, '0')}:00`)}`}
                    onClick={() => onCreate(iso, `${String(h).padStart(2, '0')}:00`)}
                    style={{ height: HOUR_PX }}
                    className="block w-full border-b border-border/30 transition-colors hover:bg-gold/10"
                  />
                ))}

                {/* الأحداث الموقوتة فوق الشبكة */}
                {timedOf(iso).map((it) => {
                  const m = minutesOf(it.time)
                  if (m == null) return null
                  const top = ((m - from * 60) / 60) * HOUR_PX
                  if (top < 0 || top > (to - from) * HOUR_PX) return null
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => onOpen(it.href)}
                      style={{ top, minHeight: HOUR_PX - 6 }}
                      className={cn(
                        'absolute inset-x-0.5 overflow-hidden rounded px-1.5 py-1 text-right transition-opacity hover:opacity-85',
                        kindMeta[it.kind].chip
                      )}
                    >
                      <span className="block truncate text-[11px] font-medium">{it.title}</span>
                      <span className="block truncate text-[10px] opacity-80">
                        <Ltr>{fmtTime(it.time)}</Ltr>
                        {it.subtitle ? ` · ${it.subtitle}` : ''}
                      </span>
                    </button>
                  )
                })}

                {/* خط الساعة الحالية — في عمود اليوم وحده */}
                {isToday && nowVisible && (
                  <div
                    style={{ top: nowTop }}
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive"
                  >
                    <span className="absolute -top-1 right-0 h-2 w-2 rounded-full bg-destructive" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setFullDay((v) => !v)}
        className="w-full border-t border-border/60 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        {fullDay ? 'عرض ساعات العمل فقط' : 'عرض اليوم كاملاً (٢٤ ساعة)'}
      </button>
    </div>
  )
}
