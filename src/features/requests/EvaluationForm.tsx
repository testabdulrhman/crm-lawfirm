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

// مذكرة التقييم على المحاور الأربعة — المرحلة الثانية من دورة العمل.
// الوثيقة: «لا يُوقَّع عقد قبلها»، ويعتمدها الشريك، ولا يُعطى العميل
// ضمان نتيجة — بل يسمع الاحتمال السيئ كتابةً.

const RECOMMENDATIONS = ['قبول', 'قبول مشروط', 'رفض', 'بحاجة لمعلومات'] as const

export const RISK_LEVELS = [
  { value: 'low', label: 'منخفضة' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'high', label: 'عالية' },
] as const

// المحاور كما سمّتها الوثيقة — والتلميحات من نصّها لا من اجتهادنا
const AXES = [
  {
    key: 'axis_procedural',
    label: 'المحور الإجرائي',
    hint: 'الصفة والمصلحة والأهلية · الاختصاص · وجود شرط تحكيم (يغيّر المسار) · المدد والسقوط · تظلّم أو تسوية واجبة مسبقاً',
  },
  {
    key: 'axis_merits',
    label: 'المحور الموضوعي',
    hint: 'الوقائع المؤيدة والمعارضة · الأساس النظامي والتعاقدي · الدفوع المتوقعة من الخصم',
  },
  {
    key: 'axis_evidence',
    label: 'المحور الإثباتي',
    hint: 'المحررات · الرسائل الرقمية وسلامة نسبتها · الحاجة لترجمة معتمدة أو خبرة',
  },
  {
    key: 'axis_financial',
    label: 'المحور المالي والتنفيذي',
    hint: 'القيمة الواقعية لا المُعلنة · التكاليف القضائية والخبرة · وأهمها: ملاءة المحكوم عليه — حكم بلا تنفيذ نصرٌ ورقي',
  },
] as const

const schema = z
  .object({
    axis_procedural: z.string().optional(),
    axis_merits: z.string().optional(),
    axis_evidence: z.string().optional(),
    axis_financial: z.string().optional(),
    risk_level: z.enum(['low', 'medium', 'high']).optional(),
    recommendation: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => Boolean(v.recommendation?.trim()), {
    message: 'المذكرة بلا توصية ليست مذكرة.',
    path: ['recommendation'],
  })
  .refine(
    (v) =>
      Boolean(
        v.axis_procedural?.trim() ||
          v.axis_merits?.trim() ||
          v.axis_evidence?.trim() ||
          v.axis_financial?.trim()
      ),
    { message: 'املأ محوراً واحداً على الأقل.', path: ['axis_procedural'] }
  )

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
      axis_procedural: evaluation?.axis_procedural ?? '',
      axis_merits: evaluation?.axis_merits ?? '',
      axis_evidence: evaluation?.axis_evidence ?? '',
      axis_financial: evaluation?.axis_financial ?? '',
      risk_level: evaluation?.risk_level ?? undefined,
      recommendation: evaluation?.recommendation ?? '',
      notes: evaluation?.notes ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const base = {
      axis_procedural: values.axis_procedural?.trim() || null,
      axis_merits: values.axis_merits?.trim() || null,
      axis_evidence: values.axis_evidence?.trim() || null,
      axis_financial: values.axis_financial?.trim() || null,
      risk_level: values.risk_level ?? null,
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
        <DialogTitle>
          {isEdit ? 'تعديل مذكرة التقييم' : 'مذكرة التقييم'}
        </DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[60vh] space-y-4 overflow-y-auto pe-1">
        {AXES.map((a) => (
          <div key={a.key} className="space-y-1.5">
            <Label htmlFor={a.key}>{a.label}</Label>
            <Textarea
              id={a.key}
              rows={3}
              placeholder={a.hint}
              {...register(a.key)}
            />
          </div>
        ))}
        {errors.axis_procedural && (
          <p className="text-sm text-destructive">
            {errors.axis_procedural.message}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>درجة المخاطر</Label>
            <Controller
              control={control}
              name="risk_level"
              render={({ field }) => (
                <Select
                  value={field.value ?? undefined}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
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
                    <SelectValue placeholder="اختر" />
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
            {errors.recommendation && (
              <p className="text-sm text-destructive">
                {errors.recommendation.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-notes">ملاحظات</Label>
          <Textarea id="ev-notes" rows={2} {...register('notes')} />
        </div>

        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          بعد الحفظ تنتظر المذكرة اعتماد المدير — والوثيقة: لا يُوقَّع عقد
          قبلها، ولا يُعطى العميل ضمان نتيجة.
        </p>
      </div>

      <DialogFooter>
        <Button type="submit" variant="gold" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'حفظ التعديل' : 'حفظ المذكرة'}
        </Button>
      </DialogFooter>
    </form>
  )
}
