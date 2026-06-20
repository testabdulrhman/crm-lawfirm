import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { getTemplate, fillTemplate } from '@/lib/templates'
import { normalizeSaudiPhone, todayISO, fmtDatePref, fmtTime } from '@/lib/format'
import { addAppointmentEvent, deleteCalendarEvent } from '@/lib/calendar'
import type { Appointment, AppointmentInput, SmsConfig } from '@/types/db'

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
      description: e instanceof Error ? e.message : undefined,
    })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['appointments'] })
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
    onError: errToast('تعذّرت إضافة الموعد'),
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
    onError: errToast('تعذّر تحديث الموعد'),
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

async function fetchSmsConfig(): Promise<SmsConfig | null> {
  const { data, error } = await supabase
    .from('lookup_values')
    .select('value')
    .eq('type', 'sms_config')
    .maybeSingle()
  if (error) throw error
  if (!data?.value) return null
  try {
    return JSON.parse(data.value as string) as SmsConfig
  } catch {
    return null
  }
}

// يرسل SMS للموعد ويُسجّل في sms_log. يُرجع true عند النجاح. لا يرمي أخطاء قاتلة.
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
    const cfg = await fetchSmsConfig()
    if (!cfg) return false

    const body = (await getTemplate(templateKey)) || fallback
    message = fillTemplate(body, {
      name,
      date: fmtDatePref(appt.appointment_date),
      time: fmtTime(appt.appointment_time),
    })

    const { data, error } = await supabase.functions.invoke('swift-endpoint', {
      body: {
        userName: cfg.userName,
        apiKey: cfg.apiKey,
        userSender: cfg.sender,
        numbers,
        msg: message,
      },
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
