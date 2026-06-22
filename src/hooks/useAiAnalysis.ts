import { useMutation } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

// نتيجة تحليل المتقدّم المحلَّلة (قد تكون null لو تعذّر تحليل JSON)
export interface ApplicantAnalysis {
  summary: string
  suggested_role: string
  strengths: string[]
  concerns: string[]
  fit_score: number
  recommendation: string
}

export interface AnalyzeResult {
  parsed: ApplicantAnalysis | null
  text: string
}

interface AnalyzeArgs {
  full_name?: string | null
  qualifications?: string | null
  email?: string | null
}

/**
 * تحليل متقدّم للتوظيف عبر دالة ai-assistant (Claude).
 * تحليل عند الطلب — لا يُخزَّن في قاعدة البيانات.
 */
export function useAnalyzeApplicant() {
  return useMutation({
    mutationFn: async (args: AnalyzeArgs): Promise<AnalyzeResult> => {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          task: 'analyze_applicant',
          payload: {
            full_name: args.full_name ?? '',
            qualifications: args.qualifications ?? '',
            email: args.email ?? '',
            // cv_text غير مُرسَل في هذه المرحلة (لا نستخرج نص PDF)
          },
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return {
        parsed: (data?.parsed ?? null) as ApplicantAnalysis | null,
        text: (data?.text ?? '') as string,
      }
    },
    onError: () =>
      toast({ variant: 'destructive', title: 'تعذّر التحليل، حاول مرة أخرى' }),
  })
}
