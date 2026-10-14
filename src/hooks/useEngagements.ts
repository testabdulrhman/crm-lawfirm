// وحدة العقود (اتفاقيات الأتعاب): العقد ← الموكّل ← المشاريع (قضايا/خدمات).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import type { Engagement, EngagementInput, EngagementInstallment } from '@/types/db'

const SELECT = '*, client:contacts(id,name,phone)'
const KEY = 'engagements'

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [KEY] })
}

export function useEngagements() {
  return useQuery({
    queryKey: [KEY],
    queryFn: async (): Promise<Engagement[]> => {
      const { data, error } = await supabase
        .from('engagements')
        .select(SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Engagement[]
    },
  })
}

export function useEngagement(id: string | null) {
  return useQuery({
    queryKey: [KEY, 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<Engagement> => {
      const { data, error } = await supabase
        .from('engagements')
        .select(SELECT)
        .eq('id', id)
        .single()
      if (error) throw error
      return data as unknown as Engagement
    },
  })
}

// المشاريع المرتبطة بالعقد (قضايا + خدمات)
export function useEngagementProjects(engagementId: string | null) {
  return useQuery({
    queryKey: [KEY, 'projects', engagementId],
    enabled: !!engagementId,
    queryFn: async () => {
      const [cases, services] = await Promise.all([
        supabase
          .from('cases')
          .select('id, title, office_num, status')
          .eq('kind', 'case') // الاستشارات تأتي من فرعها — وإلا تكررت
          .eq('engagement_id', engagementId)
          .order('created_at', { ascending: false }),
        supabase
          .from('legal_services')
          .select('id, title, type, status')
          .eq('engagement_id', engagementId)
          .order('created_at', { ascending: false }),
      ])
      if (cases.error) throw cases.error
      if (services.error) throw services.error
      return {
        cases: cases.data ?? [],
        services: services.data ?? [],
      }
    },
  })
}

export function useCreateEngagement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EngagementInput): Promise<Engagement> => {
      const { data, error } = await supabase
        .from('engagements')
        .insert(input)
        .select(SELECT)
        .single()
      if (error) throw error
      return data as unknown as Engagement
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'أُضيف العقد' })
    },
    onError: errToast('تعذّرت إضافة العقد'),
  })
}

export function useUpdateEngagement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<EngagementInput>
    }): Promise<void> => {
      const { error } = await supabase
        .from('engagements')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidate(qc)
      qc.invalidateQueries({ queryKey: [KEY, 'detail', vars.id] })
      toast({ variant: 'success', title: 'تم تحديث العقد' })
    },
    onError: errToast('تعذّر تحديث العقد'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة)
export function useDeleteEngagement() {
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
        .from('engagements')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate(qc)
      toast({ variant: 'success', title: 'حُذف العقد (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف العقد'),
  })
}

// ربط/فك قضية بالعقد (العمود الإضافي على cases)
export function useLinkCaseToEngagement(engagementId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      caseId,
      link,
    }: {
      caseId: string
      link: boolean
    }): Promise<void> => {
      const { error } = await supabase
        .from('cases')
        .update({ engagement_id: link ? engagementId : null })
        .eq('id', caseId)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: [KEY, 'projects', engagementId] })
      qc.invalidateQueries({ queryKey: ['cases'] })
      qc.invalidateQueries({ queryKey: ['case', vars.caseId] })
      toast({
        variant: 'success',
        title: vars.link ? 'رُبطت القضية بالعقد' : 'فُكّ ربط القضية',
      })
    },
    onError: errToast('تعذّر تحديث الربط'),
  })
}

/* ===================== الدفعات (2026-10-14) — للمدير وحده كبقية المال ===================== */

const INST = 'engagement_installments'

export function useInstallments(engagementId: string | null) {
  return useQuery({
    queryKey: [INST, engagementId],
    enabled: !!engagementId,
    queryFn: async (): Promise<EngagementInstallment[]> => {
      const { data, error } = await supabase
        .from('engagement_installments')
        .select('*')
        .eq('engagement_id', engagementId!)
        .order('seq')
      if (error) throw error
      return (data ?? []) as EngagementInstallment[]
    },
  })
}

/** كل الدفعات — لملخص التحصيل في صفحة العقود */
export function useAllInstallments() {
  return useQuery({
    queryKey: [INST, 'all'],
    queryFn: async (): Promise<EngagementInstallment[]> => {
      const { data, error } = await supabase.from('engagement_installments').select('*').order('seq')
      if (error) throw error
      return (data ?? []) as EngagementInstallment[]
    },
  })
}

export function useSaveInstallment(engagementId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Partial<EngagementInstallment> & { id?: string }) => {
      const { id, ...row } = v
      const payload = { ...row, engagement_id: engagementId, updated_at: new Date().toISOString() }
      const { error } = id
        ? await supabase.from('engagement_installments').update(payload).eq('id', id)
        : await supabase.from('engagement_installments').insert(payload)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [INST] })
      toast({ variant: 'success', title: 'حُفظت الدفعة' })
    },
    onError: errToast('تعذّر حفظ الدفعة'),
  })
}

export function useDeleteInstallment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('engagement_installments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [INST] })
      toast({ variant: 'success', title: 'حُذفت الدفعة' })
    },
    onError: errToast('تعذّر حذف الدفعة'),
  })
}
