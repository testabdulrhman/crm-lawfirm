import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { uploadFile } from '@/lib/files'
import type { CaseDocument } from '@/types/db'
import { errMessage } from '@/lib/errors'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function useCaseDocuments(caseId: string) {
  return useQuery({
    queryKey: ['case_documents', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<CaseDocument[]> => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('case_id', caseId)
        .is('deleted_at', null) // حذف ناعم
        .order('document_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as CaseDocument[]
    },
  })
}

export interface AddDocumentArgs {
  file: File
  name?: string | null
  documentDate?: string | null
  description?: string | null
  uploadedByName: string | null
}

/**
 * الرفع الفعلي: التخزين ثم صف القاعدة. بلا toasts — النداء المباشر يخدم رفع
 * الدفعات حيث يُجمع مصير كل ملف في تقرير دائم بدل رسائل تختفي.
 * ⚠️ الملف لا يُعد «في النظام» إلا بعد نجاح **الخطوتين**: رفعٌ للتخزين نجح
 *    وفشل الإدراج بعده = ملف يتيم لا يظهر في أي شاشة.
 */
export async function addDocumentDirect(
  caseId: string,
  args: AddDocumentArgs
): Promise<void> {
  const { publicUrl, path } = await uploadFile(args.file, {
    folder: `case_documents/${caseId}`,
  })
  const { error } = await supabase.from('documents').insert({
    case_id: caseId,
    name: args.name?.trim() || args.file.name,
    file_url: publicUrl,
    file_path: path,
    file_type: args.file.type || null,
    file_size: args.file.size,
    document_date: args.documentDate || null,
    description: args.description?.trim() || null,
    uploaded_by_name: args.uploadedByName,
  })
  if (error) throw error
}

export function useAddDocument(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: AddDocumentArgs) => addDocumentDirect(caseId, args),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_documents', caseId] })
      toast({ variant: 'success', title: 'تم رفع المستند' })
    },
    onError: errToast('تعذّر رفع المستند'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeleteDocument(caseId: string) {
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
        .from('documents')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_documents', caseId] })
      toast({ variant: 'success', title: 'تم حذف المستند (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف المستند'),
  })
}
