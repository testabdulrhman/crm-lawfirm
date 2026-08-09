// الأيام المحجوبة عن الحجز الإلكتروني (أعياد وإجازات المكتب).
// ⚠️ يتطلب جدول booking_blocked_dates — migration 20260808_booking_website_phase1.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

export interface BlockedDate {
  id: string
  blocked_date: string
  reason: string | null
  created_by: string | null
  created_at: string | null
}

export function useBlockedDates() {
  return useQuery({
    queryKey: ['booking_blocked_dates'],
    queryFn: async (): Promise<BlockedDate[]> => {
      const { data, error } = await supabase
        .from('booking_blocked_dates')
        .select('*')
        .order('blocked_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as BlockedDate[]
    },
  })
}

export function useAddBlockedDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { date: string; reason: string; by: string | null }) => {
      const { error } = await supabase.from('booking_blocked_dates').insert({
        blocked_date: input.date,
        reason: input.reason.trim() || null,
        created_by: input.by,
      })
      if (error) {
        if (error.code === '23505') throw new Error('هذا اليوم محجوب مسبقاً.')
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking_blocked_dates'] })
      toast({ variant: 'success', title: 'حُجب اليوم عن الحجز الإلكتروني' })
    },
    onError: (e: unknown) =>
      toast({ variant: 'destructive', title: 'تعذّر حجب اليوم', description: errMessage(e) }),
  })
}

export function useRemoveBlockedDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('booking_blocked_dates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['booking_blocked_dates'] })
      toast({ variant: 'success', title: 'أُعيد فتح اليوم للحجز' })
    },
    onError: (e: unknown) =>
      toast({ variant: 'destructive', title: 'تعذّر إعادة فتح اليوم', description: errMessage(e) }),
  })
}
