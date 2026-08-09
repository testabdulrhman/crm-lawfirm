import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { getTemplate, fillTemplate } from '@/lib/templates'
import { normalizeSaudiPhone, todayISO, fmtDatePref, fmtTime } from '@/lib/format'
import { addAppointmentEvent, deleteCalendarEvent } from '@/lib/calendar'
import type { Appointment, AppointmentInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

function calendarWarn() {
  toast({
    variant: 'default',
    title: 'تعذّرت مزامنة التقويم',
    description: 'حُفظ الموعد، لكن لم يُنشأ/يُحدّث حدث التقويم.',
  })
}

const SELECT = '*, client:contacts(id,name,phone)'

const DEFAULT_CONFIRMATION =
  'مرحباً {name}، نذكّركم بموعدكم في مكتب عبدالرحمن بن رضوان المشيقح للمحاماة يوم {date} الساعة {time}.'
const DEFAULT_THANK_YOU =
  'شكراً {name} لزيارتكم مكتب عبدالرحمن بن رضوان المشيقح للمحاماة. نتشرّف بخدمتكم.'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['appointments'] })
  qc.invalidateQueries({ queryKey: ['appointment_conflict'] })
}

/* ===================== منع تعارض المواعيد ===================== */
// ⚠️ القاعدة تمنع التداخل بقيد appointments_no_overlap (يسري على 2026-08-09 فأحدث).
//    هذا الفحص يسبقه ليعرف الموظف بمن يتعارض قبل الحفظ، لا ليحلّ محلّه.
//    كل الحسابات بتوقيت الرياض — نفس ما يخزَّن في العمودين.

export interface AppointmentConflict {
  id: string
  client_name: string | null
  appointment_time: string | null
  duration_minutes: number | null
}

const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

/** الموعد المتعارض مع (تاريخ، وقت، مدة) — أو null إن كانت الفترة شاغرة. */
export function useAppointmentConflict(args: {
  date: string | null
  time: string | null
  durationMinutes: number
  excludeId?: string | null
}) {
  const { date, time, durationMinutes, excludeId } = args
  const enabled = !!date && !!time
  return useQuery({
    queryKey: ['appointment_conflict', date, time, durationMinutes, excludeId ?? null],
    enabled,
    queryFn: async (): Promise<AppointmentConflict | null> => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, client_name, appointment_time, duration_minutes')
        .eq('appointment_date', date)
        .neq('status', 'cancelled')
      if (error) throw error

      const start = toMinutes(time as string)
      const end = start + (durationMinutes || 60)
      const hit = (data ?? []).find((a) => {
        if (excludeId && a.id === excludeId) return false
        if (!a.appointment_time) return false
        const s = toMinutes(String(a.appointment_time).slice(0, 5))
        const e = s + (a.duration_minutes ?? 60)
        return start < e && s < end
      })
      return (hit as AppointmentConflict | undefined) ?? null
    },
  })
}

/** ترجمة خطأ قيد التداخل إلى رسالة عربية واضحة. */
function friendlyApptError(e: unknown): string | undefined {
  const m = errMessage(e) ?? String(e ?? '')
  if (m.includes('appointments_no_overlap') || m.includes('23P01'))
    return 'يتعارض هذا الموعد مع موعد آخر في نفس الوقت. اختر وقتاً شاغراً أو عدّل مدة الموعد.'
  if (m.includes('appointments_reference_no_key'))
    return 'الرقم المرجعي مستخدم مسبقاً — أعد المحاولة.'
  return errMessage(e)
}


/* ===================== الجلب ===================== */

export function useAppointments() {
  return useQuery({
    queryKey: ['appointments'],
    queryFn: async (): Promise<Appointment[]> => {
      const { data, error } = await supabase
        .from('appointments')
        .select(SELECT)
        .order('appointment_date', { ascending: false, nullsFirst: false })
        .order('appointment_time', { ascending: false, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as Appointment[]
    },
  })
}

export function useAppointment(id: string | null) {
  return useQuery({
    queryKey: ['appointment', id],
    enabled: !!id,
    queryFn: async (): Promise<Appointment> => {
      const { data, error } = await supabase
        .from('appointments')
        .select(SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as unknown as Appointment
    },
  })
}

// عدد المواعيد المؤكّدة بتاريخ ≥ اليوم (لـ badge الـ Sidebar)
export function useUpcomingAppointmentsCount() {
  return useQuery({
    queryKey: ['appointments', 'upcoming_count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .gte('appointment_date', todayISO())
      if (error) throw error
      return count ?? 0
    },
  })
}

/* ===================== CRUD ===================== */
// ملاحظة: منطق الحفظ مفصول هنا ليسهل ربط Google Calendar لاحقاً.

export function useCreateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AppointmentInput): Promise<{ calOk: boolean }> => {
      const { data, error } = await supabase
        .from('appointments')
        .insert({ status: 'confirmed', duration_minutes: 60, ...input })
        .select(SELECT)
        .single()
      if (error) throw error
      const appt = data as unknown as Appointment

      // مزامنة التقويم (غير قاتلة)
      const eventId = await addAppointmentEvent(appt)
      if (eventId) {
        await supabase
          .from('appointments')
          .update({ gcal_event_id: eventId })
          .eq('id', appt.id)
        return { calOk: true }
      }
      return { calOk: false }
    },
    onSuccess: (res) => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تمت إضافة الموعد' })
      if (!res.calOk) calendarWarn()
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّرت إضافة الموعد',
        description: friendlyApptError(e),
      }),
  })
}

export function useUpdateAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<AppointmentInput>
    }): Promise<{ calWarn: boolean }> => {
      // اجلب الصف الحالي لمقارنة التاريخ/الوقت ومعرّف التقويم
      const { data: existing } = await supabase
        .from('appointments')
        .select(SELECT)
        .eq('id', id)
        .single()
      const old = existing as unknown as Appointment | null

      const { error } = await supabase
        .from('appointments')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error

      const dateChanged =
        input.appointment_date !== undefined &&
        input.appointment_date !== old?.appointment_date
      const timeChanged =
        input.appointment_time !== undefined &&
        input.appointment_time !== old?.appointment_time

      if (dateChanged || timeChanged) {
        await deleteCalendarEvent(old?.gcal_event_id)
        const merged = { ...(old as Appointment), ...input } as Appointment
        const eventId = await addAppointmentEvent(merged)
        await supabase
          .from('appointments')
          .update({ gcal_event_id: eventId })
          .eq('id', id)
        return { calWarn: !eventId }
      }
      return { calWarn: false }
    },
    onSuccess: (res, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['appointment', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث الموعد' })
      if (res.calWarn) calendarWarn()
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر تحديث الموعد',
        description: friendlyApptError(e),
      }),
  })
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string
      status: string
    }): Promise<void> => {
      const { error } = await supabase
        .from('appointments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['appointment', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث الحالة' })
    },
    onError: errToast('تعذّر تحديث الحالة'),
  })
}

export function useDeleteAppointment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // احذف حدث التقويم أولاً إن وُجد (غير قاتل)
      const { data: existing } = await supabase
        .from('appointments')
        .select('gcal_event_id')
        .eq('id', id)
        .maybeSingle()
      await deleteCalendarEvent(
        (existing as { gcal_event_id: string | null } | null)?.gcal_event_id
      )

      const { error } = await supabase.from('appointments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تم حذف الموعد' })
    },
    onError: errToast('تعذّر حذف الموعد'),
  })
}

/* ===================== SMS ===================== */

// يرسل SMS للموعد ويُسجّل في sms_log. يُرجع true عند النجاح. لا يرمي أخطاء قاتلة.
// بيانات Msegat تُحلّ خادميّاً داخل swift-endpoint (لا تُرسل من المتصفّح).
async function sendAppointmentSms(
  appt: Appointment,
  templateKey: string,
  fallback: string,
  sentBy: string | null
): Promise<boolean> {
  const phone = appt.client_phone || appt.client?.phone || ''
  const numbers = normalizeSaudiPhone(phone)
  if (!numbers) return false

  const name = appt.client_name || appt.client?.name || 'عميلنا'
  let message = ''
  try {
    const body = (await getTemplate(templateKey)) || fallback
    message = fillTemplate(body, {
      name,
      date: fmtDatePref(appt.appointment_date),
      time: fmtTime(appt.appointment_time),
    })

    const { data, error } = await supabase.functions.invoke('swift-endpoint', {
      body: { numbers, msg: message },
    })
    const ok = !error && (data?.code === '1' || data?.code === 1)

    await supabase.from('sms_log').insert({
      recipient_name: name,
      phone: numbers,
      message,
      status: ok ? 'sent' : 'failed',
      sent_by: sentBy,
    })
    return ok
  } catch {
    try {
      await supabase.from('sms_log').insert({
        recipient_name: name,
        phone: numbers,
        message,
        status: 'failed',
        sent_by: sentBy,
      })
    } catch {
      /* تجاهل */
    }
    return false
  }
}

function smsResultToast(ok: boolean, hasPhone: boolean, sentTitle: string) {
  if (!hasPhone) {
    toast({ variant: 'destructive', title: 'لا يوجد رقم جوال للعميل' })
  } else if (ok) {
    toast({ variant: 'success', title: sentTitle })
  } else {
    toast({
      variant: 'default',
      title: 'تعذّر إرسال الرسالة',
      description: 'تحقّق من إعدادات SMS أو الرقم.',
    })
  }
}

export function useSendConfirmation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      appointment,
      sentBy,
    }: {
      appointment: Appointment
      sentBy: string | null
    }): Promise<{ ok: boolean; hasPhone: boolean }> => {
      const hasPhone = !!(
        appointment.client_phone || appointment.client?.phone
      )
      const ok = await sendAppointmentSms(
        appointment,
        'appointment_confirmation',
        DEFAULT_CONFIRMATION,
        sentBy
      )
      if (ok) {
        await supabase
          .from('appointments')
          .update({ confirmation_sent_at: new Date().toISOString() })
          .eq('id', appointment.id)
      }
      return { ok, hasPhone }
    },
    onSuccess: (res) => {
      invalidate(qc)
      smsResultToast(res.ok, res.hasPhone, 'تم إرسال تأكيد الموعد')
    },
    onError: errToast('تعذّر إرسال التأكيد'),
  })
}

export function useSendThankYou() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      appointment,
      sentBy,
    }: {
      appointment: Appointment
      sentBy: string | null
    }): Promise<{ ok: boolean; hasPhone: boolean }> => {
      const hasPhone = !!(
        appointment.client_phone || appointment.client?.phone
      )
      const ok = await sendAppointmentSms(
        appointment,
        'appointment_thank_you',
        DEFAULT_THANK_YOU,
        sentBy
      )
      if (ok) {
        await supabase
          .from('appointments')
          .update({ thank_you_sent_at: new Date().toISOString() })
          .eq('id', appointment.id)
      }
      return { ok, hasPhone }
    },
    onSuccess: (res) => {
      invalidate(qc)
      smsResultToast(res.ok, res.hasPhone, 'تم إرسال رسالة الشكر')
    },
    onError: errToast('تعذّر إرسال الشكر'),
  })
}
