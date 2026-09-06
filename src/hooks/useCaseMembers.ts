import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'

/** عضو في فريق الملف — زميل أُشرك فيه بلا أن يكون مسؤوله */
export interface CaseMember {
  case_id: string
  member_id: string
  role: string | null
  added_by: string | null
  created_at: string
  member: {
    id: string
    name: string
    short_name: string | null
    avatar_url: string | null
    avatar_initial: string | null
    avatar_color: string | null
  } | null
}

const key = (caseId: string) => ['case_members', caseId] as const

export function useCaseMembers(caseId: string | undefined) {
  return useQuery({
    queryKey: key(caseId ?? ''),
    enabled: !!caseId,
    queryFn: async (): Promise<CaseMember[]> => {
      const { data, error } = await supabase
        .from('case_members')
        .select(
          'case_id, member_id, role, added_by, created_at,' +
            ' member:team_members!case_members_member_id_fkey' +
            '(id, name, short_name, avatar_url, avatar_initial, avatar_color)'
        )
        .eq('case_id', caseId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as CaseMember[]
    },
  })
}

export function useAddCaseMember(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { memberId: string; addedBy: string | null }) => {
      const { error } = await supabase.from('case_members').insert({
        case_id: caseId,
        member_id: args.memberId,
        role: 'متعاون',
        added_by: args.addedBy,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'أُضيف إلى فريق الملف' })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّرت الإضافة',
        description: errMessage(e),
      }),
  })
}

export function useRemoveCaseMember(caseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('case_members')
        .delete()
        .eq('case_id', caseId)
        .eq('member_id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(caseId) })
      toast({ variant: 'success', title: 'أُزيل من فريق الملف' })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّرت الإزالة',
        description: errMessage(e),
      }),
  })
}
