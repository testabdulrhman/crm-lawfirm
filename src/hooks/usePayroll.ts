// قيود الرواتب لكل موظف — القراءة محمية بـ RLS (المدير الكل، الموظف سجلاته فقط)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import type { PayrollEntry, PayrollEntryInput } from '@/types/db'

const KEY = 'payroll'

function errToast(title: string) {
  return (e: unknown) =>
    toast({ variant: 'destructive', title, description: errMessage(e) })
}

export function usePayrollEntries(teamMemberId: string | null) {
  return useQuery({
    queryKey: [KEY, teamMemberId],
    enabled: !!teamMemberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payroll_entries')
        .select('*')
        .eq('team_member_id', teamMemberId)
        .is('deleted_at', null)
        .order('entry_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PayrollEntry[]
    },
  })
}

export function useAddPayrollEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PayrollEntryInput) => {
      const { data, error } = await supabase
        .from('payroll_entries')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as PayrollEntry
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: [KEY, d.team_member_id] })
      toast({ title: 'تمت إضافة القيد' })
    },
    onError: errToast('تعذّرت إضافة القيد'),
  })
}

export function useDeletePayrollEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      teamMemberId,
      deletedBy,
    }: {
      id: string
      teamMemberId: string
      deletedBy: string | null
    }) => {
      const { error } = await supabase
        .from('payroll_entries')
        .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy })
        .eq('id', id)
      if (error) throw error
      return teamMemberId
    },
    onSuccess: (teamMemberId) => {
      qc.invalidateQueries({ queryKey: [KEY, teamMemberId] })
      toast({ title: 'تم حذف القيد' })
    },
    onError: errToast('تعذّر حذف القيد'),
  })
}
