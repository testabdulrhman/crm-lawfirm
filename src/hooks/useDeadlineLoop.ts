import { useMutation, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { useAuth } from '@/stores/auth'

// المهل النظامية — المهام المشتقّة تلقائياً من الأحكام والجلسات والوكالات. تُعرض في
// لوحة التحكم ضمن «المطلوب مني» (src/features/dashboard) بوسم نوعها؛ وفوات مهلة
// الاعتراض **سقوط حق لا تأخير**، والوثيقة المرجعية تجعل المفوَّت منها صفراً بلا تسامح.

/** الملكية المزدوجة: شخص يحسب المهلة وآخر يعتمد صحتها */
export function useConfirmDeadline() {
  const qc = useQueryClient()
  const { teamMember } = useAuth()
  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!teamMember?.id) throw new Error('لم يُعرف المستخدم الحالي.')
      const { error } = await supabase
        .from('tasks')
        .update({
          deadline_confirmed_by: teamMember.id,
          deadline_confirmed_at: new Date().toISOString(),
        })
        .eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action_queue'] })
      qc.invalidateQueries({ queryKey: ['task'] })
      toast({ title: 'اعتُمد احتساب المهلة' })
    },
    onError: (e) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر اعتماد المهلة',
        description: errMessage(e),
      }),
  })
}
