// تكامل Google Calendar عبر Edge Function `calendar-sync` (النسخة 2).
// كل العمليات غير قاتلة: تُرجع eventId أو null، ولا ترمي أخطاء توقف الحفظ/الحذف.
import { supabase } from '@/lib/supabase'
import type { Appointment, CaseSession } from '@/types/db'

// إضافة حدث جلسة → يُرجع eventId أو null عند الفشل.
export async function addSessionEvent(
  session: Pick<
    CaseSession,
    'session_date' | 'session_time' | 'title' | 'court' | 'preparation'
  >,
  caseTitle: string | null
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'add',
        session: {
          session_date: session.session_date,
          session_time: session.session_time,
          title: session.title,
          court: session.court,
          preparation: session.preparation,
        },
        caseTitle: caseTitle ?? '',
      },
    })
    if (error || !data?.success) return null
    return (data.eventId as string) ?? null
  } catch {
    return null
  }
}

/**
 * مزامنة جلسة بمعرّفها من الخادم (2026-09-24). الخادم يحجز الصف ذرّياً قبل الإنشاء، فلا
 * يتكرر الحدث وإن نادى الترقر والزرّ معاً. الجلسة الجديدة لا تحتاج هذا — ترقر الإدراج يكفي.
 * يُرجع eventId أو null.
 */
export async function syncSessionCalendar(sessionId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: { action: 'sync-session', session_id: sessionId },
    })
    if (error || !data?.success) return null
    return (data.eventId as string) ?? null
  } catch {
    return null
  }
}

// إضافة حدث موعد → يُرجع eventId أو null.
export async function addAppointmentEvent(
  appt: Pick<
    Appointment,
    | 'appointment_date'
    | 'appointment_time'
    | 'duration_minutes'
    | 'client_name'
    | 'client_phone'
    | 'notes'
  >
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('calendar-sync', {
      body: {
        action: 'add-appointment',
        appointment: {
          appointment_date: appt.appointment_date,
          appointment_time: appt.appointment_time,
          duration_minutes: appt.duration_minutes,
          client_name: appt.client_name,
          client_phone: appt.client_phone,
          notes: appt.notes,
        },
      },
    })
    if (error || !data?.success) return null
    return (data.eventId as string) ?? null
  } catch {
    return null
  }
}

// حذف حدث من التقويم (غير قاتل).
export async function deleteCalendarEvent(
  googleEventId: string | null | undefined
): Promise<void> {
  if (!googleEventId) return
  try {
    await supabase.functions.invoke('calendar-sync', {
      body: { action: 'delete', googleEventId },
    })
  } catch {
    /* تجاهل — لا يمنع حذف السجل */
  }
}
