import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/stores/auth'
import { useAddEvaluation, useUpdateEvaluation } from '@/hooks/useRequests'
import type { RequestEvaluation, RequestEvaluationInput } from '@/types/db'

const RECOMMENDATIONS = ['قبول', 'رفض', 'بحاجة لمعلومات'] as const

const schema = z
  .object({
    summary: z.string().optional(),
    strengths: z.string().optional(),
    weaknesses: z.string().optional(),
    recommendation: z.string().optional(),
    notes: z.string().optional(),
  })
  // منع التقييم الفارغ تماماً: لا بد من ملخص أو توصية على الأقل
  .refine((v) => Boolean(v.summary?.trim() || v.recommendation?.trim()), {
    message: 'أدخل ملخصاً أو توصية على الأقل.',
    path: ['summary'],
  })

type FormValues = z.infer<typeof schema>

export function EvaluationForm({
  requestId,
  evaluation,
  onDone,
}: {
  requestId: string
  evaluation?: RequestEvaluation | null
  onDone: () => void
}) {
  const isEdit = Boolean(evaluation)
  const { teamMember } = useAuth()
  const addM = useAddEvaluation()
  const updateM = useUpdateEvaluation()
  const pending = addM.isPending || updateM.isPending

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      summary: evaluation?.summary ?? '',
      strengths: evaluation?.strengths ?? '',
      weaknesses: evaluation?.weaknesses ?? '',
      recommendation: evaluation?.recommendation ?? '',
      notes: evaluation?.notes ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const base = {
      summary: values.summary?.trim() || null,
      strengths: values.strengths?.trim() || null,
      weaknesses: values.weaknesses?.trim() || null,
      recommendation: values.recommendation?.trim() || null,
      notes: values.notes?.trim() || null,
    }
    if (isEdit && evaluation) {
      await updateM.mutateAsync({ id: evaluation.id, input: base })
    } else {
      const input: RequestEvaluationInput = {
        request_id: requestId,
        evaluator_id: teamMember?.id ?? null,
        evaluator_name: teamMember?.name ?? null,
        ...base,
      }
      await addM.mutateAsync(input)
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل تقييم' : 'تقييم جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[60vh] space-y-3 overflow-y-auto pl-1 pr-1">
        <div className="space-y-1.5">
          <Label htmlFor="summary">الملخص</Label>
          <Textarea id="summary" rows={2} {...register('summary')} />
          {errors.summary && (
            <p className="text-xs text-destructive">{errors.summary.message}</p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="strengths">نقاط القوة</Label>
            <Textarea id="strengths" rows={3} {...register('strengths')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weaknesses">نقاط الضعف</Label>
            <Textarea id="weaknesses" rows={3} {...register('weaknesses')} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>التوصية</Label>
          <Controller
            control={control}
            name="recommendation"
            render={({ field }) => (
              <Select
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر التوصية" />
                </SelectTrigger>
                <SelectContent>
                  {RECOMMENDATIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">ملاحظات</Label>
          <Textarea id="notes" rows={2} {...register('notes')} />
        </div>
      </div>

      <DialogFooter className="gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'حفظ' : 'إضافة'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          إلغاء
        </Button>
      </DialogFooter>
    </form>
  )
}
