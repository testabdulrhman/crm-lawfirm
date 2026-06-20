import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

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
import { useAuth } from '@/stores/auth'
import { useContacts } from '@/hooks/useContacts'
import {
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
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function AppointmentForm({
  appointment,
  onDone,
}: {
  appointment?: Appointment | null
  onDone: () => void
}) {
  const isEdit = Boolean(appointment)
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
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      client_name: appointment?.client_name ?? '',
      client_phone: appointment?.client_phone ?? '',
      appointment_date: appointment?.appointment_date ?? '',
      appointment_time: appointment?.appointment_time
        ? appointment.appointment_time.slice(0, 5)
        : '',
      duration_minutes:
        appointment?.duration_minutes != null
          ? String(appointment.duration_minutes)
          : '60',
      status: appointment?.status ?? 'confirmed',
      notes: appointment?.notes ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
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
      notes: t(values.notes),
    }
    if (isEdit && appointment) {
      await updateM.mutateAsync({ id: appointment.id, input })
    } else {
      await createM.mutateAsync({ ...input, created_by: teamMember?.name ?? null })
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
        {errors.appointment_date && (
          <p className="text-xs text-destructive">
            {errors.appointment_date.message}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="appt_notes">ملاحظات</Label>
          <Textarea id="appt_notes" rows={2} {...register('notes')} />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
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
