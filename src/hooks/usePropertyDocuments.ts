import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'

// مرفق توثيق عقاري (جدول property_documents)
export interface PropertyDocument {
  id: string
  transfer_id: string | null
  name: string
  file_url: string | null
  file_type: string | null
  file_size: number | null
  doc_type: string | null
  uploaded_by: string | null // اسم الرافع (العمود نصّي)
  created_at: string | null
  deleted_at: string | null
  deleted_by: string | null
}

// حدّ حجم الملف: 10 ميجابايت
export const MAX_DOC_SIZE = 10 * 1024 * 1024

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function usePropertyDocuments(transferId: string) {
  return useQuery({
    queryKey: ['property_documents', transferId],
    enabled: !!transferId,
    queryFn: async (): Promise<PropertyDocument[]> => {
      const { data, error } = await supabase
        .from('property_documents')
        .select('*')
        .eq('transfer_id', transferId)
        .is('deleted_at', null) // حذف ناعم
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PropertyDocument[]
    },
  })
}

export function useUploadPropertyDocument(transferId: string) {
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
        throw new Error('حجم الملف يتجاوز 10 ميجابايت. اختر ملفاً أصغر.')
      }
      // المسار: property/{transferId}/{timestamp}_{safeName}
      const { publicUrl } = await uploadFile(file, {
        folder: `property/${transferId}`,
      })
      const { error } = await supabase.from('property_documents').insert({
        transfer_id: transferId,
        name: file.name, // الاسم الأصلي للعرض
        file_url: publicUrl,
        file_type: file.type || null,
        file_size: file.size,
        uploaded_by: uploadedBy, // العمود نصّي → نخزّن اسم الرافع
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['property_documents', transferId] })
      toast({ variant: 'success', title: 'تم رفع المرفق' })
    },
    onError: errToast('تعذّر رفع المرفق'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeletePropertyDocument(transferId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      deletedBy,
    }: {
      id: string
      deletedBy: string | null // auth uid (العمود uuid)
    }): Promise<void> => {
      const { error } = await supabase
        .from('property_documents')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['property_documents', transferId] })
      toast({ variant: 'success', title: 'تم حذف المرفق (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف المرفق'),
  })
}
