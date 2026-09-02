// طلبات الموظفين: إجازة · استئذان · دوام عن بعد — جدول hr_requests.
// RLS: الموظف طلباته (تقديم/إلغاء المعلّق)، المدير الكل (اعتماد/رفض).
// الإشعارات تُنشئها مشغّلات القاعدة (تقديم → المدراء، قرار → صاحب الطلب).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { useAuth } from '@/stores/auth'
import type { HrRequest, HrRequestInput } from '@/types/db'

const KEY = 'hr_requests'

export type HrKind = 'leave' | 'permission' | 'remote'
export type HrStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export const HR_KIND_LABELS: Record<HrKind, string> = {
  leave: 'إجازة',
  permission: 'استئذان',
  remote: 'دوام عن بعد',
}

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: 'سنوية',
  sick: 'مرضية',
  emergency: 'اضطرارية',
  unpaid: 'بدون راتب',
}

export const HR_STATUS_LABELS: Record<HrStatus, string> = {
  pending: 'بانتظار الاعتماد',
  approved: 'معتمد',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
}

export const hrKindLabel = (k: string | null | undefined) =>
  k && k in HR_KIND_LABELS ? HR_KIND_LABELS[k as HrKind] : (k ?? '—')
export const hrStatusLabel = (s: string | null | undefined) =>
  s && s in HR_STATUS_LABELS ? HR_STATUS_LABELS[s as HrStatus] : (s ?? '—')

/** عدد الأيام شاملاً الطرفين */
export function hrDays(r: Pick<HrRequest, 'start_date' | 'end_date'>): number {
  const a = new Date(r.start_date + 'T12:00:00')
  const b = new Date(r.end_date + 'T12:00:00')
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1)
}

/** ساعات الاستئذان (من/إلى) بكسر عشري واحد */
export function hrHours(r: Pick<HrRequest, 'from_time' | 'to_time'>): number | null {
  if (!r.from_time || !r.to_time) return null
  const [fh, fm] = r.from_time.split(':').map(Number)
  const [th, tm] = r.to_time.split(':').map(Number)
  const mins = th * 60 + tm - (fh * 60 + fm)
  return mins > 0 ? Math.round(mins / 6) / 10 : null
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

const SELECT =
  '*, member:team_members!hr_requests_member_id_fkey(id, name, short_name, avatar_initial, avatar_color), decider:team_members!hr_requests_decided_by_fkey(id, name, short_name)'

/** الطلبات: mine = طلباتي، all = الكل (المدير — RLS يحصر البقية على طلباتهم)، أو موظف محدّد */
export function useHrRequests(opts: { scope: 'mine' | 'all'; memberId?: string | null }) {
  const myId = useAuth((s) => s.teamMember?.id ?? null)
  const memberId = opts.memberId ?? (opts.scope === 'mine' ? myId : null)
  return useQuery({
    queryKey: [KEY, opts.scope, memberId],
    enabled: opts.scope === 'all' || !!memberId,
    queryFn: async (): Promise<HrRequest[]> => {
      let q = supabase.from('hr_requests').select(SELECT).order('created_at', { ascending: false })
      if (memberId) q = q.eq('member_id', memberId)
      const { data, error } = await q.limit(300)
      if (error) throw error
      return (data ?? []) as HrRequest[]
    },
  })
}

/** المعلّق الذي ينتظر المدير — شارة الشريط الجانبي (للمدير فقط) */
export function usePendingHrCount(enabled: boolean) {
  return useQuery({
    queryKey: [KEY, 'pending_count'],
    enabled,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('hr_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useCreateHrRequest() {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.teamMember?.id ?? null)
  return useMutation({
    mutationFn: async (input: HrRequestInput) => {
      if (!myId) throw new Error('لم يُحمَّل ملفك بعد — أعد تحميل الصفحة')
      const { data, error } = await supabase
        .from('hr_requests')
        .insert({ ...input, member_id: myId })
        .select('id')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast({ variant: 'success', title: 'قُدّم الطلب — وصل إشعار للمدير' })
      return qc.invalidateQueries({ queryKey: [KEY] })
    },
    onError: errToast('تعذّر تقديم الطلب'),
  })
}

export function useCancelHrRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // مشروط بالمعلّق: صفر صفوف = سبق البتّ فيه (درس «توست نجاح كاذب»)
      const { data, error } = await supabase
        .from('hr_requests')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('الطلب لم يعد معلّقاً — بُتّ فيه قبل الإلغاء')
    },
    onSuccess: () => {
      toast({ title: 'أُلغي الطلب' })
      return qc.invalidateQueries({ queryKey: [KEY] })
    },
    onError: errToast('تعذّر إلغاء الطلب'),
  })
}

export function useDecideHrRequest() {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.teamMember?.id ?? null)
  return useMutation({
    mutationFn: async (args: { id: string; status: 'approved' | 'rejected'; note?: string | null }) => {
      const { data, error } = await supabase
        .from('hr_requests')
        .update({
          status: args.status,
          decision_note: args.note?.trim() || null,
          decided_by: myId,
          decided_at: new Date().toISOString(),
        })
        .eq('id', args.id)
        .eq('status', 'pending')
        .select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('الطلب لم يعد معلّقاً — ربما ألغاه صاحبه')
      return args.status
    },
    onSuccess: (status) => {
      toast({
        variant: 'success',
        title: status === 'approved' ? 'اعتُمد الطلب — وصل إشعار للموظف' : 'رُفض الطلب — وصل إشعار للموظف',
      })
      return qc.invalidateQueries({ queryKey: [KEY] })
    },
    onError: errToast('تعذّر تسجيل القرار'),
  })
}
