// صفحة حجز المواعيد العامة (بلا تسجيل دخول) — تقويم أم القرى والميلادي معاً.
// كل البيانات عبر دالة booking: لا تُقرأ مواعيد العملاء الآخرين إطلاقاً.
import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Scale,
  User,
  Phone,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { supabase } from '@/lib/supabase'
import { useOfficeInfo } from '@/hooks/useSettings'
import { cn } from '@/lib/utils'
import { fmtHijri, fmtGregorian, fmtNumber } from '@/lib/format'
import { errMessage } from '@/lib/errors'

const HIJRI_LOCALE = 'ar-SA-u-ca-islamic-umalqura-nu-latn'
const WEEKDAYS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']

// اسم الشهر الهجري لتاريخ ما (للترويسة) — بلا تكرار لاحقة «هـ»
const hijriMonthName = (d: Date): string =>
  new Intl.DateTimeFormat(HIJRI_LOCALE, { month: 'long', year: 'numeric' })
    .format(d)
    .replace(/\s*هـ\s*$/, '')
// يوم هجري بأرقام لاتينية (للخلية)
const hijriDay = (d: Date): string =>
  new Intl.DateTimeFormat(HIJRI_LOCALE, { day: 'numeric' }).format(d)

// ⚠️ من مكوّنات التاريخ المحلية لا toISOString: الأخيرة تُرجع يوماً للخلف في توقيت الرياض (UTC+3)
const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
const to12h = (t: string): string => {
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'م' : 'ص'
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hh}:${String(m).padStart(2, '0')} ${period}`
}

interface DayInfo {
  date: string
  count: number
}

export default function Booking() {
  const { data: office } = useOfficeInfo()

  const [days, setDays] = useState<DayInfo[]>([])
  const [loadingDays, setLoadingDays] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ date: string; time: string } | null>(null)

  // الأيام المتاحة
  useEffect(() => {
    ;(async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke('booking', {
          body: { action: 'slots' },
        })
        if (e || data?.error) throw new Error(data?.error || 'تعذّر جلب المواعيد')
        setDays(data.days ?? [])
      } catch (e) {
        setError(errMessage(e) ?? 'تعذّر جلب المواعيد المتاحة')
      } finally {
        setLoadingDays(false)
      }
    })()
  }, [])

  // فترات اليوم المختار
  useEffect(() => {
    if (!selectedDate) return
    setLoadingSlots(true)
    setSelectedTime(null)
    ;(async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke('booking', {
          body: { action: 'slots', date: selectedDate },
        })
        if (e || data?.error) throw new Error(data?.error || 'تعذّر جلب الأوقات')
        setSlots(data.slots ?? [])
      } catch (e) {
        setError(errMessage(e) ?? 'تعذّر جلب الأوقات')
      } finally {
        setLoadingSlots(false)
      }
    })()
  }, [selectedDate])

  const available = useMemo(() => new Set(days.map((d) => d.date)), [days])

  // شبكة الشهر المعروض
  const grid = useMemo(() => {
    const base = new Date()
    base.setDate(1)
    base.setMonth(base.getMonth() + monthOffset)
    const year = base.getFullYear()
    const month = base.getMonth()
    const first = new Date(year, month, 1)
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < first.getDay(); i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
    return { cells, label: base }
  }, [monthOffset])

  const submit = async () => {
    if (!name.trim() || name.trim().length < 3) return setError('اكتب اسمك الكامل.')
    if (phone.replace(/\D/g, '').length < 9) return setError('رقم الجوال غير صحيح.')
    if (!selectedDate || !selectedTime) return setError('اختر اليوم والوقت.')
    setError(null)
    setSaving(true)
    try {
      const { data, error: e } = await supabase.functions.invoke('booking', {
        body: {
          action: 'book',
          name: name.trim(),
          phone: phone.trim(),
          date: selectedDate,
          time: selectedTime,
          notes: notes.trim(),
        },
      })
      if (e || data?.error) {
        // تعارض: الفترة حُجزت للتو
        if (data?.slots) setSlots(data.slots)
        throw new Error(data?.error || 'تعذّر إتمام الحجز')
      }
      setDone({ date: selectedDate, time: selectedTime })
    } catch (e) {
      setError(errMessage(e) ?? 'تعذّر إتمام الحجز')
    } finally {
      setSaving(false)
    }
  }

  /* ===== شاشة التأكيد ===== */
  if (done) {
    const d = new Date(`${done.date}T00:00:00`)
    return (
      <Shell office={office}>
        <div className="rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">تم تأكيد موعدك</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نتشرّف باستقبالك في المكتب في الموعد التالي:
          </p>
          <div className="mt-4 space-y-1 rounded-xl bg-muted/50 p-4">
            <p className="text-base font-semibold text-foreground">
              {WEEKDAYS[d.getDay()]} — {to12h(done.time)}
            </p>
            <p className="text-sm text-gold-700 dark:text-gold-300">
              {fmtHijri(d)}
            </p>
            <p className="text-sm text-muted-foreground">{fmtGregorian(d)}</p>
          </div>
          {office?.address && (
            <p className="mt-4 text-sm text-muted-foreground">
              العنوان: {office.address}
            </p>
          )}
          <Button
            variant="outline"
            className="mt-5"
            onClick={() => {
              setDone(null)
              setSelectedDate(null)
              setSelectedTime(null)
              setName('')
              setPhone('')
              setNotes('')
            }}
          >
            حجز موعد آخر
          </Button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell office={office}>
      {/* التقويم */}
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={monthOffset <= 0}
            onClick={() => setMonthOffset((m) => m - 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <p className="text-sm font-bold text-foreground">
              {hijriMonthName(grid.label)} هـ
            </p>
            <p className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat('ar', {
                month: 'long',
                year: 'numeric',
                numberingSystem: 'latn',
              }).format(grid.label)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={monthOffset >= 1}
            onClick={() => setMonthOffset((m) => m + 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {loadingDays ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => (
                <span key={w} className="text-[11px] font-medium text-muted-foreground">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.cells.map((cell, i) => {
                if (!cell) return <span key={i} />
                const ds = iso(cell)
                const open = available.has(ds)
                const active = selectedDate === ds
                return (
                  <button
                    key={i}
                    disabled={!open}
                    onClick={() => setSelectedDate(ds)}
                    className={cn(
                      'flex flex-col items-center rounded-lg border py-1.5 transition-colors',
                      active
                        ? 'border-gold bg-gold text-navy'
                        : open
                          ? 'border-border bg-background hover:border-gold hover:bg-gold/10'
                          : 'cursor-not-allowed border-transparent bg-muted/30 text-muted-foreground/40'
                    )}
                  >
                    {/* الهجري أساس والميلادي تحته */}
                    <span className="text-sm font-semibold leading-none">
                      {hijriDay(cell)}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 text-[10px] leading-none',
                        active ? 'text-navy/70' : 'text-muted-foreground'
                      )}
                    >
                      {fmtNumber(cell.getDate())}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              الرقم الكبير هجري (أم القرى) والصغير ميلادي — الأيام المتاحة فقط
              قابلة للاختيار
            </p>
          </>
        )}
      </div>

      {/* الأوقات */}
      {selectedDate && (
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gold" />
            <p className="text-sm font-semibold text-foreground">
              أوقات {WEEKDAYS[new Date(`${selectedDate}T00:00:00`).getDay()]}
            </p>
            <span className="text-xs text-muted-foreground">
              {fmtHijri(selectedDate)}
            </span>
          </div>
          {loadingSlots ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : slots.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا أوقات متاحة في هذا اليوم — اختر يوماً آخر.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTime(t)}
                  className={cn(
                    'rounded-lg border py-2 text-sm font-medium transition-colors',
                    selectedTime === t
                      ? 'border-gold bg-gold text-navy'
                      : 'border-border hover:border-gold hover:bg-gold/10'
                  )}
                >
                  {to12h(t)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* البيانات */}
      {selectedTime && (
        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold text-foreground">بياناتك</p>
          <div className="space-y-1.5">
            <Label htmlFor="bk_name">الاسم الكامل *</Label>
            <div className="relative">
              <User className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="bk_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pr-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk_phone">رقم الجوال *</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="bk_phone"
                dir="ltr"
                inputMode="tel"
                placeholder="05XXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pr-9 text-right"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bk_notes">موضوع الاستشارة (اختياري)</Label>
            <Textarea
              id="bk_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {error}
            </p>
          )}

          <Button
            variant="gold"
            className="w-full"
            size="lg"
            disabled={saving}
            onClick={submit}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            تأكيد الحجز
          </Button>
        </div>
      )}

      {error && !selectedTime && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </Shell>
  )
}

// الإطار العام للصفحة (ترويسة المكتب)
function Shell({
  office,
  children,
}: {
  office?: { office_name?: string | null; logo_url?: string | null; phone?: string | null; address?: string | null } | null
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-navy px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-4">
        {/* الترويسة */}
        <div className="text-center">
          {office?.logo_url ? (
            <img
              src={office.logo_url}
              alt="شعار المكتب"
              className="mx-auto max-h-24 object-contain"
            />
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 ring-1 ring-gold/30">
              <Scale className="h-7 w-7 text-gold" />
            </div>
          )}
          <h1 className="mt-3 text-lg font-bold text-gold">
            {office?.office_name ?? 'حجز موعد'}
          </h1>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-navy-100">
            <CalendarDays className="h-4 w-4" />
            احجز موعد استشارتك
          </p>
        </div>
        {children}
        <p className="pb-4 text-center text-xs text-navy-200">
          {office?.phone ? `للاستفسار: ${office.phone}` : ''}
        </p>
      </div>
    </div>
  )
}
