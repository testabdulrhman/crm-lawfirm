import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { uploadFile } from '@/lib/files'

// «اقترح تعديلاً» (طلب المدير 2026-09-24): يُكتب من الصفحة نفسها ويُحفظ معه مسارها ولقطة
// لها، وجلسة التطوير تقرأ الجديد وتنفّذ ثم تردّ هنا. القاعدة تفرض: الموظف يرى طلباته،
// والمدير الكل ويغيّر الحالة ويردّ.

export type ChangeRequestStatus = 'new' | 'in_progress' | 'done' | 'declined'

export interface ChangeRequest {
  id: string
  created_at: string
  created_by: string | null
  platform: 'web' | 'ios'
  page_path: string | null
  page_title: string | null
  body: string
  screenshot_url: string | null
  status: ChangeRequestStatus
  reply: string | null
  replied_at: string | null
  commit_ref: string | null
  author?: { id: string; name: string | null; short_name: string | null } | null
}

const KEY = ['change_requests'] as const

export function useChangeRequests() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<ChangeRequest[]> => {
      const { data, error } = await supabase
        .from('change_requests')
        .select('*, author:team_members!change_requests_created_by_fkey(id, name, short_name)')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as unknown as ChangeRequest[]
    },
  })
}

/** عدد الجديد — لشارة القائمة الجانبية */
export function useNewChangeRequestsCount(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'new_count'],
    enabled,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('change_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
      if (error) throw error
      return count ?? 0
    },
  })
}

export function useCreateChangeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      body: string
      pagePath: string
      pageTitle: string
      screenshot: Blob | null
    }) => {
      let screenshotUrl: string | null = null
      if (input.screenshot) {
        // اللقطة تحسين لا شرط: إن تعذّر رفعها يُحفظ الطلب بدونها
        try {
          const file = new File([input.screenshot], `screen-${Date.now()}.jpg`, { type: 'image/jpeg' })
          screenshotUrl = (await uploadFile(file, { folder: 'change_requests' })).publicUrl
        } catch {
          screenshotUrl = null
        }
      }
      const { error } = await supabase.from('change_requests').insert({
        body: input.body.trim(),
        page_path: input.pagePath,
        page_title: input.pageTitle,
        screenshot_url: screenshotUrl,
        platform: 'web',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast({
        variant: 'success',
        title: 'وصل اقتراحك',
        description: 'يصلك إشعار حين يُنفَّذ أو يُردّ عليه.',
      })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر إرسال الاقتراح', description: errMessage(e) }),
  })
}

export function useUpdateChangeRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; status?: ChangeRequestStatus; reply?: string | null }) => {
      const patch: Record<string, unknown> = {}
      if (input.status) patch.status = input.status
      if (input.reply !== undefined) {
        patch.reply = input.reply?.trim() || null
        patch.replied_at = input.reply?.trim() ? new Date().toISOString() : null
      }
      const { error } = await supabase.from('change_requests').update(patch).eq('id', input.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast({ variant: 'success', title: 'حُفظ' })
    },
    onError: (e) => toast({ variant: 'destructive', title: 'تعذّر الحفظ', description: errMessage(e) }),
  })
}
