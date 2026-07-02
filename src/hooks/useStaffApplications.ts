import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { getTemplate, fillTemplate } from '@/lib/templates'
import { normalizeSaudiPhone } from '@/lib/format'
import type {
  StaffApplication,
  StaffApplicationStatus,
} from '@/types/db'

const LIST_KEY = 'staff_applications'
const LOGIN_URL = 'https://app.redwan.sa'

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [LIST_KEY] })
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

/* ===================== الجلب ===================== */

export function useStaffApplications(
  filter: StaffApplicationStatus | 'all' = 'all'
) {
  return useQuery({
    queryKey: [LIST_KEY, filter],
    queryFn: async (): Promise<StaffApplication[]> => {
      let q = supabase
        .from('staff_applications')
        .select('*')
        .is('deleted_at', null) // استبعاد المحذوفة (حذف ناعم)
        .order('created_at', { ascending: false })
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as StaffApplication[]
    },
  })
}

export function useStaffApplication(id: string | null) {
  return useQuery({
    queryKey: [LIST_KEY, 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<StaffApplication> => {
      const { data, error } = await supabase
        .from('staff_applications')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as StaffApplication
    },
  })
}

export function usePendingApplicationsCount() {
  return useQuery({
    queryKey: [LIST_KEY, 'pending_count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('staff_applications')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

/* ===================== مساعد SMS ===================== */
// بيانات Msegat تُحلّ خادميّاً داخل swift-endpoint (لا تُرسل من المتصفّح).

interface SendCredentialsArgs {
  name: string
  email: string
  password: string
  phone: string
  sentBy: string | null
}

// يرسل بيانات الدخول عبر SMS ويُسجّل في sms_log. يُرجع true عند النجاح.
// لا يرمي أخطاء قاتلة — فشل SMS لا يجب أن يُفشل الاعتماد.
async function sendCredentialsSms(args: SendCredentialsArgs): Promise<boolean> {
  const numbers = normalizeSaudiPhone(args.phone)
  if (!numbers) return false

  let message = ''
  // نسخة السجلّ: كلمة المرور مموّهة — لا تُخزَّن نصّاً أبداً (أمان)
  const redact = (m: string) =>
    args.password ? m.split(args.password).join('••••••') : m
  try {
    const body = await getTemplate('staff_credentials')
    message = body
      ? fillTemplate(body, {
          name: args.name,
          login_url: LOGIN_URL,
          email: args.email,
          password: args.password,
        })
      : `مرحباً ${args.name}، رابط الدخول: ${LOGIN_URL} — البريد: ${args.email} — كلمة المرور: ${args.password}`

    const { data, error } = await supabase.functions.invoke('swift-endpoint', {
      body: { numbers, msg: message },
    })
    const ok = !error && (data?.code === '1' || data?.code === 1)

    // سجّل النتيجة (بالنسخة المموّهة)
    await supabase.from('sms_log').insert({
      recipient_name: args.name,
      phone: numbers,
      message: redact(message),
      status: ok ? 'sent' : 'failed',
      sent_by: args.sentBy,
    })
    return ok
  } catch {
    // سجّل الفشل إن أمكن (بالنسخة المموّهة)
    try {
      await supabase.from('sms_log').insert({
        recipient_name: args.name,
        phone: numbers,
        message: redact(message),
        status: 'failed',
        sent_by: args.sentBy,
      })
    } catch {
      /* تجاهل */
    }
    return false
  }
}

/* ===================== الاعتماد ===================== */

export interface ApproveArgs {
  application: StaffApplication
  email: string
  password: string
  role: string
  reviewerName: string | null
}

export interface ApproveResult {
  teamMemberId: string | null
  smsSent: boolean
  hasPhone: boolean
}

export function useApproveApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: ApproveArgs): Promise<ApproveResult> => {
      const a = args.application

      // 1) إنشاء حساب الموظف عبر Edge Function
      const { data, error } = await supabase.functions.invoke(
        'swift-endpoint',
        {
          body: {
            action: 'create-user',
            email: args.email,
            password: args.password,
            name: a.full_name,
            role: args.role,
            short_name: a.full_name,
            avatar_initial: (a.full_name ?? '؟').trim().charAt(0),
            phone: a.phone,
            date_of_birth: a.date_of_birth,
            id_number: a.id_number,
            national_address: a.national_address,
            bank_name: a.bank_name,
            bank_iban: a.bank_iban,
            qualifications: a.qualifications,
            cv_url: a.cv_url,
            qualification_doc_url: a.qualification_doc_url,
            lawyer_license_url: a.lawyer_license_url,
            emergency_contact_name: a.emergency_contact_name,
            emergency_contact_phone: a.emergency_contact_phone,
            emergency_contact_relation: a.emergency_contact_relation,
          },
        }
      )
      if (error) throw new Error(error.message)
      if (!data?.success) {
        throw new Error(data?.error || 'فشل إنشاء حساب الموظف')
      }
      const teamMemberId: string | null = data.team_member_id ?? null

      // 2) تحديث حالة الطلب
      const { error: updErr } = await supabase
        .from('staff_applications')
        .update({
          status: 'approved',
          reviewed_by: args.reviewerName,
          reviewed_at: new Date().toISOString(),
          approved_team_member_id: teamMemberId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', a.id)
      if (updErr) throw updErr

      // 3) إرسال SMS ببيانات الدخول (فشله لا يُفشل العملية)
      const hasPhone = !!a.phone && normalizeSaudiPhone(a.phone) !== ''
      let smsSent = false
      if (hasPhone) {
        smsSent = await sendCredentialsSms({
          name: a.full_name ?? 'الموظف',
          email: args.email,
          password: args.password,
          phone: a.phone!,
          sentBy: args.reviewerName,
        })
      }

      return { teamMemberId, smsSent, hasPhone }
    },
    onSuccess: (res) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: ['team_members'] })
      if (!res.hasPhone) {
        toast({
          variant: 'success',
          title: 'تم اعتماد الطلب وإنشاء الحساب',
          description: 'لا يوجد رقم جوال — لم تُرسل رسالة.',
        })
      } else if (res.smsSent) {
        toast({
          variant: 'success',
          title: 'تم الاعتماد وإرسال بيانات الدخول عبر SMS',
        })
      } else {
        toast({
          variant: 'default',
          title: 'تم اعتماد الطلب وإنشاء الحساب',
          description: 'تعذّر إرسال SMS — الحساب منشأ، أبلغ الموظف يدوياً.',
        })
      }
    },
    onError: errToast('تعذّر اعتماد الطلب'),
  })
}

/* ===================== الرفض ===================== */

// رسالة اعتذار للمتقدّم عبر قالب application_rejected (غير قاتلة).
const DEFAULT_REJECTION =
  'مرحباً {name}، نشكر تقديمكم على الوظيفة لدى شركة عبدالرحمن بن رضوان المشيقح للمحاماة. نعتذر عن عدم قبول طلبكم حالياً، ونتمنّى لكم التوفيق.'

async function sendRejectionSms(
  name: string,
  phone: string,
  sentBy: string | null
): Promise<boolean> {
  const numbers = normalizeSaudiPhone(phone)
  if (!numbers) return false
  let message = ''
  try {
    const body = await getTemplate('application_rejected')
    message = fillTemplate(body || DEFAULT_REJECTION, { name })
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

export function useRejectApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      application,
      reason,
      reviewerName,
      sendSms,
    }: {
      application: StaffApplication
      reason: string
      reviewerName: string | null
      sendSms: boolean
    }): Promise<{ sendSms: boolean; hasPhone: boolean; smsSent: boolean }> => {
      const { error } = await supabase
        .from('staff_applications')
        .update({
          status: 'rejected',
          rejection_reason: reason, // يُحفظ داخلياً ولا يُرسل للمتقدّم
          reviewed_by: reviewerName,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', application.id)
      if (error) throw error

      const hasPhone =
        !!application.phone && normalizeSaudiPhone(application.phone) !== ''
      let smsSent = false
      if (sendSms && hasPhone) {
        smsSent = await sendRejectionSms(
          application.full_name ?? 'المتقدّم',
          application.phone!,
          reviewerName
        )
      }
      return { sendSms, hasPhone, smsSent }
    },
    onSuccess: (res) => {
      invalidate(qc)
      if (res.sendSms && res.hasPhone && !res.smsSent) {
        toast({
          variant: 'default',
          title: 'تم رفض الطلب',
          description: 'تعذّر إرسال رسالة الاعتذار — تحقّق من إعدادات SMS.',
        })
      } else if (res.sendSms && res.smsSent) {
        toast({ variant: 'success', title: 'تم رفض الطلب وإرسال رسالة الاعتذار' })
      } else {
        toast({ variant: 'success', title: 'تم رفض الطلب' })
      }
    },
    onError: errToast('تعذّر رفض الطلب'),
  })
}

// إعادة الطلب المرفوض إلى «قيد المراجعة»
export function useReopenApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('staff_applications')
        .update({
          status: 'pending',
          rejection_reason: null,
          reviewed_by: null,
          reviewed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'أُعيد الطلب إلى قيد المراجعة' })
    },
    onError: errToast('تعذّر إعادة الطلب'),
  })
}

/* ===================== الحذف الناعم (للمدير) ===================== */

export function useDeleteApplication() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      deletedBy,
    }: {
      id: string
      deletedBy: string | null
    }): Promise<void> => {
      const { error } = await supabase
        .from('staff_applications')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: deletedBy,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'تم حذف الطلب (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف الطلب'),
  })
}
