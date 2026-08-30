import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

export interface MessageTemplate {
  id: string
  key: string | null
  name: string | null
  description: string | null
  body: string | null
  body_whatsapp: string | null
  body_email: string | null
  email_subject: string | null
  variables: string[] | null
}

export interface MessageTemplateUpdate {
  body?: string
  body_whatsapp?: string | null
  body_email?: string | null
  email_subject?: string | null
}

export function useMessageTemplates() {
  return useQuery({
    queryKey: ['message_templates'],
    queryFn: async (): Promise<MessageTemplate[]> => {
      const { data, error } = await supabase
        .from('message_templates')
        .select(
          'id, key, name, description, body, body_whatsapp, body_email, email_subject, variables'
        )
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as MessageTemplate[]
    },
  })
}

export function useUpdateMessageTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string
      input: MessageTemplateUpdate
    }): Promise<void> => {
      const { error } = await supabase
        .from('message_templates')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message_templates'] })
      toast({ variant: 'success', title: 'تم حفظ القالب' })
    },
    onError: (e: unknown) =>
      toast({
        variant: 'destructive',
        title: 'تعذّر حفظ القالب',
        description: errMessage(e),
      }),
  })
}
