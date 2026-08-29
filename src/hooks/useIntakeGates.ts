import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { useAuth } from '@/stores/auth'

// بوابتا المرحلة الأولى من الوثيقة («الاستقطاب والتحليل الأولي»):
// فحص تعارض المصالح، والعناية الواجبة KYC/AML.
//
// ⚠️ الأحكام النظامية (الاحتفاظ عشر سنوات، تصنيف الأنشطة، المستفيد
// الحقيقي) منقولة عن وثيقة المستخدم ولم تُراجع على الأنظمة السعودية.

/* ===================== فحص تعارض المصالح ===================== */

export type ConflictCircle = 'direct' | 'historical' | 'structural'

export const CIRCLE_LABELS: Record<ConflictCircle, string> = {
  direct: 'مباشر — موكّل حالي',
  historical: 'تاريخي — ملف أو طرف سابق',
  structural: 'شخصي وهيكلي — مصالح المكتب',
}

export interface ConflictMatch {
  circle: ConflictCircle
  source: string
  ref_id: string | null
  label: string | null
  detail: string | null
}

export interface ConflictCoverage {
  contacts: number
  cases: number
  case_parties: number
  team_members: number
}

export type ConflictOutcome = 'accept' | 'reject' | 'conditional'

export const OUTCOME_LABELS: Record<ConflictOutcome, string> = {
  accept: 'قبول',
  reject: 'رفض',
  conditional: 'قبول مشروط',
}

export interface ConflictCheck {
  id: string
  request_id: string | null
  searched_name: string
  outcome: ConflictOutcome
  matches: ConflictMatch[]
  coverage: ConflictCoverage | Record<string, number>
  screen_wall: string | null
  notes: string | null
  checked_by_name: string | null
  checked_at: string
}

/** يُشغَّل عند الطلب فقط — البحث فعل واعٍ لا تحميل تلقائي */
export function useConflictSearch() {
  return useMutation({
    mutationFn: async (
      name: string
    ): Promise<{ matches: ConflictMatch[]; coverage: ConflictCoverage }> => {
      const [res, cov] = await Promise.all([
        supabase.rpc('conflict_search', { p_name: name }),
        supabase.rpc('conflict_coverage'),
      ])
      if (res.error) throw res.error
      if (cov.error) throw cov.error
      return {
        matches: (res.data ?? []) as ConflictMatch[],
        coverage: cov.data as ConflictCoverage,
      }
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر إجراء الفحص',
        description: errMessage(e),
      }),
  })
}

export function useConflictChecks(requestId: string | null) {
  return useQuery({
    queryKey: ['conflict_checks', requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<ConflictCheck[]> => {
      const { data, error } = await supabase
        .from('conflict_checks')
        .select('*')
        .eq('request_id', requestId!)
        .order('checked_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ConflictCheck[]
    },
  })
}

export function useSaveConflictCheck() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (input: {
      requestId: string
      searchedName: string
      outcome: ConflictOutcome
      matches: ConflictMatch[]
      coverage: ConflictCoverage
      screenWall?: string | null
      notes?: string | null
    }) => {
      const { error } = await supabase.from('conflict_checks').insert({
        request_id: input.requestId,
        searched_name: input.searchedName,
        outcome: input.outcome,
        matches: input.matches,
        coverage: input.coverage,
        screen_wall: input.screenWall ?? null,
        notes: input.notes ?? null,
        checked_by: teamMember?.id ?? null,
        checked_by_name: teamMember?.name ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['conflict_checks', v.requestId] })
      toast({ variant: 'success', title: 'وُثّق فحص التعارض' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ الفحص',
        description: errMessage(e),
      }),
  })
}

/* ===================== العناية الواجبة (KYC/AML) ===================== */

export type RiskLevel = 'low' | 'medium' | 'high'

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  high: 'عالٍ',
}

// المؤشرات التحذيرية كما عدّدتها الوثيقة
export const RED_FLAGS = [
  'إصرار على الدفع نقداً',
  'الدفع من طرف ثالث',
  'عدم اهتمام بالنتيجة',
  'رفض تقديم مستندات',
  'شخص معرّض سياسياً',
  'هيكل ملكية معقّد',
  'دولة عالية المخاطر',
] as const

export interface KycCheck {
  id: string
  request_id: string | null
  client_type: 'individual' | 'company'
  id_type: string | null
  id_number: string | null
  id_verified: boolean
  capacity: 'principal' | 'agent' | null
  cr_number: string | null
  ubo_name: string | null
  ubo_id_number: string | null
  risk_level: RiskLevel
  edd_required: boolean
  edd_notes: string | null
  red_flags: string[]
  notes: string | null
  checked_by_name: string | null
  checked_at: string
}

export type KycInput = Omit<
  KycCheck,
  'id' | 'checked_at' | 'checked_by_name' | 'request_id'
>

export function useKycCheck(requestId: string | null) {
  return useQuery({
    queryKey: ['kyc_check', requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<KycCheck | null> => {
      const { data, error } = await supabase
        .from('kyc_checks')
        .select('*')
        .eq('request_id', requestId!)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data as KycCheck | null) ?? null
    },
  })
}

export function useSaveKycCheck() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async ({
      requestId,
      existingId,
      input,
    }: {
      requestId: string
      existingId?: string | null
      input: KycInput
    }) => {
      const row = {
        ...input,
        request_id: requestId,
        checked_by: teamMember?.id ?? null,
        checked_by_name: teamMember?.name ?? null,
        updated_at: new Date().toISOString(),
      }
      const { error } = existingId
        ? await supabase.from('kyc_checks').update(row).eq('id', existingId)
        : await supabase.from('kyc_checks').insert(row)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['kyc_check', v.requestId] })
      toast({ variant: 'success', title: 'حُفظت العناية الواجبة' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر الحفظ',
        description: errMessage(e),
      }),
  })
}

/* ===================== حال البوابات ===================== */

export interface GateState {
  conflict: ConflictCheck | null
  kyc: KycCheck | null
  /** البوابة الأولى في الوثيقة: لا فتح ملف دون فحص تعارض موثّق */
  canOpenMatter: boolean
  missing: string[]
}

export function useIntakeGates(requestId: string | null): GateState {
  const { data: checks } = useConflictChecks(requestId)
  const { data: kyc } = useKycCheck(requestId)
  const conflict = checks?.[0] ?? null

  const missing: string[] = []
  if (!conflict) missing.push('فحص تعارض المصالح')
  else if (conflict.outcome === 'reject') missing.push('التعارض انتهى بالرفض')
  if (!kyc) missing.push('العناية الواجبة (KYC)')
  else if (!kyc.id_verified) missing.push('التحقق من الهوية')

  return {
    conflict,
    kyc: kyc ?? null,
    canOpenMatter: missing.length === 0,
    missing,
  }
}

/* ============ الجلسة التمهيدية ← سجل الاستفسار ============ */
// الوثيقة تضع الجلسة التمهيدية بنداً في «الاستقطاب»، لا مرحلة مستقلة.
// الربط يمنع أن يبقى ما دار في اللقاء في الرأس أو في واتساب.

export interface LinkedAppointment {
  id: string
  appointment_date: string | null
  appointment_time: string | null
  status: string | null
  meeting_method: string | null
  notes: string | null
}

export function useRequestAppointments(requestId: string | null) {
  return useQuery({
    queryKey: ['request_appointments', requestId],
    enabled: !!requestId,
    queryFn: async (): Promise<LinkedAppointment[]> => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_time, status, meeting_method, notes')
        .eq('request_id', requestId!)
        .order('appointment_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as LinkedAppointment[]
    },
  })
}

/** ينشئ سجل استفسار من موعد قائم ويربطهما — بلا إعادة كتابة البيانات */
export function useCreateRequestFromAppointment() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (appt: {
      id: string
      client_id: string | null
      client_name: string | null
      client_phone: string | null
      notes: string | null
      appointment_date: string | null
    }): Promise<string> => {
      const { data, error } = await supabase
        .from('incoming_requests')
        .insert({
          client_name: appt.client_name,
          client_phone: appt.client_phone,
          request_type: 'consultation',
          received_at: appt.appointment_date,
          description: appt.notes,
          status: 'under_review',
          created_by: teamMember?.name ?? null,
        })
        .select('id')
        .single()
      if (error) throw error

      const requestId = (data as { id: string }).id
      const { error: linkErr } = await supabase
        .from('appointments')
        .update({ request_id: requestId })
        .eq('id', appt.id)
      if (linkErr) throw linkErr
      return requestId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['requests'] })
      qc.invalidateQueries({ queryKey: ['appointments'] })
      toast({ variant: 'success', title: 'أُنشئ سجل الاستفسار وربط بالموعد' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر إنشاء السجل',
        description: errMessage(e),
      }),
  })
}
