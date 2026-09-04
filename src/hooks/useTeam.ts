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

/**
 * فتح حساب الدخول لموظف موجود (swift-endpoint/provision-member).
 *
 * لماذا خطوة منفصلة: صفّ team_members لا يكفي للدخول — لا بد من حساب في
 * auth.users مربوط بـauth_id. وقبل هذا كان الموظف يُضاف بلا حساب فيطلب رمز
 * الدخول ولا يصله شيء ولا خطأ (الدالة تصمت أمام غير المسجّلين عمداً)،
 * وهو ما وقع فعلاً مع المستشار رضوان (2026-09-04).
 */
export function useProvisionMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { memberId: string; welcome?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('swift-endpoint', {
        body: {
          action: 'provision-member',
          member_id: args.memberId,
          welcome: args.welcome ?? true,
        },
      })
      if (error) {
        let detail = errMessage(error)
        try {
          const ctx = await (error as { context?: Response }).context?.json()
          if (ctx?.error) detail = ctx.error
        } catch {
          /* نكتفي بالرسالة العامة */
        }
        throw new Error(detail)
      }
      if (data?.error) throw new Error(data.error)
      return data as {
        success: boolean
        already_provisioned?: boolean
        welcome_sent?: boolean
        has_phone?: boolean
      }
    },
    onSuccess: (r) => {
      toast({
        variant: 'success',
        title: r.already_provisioned
          ? 'الموظف يملك حساب دخول أصلاً'
          : r.welcome_sent
            ? 'فُتح الدخول وأُرسلت رسالة الترحيب'
            : 'فُتح الدخول — لم تُرسل رسالة (تحقّق من الجوال)',
      })
      return qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر فتح حساب الدخول',
        description: errMessage(e),
      }),
  })
}

export function useCreateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: TeamMemberInput): Promise<TeamMember> => {
      // صفّ البيانات فقط — حساب الدخول يُفتح بعده عبر useProvisionMember
      // (يحتاج service role فلا يمكن من المتصفّح مباشرة).
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
