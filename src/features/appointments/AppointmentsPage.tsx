import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  CalendarClock,
  ChevronLeft,
  Clock,
  CheckCircle2,
  MessageSquare,
  CalendarCheck,
  Globe,
  Scale,
  Video,
  MapPin,
  Hash,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref, fmtTime, todayISO } from '@/lib/format'
import { useAppointments } from '@/hooks/useAppointments'
import { usePageState } from '@/hooks/usePageState'
import { AppointmentForm } from './AppointmentForm'
import {
  APPT_STATUS_OPTIONS,
  apptStatusBadge,
  apptStatusLabel,
  serviceTypeLabel,
  meetingMethodLabel,
} from '@/lib/appointmentLabels'
import type { Appointment } from '@/types/db'

function countdown(dateStr: string | null): { text: string; soon: boolean } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (days < 0) return null
  if (days === 0) return { text: 'اليوم', soon: true }
  if (days === 1) return { text: 'غداً', soon: true }
  return { text: `بعد ${fmtNumber(days)} يوم`, soon: days <= 3 }
}

export function AppointmentsPage() {
  const { data, isLoading } = useAppointments()
  const [, navigate] = useLocation()

  const [search, setSearch] = usePageState('appts:q', '')
  const [status, setStatus] = usePageState<string>('appts:status', 'all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((a) => {
      if (q) {
        const name = (a.client_name || a.client?.name || '').toLowerCase()
        if (!name.includes(q)) return false
      }
      if (status !== 'all' && (a.status ?? '') !== status) return false
      return true
    })
  }, [data, search, status])

  const { upcoming, past } = useMemo(() => {
    const today = todayISO()
    const up = filtered
      .filter((a) => (a.appointment_date ?? '') >= today)
      .sort((x, y) =>
        (x.appointment_date ?? '').localeCompare(y.appointment_date ?? '') ||
        (x.appointment_time ?? '').localeCompare(y.appointment_time ?? '')
      )
    const pa = filtered
      .filter((a) => (a.appointment_date ?? '') < today)
      .sort((x, y) =>
        (y.appointment_date ?? '').localeCompare(x.appointment_date ?? '') ||
        (y.appointment_time ?? '').localeCompare(x.appointment_time ?? '')
      )
    return { upcoming: up, past: pa }
  }, [filtered])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">المواعيد</h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          موعد جديد
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم العميل…"
          className="pr-9"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip active={status === 'all'} onClick={() => setStatus('all')} label="الكل" />
        {APPT_STATUS_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            active={status === o.value}
            onClick={() => setStatus(o.value)}
            label={o.label}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section title="المواعيد القادمة" count={upcoming.length}>
            {upcoming.map((a) => (
              <AppointmentRow
                key={a.id}
                appt={a}
                upcoming
                onOpen={() => navigate(`/appointments/${a.id}`)}
              />
            ))}
          </Section>
          <Section title="المواعيد السابقة" count={past.length}>
            {past.map((a) => (
              <AppointmentRow
                key={a.id}
                appt={a}
                onOpen={() => navigate(`/appointments/${a.id}`)}
              />
            ))}
          </Section>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <AppointmentForm onDone={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button size="sm" variant={active ? 'default' : 'outline'} onClick={onClick}>
      {label}
    </Button>
  )
}

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {title}
        <span className="text-xs text-muted-foreground">({fmtNumber(count)})</span>
      </h3>
      <Card className="overflow-hidden">
        <ul className="divide-y">{children}</ul>
      </Card>
    </div>
  )
}

function AppointmentRow({
  appt: a,
  upcoming,
  onOpen,
}: {
  appt: Appointment
  upcoming?: boolean
  onOpen: () => void
}) {
  const cd = upcoming ? countdown(a.appointment_date) : null
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-muted/50"
      >
        {/* التاريخ والوقت — عمود ثابت يجعل المسح البصري سهلاً */}
        <div className="w-28 shrink-0 sm:w-36">
          <p className="truncate text-sm font-medium text-foreground">
            {fmtDatePref(a.appointment_date)}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            {a.appointment_time ? fmtTime(a.appointment_time) : '—'}
            {a.duration_minutes != null && (
              <span className="text-muted-foreground/70">
                · {fmtNumber(a.duration_minutes)} د
              </span>
            )}
          </p>
        </div>

        {/* العميل والتفاصيل */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">
            {a.client_name || a.client?.name || 'عميل'}
          </p>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            {serviceTypeLabel(a.service_type) && (
              <span className="flex items-center gap-1">
                <Scale className="h-3 w-3 shrink-0" />
                {serviceTypeLabel(a.service_type)}
              </span>
            )}
            {meetingMethodLabel(a.meeting_method) && (
              <span className="flex items-center gap-1">
                {a.meeting_method === 'remote' ? (
                  <Video className="h-3 w-3 shrink-0" />
                ) : (
                  <MapPin className="h-3 w-3 shrink-0" />
                )}
                {meetingMethodLabel(a.meeting_method)}
              </span>
            )}
            {a.reference_no && (
              <span className="flex items-center gap-1 font-mono">
                <Hash className="h-3 w-3 shrink-0" />
                {a.reference_no}
              </span>
            )}
            {cd && (
              <span
                className={cn(
                  'font-medium',
                  cd.soon ? 'text-amber-600 dark:text-amber-400' : ''
                )}
              >
                {cd.text}
              </span>
            )}
          </div>
        </div>

        {/* المؤشّرات — تختفي على الشاشات الضيقة */}
        <div className="hidden shrink-0 items-center gap-1.5 text-muted-foreground sm:flex">
          {a.gcal_event_id && (
            <CalendarCheck
              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
              aria-label="في التقويم"
            />
          )}
          {a.confirmation_sent_at && (
            <CheckCircle2
              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
              aria-label="أُرسل التأكيد"
            />
          )}
          {a.thank_you_sent_at && (
            <MessageSquare className="h-3.5 w-3.5" aria-label="أُرسل الشكر" />
          )}
        </div>

        {/* الحالة والمصدر */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={apptStatusBadge(a.status)}>{apptStatusLabel(a.status)}</Badge>
          {a.source === 'website' && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Globe className="h-2.5 w-2.5" />
              من الموقع
            </Badge>
          )}
        </div>

        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <CalendarClock className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد مواعيد</p>
      <p className="text-sm text-muted-foreground">أضِف أول موعد عبر «موعد جديد».</p>
    </div>
  )
}
