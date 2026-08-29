import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ContactPicker } from '@/components/ContactPicker'
import { DualDatePicker } from '@/components/DualDatePicker'
import { fmtNumber, fmtTime } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useContacts } from '@/hooks/useContacts'
import {
  useAppointmentConflict,
  useCreateAppointment,
  useUpdateAppointment,
} from '@/hooks/useAppointments'
import { APPT_STATUS_OPTIONS } from '@/lib/appointmentLabels'
import type { Appointment, AppointmentInput, Contact } from '@/types/db'

const schema = z.object({
  client_name: z.string().optional(),
  client_phone: z.string().optional(),
  appointment_date: z.string().min(1, 'التاريخ مطلوب'),
  appointment_time: z.string().optional(),
  duration_minutes: z.string().optional(),
  status: z.string().min(1),
  // طريقة الاجتماع — غيابها كان يخفي قسم رابط الاجتماع في صفحة الموعد
  // (بلاغ المستخدم 2026-08-26)
  meeting_method: z.string().optional(),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function AppointmentForm({
  appointment,
  onDone,
  defaultDate,
  defaultTime,
}: {
  appointment?: Appointment | null
  onDone: () => void
  /** تعبئة مسبقة عند الإنشاء من التقويم — اليوم الذي نُقر عليه */
  defaultDate?: string | null
  /** الساعة التي نُقر عليها في عرض الأسبوع (HH:MM) */
  defaultTime?: string | null
}) {
  const isEdit = Boolean(appointment)

  // قادم من زر «حجز موعد» في سجل الاستفسار — يربط الموعد بالطلب ويملأ الاسم
  const fromRequest = useMemo<{ requestId: string; clientName: string | null } | null>(
    () => {
      if (appointment) return null
      try {
        const raw = sessionStorage.getItem('appointment:from-request')
        if (!raw) return null
        sessionStorage.removeItem('appointment:from-request')
        return JSON.parse(raw)
      } catch {
        return null
      }
    },
    [appointment]
  )
  const { teamMember } = useAuth()
  const { data: contacts } = useContacts()
  const createM = useCreateAppointment()
  const updateM = useUpdateAppointment()
  const pending = createM.isPending || updateM.isPending

  const [clientId, setClientId] = useState<string | null>(
    appointment?.client_id ?? null
  )

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_name: appointment?.client_name ?? fromRequest?.clientName ?? '',
      client_phone: appointment?.client_phone ?? '',
      appointment_date: appointment?.appointment_date ?? defaultDate ?? '',
      appointment_time: appointment?.appointment_time
        ? appointment.appointment_time.slice(0, 5)
        : (defaultTime ?? ''),
      meeting_method: appointment?.meeting_method ?? 'onsite',
      duration_minutes:
        appointment?.duration_minutes != null
          ? String(appointment.duration_minutes)
          : '60',
      status: appointment?.status ?? 'confirmed',
      notes: appointment?.notes ?? '',
    },
  })

  // ⚠️ فحص حيّ للتعارض — يمنع الموظف من تسجيل وقت محجوز قبل الحفظ.
  //    القاعدة تمنعه أيضاً بقيد appointments_no_overlap، وهذا ليعرف بمن يتعارض.
  const wDate = watch('appointment_date')
  const wTime = watch('appointment_time')
  const wDur = Number(watch('duration_minutes')) || 60
  const { data: conflict, isFetching: checkingConflict } = useAppointmentConflict({
    date: wDate || null,
    time: wTime && wTime.trim() !== '' ? wTime : null,
    durationMinutes: wDur,
    excludeId: appointment?.id ?? null,
  })

  const onSubmit = async (values: FormValues) => {
    // حارس أخير في الواجهة — القاعدة هي الحكم النهائي
    if (conflict) return
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const dur =
      values.duration_minutes && values.duration_minutes.trim() !== ''
        ? Number(values.duration_minutes)
        : 60
    const input: AppointmentInput = {
      client_id: clientId,
      client_name: t(values.client_name),
      client_phone: t(values.client_phone),
      appointment_date: values.appointment_date,
      appointment_time: t(values.appointment_time),
      duration_minutes: !isNaN(dur) ? dur : 60,
      status: values.status,
      meeting_method: t(values.meeting_method),
      notes: t(values.notes),
    }
    if (isEdit && appointment) {
      await updateM.mutateAsync({ id: appointment.id, input })
    } else {
      await createM.mutateAsync({
        ...input,
        created_by: teamMember?.name ?? null,
        request_id: fromRequest?.requestId ?? null,
      })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل موعد' : 'موعد جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 space-y-3">
        {/* العميل */}
        <div className="space-y-1.5 rounded-lg border border-dashed p-3">
          <Label>العميل (من جهات الاتصال — اختياري)</Label>
          <ContactPicker
            contacts={contacts ?? []}
            value={clientId}
            onSelect={(c: Contact | null) => {
              setClientId(c?.id ?? null)
              if (c) {
                setValue('client_name', c.name ?? '')
                setValue('client_phone', c.phone ?? '')
              }
            }}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input placeholder="اسم العميل" {...register('client_name')} />
            <Input placeholder="جوال العميل" dir="ltr" {...register('client_phone')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Controller
              control={control}
              name="appointment_date"
              render={({ field }) => (
                <DualDatePicker
                  label="التاريخ"
                  required
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
            {errors.appointment_date && (
              <p className="text-xs text-destructive">
                {errors.appointment_date.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appt_time">الوقت</Label>
            <Input id="appt_time" type="time" {...register('appointment_time')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="appt_dur">المدة (دقيقة)</Label>
            <Input
              id="appt_dur"
              type="number"
              dir="ltr"
              {...register('duration_minutes')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>طريقة الاجتماع</Label>
            <Controller
              control={control}
              name="meeting_method"
              render={({ field }) => (
                <Select value={field.value ?? 'onsite'} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onsite">حضوري</SelectItem>
                    <SelectItem value="remote">عن بُعد</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>الحالة</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPT_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        {/* حالة الفترة: محجوزة أم شاغرة */}
        {wDate && wTime && checkingConflict && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            جارٍ التحقق من توفر الوقت…
          </p>
        )}
        {wDate && wTime && !checkingConflict && (
          conflict ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="text-xs">
                <p className="font-medium text-destructive">هذا الوقت محجوز</p>
                <p className="mt-0.5 text-muted-foreground">
                  يتعارض مع موعد {conflict.client_name || 'عميل'} الساعة{' '}
                  {fmtTime(conflict.appointment_time)}
                  {conflict.duration_minutes != null &&
                    ` (${fmtNumber(conflict.duration_minutes)} دقيقة)`}
                  . اختر وقتاً آخر أو عدّل المدة.
                </p>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              الفترة شاغرة
            </p>
          )
        )}

        <div className="space-y-1.5">
          <Label htmlFor="appt_notes">ملاحظات</Label>
          <Textarea id="appt_notes" rows={2} {...register('notes')} />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button
          type="submit"
          variant="gold"
          disabled={pending || !!conflict || checkingConflict}
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'حفظ التعديلات' : 'إضافة'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          إلغاء
        </Button>
      </DialogFooter>
    </form>
  )
}
