import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { uploadFile } from '@/lib/files'
import { todayISO } from '@/lib/format'
import type {
  IncomingRequest,
  IncomingRequestInput,
  RequestDocument,
  RequestEvaluation,
  RequestEvaluationInput,
  RequestStatus,
} from '@/types/db'

const LIST_KEY = 'incoming_requests'
const PENDING_KEY = ['incoming_requests', 'pending_count'] as const

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [LIST_KEY] })
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

/* ===================== القائمة ===================== */

export function useRequests(filter: RequestStatus | 'all' = 'all') {
  return useQuery({
    queryKey: [LIST_KEY, filter],
    queryFn: async (): Promise<IncomingRequest[]> => {
      let q = supabase
        .from('incoming_requests')
        .select('*')
        .order('received_at', { ascending: false })
        .order('created_at', { ascending: false })
      if (filter !== 'all') q = q.eq('status', filter)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as IncomingRequest[]
    },
  })
}

// عدّاد «قيد الدراسة» للـ Sidebar
export function usePendingRequestsCount() {
  return useQuery({
    queryKey: PENDING_KEY,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('incoming_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'under_review')
      if (error) throw error
      return count ?? 0
    },
  })
}

/* ===================== طلب واحد + علاقاته ===================== */

export interface RequestDetailData {
  request: IncomingRequest
  evaluations: RequestEvaluation[]
  documents: RequestDocument[]
}

export function useRequest(id: string | null) {
  return useQuery({
    queryKey: [LIST_KEY, 'detail', id],
    enabled: !!id,
    queryFn: async (): Promise<RequestDetailData> => {
      const [reqRes, evalRes, docRes] = await Promise.all([
        supabase.from('incoming_requests').select('*').eq('id', id).single(),
        supabase
          .from('request_evaluations')
          .select('*')
          .eq('request_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('request_documents')
          .select('*')
          .eq('request_id', id)
          .is('deleted_at', null) // استبعاد المحذوفة (حذف ناعم)
          .order('created_at', { ascending: false }),
      ])
      if (reqRes.error) throw reqRes.error
      if (evalRes.error) throw evalRes.error
      if (docRes.error) throw docRes.error
      return {
        request: reqRes.data as IncomingRequest,
        evaluations: (evalRes.data ?? []) as RequestEvaluation[],
        documents: (docRes.data ?? []) as RequestDocument[],
      }
    },
  })
}

/* ===================== طلب: إضافة/تعديل ===================== */

export function useCreateRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: IncomingRequestInput
    ): Promise<IncomingRequest> => {
      const payload: IncomingRequestInput = {
        status: 'under_review',
        received_at: input.received_at || todayISO(),
        ...input,
      }
      const { data, error } = await supabase
        .from('incoming_requests')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as IncomingRequest
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تمت إضافة الطلب' })
    },
    onError: errToast('تعذّرت إضافة الطلب'),
  })
}

export function useUpdateRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<IncomingRequestInput>
    }): Promise<IncomingRequest> => {
      const { data, error } = await supabase
        .from('incoming_requests')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as IncomingRequest
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تم تحديث الطلب' })
    },
    onError: errToast('تعذّر تحديث الطلب'),
  })
}

/* ===================== الإسناد ===================== */

export function useAssignRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      assignedToId,
      assignedToName,
    }: {
      id: string
      assignedToId: string
      assignedToName: string
    }): Promise<void> => {
      const { error } = await supabase
        .from('incoming_requests')
        .update({
          assigned_to_id: assignedToId,
          assigned_to_name: assignedToName,
          assigned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تم إسناد الطلب' })
    },
    onError: errToast('تعذّر إسناد الطلب'),
  })
}

/* ===================== القرار ===================== */

export function useDecideRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      decisionBy,
      rejectionReason,
    }: {
      id: string
      status: Extract<RequestStatus, 'accepted' | 'rejected' | 'deferred'>
      decisionBy: string
      rejectionReason?: string | null
    }): Promise<void> => {
      const { error } = await supabase
        .from('incoming_requests')
        .update({
          status,
          decision_at: todayISO(),
          decision_by: decisionBy,
          rejection_reason: status === 'rejected' ? rejectionReason ?? null : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      invalidateAll(qc)
      const label =
        vars.status === 'accepted'
          ? 'قُبِل الطلب'
          : vars.status === 'rejected'
            ? 'رُفِض الطلب'
            : 'أُجّل الطلب'
      toast({ variant: 'success', title: label })
    },
    onError: errToast('تعذّر تسجيل القرار'),
  })
}

/* ===================== التقييمات ===================== */

export function useAddEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RequestEvaluationInput): Promise<void> => {
      const { error } = await supabase
        .from('request_evaluations')
        .insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تمت إضافة التقييم' })
    },
    onError: errToast('تعذّرت إضافة التقييم'),
  })
}

export function useUpdateEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<RequestEvaluationInput>
    }): Promise<void> => {
      const { error } = await supabase
        .from('request_evaluations')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تم تحديث التقييم' })
    },
    onError: errToast('تعذّر تحديث التقييم'),
  })
}

export function useDeleteEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase
        .from('request_evaluations')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تم حذف التقييم' })
    },
    onError: errToast('تعذّر حذف التقييم'),
  })
}

/* ===================== المرفقات ===================== */

export function useAddRequestDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      requestId,
      file,
    }: {
      requestId: string
      file: File
    }): Promise<void> => {
      // رفع إلى Supabase Storage ثم تسجيل صف
      const { publicUrl } = await uploadFile(file, {
        folder: 'request_documents',
      })
      const { error } = await supabase.from('request_documents').insert({
        request_id: requestId,
        name: file.name,
        file_url: publicUrl,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تم رفع المرفق' })
    },
    onError: errToast('تعذّر رفع المرفق'),
  })
}

// حذف ناعم: نضبط deleted_at/deleted_by فقط، ولا نلمس Storage إطلاقاً.
export function useDeleteRequestDocument() {
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
        .from('request_documents')
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: deletedBy,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateAll(qc)
      toast({ variant: 'success', title: 'تم حذف المرفق (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف المرفق'),
  })
}
