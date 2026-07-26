import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import type { TeamMember, TeamMemberInput } from '@/types/db'
import { errMessage } from '@/lib/errors'

const KEY = ['team_members'] as const

export function useTeamMembers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as TeamMember[]
    },
  })
}

export function useCreateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TeamMemberInput): Promise<TeamMember> => {
      // ملاحظة: نكتب فقط في جدول team_members (بيانات وصفية).
      // إنشاء حساب الدخول (auth user) يتم عبر Edge Function في وحدة طلبات التوظيف لاحقاً.
      const { data, error } = await supabase
        .from('team_members')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as TeamMember
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast({ variant: 'success', title: 'تمت إضافة الموظف بنجاح' })
    },
    onError: (e: unknown) => {
      toast({
        variant: 'destructive',
        title: 'تعذّرت إضافة الموظف',
        description: errMessage(e),
      })
    },
  })
}

export function useUpdateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: TeamMemberInput
    }): Promise<TeamMember> => {
      const { data, error } = await supabase
        .from('team_members')
        .update(input)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as TeamMember
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY })
      toast({ variant: 'success', title: 'تم تحديث بيانات الموظف' })
    },
    onError: (e: unknown) => {
      toast({
        variant: 'destructive',
        title: 'تعذّر تحديث الموظف',
        description: errMessage(e),
      })
    },
  })
}

export function useToggleActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      is_active,
    }: {
      id: string
      is_active: boolean
    }): Promise<void> => {
      const { error } = await supabase
        .from('team_members')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEY })
      toast({
        variant: 'success',
        title: vars.is_active ? 'تم تفعيل الموظف' : 'تم إيقاف الموظف',
      })
    },
    onError: (e: unknown) => {
      toast({
        variant: 'destructive',
        title: 'تعذّر تغيير الحالة',
        description: errMessage(e),
      })
    },
  })
}
