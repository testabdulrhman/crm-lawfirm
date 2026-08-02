// اعتمادات الصادر: طلب توقيع/ختم من المدير + الموافقة (دمج الختم في PDF) + SMS للطرفين.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { normalizeSaudiPhone } from '@/lib/format'
import { applyModeLabel, type ApplyMode, type StampPosition } from '@/lib/pdfStamp'
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
    }: {
      letter: OutgoingLetter
      requesterId: string | null
      requesterName: string | null
      position: StampPosition
      mode: ApplyMode
    }): Promise<void> => {
      const { error } = await supabase.from('outgoing_approvals').upsert(
        {
          letter_id: letter.id,
          status: 'pending',
          note: null,
          stamp_page: position.page,
          stamp_x: position.x,
          stamp_y: position.y,
          apply_mode: mode,
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
        .select('name, phone')
        .eq('is_director', true)
        .eq('is_active', true)
        .not('phone', 'is', null)
      const msg = `طلب اعتماد خطاب صادر 🖋 (${applyModeLabel(mode)})\n${letter.subject || letter.letter_number || 'خطاب'}\nمن: ${requesterName ?? 'موظف'}\n${letterLink(letter.id)}`
      await Promise.all(
        (directors ?? []).map((d) =>
          sendSms({
            phone: d.phone as string,
            name: d.name ?? 'المدير',
            message: msg,
            sentBy: requesterName,
          })
        )
      )
    },
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.letter.id)
      toast({ variant: 'success', title: 'أُرسل طلب الاعتماد للمدير' })
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
    }): Promise<void> => {
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
      if (requester?.phone) {
        await sendSms({
          phone: requester.phone,
          name: requester.name ?? 'موظف',
          message: `تم اعتماد وتوقيع الخطاب ✓\n${letter.subject || letter.letter_number || 'خطاب'}\n${letterLink(letter.id)}`,
          sentBy: approverName,
        })
      }
    },
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.letter.id)
      toast({ variant: 'success', title: 'تم الاعتماد والتوقيع ✓' })
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
    }): Promise<void> => {
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
      if (requester?.phone) {
        const reason = note.trim() !== '' ? `\nالسبب: ${note.trim()}` : ''
        await sendSms({
          phone: requester.phone,
          name: requester.name ?? 'موظف',
          message: `تم رفض طلب اعتماد الخطاب\n${letter.subject || letter.letter_number || 'خطاب'}${reason}\n${letterLink(letter.id)}`,
          sentBy: approverName,
        })
      }
    },
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.letter.id)
      toast({ title: 'تم رفض الطلب وإشعار الموظف' })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر الرفض',
        description: errMessage(e),
      }),
  })
}
