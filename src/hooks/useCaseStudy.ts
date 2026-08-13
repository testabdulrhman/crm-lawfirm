// دراسة القضية: قراءة/حفظ الأقسام + توليد بالذكاء عبر دالة case-study
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

export interface CaseStudy {
  id: string
  case_id: string
  basics: string | null
  timeline: string | null
  facts: string | null
  requests: string | null
  plaintiff_grounds: string | null
  defendant_defenses: string | null
  references_list: string | null
  legal_opinion: string | null
  suitability: string | null
  attachments_list: string | null
  status: string // draft/approved
  generated_at: string | null
  generated_by: string | null
  updated_at: string | null
  updated_by: string | null
  created_at: string | null
}

export type CaseStudyInput = Partial<
  Omit<CaseStudy, 'id' | 'case_id' | 'created_at'>
>

const KEY = 'case-study'

export function useCaseStudy(caseId: string) {
  return useQuery({
    queryKey: [KEY, caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_studies')
        .select('*')
        .eq('case_id', caseId)
        .maybeSingle()
      if (error) throw error
      return (data as CaseStudy | null) ?? null
    },
  })
}

export function useSaveCaseStudy(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CaseStudyInput) => {
      const { error } = await supabase
        .from('case_studies')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('case_id', caseId)
      if (error) throw error
    },
    onSuccess: () => {
      toast({ variant: 'success', title: 'حُفظت الدراسة' })
      // ننتظر تحديث الكاش قبل onSuccess المكوّن — يمنع ارتداد النص القديم
      return qc.invalidateQueries({ queryKey: [KEY, caseId] })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ الدراسة',
        description: errMessage(e),
      }),
  })
}

// التوليد يعمل في خلفية الخادم (قد يستغرق دقائق) — نطلقه ثم نتابع الصف حتى يكتمل
export function useGenerateCaseStudy(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userName: string | null) => {
      const startedAt = Date.now()
      const { data, error } = await supabase.functions.invoke('case-study', {
        body: { case_id: caseId, user_name: userName },
      })
      if (error) {
        let detail = errMessage(error)
        try {
          const ctx = await (error as { context?: Response }).context?.json()
          if (ctx?.error) detail = ctx.error
        } catch {
          /* نكتفي بالرسالة العامة */
        }
        throw new Error(detail)
      }
      if (data?.error) throw new Error(data.error)

      // متابعة كل 6 ثوانٍ حتى 7 دقائق
      for (let i = 0; i < 70; i++) {
        await new Promise((r) => setTimeout(r, 6000))
        const { data: row } = await supabase
          .from('case_studies')
          .select('*')
          .eq('case_id', caseId)
          .maybeSingle()
        const study = row as CaseStudy | null
        if (
          study?.generated_at &&
          new Date(study.generated_at).getTime() >= startedAt - 10000
        ) {
          return study
        }
      }
      throw new Error(
        'استغرق التوليد أطول من المتوقع — أعد فتح التبويب بعد قليل أو أعد المحاولة.'
      )
    },
    onSuccess: (study) => {
      qc.invalidateQueries({ queryKey: [KEY, caseId] })
      toast({
        title: 'اكتملت دراسة القضية',
        description: study.generated_by ?? undefined,
      })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر توليد الدراسة',
        description: errMessage(e),
      }),
  })
}
