import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  CalendarClock,
  ChevronLeft,
  Clock,
  Timer,
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
import { Card, CardContent } from '@/components/ui/card'
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section title="المواعيد القادمة" count={upcoming.length}>
            {upcoming.map((a) => (
              <AppointmentCard
                key={a.id}
                appt={a}
                upcoming
                onOpen={() => navigate(`/appointments/${a.id}`)}
              />
            ))}
          </Section>
          <Section title="المواعيد السابقة" count={past.length}>
            {past.map((a) => (
              <AppointmentCard
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  )
}

function AppointmentCard({
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
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {a.client_name || a.client?.name || 'عميل'}
          </p>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant={apptStatusBadge(a.status)}>
              {apptStatusLabel(a.status)}
            </Badge>
            {a.source === 'website' && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Globe className="h-2.5 w-2.5" />
                من الموقع
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="flex items-center gap-1">
            <CalendarClock className="h-3 w-3" />
            {fmtDatePref(a.appointment_date)}
          </p>
          <div className="flex flex-wrap items-center gap-x-3">
            {a.appointment_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fmtTime(a.appointment_time)}
              </span>
            )}
            {a.duration_minutes != null && (
              <span className="flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {fmtNumber(a.duration_minutes)} د
              </span>
            )}
          </div>
          {(serviceTypeLabel(a.service_type) || meetingMethodLabel(a.meeting_method)) && (
            <div className="flex flex-wrap items-center gap-x-3">
              {serviceTypeLabel(a.service_type) && (
                <span className="flex items-center gap-1">
                  <Scale className="h-3 w-3" />
                  {serviceTypeLabel(a.service_type)}
                </span>
              )}
              {meetingMethodLabel(a.meeting_method) && (
                <span className="flex items-center gap-1">
                  {a.meeting_method === 'remote' ? (
                    <Video className="h-3 w-3" />
                  ) : (
                    <MapPin className="h-3 w-3" />
                  )}
                  {meetingMethodLabel(a.meeting_method)}
                </span>
              )}
            </div>
          )}
          {a.reference_no && (
            <p className="flex items-center gap-1 font-mono text-[11px]">
              <Hash className="h-3 w-3" />
              {a.reference_no}
            </p>
          )}
          {cd && (
            <p
              className={cn(
                'font-medium',
                cd.soon ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
              )}
            >
              {cd.text}
            </p>
          )}
        </div>

        {/* مؤشّرات SMS + التقويم */}
        {(a.confirmation_sent_at || a.thank_you_sent_at || a.gcal_event_id) && (
          <div className="flex flex-wrap gap-1.5">
            {a.gcal_event_id && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CalendarCheck className="h-3 w-3" />
                في التقويم
              </span>
            )}
            {a.confirmation_sent_at && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" />
                تم التأكيد
              </span>
            )}
            {a.thank_you_sent_at && (
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3" />
                تم الشكر
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onOpen}>
            عرض
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
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
