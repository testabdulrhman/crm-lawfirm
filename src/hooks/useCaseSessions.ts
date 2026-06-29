import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { addSessionEvent, deleteCalendarEvent } from '@/lib/calendar'
import { normalizeSaudiPhone } from '@/lib/format'
import type {
  CaseSession,
  CaseSessionInput,
  CloseSessionResult,
  SessionNeedingClosure,
  SmsConfig,
} from '@/types/db'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

function invalidate(qc: ReturnType<typeof useQueryClient>, caseId: string) {
  qc.invalidateQueries({ queryKey: ['case_sessions', caseId] })
  // hearing_date في بطاقة القضية قد تتأثّر
  qc.invalidateQueries({ queryKey: ['cases'] })
  qc.invalidateQueries({ queryKey: ['case', caseId] })
}

async function getCaseTitle(caseId: string): Promise<string | null> {
  const { data } = await supabase
    .from('cases')
    .select('title')
    .eq('id', caseId)
    .maybeSingle()
  return (data?.title as string | undefined) ?? null
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
      const session = data as CaseSession

      // مزامنة التقويم (غير قاتلة)
      const caseTitle = await getCaseTitle(caseId)
      const eventId = await addSessionEvent(session, caseTitle)
      if (eventId) {
        await supabase
          .from('sessions')
          .update({ gcal_event_id: eventId })
          .eq('id', session.id)
        return { calOk: true }
      }
      return { calOk: false }
    },
    onSuccess: (res) => {
      invalidate(qc, caseId)
      toast({ variant: 'success', title: 'تمت إضافة الجلسة' })
      if (!res.calOk) calendarWarn()
    },
    onError: errToast('تعذّرت إضافة الجلسة'),
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
        // delete + add
        await deleteCalendarEvent(old?.gcal_event_id)
        const merged: CaseSession = { ...(old as CaseSession), ...input } as CaseSession
        const caseTitle = await getCaseTitle(caseId)
        const eventId = await addSessionEvent(merged, caseTitle)
        await supabase
          .from('sessions')
          .update({ gcal_event_id: eventId })
          .eq('id', id)
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

// إرسال تقرير الجلسة عبر SMS (يعيد استخدام Msegat) ويُسجّل report_sent_at/via.
// لا يرمي أخطاء قاتلة — يُرجع true عند النجاح.
async function fetchSmsConfig(): Promise<SmsConfig | null> {
  const { data } = await supabase
    .from('lookup_values')
    .select('value')
    .eq('type', 'sms_config')
    .maybeSingle()
  if (!data?.value) return null
  try {
    return JSON.parse(data.value as string) as SmsConfig
  } catch {
    return null
  }
}

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
    const cfg = await fetchSmsConfig()
    if (!cfg) return false
    const { data, error } = await supabase.functions.invoke('swift-endpoint', {
      body: {
        userName: cfg.userName,
        apiKey: cfg.apiKey,
        userSender: cfg.sender,
        numbers,
        msg: args.message,
      },
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
