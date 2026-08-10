import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

// نتيجة تحليل المتقدّم المحلَّلة (قد تكون null لو تعذّر تحليل JSON)
export interface ApplicantAnalysis {
  summary: string
  suggested_role: string
  strengths: string[]
  concerns: string[]
  gpa?: string | null
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
  // تمرير معرّف الطلب يجعل الخادم يحفظ النتيجة في staff_application_analysis
  application_id?: string
  analyzed_by?: string | null
  full_name?: string | null
  qualifications?: string | null
  email?: string | null
  cv_url?: string | null
}

// التحليل المحفوظ لطلب توظيف (من جدول staff_application_analysis)
export interface SavedAnalysis {
  application_id: string
  fit_score: number | null
  gpa: string | null
  experience_years: string | null
  suggested_role: string | null
  summary: string | null
  recommendation: string | null
  used_cv: boolean | null
  analyzed_at: string | null
  analyzed_by: string | null
}

export function useSavedApplicantAnalysis(applicationId: string | null) {
  return useQuery({
    queryKey: ['staff_application_analysis', applicationId],
    enabled: !!applicationId,
    queryFn: async (): Promise<SavedAnalysis | null> => {
      const { data, error } = await supabase
        .from('staff_application_analysis')
        .select('*')
        .eq('application_id', applicationId)
        .maybeSingle()
      if (error) throw error
      return (data as SavedAnalysis) ?? null
    },
  })
}

// كل التحليلات المحفوظة (لمعرفة من حُلّل — يستخدمها زر «تحليل الكل»)
export function useApplicantAnalyses() {
  return useQuery({
    queryKey: ['staff_application_analysis'],
    queryFn: async (): Promise<SavedAnalysis[]> => {
      const { data, error } = await supabase
        .from('staff_application_analysis')
        .select('*')
      if (error) throw error
      return (data ?? []) as SavedAnalysis[]
    },
  })
}

/**
 * تحليل متقدّم للتوظيف عبر دالة ai-assistant (Claude).
 * تحليل عند الطلب — لا يُخزَّن في قاعدة البيانات.
 */
export function useAnalyzeApplicant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: AnalyzeArgs): Promise<AnalyzeResult> => {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          task: 'analyze_applicant',
          payload: {
            application_id: args.application_id || undefined,
            analyzed_by: args.analyzed_by || undefined,
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['staff_application_analysis'] }),
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

// يقرأ محضر جلسة (PDF أو صورة) عبر رابطه ويُرجع ما تمّ + الخطوة القادمة.
//
// ⚠️ دالة مستقلة (extract-minutes) لا ai-assistant: الأخيرة سقفها 2000 رمزاً
//    يبتلع التفكيرُ الداخلي أكثرَها، فيُقطع الـJSON ويفشل تحليله فتُرجع null
//    وتصمت الشاشة. المستقلة سقفها أوسع وتُرجع سبب الفشل صراحةً.
export function useExtractSessionMinutes() {
  return useMutation({
    mutationFn: async (docUrl: string): Promise<SessionMinutesExtraction> => {
      const { data, error } = await supabase.functions.invoke('extract-minutes', {
        body: { doc_url: docUrl },
      })
      // أخطاء الدالة (422/400) تصل هنا كـ FunctionsHttpError بلا نصّها،
      // فنقرأ الرد الأصلي لنُظهر السبب الحقيقي للموظف.
      if (error) {
        let msg = ''
        try {
          const res = (error as { context?: Response }).context
          if (res) msg = (await res.clone().json())?.error ?? ''
        } catch {
          /* يبقى العام */
        }
        throw new Error(msg || 'تعذّر الاتصال بخدمة قراءة المحضر.')
      }
      if (data?.error) throw new Error(data.error)
      if (!data?.parsed) throw new Error('لم يُستخرج شيء من المحضر — املأ الحقول يدوياً.')
      return data.parsed as SessionMinutesExtraction
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّرت قراءة المحضر',
        description: errMessage(e),
      }),
  })
}
