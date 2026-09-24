import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { deleteCalendarEvent, syncSessionCalendar } from '@/lib/calendar'
import { normalizeSaudiPhone, fmtDatePref } from '@/lib/format'
import type {
  CaseSession,
  CaseSessionInput,
  CloseSessionResult,
  SessionNeedingClosure,
} from '@/types/db'
import { errMessage } from '@/lib/errors'

// ترجمة أخطاء القاعدة المعروفة إلى رسائل عربية واضحة
function friendlyDbError(e: unknown): string | undefined {
  const m = errMessage(e) ?? String(e ?? '')
  if (m.includes('sessions_case_number_unique'))
    return 'رقم الجلسة مستخدم مسبقاً في هذه القضية — اختر رقماً آخر.'
  if (m.includes('schema cache'))
    return 'خطأ مؤقت في الخادم — أعد المحاولة بعد لحظات.'
  return errMessage(e)
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: friendlyDbError(e),
    })
}

function invalidate(qc: ReturnType<typeof useQueryClient>, caseId: string) {
  qc.invalidateQueries({ queryKey: ['case_sessions', caseId] })
  // hearing_date في بطاقة القضية قد تتأثّر
  qc.invalidateQueries({ queryKey: ['cases'] })
  qc.invalidateQueries({ queryKey: ['case', caseId] })
}

function calendarWarn() {
  toast({
    variant: 'default',
    title: 'تعذّرت مزامنة التقويم',
    description: 'حُفظت الجلسة، لكن لم يُنشأ/يُحدّث حدث التقويم.',
  })
}

// جلسة مع عنوان قضيتها (لصفحة «جميع الجلسات»)
export interface SessionWithCase extends CaseSession {
  case: { id: string; title: string | null } | null
}

// كل الجلسات عبر جميع القضايا (لصفحة الجلسات الشاملة)
export function useAllSessions() {
  return useQuery({
    queryKey: ['all_sessions'],
    queryFn: async (): Promise<SessionWithCase[]> => {
      const { data, error } = await supabase
        .from('sessions')
        .select('*, case:cases!sessions_case_id_fkey(id, title)')
        .order('session_date', { ascending: false })
        .order('session_time', { ascending: false })
      if (error) throw error
      return (data ?? []) as SessionWithCase[]
    },
  })
}

export function useCaseSessions(caseId: string) {
  return useQuery({
    queryKey: ['case_sessions', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<CaseSession[]> => {
      // public.sessions فقط (عميل supabase-js يستهدف public افتراضياً)
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('case_id', caseId)
        .order('session_date', { ascending: true })
        .order('session_time', { ascending: true })
      if (error) throw error
      return (data ?? []) as CaseSession[]
    },
  })
}

export function useAddSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CaseSessionInput): Promise<{ calOk: boolean }> => {
      // الكتابة الجديدة تستخدم القيم العربية للحالة
      const { data, error } = await supabase
        .from('sessions')
        .insert({ status: 'قادمة', ...input })
        .select('*')
        .single()
      if (error) throw error
      void (data as CaseSession)
      // التقويم يتولّاه الخادم: ترقر الإدراج ينادي calendar-sync (2026-09-24) — ومناداته من
      // هنا أيضاً كانت ستُنشئ الحدث مرتين
      return { calOk: true }
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تمت إضافة الجلسة' })
      // الحدث يُنشأ في الخلفية خلال ثوانٍ — نعيد الجلب ليظهر «في التقويم»
      setTimeout(() => invalidate(qc, caseId), 4000)
    },
    onError: errToast('تعذّرت إضافة الجلسة'),
  })
}

// إعادة إضافة جلسة للتقويم يدوياً (لجلسة فشلت مزامنتها وقت الإنشاء)
export function useSyncSessionCalendar(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (session: CaseSession): Promise<void> => {
      // الخادم يحجز الصف ويحفظ المعرّف — لا تكرار ولو ضُغط الزرّ والترقر يعمل
      const eventId = await syncSessionCalendar(session.id)
      if (!eventId)
        throw new Error(
          'رفض تقويم Google إنشاء الحدث — تحقّق من الإعدادات ← التكاملات (تفعيل المزامنة ومعرّف التقويم).'
        )
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      qc.invalidateQueries({ queryKey: ['all_sessions'] })
      toast({ variant: 'success', title: 'أُضيفت الجلسة للتقويم ✓' })
    },
    onError: errToast('تعذّرت إضافة الجلسة للتقويم'),
  })
}

export function useUpdateSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<CaseSessionInput>
    }): Promise<{ calWarn: boolean }> => {
      // اجلب الصف الحالي لمقارنة التاريخ/الوقت ومعرّف التقويم
      const { data: existing } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single()
      const old = existing as CaseSession | null

      const { error } = await supabase.from('sessions').update(input).eq('id', id)
      if (error) throw error

      // هل تغيّر التاريخ أو الوقت؟
      const dateChanged =
        input.session_date !== undefined &&
        input.session_date !== old?.session_date
      const timeChanged =
        input.session_time !== undefined &&
        input.session_time !== old?.session_time

      if (dateChanged || timeChanged) {
        // احذف الحدث القديم وأفرغ المعرّف، ثم ليُنشئ الخادم حدثاً بالموعد الجديد
        await deleteCalendarEvent(old?.gcal_event_id)
        await supabase.from('sessions').update({ gcal_event_id: null }).eq('id', id)
        const eventId = await syncSessionCalendar(id)
        return { calWarn: !eventId }
      }
      return { calWarn: false }
    },
    onSuccess: (res) => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تم تحديث الجلسة' })
      if (res.calWarn) calendarWarn()
    },
    onError: errToast('تعذّر تحديث الجلسة'),
  })
}

// تسجيل نتيجة: الحالة «منعقدة» + outcome (لا يؤثّر على التقويم)
export function useSetSessionOutcome(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      outcome,
    }: {
      id: string
      outcome: string
    }): Promise<void> => {
      const { error } = await supabase
        .from('sessions')
        .update({ status: 'منعقدة', outcome })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تم تسجيل نتيجة الجلسة' })
    },
    onError: errToast('تعذّر تسجيل النتيجة'),
  })
}

export function useDeleteSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // احذف حدث التقويم أولاً إن وُجد (غير قاتل)
      const { data: existing } = await supabase
        .from('sessions')
        .select('gcal_event_id')
        .eq('id', id)
        .maybeSingle()
      await deleteCalendarEvent(
        (existing as { gcal_event_id: string | null } | null)?.gcal_event_id
      )

      const { error } = await supabase.from('sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تم حذف الجلسة' })
    },
    onError: errToast('تعذّر حذف الجلسة'),
  })
}

/* ===================== تأجيل الجلسة ===================== */

// يوسم الجلسة «مؤجّلة»، يحذف حدث تقويمها، وإن أُعطي تاريخ جديد
// يُنشئ جلسة بديلة (نفس العنوان/المحكمة) ويزامنها مع التقويم.
export function usePostponeSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      newDate,
      newTime,
      nextNumber,
    }: {
      id: string
      newDate?: string | null
      newTime?: string | null
      nextNumber?: number | null
    }): Promise<{ createdNew: boolean; calWarn: boolean }> => {
      const { data: existing } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', id)
        .single()
      const old = existing as CaseSession | null

      // وسم مؤجّلة + ملاحظة في النتيجة (إن لم تكن مسجّلة)
      const note = newDate
        ? `أُجّلت الجلسة إلى ${fmtDatePref(newDate)}`
        : 'أُجّلت الجلسة'
      const { error } = await supabase
        .from('sessions')
        .update({
          status: 'مؤجّلة',
          outcome: old?.outcome && old.outcome.trim() ? old.outcome : note,
        })
        .eq('id', id)
      if (error) throw error

      // حذف حدث التقويم للجلسة المؤجّلة (غير قاتل — لن تُعقد بموعدها)
      if (old?.gcal_event_id) {
        await deleteCalendarEvent(old.gcal_event_id)
        await supabase
          .from('sessions')
          .update({ gcal_event_id: null })
          .eq('id', id)
      }

      // جلسة بديلة بالتاريخ الجديد (اختياري)
      let createdNew = false
      const calWarn = false
      if (newDate) {
        const { data: created, error: insErr } = await supabase
          .from('sessions')
          .insert({
            case_id: caseId,
            title: old?.title ?? 'جلسة',
            session_number: nextNumber ?? null,
            session_date: newDate,
            session_time: newTime || null,
            court: old?.court ?? null,
            status: 'قادمة',
          })
          .select('*')
          .single()
        if (insErr) throw insErr
        createdNew = true
        void created
        // تقويم الجلسة البديلة يتولّاه ترقر الإدراج في الخادم
        setTimeout(() => invalidate(qc, caseId), 4000)
      }
      return { createdNew, calWarn }
    },
    onSuccess: (res) => {
      invalidate(qc, caseId)
      qc.invalidateQueries({ queryKey: ['all_sessions'] })
      qc.invalidateQueries({ queryKey: ['dashboard_overview'] })
      toast({
        variant: 'success',
        title: res.createdNew
          ? 'أُجّلت الجلسة وأُنشئت جلسة بالتاريخ الجديد'
          : 'أُجّلت الجلسة',
      })
      if (res.calWarn) calendarWarn()
    },
    onError: errToast('تعذّر تأجيل الجلسة'),
  })
}

/* ===================== إغلاق الجلسة ===================== */

export interface CloseSessionArgs {
  sessionId: string
  outcome: string
  minutesUrl?: string | null
  nextAction: 'none' | 'next_session' | 'await_ruling' | 'case_closed'
  nextSessionDate?: string | null
  nextSessionTime?: string | null
  rulingDueDate?: string | null
}

export function useCloseSession(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: CloseSessionArgs): Promise<CloseSessionResult> => {
      const { data, error } = await supabase.rpc('close_session', {
        p_session_id: args.sessionId,
        p_outcome: args.outcome,
        p_minutes_url: args.minutesUrl ?? null,
        p_next_action: args.nextAction,
        p_next_session_date: args.nextSessionDate ?? null,
        p_next_session_time: args.nextSessionTime ?? null,
        p_ruling_due_date: args.rulingDueDate ?? null,
      })
      if (error) throw error
      return data as CloseSessionResult
    },
    onSuccess: () => {
      invalidate(qc, caseId)
      qc.invalidateQueries({ queryKey: ['dashboard_overview'] })
      qc.invalidateQueries({ queryKey: ['sessions_need_closure'] })
      qc.invalidateQueries({ queryKey: ['all_sessions'] })
    },
    onError: errToast('تعذّر إغلاق الجلسة'),
  })
}

export function useSessionsNeedClosure(scope: 'all' | 'mine' = 'all') {
  return useQuery({
    queryKey: ['sessions_need_closure', scope],
    queryFn: async (): Promise<SessionNeedingClosure[]> => {
      const { data, error } = await supabase.rpc('sessions_need_closure', {
        p_scope: scope,
      })
      if (error) throw error
      return (data ?? []) as SessionNeedingClosure[]
    },
  })
}

// إرسال تقرير الجلسة عبر SMS (Msegat عبر swift-endpoint — البيانات تُحلّ خادميّاً).
// لا يرمي أخطاء قاتلة — يُرجع true عند النجاح.
export async function sendSessionReportSms(args: {
  sessionId: string
  phone: string
  clientName: string | null
  message: string
  sentBy: string | null
}): Promise<boolean> {
  const numbers = normalizeSaudiPhone(args.phone)
  if (!numbers) return false
  try {
    // بيانات Msegat تُحلّ خادميّاً داخل swift-endpoint (لا تُرسل من المتصفّح)
    const { data, error } = await supabase.functions.invoke('swift-endpoint', {
      body: { numbers, msg: args.message },
    })
    const ok = !error && (data?.code === '1' || data?.code === 1)
    await supabase.from('sms_log').insert({
      recipient_name: args.clientName ?? 'عميل',
      phone: numbers,
      message: args.message,
      status: ok ? 'sent' : 'failed',
      sent_by: args.sentBy,
    })
    return ok
  } catch {
    return false
  }
}

// إرسال تقرير الجلسة عبر الواتساب مباشرة (بوابة Evolution عبر whatsapp-send).
// الدالة الخادمية تسجّل الإرسال في sms_log بنفسها.
// تُرجع { ok, error } — الرسالة العربية تُعرض للموظف عند الفشل.
export async function sendSessionReportWhatsApp(args: {
  phone: string
  clientName: string | null
  message: string
}): Promise<{ ok: boolean; error?: string }> {
  const numbers = normalizeSaudiPhone(args.phone)
  if (!numbers) return { ok: false, error: 'رقم الجوال غير صالح' }
  try {
    const { data, error } = await supabase.functions.invoke('whatsapp-send', {
      body: {
        phone: numbers,
        message: args.message,
        recipient_name: args.clientName ?? 'عميل',
      },
    })
    if (error || data?.error)
      return { ok: false, error: errMessage(data?.error ?? error) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: errMessage(e) }
  }
}

// تحديث رقم الجلسة (يُستخدم عند تعبئته من المحضر أثناء الإغلاق)
// يُرجع رسالة خطأ عربية عند الفشل (مثل تكرار الرقم)، أو null عند النجاح.
export async function updateSessionNumber(
  id: string,
  num: number | null
): Promise<string | null> {
  const { error } = await supabase
    .from('sessions')
    .update({ session_number: num })
    .eq('id', id)
  if (error) {
    return error.message.includes('sessions_case_number_unique')
      ? 'رقم الجلسة مستخدم مسبقاً في هذه القضية.'
      : error.message
  }
  return null
}

// تحديث وسم إرسال التقرير على الجلسة (بعد الإرسال)
export async function markSessionReportSent(
  sessionId: string,
  via: string
): Promise<void> {
  await supabase
    .from('sessions')
    .update({ report_sent_at: new Date().toISOString(), report_sent_via: via })
    .eq('id', sessionId)
}
