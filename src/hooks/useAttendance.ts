// سجل الحضور والغياب (طلب المدير 2026-10-11: «ودي أقدر أسجّل غياب الموظفين»).
// يسجّل المدير وراكان، والحذف للمدير، والموظف يرى سجله بلا إشعار؛ والخصم يُقترح ولا يدخل الرواتب إلا باعتماد المدير.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { STAFF_DOCS_BUCKET } from '@/hooks/useMemberDocuments'

export type AttendanceKind = 'absent' | 'excused' | 'late' | 'early_leave' | 'field'
export type DeductionStatus = 'none' | 'proposed' | 'approved' | 'rejected'

export const KIND_LABEL: Record<AttendanceKind, string> = {
  absent: 'غياب بدون عذر',
  excused: 'غياب بعذر',
  late: 'تأخير',
  early_leave: 'انصراف مبكر',
  field: 'مهمة خارجية',
}

export interface AttendanceRecord {
  id: string
  member_id: string
  day: string
  kind: AttendanceKind
  minutes: number | null
  note: string | null
  attachment_url: string | null
  deduction_status: DeductionStatus
  deduction_amount: number | null
  payroll_entry_id: string | null
  created_at: string
  member?: { name: string | null; short_name: string | null } | null
  recorder?: { name: string | null; short_name: string | null } | null
}

export interface AbsenceSuggestion {
  member_id: string
  member_name: string
  day: string
}

const KEY = 'attendance'
const COLS =
  'id, member_id, day, kind, minutes, note, attachment_url, deduction_status, deduction_amount, payroll_entry_id, created_at, ' +
  'member:team_members!attendance_records_member_id_fkey(name, short_name), ' +
  'recorder:team_members!attendance_records_recorded_by_fkey(name, short_name)'

/** سجلات فترة — لموظف واحد (صفحته) أو للجميع (صفحة الحضور) */
export function useAttendance(opts: { from: string; to: string; memberId?: string | null }) {
  return useQuery({
    queryKey: [KEY, opts.from, opts.to, opts.memberId ?? 'all'],
    queryFn: async (): Promise<AttendanceRecord[]> => {
      let q = supabase
        .from('attendance_records')
        .select(COLS)
        .is('deleted_at', null)
        .gte('day', opts.from)
        .lte('day', opts.to)
        .order('day', { ascending: false })
      if (opts.memberId) q = q.eq('member_id', opts.memberId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as AttendanceRecord[]
    },
  })
}

export function useAbsenceSuggestions(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'suggestions'],
    enabled,
    queryFn: async (): Promise<AbsenceSuggestion[]> => {
      const { data, error } = await supabase.rpc('absence_suggestions', { p_days: 5 })
      if (error) throw error
      return (data ?? []) as AbsenceSuggestion[]
    },
  })
}

export function usePendingDeductions(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'pending-deductions'],
    enabled,
    queryFn: async (): Promise<AttendanceRecord[]> => {
      const { data, error } = await supabase
        .from('attendance_records')
        .select(COLS)
        .is('deleted_at', null)
        .eq('deduction_status', 'proposed')
        .order('day', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AttendanceRecord[]
    },
  })
}

/** يوم من آخر راتب مسجّل (÷٣٠) — اقتراح لمبلغ الخصم، يعدّله المدير */
export async function suggestedDayWage(memberId: string): Promise<number | null> {
  const { data } = await supabase
    .from('payroll_entries')
    .select('amount')
    .eq('team_member_id', memberId)
    .eq('entry_type', 'salary')
    .is('deleted_at', null)
    .order('entry_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const amt = Number(data?.amount ?? 0)
  return amt > 0 ? Math.round((amt / 30) * 100) / 100 : null
}

export interface SaveAttendanceArgs {
  id?: string
  member_id: string
  day: string
  kind: AttendanceKind
  minutes?: number | null
  note?: string | null
  proposeDeduction?: boolean
  deductionAmount?: number | null
  file?: File | null
}

export function useSaveAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: SaveAttendanceArgs) => {
      let attachment: string | null | undefined
      if (a.file) {
        // العذر الطبي ونحوه وثيقة حساسة — المخزن الخاص بمسار الموظف (يقرؤه المدير وصاحبه فقط)
        const ext = (a.file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `${a.member_id}/attendance-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage.from(STAFF_DOCS_BUCKET).upload(path, a.file)
        if (upErr) throw new Error('تعذّر رفع المرفق — إرفاق العذر للمدير')
        attachment = path
      }
      const row: Record<string, unknown> = {
        member_id: a.member_id,
        day: a.day,
        kind: a.kind,
        minutes: a.kind === 'late' || a.kind === 'early_leave' ? a.minutes || null : null,
        note: a.note?.trim() || null,
        deduction_status: a.kind === 'absent' && a.proposeDeduction ? 'proposed' : 'none',
        deduction_amount: a.kind === 'absent' && a.proposeDeduction ? a.deductionAmount || null : null,
      }
      if (attachment !== undefined) row.attachment_url = attachment
      // بلا returning: لقطة ما قبل الإدراج قد ترفضها RLS (gotcha-client-numbering-vs-rls)
      const { error } = a.id
        ? await supabase.from('attendance_records').update(row).eq('id', a.id)
        : await supabase.from('attendance_records').insert(row)
      if (error) {
        if ((error as { code?: string }).code === '23505') throw new Error('مسجّل مسبقاً بالنوع نفسه في هذا اليوم')
        throw error
      }
    },
    onSuccess: (_d, a) => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast({ variant: 'success', title: a.id ? 'حُفظ التعديل' : `سُجّل: ${KIND_LABEL[a.kind]}` })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر الحفظ', description: errMessage(e) }),
  })
}

export function useDeleteAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; by: string | null }) => {
      const { error } = await supabase
        .from('attendance_records')
        .update({ deleted_at: new Date().toISOString(), deleted_by: a.by })
        .eq('id', a.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast({ variant: 'success', title: 'حُذف السجل' })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر الحذف', description: errMessage(e) }),
  })
}

export function useDecideDeduction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: { id: string; approve: boolean; amount?: number | null }) => {
      const { error } = await supabase.rpc('decide_absence_deduction', {
        p_id: a.id,
        p_approve: a.approve,
        p_amount: a.amount ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_d, a) => {
      qc.invalidateQueries({ queryKey: [KEY] })
      qc.invalidateQueries({ queryKey: ['payroll'] })
      toast({ variant: 'success', title: a.approve ? 'اعتُمد الخصم وأُضيف لمسيّر الرواتب' : 'رُفض الخصم' })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر القرار', description: errMessage(e) }),
  })
}

/** رابط موقّت للمرفق (المخزن خاص) */
export async function attendanceAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(STAFF_DOCS_BUCKET).createSignedUrl(path, 600)
  if (error) throw error
  return data.signedUrl
}
