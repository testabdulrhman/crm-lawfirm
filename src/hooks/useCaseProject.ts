// بطاقة المشروع القانوني للقضية — الطبقة الإدارية (نطاق/مخرجات/افتراضات).
// مبنية على إطار LPA: المشروع القانوني ≠ الملف القضائي.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

export interface CaseProject {
  id: string
  case_id: string
  goal: string | null
  scope_in: string | null
  scope_out: string | null
  deliverables: string | null
  assumptions: string | null
  updated_by: string | null
  updated_at: string | null
  created_at: string | null
}

export type CaseProjectInput = Pick<
  CaseProject,
  'goal' | 'scope_in' | 'scope_out' | 'deliverables' | 'assumptions'
>

export function useCaseProject(caseId: string) {
  return useQuery({
    queryKey: ['case_project', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<CaseProject | null> => {
      const { data, error } = await supabase
        .from('case_projects')
        .select('*')
        .eq('case_id', caseId)
        .maybeSingle()
      if (error) throw error
      return (data as CaseProject) ?? null
    },
  })
}

export function useSaveCaseProject(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      input,
      updatedBy,
    }: {
      input: CaseProjectInput
      updatedBy: string | null
    }): Promise<void> => {
      const { error } = await supabase.from('case_projects').upsert(
        {
          case_id: caseId,
          ...input,
          updated_by: updatedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'case_id' }
      )
      if (error) throw error
    },
    onSuccess: () => {
      toast({ variant: 'success', title: 'حُفظت بطاقة المشروع' })
      // نُرجع الوعد فينتظره React Query قبل نداء onSuccess للمكوّن —
      // مسح المسودة قبل تحديث الكاش كان يرتدّ بالنص للقيمة القديمة
      return qc.invalidateQueries({ queryKey: ['case_project', caseId] })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ بطاقة المشروع',
        description: errMessage(e),
      }),
  })
}
