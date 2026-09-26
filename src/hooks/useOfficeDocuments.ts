// مستندات المكتب (2026-09-26): تراخيصه وشهاداته الرسمية بتواريخ انتهائها.
// الرفع يمرّ بدالة office-doc-extract التي تقرأ الملف وتقترح بياناته ومطابقته بمستند مسجّل —
// ولا يُحفظ شيء قبل أن يراجعه الموظف.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'

export type OfficeDocCategory = 'license' | 'certificate' | 'registration' | 'membership' | 'contract' | 'other'

export const OFFICE_DOC_CATEGORY_LABELS: Record<OfficeDocCategory, string> = {
  license: 'ترخيص',
  certificate: 'شهادة',
  registration: 'سجل وقيد',
  membership: 'عضوية',
  contract: 'عقد',
  other: 'أخرى',
}

export interface OfficeDocument {
  id: string
  name: string
  type: string | null
  doc_number: string | null
  issuing_authority: string | null
  issue_date: string | null
  expiry_date: string | null
  file_url: string | null
  file_name: string | null
  notes: string | null
  status: string | null
  ai_extracted: boolean
  created_at: string
  updated_at: string | null
}

export interface OfficeDocExtraction {
  name: string
  category: OfficeDocCategory
  doc_number: string | null
  issuing_authority: string | null
  issue_date: string | null
  expiry_date: string | null
  hijri_note: string | null
  summary: string
  match_id: string | null
  confidence: 'high' | 'medium' | 'low'
}

export type OfficeDocInput = Pick<
  OfficeDocument,
  'name' | 'type' | 'doc_number' | 'issuing_authority' | 'issue_date' | 'expiry_date' | 'notes'
> & { file_url?: string | null; file_name?: string | null; ai_extracted?: boolean }

const KEY = ['office_documents']

export function useOfficeDocuments() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<OfficeDocument[]> => {
      const { data, error } = await supabase.from('office_documents').select('*').order('name')
      if (error) throw error
      return (data ?? []) as OfficeDocument[]
    },
  })
}

/** يرفع الملف لمجلد office/ ثم يطلب قراءته — يُرجع المسار والرابط والاقتراح */
export async function uploadAndExtract(file: File): Promise<{
  file_url: string
  file_name: string
  extraction: OfficeDocExtraction | null
  error: string | null
}> {
  const { path, publicUrl } = await uploadFile(file, { folder: 'office' })
  const { data, error } = await supabase.functions.invoke('office-doc-extract', { body: { file_path: path } })
  // فشل القراءة لا يُضيّع الرفع: يُفتح النموذج فارغاً والملف مرفق
  let reason: string | null = null
  if (error) {
    reason = errMessage(error) ?? 'تعذّرت قراءة الملف'
    try {
      const body = await (error as { context?: Response }).context?.json?.()
      if (body?.error) reason = body.error
    } catch {
      /* السبب العام يكفي */
    }
  } else if (data?.error) reason = data.error
  return {
    file_url: publicUrl,
    file_name: file.name,
    extraction: (data?.result as OfficeDocExtraction) ?? null,
    error: reason,
  }
}

export function useSaveOfficeDoc() {
  const qc = useQueryClient()
  const myId = useAuth((s) => s.teamMember?.id ?? null)
  return useMutation({
    mutationFn: async (v: { id: string | null; input: OfficeDocInput }) => {
      if (v.id) {
        const { data, error } = await supabase.from('office_documents').update(v.input).eq('id', v.id).select('id')
        if (error) throw error
        if (!data?.length) throw new Error('لم يُحفظ — لا صلاحية أو المستند محذوف')
      } else {
        const { error } = await supabase
          .from('office_documents')
          .insert({ ...v.input, status: 'active', created_by: myId })
        if (error) throw error
      }
    },
    onSuccess: (_d, v) => {
      toast({ title: v.id ? 'حُدّث المستند' : 'أُضيف المستند' })
      return qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر حفظ المستند', description: errMessage(e) }),
  })
}

export function useDeleteOfficeDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('office_documents').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('الحذف للمدير وحده')
    },
    onSuccess: () => {
      toast({ title: 'حُذف المستند' })
      return qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر الحذف', description: errMessage(e) }),
  })
}
