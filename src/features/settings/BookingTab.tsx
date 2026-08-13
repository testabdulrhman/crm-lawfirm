// إعدادات الحجز الإلكتروني — redwan.sa/appointments
// حالياً: حجب الأيام (أعياد وإجازات المكتب). الخدمات وأوقات الدوام في
// lookup_values.booking_config وتُدار من تبويب التصنيفات.
//
// ⚠️ يتطلب جدول booking_blocked_dates — migration 20260808_booking_website_phase1.
import { useState } from 'react'
import { CalendarX2, Plus, Undo2, Loader2, ExternalLink } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { DualDatePicker } from '@/components/DualDatePicker'
import { openExternal } from '@/lib/external'
import { fmtDatePref, todayISO } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import {
  useBlockedDates,
  useAddBlockedDate,
  useRemoveBlockedDate,
} from '@/hooks/useBookingBlockedDates'

const BOOKING_URL = 'https://redwan.sa/appointments'

export function BookingTab() {
  const { data: blocked, isLoading, error, refetch } = useBlockedDates()
  const addM = useAddBlockedDate()
  const removeM = useRemoveBlockedDate()
  const { teamMember } = useAuth()

  const [date, setDate] = useState<string>(todayISO())
  const [reason, setReason] = useState('')

  const today = todayISO()
  const upcoming = (blocked ?? []).filter((b) => b.blocked_date >= today)
  const past = (blocked ?? []).filter((b) => b.blocked_date < today)

  const submit = () => {
    if (!date) return
    addM.mutate(
      { date, reason, by: teamMember?.name ?? null },
      { onSuccess: () => setReason('') }
    )
  }

  return (
    <div className="space-y-4">
      {/* الرابط العام */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium text-foreground">رابط الحجز العام</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              يحجز العملاء مواعيدهم منه، وتصل الحجوزات مباشرة لصفحة المواعيد.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openExternal(BOOKING_URL)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span dir="ltr">{BOOKING_URL}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </CardContent>
      </Card>

      {/* حجب يوم */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="font-medium text-foreground">حجب يوم عن الحجز</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              الأعياد والإجازات — اليوم المحجوب لا تظهر له أي أوقات على الموقع.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label className="mb-1.5 block text-xs">اليوم</Label>
              <DualDatePicker value={date} onChange={(v) => setDate(v ?? '')} />
            </div>
            <div>
              <Label htmlFor="blk_reason" className="mb-1.5 block text-xs">
                السبب (اختياري)
              </Label>
              <Input
                id="blk_reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="إجازة عيد الفطر"
              />
            </div>
            <Button
              variant="gold"
              onClick={submit}
              disabled={!date || addM.isPending}
              className="gap-1.5"
            >
              {addM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              حجب
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* القائمة */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="p-4">
              <QueryErrorState
                title="تعذّر جلب الأيام المحجوبة"
                error={error}
                onRetry={() => refetch()}
              />
            </div>
          ) : (blocked?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <CalendarX2 className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                لا توجد أيام محجوبة — كل أيام الدوام متاحة للحجز.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {[...upcoming, ...past].map((b) => {
                const isPast = b.blocked_date < today
                return (
                  <li
                    key={b.id}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      isPast ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {fmtDatePref(b.blocked_date)}
                      </p>
                      {b.reason && (
                        <p className="truncate text-xs text-muted-foreground">{b.reason}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                      disabled={removeM.isPending}
                      onClick={() => removeM.mutate(b.id)}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      إعادة فتحه
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
