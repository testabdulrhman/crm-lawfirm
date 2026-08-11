// قوالب العقود: رفع ملف .docx، اكتشاف متغيراته، ثم التوليد منه عند الحاجة.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { uploadFile } from '@/lib/files'
import { scanPlaceholders, suggestLabel } from '@/lib/docxTemplate'

const KEY = 'contract_templates'

export interface TemplatePlaceholder {
  key: string
  label: string
}

export interface ContractTemplate {
  id: string
  name: string
  description: string | null
  file_url: string
  file_name: string | null
  placeholders: TemplatePlaceholder[]
  is_active: boolean
  sort_order: number
  created_by: string | null
  created_at: string | null
}

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

export function useContractTemplates(includeInactive = false) {
  return useQuery({
    queryKey: [KEY, includeInactive],
    queryFn: async (): Promise<ContractTemplate[]> => {
      let q = supabase
        .from('contract_templates')
        .select('*')
        .is('deleted_at', null)
        .order('sort_order')
        .order('created_at', { ascending: false })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as ContractTemplate[]
    },
  })
}

/** رفع قالب جديد: يُفحص الملف أولاً لاستخراج متغيراته قبل الحفظ. */
export function useUploadContractTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      name,
      description,
      createdBy,
    }: {
      file: File
      name: string
      description: string | null
      createdBy: string | null
    }): Promise<number> => {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        throw new Error('القالب يجب أن يكون ملف Word بصيغة .docx')
      }

      // نقرأ المتغيرات قبل الرفع — قالب بلا متغيرات غالباً خطأ في التأليف
      const keys = await scanPlaceholders(await file.arrayBuffer())
      if (keys.length === 0) {
        throw new Error(
          'لم يُعثر على أي متغيّر {{...}} داخل القالب. اكتب المتغيرات في Word هكذا: {{NAME}}'
        )
      }

      const { publicUrl } = await uploadFile(file, {
        bucket: 'avatars',
        folder: 'contract-templates',
      })

      const { error } = await supabase.from('contract_templates').insert({
        name: name.trim(),
        description: description?.trim() || null,
        file_url: publicUrl,
        file_name: file.name,
        placeholders: keys.map((k) => ({ key: k, label: suggestLabel(k) })),
        created_by: createdBy,
      })
      if (error) throw error
      return keys.length
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast({
        variant: 'success',
        title: 'أُضيف القالب',
        description: `اكتُشف ${count} متغيّراً داخله.`,
      })
    },
    onError: errToast('تعذّرت إضافة القالب'),
  })
}

export function useUpdateContractTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<
        Pick<
          ContractTemplate,
          'name' | 'description' | 'is_active' | 'sort_order' | 'placeholders'
        >
      >
    }): Promise<void> => {
      const { error } = await supabase
        .from('contract_templates')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast({ variant: 'success', title: 'حُدّث القالب' })
    },
    onError: errToast('تعذّر تحديث القالب'),
  })
}

/** حذف ناعم — القوالب قد تكون مستعملة في عقود سابقة فلا تُمحى نهائياً. */
export function useDeleteContractTemplate() {
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
        .from('contract_templates')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast({ variant: 'success', title: 'حُذف القالب' })
    },
    onError: errToast('تعذّر حذف القالب'),
  })
}

/** جلب ملف القالب من التخزين للتعبئة. */
export async function fetchTemplateFile(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('تعذّر تحميل ملف القالب من التخزين')
  return res.arrayBuffer()
}
