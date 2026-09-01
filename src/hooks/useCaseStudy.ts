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
  // v2 — الدراسة الحيّة
  version: number
  what_changed: string | null
  precedents: string | null
  statutes: string | null
  stale_since: string | null
  stale_reasons: StudyStaleReason[]
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

/* ===================== v2: الدراسة الحيّة — نسخ، مقترحات، ملخص الجلسة ===================== */

export interface StudyStaleReason {
  kind: string
  at: string
  text: string
}

export interface CaseStudyVersion {
  id: string
  case_id: string
  version: number
  snapshot: Record<string, unknown>
  reason: string | null
  created_at: string
}

export interface StudyProposal {
  id: string
  case_id: string
  study_version: number
  kind: 'task' | 'risk' | 'question'
  title: string
  detail: string | null
  due_date: string | null
  priority: string | null
  status: 'proposed' | 'accepted' | 'dismissed'
  accepted_task_id: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

export interface SessionBrief {
  id: string
  session_id: string
  case_id: string
  brief: string
  generated_at: string
  generated_by: string | null
  notified_at: string | null
}

export function useStudyVersions(caseId: string) {
  return useQuery({
    queryKey: [KEY, 'versions', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_study_versions')
        .select('*')
        .eq('case_id', caseId)
        .order('version', { ascending: false })
      if (error) throw error
      return (data ?? []) as CaseStudyVersion[]
    },
  })
}

export function useStudyProposals(caseId: string) {
  return useQuery({
    queryKey: [KEY, 'proposals', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_study_proposals')
        .select('*')
        .eq('case_id', caseId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as StudyProposal[]
    },
  })
}

// اعتماد مقترح: المهمة تُنشأ فعلاً على الملف ثم يُختم المقترح بها — القراءة صارت عملاً
export function useDecideProposal(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      proposal: StudyProposal
      decision: 'accepted' | 'dismissed'
      by: string | null
      assigneeId?: string | null
    }) => {
      const { proposal: p, decision, by, assigneeId } = args
      let taskId: string | null = null
      if (decision === 'accepted' && p.kind !== 'question') {
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            case_id: caseId,
            title: p.title,
            description: p.detail
              ? `${p.detail}\n\n— من دراسة القضية (نسخة ${p.study_version})`
              : `— من دراسة القضية (نسخة ${p.study_version})`,
            due_date: p.due_date,
            priority: p.priority,
            is_urgent: p.kind === 'risk',
            status: 'todo',
            assignee_id: assigneeId ?? null,
            created_by: by,
          })
          .select('id')
          .single()
        if (error) throw error
        taskId = data.id
      }
      const { error } = await supabase
        .from('case_study_proposals')
        .update({
          status: decision,
          accepted_task_id: taskId,
          decided_by: by,
          decided_at: new Date().toISOString(),
        })
        .eq('id', p.id)
      if (error) throw error
      return decision
    },
    onSuccess: (decision) => {
      qc.invalidateQueries({ queryKey: [KEY, 'proposals', caseId] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['case_tasks', caseId] })
      toast({
        variant: 'success',
        title: decision === 'accepted' ? 'اعتُمد المقترح وأُنشئت مهمته' : 'صُرف النظر عن المقترح',
      })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر تسجيل القرار', description: errMessage(e) }),
  })
}

// مسودة مذكرة من قسم الدفوع/الأسانيد — تُحفظ في تبويب المذكرات ليكملها المحامي
export function useDraftMemoFromStudy(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { side: 'plaintiff' | 'defendant'; text: string; title: string }) => {
      const { error } = await supabase.from('memos').insert({
        case_id: caseId,
        title: args.title,
        description: args.text,
        memo_type: 'مسودة من دراسة القضية',
        party_side: args.side,
        is_submitted: false,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['memos', caseId] })
      qc.invalidateQueries({ queryKey: ['case_memos', caseId] })
      toast({ variant: 'success', title: 'أُنشئت مسودة المذكرة في تبويب المذكرات' })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر إنشاء المسودة', description: errMessage(e) }),
  })
}

export function useSessionBrief(sessionId: string | null) {
  return useQuery({
    queryKey: ['session-brief', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_briefs')
        .select('*')
        .eq('session_id', sessionId!)
        .maybeSingle()
      if (error) throw error
      return (data as SessionBrief | null) ?? null
    },
  })
}

export function useSessionBriefs(caseId: string) {
  return useQuery({
    queryKey: ['session-briefs', caseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('session_briefs')
        .select('*')
        .eq('case_id', caseId)
      if (error) throw error
      return (data ?? []) as SessionBrief[]
    },
  })
}

export function useGenerateSessionBrief() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { sessionId: string; caseId: string; userName: string | null; force?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('session-brief', {
        body: { session_id: args.sessionId, user_name: args.userName, force: !!args.force },
      })
      if (error || data?.error) throw new Error(data?.detail || data?.error || errMessage(error))
      return args
    },
    onSuccess: (args) => {
      qc.invalidateQueries({ queryKey: ['session-brief', args.sessionId] })
      qc.invalidateQueries({ queryKey: ['session-briefs', args.caseId] })
      toast({ variant: 'success', title: 'جهز ملخص ما قبل الجلسة' })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر إعداد الملخص', description: errMessage(e) }),
  })
}
