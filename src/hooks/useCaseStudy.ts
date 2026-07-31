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
      qc.invalidateQueries({ queryKey: [KEY, caseId] })
      toast({ variant: 'success', title: 'حُفظت الدراسة' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ الدراسة',
        description: errMessage(e),
      }),
  })
}

export function useGenerateCaseStudy(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userName: string | null) => {
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
      return data as { study: CaseStudy; read_docs: string[] }
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: [KEY, caseId] })
      toast({
        title: 'اكتملت دراسة القضية',
        description:
          d.read_docs.length > 0
            ? `قرأ الذكاء ${d.read_docs.length} مستند من ملف القضية.`
            : 'وُلّدت من بيانات النظام (لا مستندات PDF مقروءة).',
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
