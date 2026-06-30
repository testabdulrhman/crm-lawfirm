import { useMutation } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'

// نتيجة تحليل المتقدّم المحلَّلة (قد تكون null لو تعذّر تحليل JSON)
export interface ApplicantAnalysis {
  summary: string
  suggested_role: string
  strengths: string[]
  concerns: string[]
  experience_years?: string | null
  fit_score: number
  recommendation: string
}

export interface AnalyzeResult {
  parsed: ApplicantAnalysis | null
  text: string
  used_cv: boolean
}

interface AnalyzeArgs {
  full_name?: string | null
  qualifications?: string | null
  email?: string | null
  cv_url?: string | null
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
            cv_url: args.cv_url || undefined, // يُرسل فقط إن وُجدت سيرة ذاتية
          },
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return {
        parsed: (data?.parsed ?? null) as ApplicantAnalysis | null,
        text: (data?.text ?? '') as string,
        used_cv: !!data?.used_cv,
      }
    },
    onError: () =>
      toast({ variant: 'destructive', title: 'تعذّر التحليل، حاول مرة أخرى' }),
  })
}

/* ===================== استخراج بيانات الحكم من الصك ===================== */

export interface RulingExtraction {
  title: string | null
  ruling_number: string | null
  ruling_date: string | null // ميلادي YYYY-MM-DD (تحويل تقريبي من الهجري)
  ruling_date_hijri: string | null
  court_name: string | null
  result: string | null
  summary: string | null
}

// يقرأ صك/حكم (PDF أو صورة) عبر رابطه ويُرجع الحقول المستخرَجة (أو null).
export function useExtractRuling() {
  return useMutation({
    mutationFn: async (docUrl: string): Promise<RulingExtraction | null> => {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { task: 'extract_ruling', payload: { doc_url: docUrl } },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return (data?.parsed ?? null) as RulingExtraction | null
    },
    onError: () =>
      toast({ variant: 'destructive', title: 'تعذّر قراءة الصك، حاول مرة أخرى' }),
  })
}

/* ===================== استخراج بيانات الجلسة من المحضر ===================== */

export interface SessionMinutesExtraction {
  session_number: number | null
  outcome: string | null
  next_action: 'none' | 'next_session' | 'await_ruling' | 'case_closed' | null
  next_session_date: string | null // ميلادي YYYY-MM-DD
  next_session_time: string | null // HH:MM
  ruling_due_date: string | null // ميلادي YYYY-MM-DD
  hijri_note: string | null
}

// يقرأ محضر جلسة (PDF أو صورة) عبر رابطه ويُرجع ما تمّ + الخطوة القادمة (أو null).
export function useExtractSessionMinutes() {
  return useMutation({
    mutationFn: async (
      docUrl: string
    ): Promise<SessionMinutesExtraction | null> => {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { task: 'extract_session_minutes', payload: { doc_url: docUrl } },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return (data?.parsed ?? null) as SessionMinutesExtraction | null
    },
    onError: () =>
      toast({ variant: 'destructive', title: 'تعذّر قراءة المحضر، حاول مرة أخرى' }),
  })
}
