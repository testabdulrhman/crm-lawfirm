import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'

/**
 * مشاركو الموعد — نفس نمط فريق الملف (case_members): assignee_id هو المسؤول،
 * وهؤلاء من معه (طلب المدير 2026-09-22).
 */
export interface AppointmentMember {
  appointment_id: string
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

const key = (id: string) => ['appointment_members', id] as const

export function useAppointmentMembers(appointmentId: string | undefined) {
  return useQuery({
    queryKey: key(appointmentId ?? ''),
    enabled: !!appointmentId,
    queryFn: async (): Promise<AppointmentMember[]> => {
      const { data, error } = await supabase
        .from('appointment_members')
        .select(
          'appointment_id, member_id, role, added_by, created_at,' +
            ' member:team_members!appointment_members_member_id_fkey' +
            '(id, name, short_name, avatar_url, avatar_initial, avatar_color)'
        )
        .eq('appointment_id', appointmentId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as unknown as AppointmentMember[]
    },
  })
}

export function useAddAppointmentMember(appointmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { memberId: string; addedBy: string | null }) => {
      const { error } = await supabase.from('appointment_members').insert({
        appointment_id: appointmentId,
        member_id: args.memberId,
        added_by: args.addedBy,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(appointmentId) })
      toast({ variant: 'success', title: 'أُضيف إلى الموعد' })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّرت الإضافة',
        description: errMessage(e),
      }),
  })
}

export function useRemoveAppointmentMember(appointmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('appointment_members')
        .delete()
        .eq('appointment_id', appointmentId)
        .eq('member_id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(appointmentId) })
      toast({ variant: 'success', title: 'أُزيل من الموعد' })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّرت الإزالة',
        description: errMessage(e),
      }),
  })
}
