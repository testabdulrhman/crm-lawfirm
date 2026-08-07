// مرفقات الخطاب الصادر (جدول outgoing_documents) — غير ملف الخطاب نفسه.
// نفس نمط مرفقات التوثيق العقاري: رفع متعدد + حذف ناعم.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'

export interface OutgoingDocument {
  id: string
  letter_id: string
  name: string
  file_url: string | null
  file_type: string | null
  file_size: number | null
  uploaded_by: string | null
  created_at: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export const MAX_DOC_SIZE = 10 * 1024 * 1024 // 10 ميجابايت

function key(letterId: string) {
  return ['outgoing_documents', letterId]
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

export function useOutgoingDocuments(letterId: string) {
  return useQuery({
    queryKey: key(letterId),
    enabled: !!letterId,
    queryFn: async (): Promise<OutgoingDocument[]> => {
      const { data, error } = await supabase
        .from('outgoing_documents')
        .select('*')
        .eq('letter_id', letterId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as OutgoingDocument[]
    },
  })
}

export function useUploadOutgoingDocument(letterId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      uploadedBy,
    }: {
      file: File
      uploadedBy: string | null
    }): Promise<void> => {
      if (file.size > MAX_DOC_SIZE) {
        throw new Error(
          `«${file.name}» حجمه يتجاوز 10 ميجابايت — اختر ملفاً أصغر.`
        )
      }
      const { publicUrl } = await uploadFile(file, {
        folder: `outgoing/${letterId}`,
      })
      const { error } = await supabase.from('outgoing_documents').insert({
        letter_id: letterId,
        name: file.name,
        file_url: publicUrl,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: uploadedBy,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(letterId) })
    },
    onError: errToast('تعذّر رفع المرفق'),
  })
}

// حذف ناعم — الملف يبقى في التخزين ويمكن استرجاعه
export function useDeleteOutgoingDocument(letterId: string) {
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
        .from('outgoing_documents')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(letterId) })
      toast({ variant: 'success', title: 'حُذف المرفق (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف المرفق'),
  })
}
