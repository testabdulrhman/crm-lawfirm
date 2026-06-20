import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { Note } from '@/types/db'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: e instanceof Error ? e.message : undefined,
    })
}

function key(caseId: string) {
  return ['case_notes', caseId]
}

export function useCaseNotes(caseId: string) {
  return useQuery({
    queryKey: key(caseId),
    enabled: !!caseId,
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from('notes')
        .select('*, author:team_members(id,name,short_name)')
        .eq('case_id', caseId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Note[]
    },
  })
}

export function useAddNote(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      content,
      authorId,
    }: {
      content: string
      authorId: string | null
    }): Promise<void> => {
      const { error } = await supabase
        .from('notes')
        .insert({ case_id: caseId, content, author_id: authorId })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
    },
    onError: errToast('تعذّرت إضافة الملاحظة'),
  })
}

export function useDeleteNote(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'تم حذف الملاحظة' })
    },
    onError: errToast('تعذّر حذف الملاحظة'),
  })
}
