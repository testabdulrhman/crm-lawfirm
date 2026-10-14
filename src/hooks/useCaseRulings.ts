import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { Ruling, RulingInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

function errToast(title: string) {
  return (e: unknown) =>
    toast({
      variant: 'destructive',
      title,
      description: errMessage(e),
    })
}

export function useCaseRulings(caseId: string) {
  return useQuery({
    queryKey: ['case_rulings', caseId],
    enabled: !!caseId,
    queryFn: async (): Promise<Ruling[]> => {
      const { data, error } = await supabase
        .from('rulings')
        .select('*')
        .eq('case_id', caseId)
        .order('ruling_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Ruling[]
    },
  })
}

export function useAddRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: RulingInput): Promise<void> => {
      const { error } = await supabase.from('rulings').insert(input)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تمت إضافة الحكم' })
    },
    onError: errToast('تعذّرت إضافة الحكم'),
  })
}

export function useUpdateRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: Partial<RulingInput>
    }): Promise<void> => {
      const { error } = await supabase.from('rulings').update(input).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تم تحديث الحكم' })
    },
    onError: errToast('تعذّر تحديث الحكم'),
  })
}

export function useDeleteRuling(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('rulings').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      toast({ variant: 'success', title: 'تم حذف الحكم' })
    },
    onError: errToast('تعذّر حذف الحكم'),
  })
}

/**
 * شارة النتيجة: أحكام الملف التي لها منطوق ولا شارة لها تُرسل مرة واحدة للذكاء (ai-assistant
 * task=ruling_outcomes) ثم يُحدَّث العرض. يملأ القديم تدريجياً عند فتح كل ملف، والمعدَّل منطوقه كذلك.
 */
export function useRulingOutcomes(caseId: string, rulings: Ruling[] | undefined) {
  const qc = useQueryClient()
  const asked = useRef(new Set<string>())
  useEffect(() => {
    const ids = (rulings ?? [])
      .filter((r) => r.result?.trim() && !r.outcome_short && !asked.current.has(r.id))
      .map((r) => r.id)
    if (!ids.length) return
    ids.forEach((id) => asked.current.add(id))
    supabase.functions
      .invoke('ai-assistant', { body: { task: 'ruling_outcomes', payload: { ids } } })
      .then(({ data }) => {
        if (data?.outcomes && Object.keys(data.outcomes).length)
          qc.invalidateQueries({ queryKey: ['case_rulings', caseId] })
      })
      .catch(() => {
        /* الشارة تكميلية — يُعاد عند الفتح القادم */
      })
  }, [rulings, caseId, qc])
}

/** مهمة الاعتراض المشتقة من الحكم (derived_key) — لمن أُسندت وهل أُنجزت */
export function useObjectionTask(rulingId: string | null) {
  return useQuery({
    queryKey: ['ruling_objection_task', rulingId],
    enabled: !!rulingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, assignee:team_members!tasks_assignee_id_fkey(name, short_name)')
        .eq('derived_key', `ruling:${rulingId}:objection`)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return data as unknown as {
        id: string
        title: string
        status: string
        assignee: { name: string | null; short_name: string | null } | null
      } | null
    },
  })
}
