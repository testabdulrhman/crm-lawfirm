// اعتمادات الصادر: طلب توقيع/ختم من المدير + الموافقة (دمج الختم في PDF) + SMS للطرفين.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { normalizeSaudiPhone } from '@/lib/format'
import { applyModeLabel, type ApplyMode, type StampPosition } from '@/lib/pdfStamp'
import { notify, notifyMany } from '@/hooks/useNotifications'
import type { OutgoingLetter } from '@/types/db'
import { errMessage } from '@/lib/errors'

const letterLink = (id: string) => `https://app.redwan.sa/#/outgoing/${id}`

// إرسال SMS عبر swift-endpoint + تسجيل في sms_log (نفس نمط بقية النظام)
async function sendSms(args: {
  phone: string
  name: string
  message: string
  sentBy: string | null
}): Promise<boolean> {
  const numbers = normalizeSaudiPhone(args.phone)
  if (!numbers) return false
  try {
    const { data, error } = await supabase.functions.invoke('swift-endpoint', {
      body: { numbers, msg: args.message },
    })
    const ok = !error && (data?.code === '1' || data?.code === 1)
    await supabase.from('sms_log').insert({
      recipient_name: args.name,
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

// حصيلة الإرسال: كم رسالة وصلت من كم محاولة
type SmsOutcome = { sent: number; total: number }

// لا تقل «تم» ما لم يصل شيء — الصمت هنا كلّف طلبات اعتماد ضائعة (2026-08-02)
function smsOutcomeToast(
  sent: number,
  total: number,
  okTitle: string,
  who: string
) {
  if (total === 0) {
    toast({ title: okTitle, description: `لا يوجد رقم جوال لـ${who} — لم تُرسل رسالة.` })
  } else if (sent === total) {
    toast({ variant: 'success', title: okTitle })
  } else if (sent === 0) {
    toast({
      variant: 'destructive',
      title: `${okTitle} — لكن لم تصل الرسالة`,
      description: `تعذّر إبلاغ ${who} برسالة نصية. أبلغه بطريقة أخرى.`,
    })
  } else {
    toast({
      variant: 'destructive',
      title: okTitle,
      description: `وصلت ${sent} من ${total} رسائل فقط.`,
    })
  }
}

function invalidate(qc: ReturnType<typeof useQueryClient>, letterId: string) {
  qc.invalidateQueries({ queryKey: ['outgoing_letters'] })
  qc.invalidateQueries({ queryKey: ['outgoing_letter', letterId] })
  qc.invalidateQueries({ queryKey: ['pending_outgoing_approvals'] })
}

// عدد طلبات الاعتماد المعلّقة (شارة القائمة الجانبية للمدير)
export function usePendingOutgoingApprovalsCount() {
  return useQuery({
    queryKey: ['pending_outgoing_approvals'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('outgoing_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

// طلب الاعتماد (الموظف): إنشاء/إعادة فتح الطلب + SMS للمدراء
export function useRequestApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      letter,
      requesterId,
      requesterName,
      position,
      mode,
      extraSignatures,
    }: {
      letter: OutgoingLetter
      requesterId: string | null
      requesterName: string | null
      position: StampPosition
      mode: ApplyMode
      extraSignatures: StampPosition[]
    }): Promise<SmsOutcome> => {
      const { error } = await supabase.from('outgoing_approvals').upsert(
        {
          letter_id: letter.id,
          status: 'pending',
          note: null,
          stamp_page: position.page,
          stamp_x: position.x,
          stamp_y: position.y,
          apply_mode: mode,
          extra_sigs: extraSignatures.length > 0 ? extraSignatures : null,
          // الأعمدة القديمة تُصفَّر — extra_sigs هي المرجع الآن
          sig2_page: null,
          sig2_x: null,
          sig2_y: null,
          requested_by: requesterId,
          requested_at: new Date().toISOString(),
          approved_by: null,
          approved_at: null,
        },
        { onConflict: 'letter_id' }
      )
      if (error) throw error

      // إشعار كل المدراء النشطين
      const { data: directors } = await supabase
        .from('team_members')
        .select('id, name, phone')
        .eq('is_director', true)
        .eq('is_active', true)
      const msg = `طلب اعتماد خطاب صادر 🖋 (${applyModeLabel(mode)})\n${letter.subject || letter.letter_number || 'خطاب'}\nمن: ${requesterName ?? 'موظف'}\n${letterLink(letter.id)}`
      await notifyMany(
        (directors ?? []).map((d) => d.id),
        {
          type: 'approval_request',
          title: 'طلب اعتماد خطاب صادر',
          message: `${letter.subject || letter.letter_number || 'خطاب'} — من ${requesterName ?? 'موظف'}`,
        }
      )
      const withPhone = (directors ?? []).filter((d) => d.phone)
      const results = await Promise.all(
        withPhone.map((d) =>
          sendSms({
            phone: d.phone as string,
            name: d.name ?? 'المدير',
            message: msg,
            sentBy: requesterName,
          })
        )
      )
      // نُرجع حصيلة الإرسال حتى لا يُقال «أُرسل» ولم يصل شيء
      return { sent: results.filter(Boolean).length, total: withPhone.length }
    },
    onSuccess: (res, vars) => {
      invalidate(qc, vars.letter.id)
      smsOutcomeToast(res.sent, res.total, 'أُرسل طلب الاعتماد للمدير', 'المدير')
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر إرسال طلب الاعتماد',
        description: errMessage(e),
      }),
  })
}

// الموافقة (المدير): حفظ النسخة الموقّعة + تحديث الخطاب + SMS للطالب
export function useApproveLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      letter,
      signedFileUrl,
      approverId,
      approverName,
    }: {
      letter: OutgoingLetter
      signedFileUrl: string
      approverId: string | null
      approverName: string | null
    }): Promise<SmsOutcome> => {
      const { error } = await supabase.from('outgoing_approvals').upsert(
        {
          letter_id: letter.id,
          status: 'approved',
          original_file_url: letter.file_url,
          signed_file_url: signedFileUrl,
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        },
        { onConflict: 'letter_id' }
      )
      if (error) throw error

      // الملف الرئيسي للخطاب يصبح النسخة الموقّعة
      const { error: e2 } = await supabase
        .from('outgoing_letters')
        .update({ file_url: signedFileUrl })
        .eq('id', letter.id)
      if (e2) throw e2

      // إشعار الطالب
      const requester = letter.approval?.requester
      await notify({
        recipientId: requester?.id,
        type: 'approval_result',
        title: 'اعتُمد خطابك ووُقّع ✓',
        message: letter.subject || letter.letter_number || 'خطاب',
      })
      if (!requester?.phone) return { sent: 0, total: 0 }
      const ok = await sendSms({
        phone: requester.phone,
        name: requester.name ?? 'موظف',
        message: `تم اعتماد وتوقيع الخطاب ✓\n${letter.subject || letter.letter_number || 'خطاب'}\n${letterLink(letter.id)}`,
        sentBy: approverName,
      })
      return { sent: ok ? 1 : 0, total: 1 }
    },
    onSuccess: (res, vars) => {
      invalidate(qc, vars.letter.id)
      smsOutcomeToast(res.sent, res.total, 'تم الاعتماد والتوقيع ✓', 'الموظف')
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر الاعتماد',
        description: errMessage(e),
      }),
  })
}

// الرفض (المدير): حالة مرفوض + سبب اختياري + SMS للطالب
export function useRejectLetter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      letter,
      note,
      approverId,
      approverName,
    }: {
      letter: OutgoingLetter
      note: string
      approverId: string | null
      approverName: string | null
    }): Promise<SmsOutcome> => {
      const { error } = await supabase.from('outgoing_approvals').upsert(
        {
          letter_id: letter.id,
          status: 'rejected',
          note: note.trim() === '' ? null : note.trim(),
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        },
        { onConflict: 'letter_id' }
      )
      if (error) throw error

      const requester = letter.approval?.requester
      if (!requester?.phone) return { sent: 0, total: 0 }
      const reason = note.trim() !== '' ? `\nالسبب: ${note.trim()}` : ''
      const ok = await sendSms({
        phone: requester.phone,
        name: requester.name ?? 'موظف',
        message: `تم رفض طلب اعتماد الخطاب\n${letter.subject || letter.letter_number || 'خطاب'}${reason}\n${letterLink(letter.id)}`,
        sentBy: approverName,
      })
      return { sent: ok ? 1 : 0, total: 1 }
    },
    onSuccess: (res, vars) => {
      invalidate(qc, vars.letter.id)
      smsOutcomeToast(res.sent, res.total, 'تم رفض الطلب وإشعار الموظف', 'الموظف')
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر الرفض',
        description: errMessage(e),
      }),
  })
}
