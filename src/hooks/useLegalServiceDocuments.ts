import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { uploadFile } from '@/lib/files'
import { errMessage } from '@/lib/errors'

// مرفق استشارة/لائحة (جدول legal_service_documents — مرفقات متعددة)
export interface LegalServiceDocument {
  id: string
  service_id: string | null
  name: string
  file_url: string | null
  file_type: string | null
  file_size: number | null
  uploaded_by: string | null // auth uid (uuid)
  created_at: string | null
  deleted_at: string | null
  deleted_by: string | null
}

// حدّ حجم الملف: 10 ميجابايت
export const MAX_LS_DOC_SIZE = 10 * 1024 * 1024

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function useLegalServiceDocuments(serviceId: string) {
  return useQuery({
    queryKey: ['legal_service_documents', serviceId],
    enabled: !!serviceId,
    queryFn: async (): Promise<LegalServiceDocument[]> => {
      const { data, error } = await supabase
        .from('legal_service_documents')
        .select('*')
        .eq('service_id', serviceId)
        .is('deleted_at', null) // حذف ناعم
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as LegalServiceDocument[]
    },
  })
}

// رفع عدّة ملفات دفعة واحدة
export function useUploadLegalServiceDocuments(serviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      files,
      uploadedBy,
    }: {
      files: File[]
      uploadedBy: string | null
    }): Promise<void> => {
      for (const file of files) {
        if (file.size > MAX_LS_DOC_SIZE) {
          throw new Error(
            `«${file.name}» يتجاوز 10 ميجابايت. اختر ملفاً أصغر.`
          )
        }
        // المسار: legal_services/{serviceId}/{timestamp}_{safeName}
        const { publicUrl } = await uploadFile(file, {
          folder: `legal_services/${serviceId}`,
        })
        const { error } = await supabase.from('legal_service_documents').insert({
          service_id: serviceId,
          name: file.name, // الاسم الأصلي للعرض
          file_url: publicUrl,
          file_type: file.type || null,
          file_size: file.size,
          uploaded_by: uploadedBy, // auth uid
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['legal_service_documents', serviceId] })
      toast({ variant: 'success', title: 'تم رفع المرفقات' })
    },
    onError: errToast('تعذّر رفع المرفقات'),
  })
}

// حذف ناعم — للمدير فقط (يُفرض في الواجهة). لا يلمس Storage.
export function useDeleteLegalServiceDocument(serviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      deletedBy,
    }: {
      id: string
      deletedBy: string | null // auth uid (uuid)
    }): Promise<void> => {
      const { error } = await supabase
        .from('legal_service_documents')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['legal_service_documents', serviceId] })
      toast({ variant: 'success', title: 'تم حذف المرفق (يمكن استرجاعه)' })
    },
    onError: errToast('تعذّر حذف المرفق'),
  })
}
