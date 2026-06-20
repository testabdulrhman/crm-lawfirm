import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { uploadFile } from '@/lib/files'
import { todayISO } from '@/lib/format'
import type { Memo, MemoDocument, MemoInput } from '@/types/db'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

function key(caseId: string) {
  return ['case_memos', caseId]
}

export function useCaseMemos(caseId: string) {
  return useQuery({
    queryKey: key(caseId),
    enabled: !!caseId,
    queryFn: async (): Promise<Memo[]> => {
      const { data, error } = await supabase
        .from('memos')
        .select('*, documents:memo_documents(*)')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      const memos = (data ?? []) as unknown as Memo[]
      // استبعاد المرفقات المحذوفة (حذف ناعم)
      for (const m of memos) {
        m.documents = (m.documents ?? []).filter(
          (d: MemoDocument) => !d.deleted_at
        )
      }
      return memos
    },
  })
}

export function useAddMemo(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MemoInput): Promise<void> => {
      const { error } = await supabase.from('memos').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تمت إضافة المذكرة' })
    },
    onError: errToast('تعذّرت إضافة المذكرة'),
  })
}

export function useUpdateMemo(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<MemoInput>
    }): Promise<void> => {
      const { error } = await supabase.from('memos').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم تحديث المذكرة' })
    },
    onError: errToast('تعذّر تحديث المذكرة'),
  })
}

export function useToggleMemoSubmitted(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      submitted,
    }: {
      id: string
      submitted: boolean
    }): Promise<void> => {
      const { error } = await supabase
        .from('memos')
        .update({
          is_submitted: submitted,
          submit_date: submitted ? todayISO() : null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
    },
    onError: errToast('تعذّر تحديث حالة التقديم'),
  })
}

export function useDeleteMemo(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('memos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم حذف المذكرة' })
    },
    onError: errToast('تعذّر حذف المذكرة'),
  })
}

/* ===== مرفقات المذكرة ===== */

export function useAddMemoDocument(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      memoId,
      file,
    }: {
      memoId: string
      file: File
    }): Promise<void> => {
      const { publicUrl } = await uploadFile(file, {
        folder: `memo_documents/${memoId}`,
      })
      const { error } = await supabase.from('memo_documents').insert({
        memo_id: memoId,
        name: file.name,
        file_url: publicUrl,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم رفع المرفق' })
    },
    onError: errToast('تعذّر رفع المرفق'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeleteMemoDocument(caseId: string) {
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
        .from('memo_documents')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم حذف المرفق (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف المرفق'),
  })
}
