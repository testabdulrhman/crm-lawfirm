import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { uploadFile } from '@/lib/files'
import type { CaseDocument, DocumentFolder, DocumentVersion } from '@/types/db'
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
      if (error) throw error
      // الترتيب بالتاريخ هو الأساس (طلب المستخدم 2026-08-25): ما لا تاريخ له
      // يأخذ تاريخ رفعه بدل أن يهبط آخر القائمة مهما كان حديثاً — فتبقى
      // القائمة زمنية متصلة بلا مستندات شاردة في الذيل.
      const dateOf = (d: CaseDocument) =>
        (d.document_date ?? d.created_at ?? '').slice(0, 10)
      return ((data ?? []) as CaseDocument[]).sort((a, b) => {
        const c = dateOf(b).localeCompare(dateOf(a))
        return c !== 0 ? c : (b.created_at ?? '').localeCompare(a.created_at ?? '')
      })
    },
  })
}

export interface AddDocumentArgs {
  file: File
  name?: string | null
  documentDate?: string | null
  description?: string | null
  uploadedByName: string | null
  /** يُرفع داخل المجلد المفتوح — null = بلا مجلد (والترقر قد يضعه في مجلد تصنيفه) */
  folderId?: string | null
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
    folder_id: args.folderId ?? null,
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

/* ===================== المجلدات (2026-10-11 — «مثل Google Drive») ===================== */

const invalidateDocs = (qc: ReturnType<typeof useQueryClient>, caseId: string) => {
  qc.invalidateQueries({ queryKey: ['case_documents', caseId] })
  qc.invalidateQueries({ queryKey: ['document_folders', caseId] })
  qc.invalidateQueries({ queryKey: ['document_versions', caseId] })
}

export function useDocumentFolders(caseId: string) {
  return useQuery({
    queryKey: ['document_folders', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<DocumentFolder[]> => {
      const { data, error } = await supabase
        .from('document_folders')
        .select('id, case_id, parent_id, name, sort_order, created_at')
        .eq('case_id', caseId)
        .is('deleted_at', null)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as DocumentFolder[]
    },
  })
}

/** إنشاء مجلد (id غائب) أو إعادة تسميته — بلا returning (لقطة ما قبل الإدراج ترفضها RLS لغير المدير) */
export function useSaveFolder(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id?: string; name: string; parentId?: string | null }) => {
      const name = args.name.trim()
      if (!name) throw new Error('اكتب اسم المجلد')
      if (args.id) {
        const { error } = await supabase.from('document_folders').update({ name }).eq('id', args.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('document_folders')
          .insert({ case_id: caseId, name, parent_id: args.parentId ?? null, sort_order: 100 })
        if (error) throw error
      }
    },
    onSuccess: (_d, args) => {
      invalidateDocs(qc, caseId)
      toast({ variant: 'success', title: args.id ? 'أُعيدت تسمية المجلد' : 'أُنشئ المجلد' })
    },
    onError: errToast('تعذّر حفظ المجلد'),
  })
}

/** حذف مجلد: محتواه (ملفات ومجلدات) يصعد للمجلد الأعلى — لا يُحذف أي ملف */
export function useDeleteFolder(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_document_folder', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateDocs(qc, caseId)
      toast({ variant: 'success', title: 'حُذف المجلد — محتواه انتقل للمجلد الأعلى' })
    },
    onError: errToast('تعذّر حذف المجلد'),
  })
}

/** نقل مستندات إلى مجلد في الملف نفسه، أو إلى ملف آخر (يصل بلا مجلد والترقر يضعه في مجلد تصنيفه) */
export function useMoveDocuments(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { ids: string[]; folderId: string | null; targetCaseId?: string }) => {
      if (args.ids.length === 0) return
      const patch: Record<string, unknown> =
        args.targetCaseId && args.targetCaseId !== caseId
          ? { case_id: args.targetCaseId, folder_id: null }
          : { folder_id: args.folderId }
      const { error } = await supabase.from('documents').update(patch).in('id', args.ids)
      if (error) throw error
    },
    onSuccess: (_d, args) => {
      invalidateDocs(qc, caseId)
      if (args.targetCaseId) invalidateDocs(qc, args.targetCaseId)
      toast({
        variant: 'success',
        title: args.ids.length > 1 ? `نُقل ${fmtCount(args.ids.length)}` : 'نُقل المستند',
      })
    },
    onError: errToast('تعذّر نقل المستند'),
  })
}

const fmtCount = (n: number) => (n === 2 ? 'مستندان' : `${n} مستندات`)

export function useRenameDocument(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; name: string }) => {
      const name = args.name.trim()
      if (!name) throw new Error('اكتب اسم المستند')
      const { error } = await supabase.from('documents').update({ name }).eq('id', args.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateDocs(qc, caseId)
      toast({ variant: 'success', title: 'أُعيدت التسمية' })
    },
    onError: errToast('تعذّرت إعادة التسمية'),
  })
}

/** استبدال الملف: الجديد يأخذ مكانه في الصف نفسه، والقديم يُحفظ في سجل النسخ */
export function useReplaceDocumentFile(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; file: File; by: string | null }) => {
      const { publicUrl, path } = await uploadFile(args.file, { folder: `case_documents/${caseId}` })
      const { error } = await supabase.rpc('replace_document_file', {
        p_doc: args.id,
        p_file_url: publicUrl,
        p_file_path: path,
        p_file_type: args.file.type || null,
        p_file_size: args.file.size,
        p_by: args.by,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateDocs(qc, caseId)
      toast({ variant: 'success', title: 'استُبدل الملف — النسخة السابقة محفوظة في سجل النسخ' })
    },
    onError: errToast('تعذّر استبدال الملف'),
  })
}

/** النسخ السابقة لمستندات الملف — مجمّعة حسب المستند */
export function useDocumentVersions(caseId: string, docIds: string[]) {
  const ids = [...docIds].sort()
  return useQuery({
    queryKey: ['document_versions', caseId, ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, DocumentVersion[]>> => {
      const { data, error } = await supabase
        .from('document_versions')
        .select('id, document_id, name, file_url, file_type, file_size, uploaded_by_name, replaced_at, replaced_by_name')
        .in('document_id', ids)
        .order('replaced_at', { ascending: false })
      if (error) throw error
      const out: Record<string, DocumentVersion[]> = {}
      for (const v of (data ?? []) as DocumentVersion[]) (out[v.document_id] ??= []).push(v)
      return out
    },
  })
}

/** ملفات للنقل إليها — بحث برقم المكتب أو العنوان */
export function useMatterSearch(q: string) {
  const term = q.replace(/[,()%]/g, ' ').trim()
  return useQuery({
    queryKey: ['matter_search_docs', term],
    enabled: term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cases')
        .select('id, office_num, title, kind')
        .in('kind', ['case', 'legal_service', 'property', 'bankruptcy'])
        .is('deleted_at', null)
        .or(`office_num.ilike.%${term}%,title.ilike.%${term}%`)
        .limit(8)
      if (error) throw error
      return (data ?? []) as { id: string; office_num: string | null; title: string | null; kind: string }[]
    },
  })
}
