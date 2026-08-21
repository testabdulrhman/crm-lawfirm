import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

// سلة الاسترجاع — للمدير فقط (الدالتان تتحققان من is_director داخلياً)

export interface TrashItem {
  item_kind: string
  id: string
  label: string | null
  context: string | null
  deleted_at: string | null
  deleted_by: string | null
}

export function useTrashItems(enabled: boolean) {
  return useQuery({
    queryKey: ['trash_items'],
    enabled,
    queryFn: async (): Promise<TrashItem[]> => {
      const { data, error } = await supabase.rpc('trash_items')
      if (error) throw error
      return (data ?? []) as TrashItem[]
    },
  })
}

export function useRestoreItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { kind: string; id: string }) => {
      const { data, error } = await supabase.rpc('restore_item', {
        p_kind: input.kind,
        p_id: input.id,
      })
      if (error) throw error
      if (!data) throw new Error('لم يُعثر على العنصر')
    },
    onSuccess: () => {
      // الاسترجاع يعيد العنصر لكل الشاشات — أوسع إبطال أسلمه
      qc.invalidateQueries()
      toast({ variant: 'success', title: 'استُرجع العنصر' })
    },
    onError: (e) =>
      toast({ variant: 'destructive', title: 'تعذّر الاسترجاع', description: errMessage(e) }),
  })
}
